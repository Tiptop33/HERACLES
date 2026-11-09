-- Tests de la migration 0072_rouvrir_un_dossier.sql.
--
--   · Sophie Secrétaire à Pau-0072        — rouvre
--   · Raoul  sans titre à Pau-0072        — ne rouvre pas
--   · Vera   Vénérable  à Tarbes-0072     — rouvre, mais chez elle

\set ON_ERROR_STOP on
\o /dev/null

\set sophie 'cdcdcdcd-7200-0000-0000-000000000001'
\set raoul  'cdcdcdcd-7200-0000-0000-000000000002'
\set vera   'cdcdcdcd-7200-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sophie', 'sophie0072@example.org', '{"role":"referent"}'),
  (:'raoul',  'raoul0072@example.org',  '{"role":"referent"}'),
  (:'vera',   'vera0072@example.org',   '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0072-pau',    'Pau — 0072'),
  ('loge-0072-tarbes', 'Tarbes — 0072')
on conflict do nothing;
select id as l_pau    from public.loge where bubble_id = 'loge-0072-pau' \gset
select id as l_tarbes from public.loge where bubble_id = 'loge-0072-tarbes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, loge_id) values
  ('ref-0072-sophie', :'sophie', 'SAVARY', 'Sophie', 'Secrétaire',       :'l_pau'::uuid),
  ('ref-0072-raoul',  :'raoul',  'RIGAL',  'Raoul',  null,               :'l_pau'::uuid),
  ('ref-0072-vera',   :'vera',   'VERDIER','Vera',   'Vénérable Maître', :'l_tarbes'::uuid)
on conflict do nothing;

-- À Pau : un dossier ouvert (qu'on clôturera dans HERACLES), un clos dans
-- Bubble, un archivé, un ouvert qui le reste. À Tarbes : un clos dans Bubble.
insert into public.candidat (numero, nom, prenom, loge_id, bubble_id, cloture, archive, bubble_modifie_le) values
  (7201, 'ARIAS',  'Alba', :'l_pau'::uuid,    null,        null,       null,  null),
  (7202, 'BOYER',  'Bart', :'l_pau'::uuid,    'cand-7202', 'Lui-même', 'Non', now() - interval '3 months'),
  (7203, 'CASTEL', 'Cora', :'l_pau'::uuid,    'cand-7203', 'Heraclés', 'Oui', now() - interval '1 year'),
  (7204, 'DELMAS', 'Dino', :'l_pau'::uuid,    null,        null,       null,  null),
  (7205, 'ESPIL',  'Elio', :'l_tarbes'::uuid, 'cand-7205', 'Autre',    'Non', now() - interval '3 months');

select id as c1 from public.candidat where numero = 7201 \gset
select id as c2 from public.candidat where numero = 7202 \gset
select id as c3 from public.candidat where numero = 7203 \gset
select id as c4 from public.candidat where numero = 7204 \gset
select id as c5 from public.candidat where numero = 7205 \gset

-- ---------------------------------------------------------------------------
\echo '— le titre, puis ce qui se rouvre'
-- ---------------------------------------------------------------------------
do $$
declare
  clos uuid := (select id from public.candidat where numero = 7202);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"cdcdcdcd-7200-0000-0000-000000000002"}', true);
  begin
    perform public.rouvrir_un_dossier(clos);
    raise exception 'ÉCHEC — un referent sans titre a rouvert';
  exception when insufficient_privilege then
    raise notice '  ok — un referent sans titre ne rouvre pas';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7200-0000-0000-000000000001"}';
  select public.verifier(public.rouvrir_un_dossier(:'c4'::uuid) = 'pas-cloture',
    'un dossier en cours ne se rouvre pas');
  select public.verifier(public.rouvrir_un_dossier(:'c3'::uuid) = 'pas-cloture',
    'un dossier archive non plus');
  select public.verifier(public.rouvrir_un_dossier(:'c5'::uuid) = 'introuvable',
    'ni le dossier d une autre loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— un dossier clos dans HERACLES se rouvre, malgre la protection de 0071'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7200-0000-0000-000000000001"}';
  select public.verifier(public.cloturer_un_dossier(:'c1'::uuid, 'Lui-même') = 'cloture',
    'la Secretaire cloture un dossier');
  select public.verifier(public.rouvrir_un_dossier(:'c1'::uuid) = 'rouvert',
    'et le rouvre');
commit;

select public.verifier(
  (select cloture is null and clos_le is null and rouvert_le is not null
     from public.candidat where id = :'c1'::uuid),
  'la cloture est effacee, la reouverture datee');

-- ---------------------------------------------------------------------------
\echo '— un dossier clos dans Bubble se rouvre, et la reprise ne le referme pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7200-0000-0000-000000000001"}';
  select public.verifier(public.rouvrir_un_dossier(:'c2'::uuid) = 'rouvert',
    'la Secretaire rouvre un dossier clos dans Bubble');
  select public.verifier(
    not exists (select 1 from public.dossiers_a_archiver() where candidat_id = :'c2'::uuid),
    'il ne se propose plus a l archivage');
commit;

-- Ce que ferait MAJBUBBLE : recopier CLOTURE tel que Bubble l'a.
update public.candidat set cloture = 'Lui-même', archive = 'Non' where id = :'c2'::uuid;
select public.verifier(
  (select cloture is null from public.candidat where id = :'c2'::uuid),
  'la reprise ne referme pas un dossier rouvert dans HERACLES');

update public.candidat set archive = 'Oui' where id = :'c2'::uuid;
select public.verifier(
  (select archive = 'Non' from public.candidat where id = :'c2'::uuid),
  'ni ne l archive');

-- Une modification ordinaire passe toujours.
update public.candidat set prenom = 'Barthélémy' where id = :'c2'::uuid;
select public.verifier(
  (select prenom = 'Barthélémy' and cloture is null from public.candidat where id = :'c2'::uuid),
  'le reste de la fiche se met a jour');

-- Le refermer reste possible, par HERACLES.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7200-0000-0000-000000000001"}';
  select public.verifier(public.cloturer_un_dossier(:'c2'::uuid, 'Heraclés') = 'cloture',
    'HERACLES peut le reclôturer');
commit;
select public.verifier(
  (select cloture = 'Heraclés' and clos_le is not null from public.candidat where id = :'c2'::uuid),
  'avec son motif et sa date');

-- ---------------------------------------------------------------------------
\echo '— la Venerable de Tarbes rouvre chez elle'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7200-0000-0000-000000000003"}';
  select public.verifier(public.rouvrir_un_dossier(:'c5'::uuid) = 'rouvert',
    'la Venerable rouvre un dossier de sa loge');
  select public.verifier(public.rouvrir_un_dossier(:'c2'::uuid) = 'introuvable',
    'pas celui de Pau');
commit;

\o
\echo '0072 — rouvrir un dossier : tout est vert.'
