-- Tests de la migration 0076_contact_du_cv_anonyme.sql.
--
--   · à Pau-0076, Sophie porte le titre de Secrétaire ; Rémi suit le dossier 7601
--   · à Tarbes-0076, personne n'est Secrétaire ; Teo suit le dossier 7602
--
-- Le lien public se teste en `anon` : c'est ainsi qu'il s'ouvre.

\set ON_ERROR_STOP on
\o /dev/null

\set sophie 'cdcdcdcd-7600-0000-0000-000000000001'
\set remi   'cdcdcdcd-7600-0000-0000-000000000002'
\set teo    'cdcdcdcd-7600-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sophie', 'sophie0076@example.org', '{"role":"referent"}'),
  (:'remi',   'remi0076@example.org',   '{"role":"referent"}'),
  (:'teo',    'teo0076@example.org',    '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0076-pau',    'Pau — 0076'),
  ('loge-0076-tarbes', 'Tarbes — 0076')
on conflict do nothing;
select id as l_pau    from public.loge where bubble_id = 'loge-0076-pau' \gset
select id as l_tarbes from public.loge where bubble_id = 'loge-0076-tarbes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, email, loge_id) values
  ('ref-0076-sophie', :'sophie', 'SAVARY', 'Sophie', 'Secrétaire', 'secretariat-pau@exemple.org', :'l_pau'::uuid),
  ('ref-0076-remi',   :'remi',   'RAMOND', 'Rémi',   null,         'remi@exemple.org',            :'l_pau'::uuid),
  ('ref-0076-teo',    :'teo',    'TAPIE',  'Teo',    null,         'teo@exemple.org',             :'l_tarbes'::uuid)
on conflict do nothing;
select id as r_remi from public.referent where bubble_id = 'ref-0076-remi' \gset
select id as r_teo  from public.referent where bubble_id = 'ref-0076-teo' \gset

insert into public.candidat (numero, nom, prenom, email, loge_id, referent_id, type_emploi, emploi_recherche) values
  (7601, 'SECRET', 'Sabine', 'sabine0076@exemple.org', :'l_pau'::uuid,    :'r_remi'::uuid, 'emploi', 'Assistante de direction'),
  (7602, 'CACHE',  'Cyril',  'cyril0076@exemple.org',  :'l_tarbes'::uuid, :'r_teo'::uuid,  'stage',  'Stage de comptabilité');

select id as c1, cv_anonyme_jeton as j1 from public.candidat where numero = 7601 \gset
select id as c2, cv_anonyme_jeton as j2 from public.candidat where numero = 7602 \gset

-- ---------------------------------------------------------------------------
\echo '— avant validation, rien ne sort, pas meme l adresse du Secretaire'
-- ---------------------------------------------------------------------------
begin;
  set local role anon;
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j1'::uuid)) = 0,
    'un CV non valide ne rend aucune ligne');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7600-0000-0000-000000000002"}';
  select public.verifier(public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide', 'Remi valide a Pau');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7600-0000-0000-000000000003"}';
  select public.verifier(public.valider_cv_anonyme(:'c2'::uuid, true) = 'valide', 'Teo valide a Tarbes');
commit;

-- ---------------------------------------------------------------------------
\echo '— valide, le CV porte l adresse du Secretaire de sa loge'
-- ---------------------------------------------------------------------------
begin;
  set local role anon;
  select public.verifier(
    (select secretaire_email from public.cv_anonyme_valide_public(:'j1'::uuid)) = 'secretariat-pau@exemple.org',
    'le Secretaire de Pau, pour un dossier de Pau');
  select public.verifier(
    (select secretaire_email is null and emploi_recherche = 'Stage de comptabilité'
       from public.cv_anonyme_valide_public(:'j2'::uuid)),
    'une loge sans Secretaire : pas d adresse, le reste du CV sort');
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j1'::uuid)
      where secretaire_email in ('remi@exemple.org', 'sabine0076@exemple.org')) = 0,
    'ni l adresse du referent qui suit, ni celle du candidat');
commit;

-- Le titre change de mains : le CV suit, sans toucher aux reglages.
update public.referent set college = null where bubble_id = 'ref-0076-sophie';
update public.referent set college = 'Secrétaire' where bubble_id = 'ref-0076-remi';
begin;
  set local role anon;
  select public.verifier(
    (select secretaire_email from public.cv_anonyme_valide_public(:'j1'::uuid)) = 'remi@exemple.org',
    'le nouveau Secretaire, des le changement de titre');
commit;

\o
\echo '0076 — le contact du CV anonyme : tout est vert.'
