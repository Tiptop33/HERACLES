-- Tests de la migration 0025_corriger_et_retirer.sql.
--
-- Le point qui compte : retirer n'est pas effacer. Une ligne retirée quitte
-- les écrans, reste en base, et revient si on la rappelle. Le reste éprouve
-- que la correction s'ouvre à la loge sans ouvrir autre chose.
--
--   · Alix   référent à Blois-0025, il suit Zoé
--   · Bree   référente à Blois-0025 — elle n'accompagne personne
--   · Chan   référente à Dax-0025 — Blois ne la regarde pas

\set ON_ERROR_STOP on
\o /dev/null

\set alix 'aaaaaaaa-3333-0000-0000-000000000051'
\set bree 'aaaaaaaa-3333-0000-0000-000000000052'
\set chan 'aaaaaaaa-3333-0000-0000-000000000053'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alix', 'alix0025@example.org', '{"role":"referent","nom":"Alix","prenom":"A"}'),
  (:'bree', 'bree0025@example.org', '{"role":"referent","nom":"Bree","prenom":"B"}'),
  (:'chan', 'chan0025@example.org', '{"role":"referent","nom":"Chan","prenom":"C"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0025-blois', 'Blois — 0025'),
  ('loge-0025-dax',   'Dax — 0025')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0025-alix', :'alix', 'Alix', 'A', 'alix0025@example.org',
   (select id from public.loge where bubble_id = 'loge-0025-blois')),
  ('ref-0025-bree', :'bree', 'Bree', 'B', 'bree0025@example.org',
   (select id from public.loge where bubble_id = 'loge-0025-blois')),
  ('ref-0025-chan', :'chan', 'Chan', 'C', 'chan0025@example.org',
   (select id from public.loge where bubble_id = 'loge-0025-dax'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id, referent_id) values
  ('cand-0025-zoe', 801, 'Zoé', 'Z', 'Blois',
   (select id from public.loge where bubble_id = 'loge-0025-blois'),
   (select id from public.referent where bubble_id = 'ref-0025-alix'))
on conflict do nothing;

select id as zoe    from public.candidat where bubble_id = 'cand-0025-zoe'  \gset
select id as r_alix from public.referent where bubble_id = 'ref-0025-alix' \gset

-- Une ligne reprise de Bubble, sans auteur : le cas qui a fait ouvrir la
-- correction à la loge.
insert into public.suivi (bubble_id, candidat_id, auteur_id, fait_le, texte) values
  ('tache-0025-orpheline', :'zoe'::uuid, null, date '2026-04-01',
   'Reprise de Bubble, personne ne l''a signée.')
on conflict (bubble_id) do nothing;

select id as orpheline from public.suivi where bubble_id = 'tache-0025-orpheline' \gset
select set_config('essai.orpheline', :'orpheline', false),
       set_config('essai.zoe',       :'zoe',       false);

-- ---------------------------------------------------------------------------
\echo '— une collegue de loge corrige, et laisse son nom'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000052"}';

  select public.verifier(
    public.modifier_le_suivi(current_setting('essai.orpheline')::uuid,
      'Reprise de Bubble, corrigée depuis HERACLES.', 'Appel', date '2026-04-02'),
    'Bree corrige une ligne qu''elle n''a pas écrite, sur une candidate qu''elle n''accompagne pas');

  select public.verifier(
    (select texte from public.suivi_du_candidat(:'zoe'::uuid))
      = 'Reprise de Bubble, corrigée depuis HERACLES.'
    and (select nature  from public.suivi_du_candidat(:'zoe'::uuid)) = 'Appel'
    and (select fait_le from public.suivi_du_candidat(:'zoe'::uuid)) = date '2026-04-02',
    'le texte, la nature et le jour ont suivi');

  select public.verifier(
    (select modifie_par_nom from public.suivi_du_candidat(:'zoe'::uuid)) = 'B Bree',
    'et le journal dit qui a corrigé');
commit;

-- L'auteur d'origine ne change pas : corriger n'est pas s'approprier.
select public.verifier(
  (select auteur_id from public.suivi where bubble_id = 'tache-0025-orpheline') is null,
  'l''auteur d''origine reste celui qu''il était — ici personne');

-- ---------------------------------------------------------------------------
\echo '— une note vide ou demesuree est refusee'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000051"}', true);

  begin
    perform public.modifier_le_suivi(current_setting('essai.orpheline')::uuid, '   ');
    raise exception 'ÉCHEC — une note vide a été acceptée';
  exception when check_violation then
    raise notice '  ok — une note vide ne dit rien';
  end;

  begin
    perform public.modifier_le_suivi(
      current_setting('essai.orpheline')::uuid, repeat('x', 4001));
    raise exception 'ÉCHEC — une note de 4001 caractères a été acceptée';
  exception when check_violation then
    raise notice '  ok — et une note démesurée non plus';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— retirer n est pas effacer'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000052"}';

  select public.verifier(
    public.retirer_le_suivi(current_setting('essai.orpheline')::uuid),
    'Bree retire la ligne');

  select public.verifier(
    (select count(*) from public.suivi_du_candidat(:'zoe'::uuid)) = 0,
    'elle a quitté le journal');
commit;

-- C'est ici que se joue la différence avec une suppression.
select public.verifier(
  (select count(*) from public.suivi where bubble_id = 'tache-0025-orpheline') = 1,
  'mais elle est toujours en base — retirer n''est pas effacer');

select public.verifier(
  (select retire_le is not null from public.suivi where bubble_id = 'tache-0025-orpheline'),
  'avec la date du retrait');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000051"}';

  select public.verifier(
    (select retire_par_nom from public.suivi_retire_du_candidat(:'zoe'::uuid)) = 'B Bree',
    'et Alix peut voir qui l''a retirée');
commit;

-- ---------------------------------------------------------------------------
\echo '— et le geste se defait'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000051"}';

  select public.verifier(
    public.rendre_le_suivi(current_setting('essai.orpheline')::uuid),
    'Alix rend la ligne retirée par Bree');

  select public.verifier(
    (select count(*) from public.suivi_du_candidat(:'zoe'::uuid)) = 1
      and (select count(*) from public.suivi_retire_du_candidat(:'zoe'::uuid)) = 0,
    'elle est revenue dans le journal — c''est ce qui rend le retrait doux acceptable');
commit;

-- ---------------------------------------------------------------------------
\echo '— une ligne retiree ne se corrige pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000051"}';

  select public.retirer_le_suivi(current_setting('essai.orpheline')::uuid);

  select public.verifier(
    public.modifier_le_suivi(current_setting('essai.orpheline')::uuid, 'tentative') = false,
    'ce qui est écarté n''est pas modifiable — il faut le rendre d''abord');

  select public.rendre_le_suivi(current_setting('essai.orpheline')::uuid);
commit;

-- Un second retrait n'écrase pas la trace du premier.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000052"}';
  select public.retirer_le_suivi(current_setting('essai.orpheline')::uuid);
  select public.verifier(
    public.retirer_le_suivi(current_setting('essai.orpheline')::uuid) = false,
    'retirer deux fois ne fait rien la seconde');
  select public.rendre_le_suivi(current_setting('essai.orpheline')::uuid);
commit;

-- ---------------------------------------------------------------------------
\echo '— une autre loge ne touche a rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000053"}';

  select public.verifier(
    public.modifier_le_suivi(current_setting('essai.orpheline')::uuid, 'par Chan') = false
      and public.retirer_le_suivi(current_setting('essai.orpheline')::uuid) = false
      and public.rendre_le_suivi(current_setting('essai.orpheline')::uuid) = false,
    'Chan n''obtient rien de Blois : les trois fonctions rendent faux');
commit;

select public.verifier(
  (select count(*) from public.suivi where texte = 'par Chan') = 0,
  'et rien n''a bougé');

-- ---------------------------------------------------------------------------
\echo '— la suppression reste interdite, comme 0021 l a pose'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'suivi' and cmd = 'DELETE') = 0,
  'toujours aucune policy de suppression : 0025 retire, il n''efface pas');

-- La barrière est double, et c'est la première qui répond : 0021 ne donne que
-- `select, insert, update` à `authenticated`. Le `delete` est donc refusé au
-- privilège de table, avant même qu'une policy ait à se prononcer.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000051"}', true);
  begin
    delete from public.suivi where id = current_setting('essai.orpheline')::uuid;
    raise exception 'ÉCHEC — une ligne de journal a été effacée';
  exception when insufficient_privilege then
    raise notice '  ok — le droit d''effacer n''est donné à personne';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.retirer_le_suivi('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — retirer répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit de l''appeler';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0025_corriger_et_retirer.sql sont passés.'
