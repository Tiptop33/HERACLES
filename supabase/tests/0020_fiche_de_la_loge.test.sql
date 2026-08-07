-- Tests de la migration 0020_fiche_de_la_loge.sql.
--
-- Une seule question, posée quatre fois : qui ouvre la fiche, et qui la
-- corrige ? Les deux réponses ne sont pas la même, et c'est tout l'objet de
-- cette migration.
--
--   · Gaëlle  référente à Lyon-0020, elle suit Anne
--   · Hugo    référent à Lyon-0020, il suit Bruno
--   · Inès    référente à Tours-0020 — Lyon ne la regarde pas
--   · Jonas   administrateur, sans loge

\set ON_ERROR_STOP on
\o /dev/null

\set gaelle 'aaaaaaaa-3333-0000-0000-000000000023'
\set hugo   'aaaaaaaa-3333-0000-0000-000000000024'
\set ines   'aaaaaaaa-3333-0000-0000-000000000025'
\set jonas  'aaaaaaaa-3333-0000-0000-000000000026'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'gaelle', 'gaelle0020@example.org', '{"role":"referent","nom":"Gaelle","prenom":"G"}'),
  (:'hugo',   'hugo0020@example.org',   '{"role":"referent","nom":"Hugo","prenom":"H"}'),
  (:'ines',   'ines0020@example.org',   '{"role":"referent","nom":"Ines","prenom":"I"}'),
  (:'jonas',  'jonas0020@example.org',  '{"role":"referent","nom":"Jonas","prenom":"J"}');
update public.profil set role = 'admin' where id = :'jonas';

insert into public.loge (bubble_id, nom) values
  ('loge-0020-lyon',  'Lyon — 0020'),
  ('loge-0020-tours', 'Tours — 0020')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0020-gaelle', :'gaelle', 'Gaelle', 'G', 'gaelle0020@example.org',
   (select id from public.loge where bubble_id = 'loge-0020-lyon')),
  ('ref-0020-hugo',   :'hugo',   'Hugo',   'H', 'hugo0020@example.org',
   (select id from public.loge where bubble_id = 'loge-0020-lyon')),
  ('ref-0020-ines',   :'ines',   'Ines',   'I', 'ines0020@example.org',
   (select id from public.loge where bubble_id = 'loge-0020-tours'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, age, email, telephone,
                             metier_libelle, ville, appreciation, cv_chemin,
                             loge_id, referent_id, parrain_id, photo_chemin) values
  -- Celle de Gaëlle : elle l'ouvre et la corrige.
  ('cand-0020-anne', 401, 'Anne', 'Alpha', 34, 'anne0020@example.org', '0601020304',
   'Consultant RH', 'Lyon', 'Très motivée', 'candidat/cv/anne.pdf',
   (select id from public.loge where bubble_id = 'loge-0020-lyon'),
   (select id from public.referent where bubble_id = 'ref-0020-gaelle'), null,
   'candidat/photo/anne.jpg'),
  -- Celle de Hugo, que Gaëlle parraine : la table la lui rendait déjà.
  ('cand-0020-bruno', 402, 'Bruno', 'Beta', 28, 'bruno0020@example.org', '0601020305',
   'Comptable', 'Lyon', 'À relancer', 'candidat/cv/bruno.pdf',
   (select id from public.loge where bubble_id = 'loge-0020-lyon'),
   (select id from public.referent where bubble_id = 'ref-0020-hugo'),
   (select id from public.referent where bubble_id = 'ref-0020-gaelle'), null),
  -- Celle de Hugo, et de lui seul : c'est celle-ci qui prouve la migration.
  -- Gaëlle n'y est ni référente ni marraine — hier, cette ligne n'existait pas
  -- pour elle.
  ('cand-0020-denis', 405, 'Denis', 'Epsilon', 31, 'denis0020@example.org', null,
   'Chaudronnier', 'Lyon', 'Entretien passé', null,
   (select id from public.loge where bubble_id = 'loge-0020-lyon'),
   (select id from public.referent where bubble_id = 'ref-0020-hugo'), null, null),
  -- Personne ne l'accompagne : sans cette migration, sa fiche n'existait pour
  -- personne.
  ('cand-0020-clara', 403, 'Clara', 'Gamma', 45, null, null,
   null, 'Lyon', null, null,
   (select id from public.loge where bubble_id = 'loge-0020-lyon'), null, null, null),
  -- Une autre loge.
  ('cand-0020-tours', 404, 'Tours', 'Delta', 22, null, null,
   'Soudeur', 'Tours', null, null,
   (select id from public.loge where bubble_id = 'loge-0020-tours'),
   (select id from public.referent where bubble_id = 'ref-0020-ines'), null, null)
on conflict do nothing;

select id as anne  from public.candidat where bubble_id = 'cand-0020-anne'  \gset
select id as bruno from public.candidat where bubble_id = 'cand-0020-bruno' \gset
select id as clara from public.candidat where bubble_id = 'cand-0020-clara' \gset
select id as denis from public.candidat where bubble_id = 'cand-0020-denis' \gset
select id as tours from public.candidat where bubble_id = 'cand-0020-tours' \gset

-- ---------------------------------------------------------------------------
\echo '— la fiche d une collegue de loge s ouvre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000023"}';

  select public.verifier(
    (select nom from public.fiche_candidat(:'denis'::uuid)) = 'Denis',
    'Gaëlle ouvre la fiche que Hugo accompagne — elle n''y est pour rien');

  select public.verifier(
    (select referent_nom from public.fiche_candidat(:'bruno'::uuid)) = 'H Hugo'
      and (select parrain_nom from public.fiche_candidat(:'bruno'::uuid)) = 'G Gaelle'
      and (select loge_nom from public.fiche_candidat(:'bruno'::uuid)) = 'Lyon — 0020',
    'et la fiche nomme le référent, le parrain et la loge');

  select public.verifier(
    (select nom from public.fiche_candidat(:'clara'::uuid)) = 'Clara',
    'celle que personne n''accompagne s''ouvre aussi — sans quoi elle n''existerait pour personne');
commit;

-- ---------------------------------------------------------------------------
\echo '— mais la table, elle, n a pas bouge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000023"}';

  -- C'est la raison d'être de cette migration : une fonction, et non une
  -- policy plus large. La table reste telle que 0006 l'a fermée.
  select public.verifier(
    (select count(*) from public.candidat
      where bubble_id in ('cand-0020-denis', 'cand-0020-clara')) = 0,
    'la table ne rend toujours que ses propres candidats');
commit;

-- ---------------------------------------------------------------------------
\echo '— corriger reste reserve a qui accompagne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000023"}';

  select public.verifier(
    (select modifiable from public.fiche_candidat(:'anne'::uuid)) = true
      and (select modifiable from public.fiche_candidat(:'bruno'::uuid)) = true
      and (select modifiable from public.fiche_candidat(:'denis'::uuid)) = false
      and (select modifiable from public.fiche_candidat(:'clara'::uuid)) = false,
    'l''écran sait où mettre le stylo : ses suivis et ses parrainages, pas le reste');

  -- Et surtout : ce n'est pas l'écran qui décide. Une modification sur une
  -- fiche que Gaëlle n'accompagne pas ne touche aucune ligne.
  update public.candidat set appreciation = 'écrit par Gaëlle'
   where id = :'clara'::uuid;
commit;

select public.verifier(
  (select appreciation from public.candidat where id = :'clara'::uuid) is null,
  'et la base refuse d''elle-même : l''appréciation de Clara est restée vide');

-- ---------------------------------------------------------------------------
\echo '— une autre loge n ouvre rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000025"}';

  select public.verifier(
    (select count(*) from public.fiche_candidat(:'anne'::uuid)) = 0
      and (select count(*) from public.fiche_candidat(:'bruno'::uuid)) = 0
      and (select count(*) from public.fiche_candidat(:'clara'::uuid)) = 0
      and (select count(*) from public.fiche_candidat(:'denis'::uuid)) = 0,
    'Inès n''obtient rien de Lyon — pas une ligne, pas un nom');

  select public.verifier(
    (select nom from public.fiche_candidat(:'tours'::uuid)) = 'Tours',
    'mais sa loge à elle s''ouvre');
commit;

-- ---------------------------------------------------------------------------
\echo '— l administration ouvre les deux loges'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000026"}';

  select public.verifier(
    (select count(*) from public.fiche_candidat(:'anne'::uuid)) = 1
      and (select count(*) from public.fiche_candidat(:'tours'::uuid)) = 1,
    'Jonas ouvre Lyon et Tours — sans lui, les 118 fiches reprises de Bubble '
    'ne s''ouvriraient nulle part');

  select public.verifier(
    (select modifiable from public.fiche_candidat(:'anne'::uuid)) = false,
    'et n''en corrige aucune : administrer n''est pas accompagner');
commit;

-- ---------------------------------------------------------------------------
\echo '— ce que la fiche rend, et ce qu elle ne rend pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000023"}';

  select public.verifier(
    (select email from public.fiche_candidat(:'bruno'::uuid)) = 'bruno0020@example.org'
      and (select cv_chemin from public.fiche_candidat(:'bruno'::uuid)) = 'candidat/cv/bruno.pdf',
    'la fiche rend bien ce qu''une fiche affiche — coordonnées et documents compris');

  select public.verifier(
    (select a_une_photo from public.fiche_candidat(:'anne'::uuid)) = true
      and (select a_une_photo from public.fiche_candidat(:'bruno'::uuid)) = false,
    'et dit qui a un visage à montrer, sans livrer le chemin du fichier');
commit;

-- Le chemin de la photo, lui, ne sort que par sa propre fonction (0019) — et
-- la fiche ne le porte pas : une colonne de plus, c'est une adresse de plus à
-- ne pas laisser fuir.
select public.verifier(
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'fiche_candidat'
      and p.parameter_name = 'photo_chemin') = 0,
  'la fiche ne porte pas le chemin de la photo');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.fiche_candidat('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — la fiche répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0020_fiche_de_la_loge.sql sont passés.'
