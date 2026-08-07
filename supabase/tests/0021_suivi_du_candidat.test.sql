-- Tests de la migration 0021_suivi_du_candidat.sql.
--
-- Un journal a deux propriétés, et elles ne vont pas ensemble : il se lit
-- largement — sinon on ne passe pas un dossier à un collègue — et il s'écrit
-- étroitement — sinon on ne sait plus qui a dit quoi. Ce fichier éprouve les
-- deux, et la frontière entre elles.
--
--   · Karim  référent à Brest-0021, il suit Nadia
--   · Lise   référente à Brest-0021 — elle ne suit personne
--   · Marc   référent à Nantes-0021 — Brest ne le regarde pas
--   · Nina   administratrice, sans loge

\set ON_ERROR_STOP on
\o /dev/null

\set karim 'aaaaaaaa-3333-0000-0000-000000000027'
\set lise  'aaaaaaaa-3333-0000-0000-000000000028'
\set marc  'aaaaaaaa-3333-0000-0000-000000000029'
\set nina  'aaaaaaaa-3333-0000-0000-000000000030'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'karim', 'karim0021@example.org', '{"role":"referent","nom":"Karim","prenom":"K"}'),
  (:'lise',  'lise0021@example.org',  '{"role":"referent","nom":"Lise","prenom":"L"}'),
  (:'marc',  'marc0021@example.org',  '{"role":"referent","nom":"Marc","prenom":"M"}'),
  (:'nina',  'nina0021@example.org',  '{"role":"referent","nom":"Nina","prenom":"N"}');
update public.profil set role = 'admin' where id = :'nina';

insert into public.loge (bubble_id, nom) values
  ('loge-0021-brest',  'Brest — 0021'),
  ('loge-0021-nantes', 'Nantes — 0021')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0021-karim', :'karim', 'Karim', 'K', 'karim0021@example.org',
   (select id from public.loge where bubble_id = 'loge-0021-brest')),
  ('ref-0021-lise',  :'lise',  'Lise',  'L', 'lise0021@example.org',
   (select id from public.loge where bubble_id = 'loge-0021-brest')),
  ('ref-0021-marc',  :'marc',  'Marc',  'M', 'marc0021@example.org',
   (select id from public.loge where bubble_id = 'loge-0021-nantes'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id, referent_id) values
  ('cand-0021-nadia', 501, 'Nadia', 'N', 'Brest',
   (select id from public.loge where bubble_id = 'loge-0021-brest'),
   (select id from public.referent where bubble_id = 'ref-0021-karim')),
  ('cand-0021-oscar', 502, 'Oscar', 'O', 'Nantes',
   (select id from public.loge where bubble_id = 'loge-0021-nantes'),
   (select id from public.referent where bubble_id = 'ref-0021-marc'))
on conflict do nothing;

select id as nadia from public.candidat where bubble_id = 'cand-0021-nadia' \gset
select id as oscar from public.candidat where bubble_id = 'cand-0021-oscar' \gset
select id as r_karim from public.referent where bubble_id = 'ref-0021-karim' \gset
select id as r_lise  from public.referent where bubble_id = 'ref-0021-lise'  \gset

-- Les blocs qui éprouvent un refus ont besoin des identifiants **en clair** :
-- joué sous l'identité d'un référent, un `select` imbriqué est d'abord filtré
-- par la RLS de `candidat` et de `referent`. L'insertion ne poserait alors
-- aucune ligne — et ne lèverait rien. On ne prouverait pas le refus, on
-- prouverait le vide.
select set_config('essai.nadia',  :'nadia',   false),
       set_config('essai.rlise',  :'r_lise',  false),
       set_config('essai.rkarim', :'r_karim', false);

-- ---------------------------------------------------------------------------
\echo '— celui qui accompagne ecrit dans le journal'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000027"}';

  insert into public.suivi (candidat_id, auteur_id, fait_le, nature, texte) values
    (:'nadia'::uuid, :'r_karim'::uuid, date '2026-03-12', 'Appel',
     'Premier contact, cherche dans la logistique.'),
    (:'nadia'::uuid, :'r_karim'::uuid, date '2026-04-02', 'Entretien',
     'Entretien chez un transporteur, sans suite.');

  select public.verifier(
    (select count(*) from public.suivi_du_candidat(:'nadia'::uuid)) = 2,
    'Karim écrit deux lignes dans le journal de Nadia');

  -- Le plus récent d'abord : c'est l'ordre où l'on reprend un dossier.
  select public.verifier(
    (select array_agg(nature) from public.suivi_du_candidat(:'nadia'::uuid))
      = array['Entretien', 'Appel'],
    'et le journal se lit du plus récent au plus ancien');

  select public.verifier(
    (select distinct auteur_nom from public.suivi_du_candidat(:'nadia'::uuid)) = 'K Karim'
      and (select bool_and(c_est_moi) from public.suivi_du_candidat(:'nadia'::uuid)),
    'le journal nomme son auteur, et dit à Karim que c''est le sien');
commit;

-- ---------------------------------------------------------------------------
\echo '— une collegue de loge lit, mais n ecrit pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000028"}';

  -- Lise n'accompagne pas Nadia. Elle lit son journal — sans quoi elle ne
  -- pourrait pas reprendre le dossier si Karim s'absentait.
  select public.verifier(
    (select count(*) from public.suivi_du_candidat(:'nadia'::uuid)) = 2,
    'Lise lit le journal d''une candidate de sa loge');

  select public.verifier(
    (select bool_or(c_est_moi) from public.suivi_du_candidat(:'nadia'::uuid)) = false,
    'et aucune de ces lignes n''est la sienne');
commit;

-- Écrire, en revanche, lui est refusé : la RLS ne rend pas d'erreur sur un
-- insert, elle le rejette. C'est ce qu'on vérifie.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000028"}', true);
  begin
    insert into public.suivi (candidat_id, auteur_id, texte)
    values (current_setting('essai.nadia')::uuid,
            current_setting('essai.rlise')::uuid,
            'écrit par Lise');
    raise exception 'ÉCHEC — Lise a pu écrire dans un journal qu''elle n''accompagne pas';
  exception when insufficient_privilege then
    raise notice '  ok — écrire reste réservé au référent et au parrain';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— on ne signe pas du nom d un collegue'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000027"}', true);
  begin
    -- Karim accompagne bien Nadia, mais il signe « Lise ».
    insert into public.suivi (candidat_id, auteur_id, texte)
    values (current_setting('essai.nadia')::uuid,
            current_setting('essai.rlise')::uuid,
            'signé Lise, écrit par Karim');
    raise exception 'ÉCHEC — Karim a signé du nom de Lise';
  exception when insufficient_privilege then
    raise notice '  ok — l''auteur déclaré doit être soi';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une autre loge ne lit rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000029"}';

  select public.verifier(
    (select count(*) from public.suivi_du_candidat(:'nadia'::uuid)) = 0,
    'Marc n''obtient rien de Brest — pas une ligne');
commit;

-- ---------------------------------------------------------------------------
\echo '— l administration lit tout, et n ecrit nulle part'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000030"}';

  select public.verifier(
    (select count(*) from public.suivi_du_candidat(:'nadia'::uuid)) = 2,
    'Nina lit le journal de Nadia');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000030"}', true);
  begin
    insert into public.suivi (candidat_id, auteur_id, texte)
    values (current_setting('essai.nadia')::uuid, null,
            'écrit par l''administration');
    raise exception 'ÉCHEC — l''administration a écrit dans un journal';
  exception when insufficient_privilege then
    raise notice '  ok — administrer n''est pas accompagner';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— on corrige son ecrit, jamais celui d un autre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000027"}';

  update public.suivi set texte = 'Premier contact, cherche dans le transport.'
   where candidat_id = :'nadia'::uuid and nature = 'Appel';

  select public.verifier(
    (select texte from public.suivi_du_candidat(:'nadia'::uuid) where nature = 'Appel')
      = 'Premier contact, cherche dans le transport.',
    'Karim corrige sa propre ligne');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000028"}';

  -- Lise lit la ligne, mais l'`update` ne touche rien : ce n'est pas la sienne.
  update public.suivi set texte = 'réécrit par Lise' where nature = 'Appel';
commit;

select public.verifier(
  (select count(*) from public.suivi where texte = 'réécrit par Lise') = 0,
  'et Lise ne réécrit pas celle de Karim — la base refuse d''elle-même');

-- ---------------------------------------------------------------------------
\echo '— la table ne rend que ce qu on a ecrit soi-meme'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000027"}';

  -- La policy de lecture directe existe pour que `corriger` retrouve sa ligne,
  -- et pour rien d'autre : elle ne rend que ses propres écrits.
  select public.verifier(
    (select count(*) from public.suivi) = 2,
    'Karim retrouve ses deux lignes — c''est ce qui lui permet de les corriger');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000028"}';

  -- Lise lit pourtant ce journal par la fonction : la table dit « les
  -- miennes », la fonction dit « celles de ma loge ». Deux questions, deux
  -- réponses.
  select public.verifier(
    (select count(*) from public.suivi) = 0
      and (select count(*) from public.suivi_du_candidat(current_setting('essai.nadia')::uuid)) = 2,
    'Lise n''en lit aucune en direct, et les deux par la fonction');
commit;

-- ---------------------------------------------------------------------------
\echo '— une ligne de journal ne s efface pas'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'suivi' and cmd = 'DELETE') = 0,
  'aucune policy de suppression : un journal dont on efface les lignes n''en est plus un');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.suivi_du_candidat('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — le journal répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0021_suivi_du_candidat.sql sont passés.'
