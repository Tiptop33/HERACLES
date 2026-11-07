-- Tests de la migration 0059_role_candidat.sql.
--
--   · Inès  s'inscrit sans métadonnées
--   · Yann  s'inscrit en demandant l'ancien mot, « chercheur »
--   · Pablo s'inscrit en demandant « admin »
--   · Lucie s'inscrit candidate, puis on découvre sa fiche de référente
--
-- Ce qui compte : l'ancien mot a disparu de la base, et aucun chemin
-- d'inscription ne fabrique autre chose qu'un candidat ou un référent.

\set ON_ERROR_STOP on
\o /dev/null

\set ines  'aaaaaaaa-5900-0000-0000-000000000001'
\set yann  'aaaaaaaa-5900-0000-0000-000000000002'
\set pablo 'aaaaaaaa-5900-0000-0000-000000000003'
\set lucie 'aaaaaaaa-5900-0000-0000-000000000004'

\echo '— le mot a changé dans l''énumération'
select public.verifier(
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'role_utilisateur' and e.enumlabel = 'chercheur'),
  'la valeur « chercheur » n''existe plus');
select public.verifier(
  exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'role_utilisateur' and e.enumlabel = 'candidat'),
  'la valeur « candidat » existe');
select public.verifier(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%''chercheur''%'),
  'aucune fonction n''écrit plus « chercheur » en toutes lettres');

\echo '— l''inscription ne fabrique que des candidats'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ines',  'ines0059@example.org',  '{}'),
  (:'yann',  'yann0059@example.org',  '{"role":"chercheur"}'),
  (:'pablo', 'pablo0059@example.org', '{"role":"admin"}');

select public.verifier((select role from public.profil where id = :'ines') = 'candidat',
  'sans métadonnées, le rôle retombe sur candidat');
select public.verifier((select role from public.profil where id = :'yann') = 'candidat',
  'l''ancien mot, envoyé par un vieux formulaire, donne candidat et n''échoue pas');
select public.verifier((select role from public.profil where id = :'pablo') = 'candidat',
  'demander « admin » ne donne que candidat');

\echo '— un candidat qui a une fiche de référent devient référent'
insert into public.loge (bubble_id, nom) values
  ('loge-0059', 'Loge — 0059')
on conflict do nothing;
insert into public.referent (bubble_id, nom, prenom, email, loge_id) values
  ('ref-0059-lucie', 'Lucie', 'L', 'lucie0059@example.org',
   (select id from public.loge where bubble_id = 'loge-0059'))
on conflict do nothing;

insert into auth.users (id, email, raw_user_meta_data) values
  (:'lucie', 'lucie0059@example.org', '{"role":"candidat"}');

select public.verifier((select role from public.profil where id = :'lucie') = 'referent',
  'le rattachement à sa fiche fait passer Lucie de candidat à référent');

\echo ''
\echo 'Tous les contrôles de 0059_role_candidat.sql sont passés.'
