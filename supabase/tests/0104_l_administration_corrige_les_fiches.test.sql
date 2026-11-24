-- Tests de la migration 0104_l_administration_corrige_les_fiches.sql.
--
-- Qui est qui :
--   · Rémi    référent du candidat, loge Nord        — corrige, comme avant
--   · Victor  autre référent de la loge Nord         — lit la fiche, ne la corrige pas
--   · Ada     administratrice, sans fiche de référent — corrige toute fiche
--
-- Données fabriquées : aucune personne réelle.

\set ON_ERROR_STOP on
\o /dev/null

\set remi   'cccccccc-0104-0000-0000-000000000001'
\set victor 'cccccccc-0104-0000-0000-000000000002'
\set ada    'cccccccc-0104-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',   'remi0104@example.org',   '{"role":"referent"}'),
  (:'victor', 'victor0104@example.org', '{"role":"referent"}'),
  (:'ada',    'ada0104@example.org',    '{"role":"referent"}')
on conflict (id) do nothing;
update public.profil set role = 'admin' where id = :'ada';

insert into public.loge (bubble_id, nom) values ('loge-0104-nord', 'Nord — 0104')
on conflict (bubble_id) do nothing;
select id as nord from public.loge where bubble_id = 'loge-0104-nord' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0104-remi',   :'remi',   'REMI',   'Rémi',   :'nord'::uuid),
  ('ref-0104-victor', :'victor', 'VICTOR', 'Victor', :'nord'::uuid)
on conflict (bubble_id) do nothing;
select id as r_remi   from public.referent where bubble_id = 'ref-0104-remi' \gset
select id as r_victor from public.referent where bubble_id = 'ref-0104-victor' \gset

insert into public.candidat (bubble_id, nom, prenom, loge_id, referent_id) values
  ('cand-0104', 'Essai', 'Claude', :'nord'::uuid, :'r_remi'::uuid)
on conflict (bubble_id) do nothing;
select id as cand from public.candidat where bubble_id = 'cand-0104' \gset

\o
\echo '— Ada, administratrice : le crayon paraît, et elle corrige'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);

  select public.verifier(
    (select f.modifiable from public.fiche_candidat(:'cand'::uuid) f),
    'la fiche dit à l''administration qu''elle peut la corriger');

  select public.verifier(
    (select count(*) from public.candidat where id = :'cand'::uuid) = 1,
    'l''administration lit la fiche dans la table, pour la page de correction');

  with corrige as (
    update public.candidat set code_postal = '33000', ville = 'Bordeaux'
     where id = :'cand'::uuid returning id)
  select public.verifier((select count(*) from corrige) = 1,
    'l''administration corrige le code postal');

  -- Le rattachement reste figé (déclencheur de 0006), même pour elle.
  update public.candidat set referent_id = :'r_victor'::uuid where id = :'cand'::uuid;
  select public.verifier(
    (select referent_id from public.candidat where id = :'cand'::uuid) = :'r_remi'::uuid,
    'le référent ne se change pas par la correction de la fiche');
commit;

select public.verifier(
  (select code_postal = '33000' and ville = 'Bordeaux' from public.candidat where id = :'cand'::uuid),
  'la correction de l''administration est enregistrée');

\echo '— Rémi, référent du candidat : rien ne change pour lui'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  select public.verifier(
    (select f.modifiable from public.fiche_candidat(:'cand'::uuid) f),
    'le référent voit toujours le crayon');
  with corrige as (
    update public.candidat set code_postal = '33100' where id = :'cand'::uuid returning id)
  select public.verifier((select count(*) from corrige) = 1, 'le référent corrige toujours');
commit;

\echo '— Victor, autre référent de la loge : il lit, ne corrige pas'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'victor' || '"}', true);
  select public.verifier(
    (select not f.modifiable from public.fiche_candidat(:'cand'::uuid) f),
    'un autre référent de la loge ne voit pas le crayon');
  with corrige as (
    update public.candidat set code_postal = '64000' where id = :'cand'::uuid returning id)
  select public.verifier((select count(*) from corrige) = 0,
    'un autre référent de la loge ne corrige pas : aucune ligne touchée');
commit;

select public.verifier(
  (select code_postal = '33100' from public.candidat where id = :'cand'::uuid),
  'seule la correction du référent est passée après celle de l''administration');
