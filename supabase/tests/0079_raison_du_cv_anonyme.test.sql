-- Tests de la migration 0079_raison_du_cv_anonyme.sql.
--
--   · Jade   référente des dossiers, à Uzès-0079
--   · Hugo   référent d'Alès-0079                 — ne voit rien

\set ON_ERROR_STOP on
\o /dev/null

\set jade 'cbcbcbcb-7900-0000-0000-000000000001'
\set hugo 'cbcbcbcb-7900-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'jade', 'jade0079@example.org', '{"role":"referent"}'),
  (:'hugo', 'hugo0079@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0079-uzes', 'Uzès — 0079'),
  ('loge-0079-ales', 'Alès — 0079')
on conflict do nothing;
select id as l_uzes from public.loge where bubble_id = 'loge-0079-uzes' \gset
select id as l_ales from public.loge where bubble_id = 'loge-0079-ales' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0079-jade', :'jade', 'JALABERT', 'Jade', :'l_uzes'::uuid),
  ('ref-0079-hugo', :'hugo', 'HUGUET',   'Hugo', :'l_ales'::uuid)
on conflict do nothing;
select id as r_jade from public.referent where bubble_id = 'ref-0079-jade' \gset

insert into public.candidat
  (numero, nom, prenom, loge_id, referent_id, type_emploi, emploi_recherche,
   experiences, cv_chemin, cv_anonyme_chemin, cloture) values
  -- propre : validé par HERACLES
  (7901, 'ARPAILLARGUES', 'Léa', :'l_uzes'::uuid, :'r_jade'::uuid, 'emploi', 'Boulangère',
   '2018-2024 — Boulangère', 'candidats/7901/cv.pdf', null, null),
  -- son nom dans les expériences
  (7902, 'BLAUZAC', 'Rémy', :'l_uzes'::uuid, :'r_jade'::uuid, 'emploi', 'Maçon',
   '2015-2023 — Maçon, entreprise Blauzac', 'candidats/7902/cv.pdf', null, null),
  -- pas de CV original
  (7903, 'COLLORGUES', 'Ana', :'l_uzes'::uuid, :'r_jade'::uuid, 'emploi', 'Vendeuse',
   null, null, null, null),
  -- un CV anonyme déposé
  (7904, 'DIONS', 'Yves', :'l_uzes'::uuid, :'r_jade'::uuid, 'emploi', 'Peintre',
   null, 'candidats/7904/cv.pdf', 'candidats/7904/cv-anonyme.pdf', null),
  -- sans emploi recherché
  (7905, 'EUZET', 'Lina', :'l_uzes'::uuid, :'r_jade'::uuid, 'emploi', null,
   null, 'candidats/7905/cv.pdf', null, null),
  -- refermé
  (7906, 'FLAUX', 'Omar', :'l_uzes'::uuid, :'r_jade'::uuid, 'emploi', 'Chauffeur',
   null, 'candidats/7906/cv.pdf', null, 'Lui-même');

select id as c1 from public.candidat where numero = 7901 \gset
select id as c2 from public.candidat where numero = 7902 \gset
select id as c3 from public.candidat where numero = 7903 \gset
select id as c4 from public.candidat where numero = 7904 \gset
select id as c5 from public.candidat where numero = 7905 \gset
select id as c6 from public.candidat where numero = 7906 \gset

-- ---------------------------------------------------------------------------
\echo '— la raison, telle que la referente la lit'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cbcbcbcb-7900-0000-0000-000000000001"}';
  select public.verifier(
    public.raison_du_cv_anonyme(:'c1'::uuid) is null,
    'valide par HERACLES : pas de raison');
  select public.verifier(
    public.raison_du_cv_anonyme(:'c2'::uuid)
      = 'Non validé automatiquement : il contient le nom ou le prénom du candidat, dans « Expériences ».',
    'le nom dans les experiences, et ou');
  select public.verifier(
    public.raison_du_cv_anonyme(:'c3'::uuid) = 'Non validé automatiquement : pas de CV original.',
    'pas de CV original');
  select public.verifier(
    public.raison_du_cv_anonyme(:'c4'::uuid) like 'Non validé automatiquement : un CV anonyme a été déposé%',
    'un CV anonyme depose');
  select public.verifier(
    public.raison_du_cv_anonyme(:'c5'::uuid) like '%ne dit pas l''emploi recherché.',
    'pas d emploi recherche');
  select public.verifier(
    public.raison_du_cv_anonyme(:'c6'::uuid) = 'Non validé automatiquement : le dossier est refermé.',
    'dossier referme');

  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, false) = 'retire',
    'Jade retire la validation de HERACLES');
  select public.verifier(
    public.raison_du_cv_anonyme(:'c1'::uuid) like 'Validation retirée par un référent%',
    'et le bandeau dit qu elle a ete retiree');
commit;

-- ---------------------------------------------------------------------------
\echo '— hors de la loge, rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cbcbcbcb-7900-0000-0000-000000000002"}';
  select public.verifier(
    public.raison_du_cv_anonyme(:'c2'::uuid) is null,
    'un referent d une autre loge n apprend rien');
commit;

do $$
begin
  perform set_config('role', 'anon', true);
  begin
    perform public.raison_du_cv_anonyme((select id from public.candidat where numero = 7902));
    raise exception 'ÉCHEC — anon lit la raison';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne lit pas la raison';
  end;
end
$$;

\o
\echo '0079 — la raison du CV anonyme : tout est vert.'
