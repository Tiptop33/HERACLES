-- Tests de la migration 0071_cloture_et_archivage.sql.
--
--   · Sophie Secrétaire à Agen-0071          — clôture, tranche l'archivage
--   · Raoul  sans titre à Agen-0071          — ni l'un ni l'autre
--   · Vera   Vénérable  à Auch-0071          — tranche, mais chez elle
--   · Igor   administrateur, sans fiche      — clôture partout, ne tranche pas

\set ON_ERROR_STOP on
\o /dev/null

\set sophie 'abababab-7100-0000-0000-000000000001'
\set raoul  'abababab-7100-0000-0000-000000000002'
\set vera   'abababab-7100-0000-0000-000000000003'
\set igor   'abababab-7100-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sophie', 'sophie0071@example.org', '{"role":"referent"}'),
  (:'raoul',  'raoul0071@example.org',  '{"role":"referent"}'),
  (:'vera',   'vera0071@example.org',   '{"role":"referent"}'),
  (:'igor',   'igor0071@example.org',   '{"role":"referent"}');
update public.profil set role = 'admin' where id = :'igor';

insert into public.loge (bubble_id, nom) values
  ('loge-0071-agen', 'Agen — 0071'),
  ('loge-0071-auch', 'Auch — 0071')
on conflict do nothing;
select id as l_agen from public.loge where bubble_id = 'loge-0071-agen' \gset
select id as l_auch from public.loge where bubble_id = 'loge-0071-auch' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, loge_id) values
  ('ref-0071-sophie', :'sophie', 'SAVARY', 'Sophie', 'Secrétaire',       :'l_agen'::uuid),
  ('ref-0071-raoul',  :'raoul',  'RIGAL',  'Raoul',  null,               :'l_agen'::uuid),
  ('ref-0071-vera',   :'vera',   'VERDIER','Vera',   'Vénérable Maître', :'l_auch'::uuid)
on conflict do nothing;

-- À Agen : un dossier ouvert, un clos dans Bubble depuis trois mois, un clos
-- dans Bubble sans date connue, un archivé dans Bubble, un clos depuis un mois.
-- À Auch : un dossier clos depuis trois mois, un dossier ouvert.
insert into public.candidat (numero, nom, prenom, loge_id, bubble_id, cloture, archive, bubble_modifie_le) values
  (7101, 'ALBERT', 'Ana',  :'l_agen'::uuid, null,          null,       null,  null),
  (7102, 'BRUN',   'Bob',  :'l_agen'::uuid, 'cand-7102',   'Lui-même', 'Non', now() - interval '3 months'),
  (7103, 'CAZES',  'Cléa', :'l_agen'::uuid, 'cand-7103',   'Autre ,,,','Non', null),
  (7104, 'DUBOIS', 'Dan',  :'l_agen'::uuid, 'cand-7104',   'Heraclés', 'Oui', now() - interval '1 year'),
  (7105, 'ESTÈVE', 'Ema',  :'l_agen'::uuid, 'cand-7105',   'Autre',    'Non', now() - interval '1 month'),
  (7106, 'FAURE',  'Fred', :'l_auch'::uuid, 'cand-7106',   'Lui-même', 'Non', now() - interval '3 months'),
  (7107, 'GIL',    'Gus',  :'l_auch'::uuid, null,          null,       null,  null);

select id as c1 from public.candidat where numero = 7101 \gset
select id as c2 from public.candidat where numero = 7102 \gset
select id as c3 from public.candidat where numero = 7103 \gset
select id as c4 from public.candidat where numero = 7104 \gset
select id as c5 from public.candidat where numero = 7105 \gset
select id as c6 from public.candidat where numero = 7106 \gset
select id as c7 from public.candidat where numero = 7107 \gset

-- ---------------------------------------------------------------------------
\echo '— clôturer : le titre, le motif, la loge'
-- ---------------------------------------------------------------------------
do $$
declare
  ouvert uuid := (select id from public.candidat where numero = 7101);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"abababab-7100-0000-0000-000000000002"}', true);
  begin
    perform public.cloturer_un_dossier(ouvert, 'Lui-même');
    raise exception 'ÉCHEC — un referent sans titre a cloture';
  exception when insufficient_privilege then
    raise notice '  ok — un referent sans titre ne cloture pas';
  end;

  perform set_config('request.jwt.claims', '{"sub":"abababab-7100-0000-0000-000000000001"}', true);
  begin
    perform public.cloturer_un_dossier(ouvert, 'Peut-être');
    raise exception 'ÉCHEC — un motif inconnu est accepte';
  exception when invalid_parameter_value then
    raise notice '  ok — le motif est Lui-même, Heraclés ou Autre';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000001"}';
  select public.verifier(public.cloturer_un_dossier(:'c1'::uuid, 'Lui-même') = 'cloture',
    'la Secretaire cloture un dossier ouvert de sa loge');
  select public.verifier(public.cloturer_un_dossier(:'c1'::uuid, 'Autre') = 'deja',
    'un dossier deja cloture ne se cloture pas deux fois');
  select public.verifier(public.cloturer_un_dossier(:'c4'::uuid, 'Autre') = 'deja',
    'ni un dossier archive');
  select public.verifier(public.cloturer_un_dossier(:'c7'::uuid, 'Autre') = 'introuvable',
    'ni le dossier d une autre loge');
commit;

select public.verifier(
  (select cloture = 'Lui-même' and clos_le is not null from public.candidat where id = :'c1'::uuid),
  'la cloture porte son motif et sa date');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000004"}';
  select public.verifier(public.cloturer_un_dossier(:'c7'::uuid, 'Heraclés') = 'cloture',
    'l administrateur cloture dans toutes les loges');
commit;

-- ---------------------------------------------------------------------------
\echo '— les dossiers a proposer : deux mois, une date, ma loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000001"}';
  select public.verifier(
    (select array_agg(numero order by numero) from public.dossiers_a_archiver()) = array[7102],
    'seul le dossier clos depuis trois mois est propose a la Secretaire');
  select public.verifier(
    (select estime from public.dossiers_a_archiver()),
    'sa date est marquee approchee : elle vient de Bubble');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000002"}';
  select public.verifier((select count(*) from public.dossiers_a_archiver()) = 0,
    'rien n est propose a un referent sans titre');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000004"}';
  select public.verifier((select count(*) from public.dossiers_a_archiver()) = 0,
    'ni a l administrateur sans titre');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000003"}';
  select public.verifier(
    (select array_agg(numero) from public.dossiers_a_archiver()) = array[7106],
    'la Venerable d Auch ne voit que les siens');
commit;

-- ---------------------------------------------------------------------------
\echo '— trancher : pas encore, puis un mois plus tard, puis archiver'
-- ---------------------------------------------------------------------------
do $$
declare
  dossier uuid := (select id from public.candidat where numero = 7102);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"abababab-7100-0000-0000-000000000004"}', true);
  begin
    perform public.trancher_l_archivage(dossier, true);
    raise exception 'ÉCHEC — l administrateur sans titre a tranche';
  exception when insufficient_privilege then
    raise notice '  ok — l administrateur sans titre ne tranche pas';
  end;
  perform set_config('request.jwt.claims', '{"sub":"abababab-7100-0000-0000-000000000002"}', true);
  begin
    perform public.trancher_l_archivage(dossier, true);
    raise exception 'ÉCHEC — un referent sans titre a tranche';
  exception when insufficient_privilege then
    raise notice '  ok — un referent sans titre ne tranche pas';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000003"}';
  select public.verifier(public.trancher_l_archivage(:'c2'::uuid, true) = 'introuvable',
    'la Venerable d Auch ne tranche pas un dossier d Agen');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000001"}';
  select public.verifier(public.trancher_l_archivage(:'c2'::uuid, false) = 'reporte',
    '« pas encore » repousse la question');
  select public.verifier((select count(*) from public.dossiers_a_archiver()) = 0,
    'et le dossier n est plus propose');
commit;

select public.verifier(
  (select archivage_reporte_au = (current_date + interval '1 month')::date
     from public.candidat where id = :'c2'::uuid),
  'jusqu a dans un mois');

-- Un mois a passé.
update public.candidat set archivage_reporte_au = current_date where id = :'c2'::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000001"}';
  select public.verifier(
    (select array_agg(numero) from public.dossiers_a_archiver()) = array[7102],
    'un mois plus tard, la question revient');
  select public.verifier(public.trancher_l_archivage(:'c2'::uuid, true) = 'archive',
    'la Secretaire confirme l archivage');
  select public.verifier((select count(*) from public.dossiers_a_archiver()) = 0,
    'et le dossier n est plus propose');
  select public.verifier(public.trancher_l_archivage(:'c2'::uuid, true) = 'introuvable',
    'un dossier archive ne se tranche plus');
commit;

select public.verifier(
  (select archive = 'Oui' and archive_le is not null and archivage_reporte_au is null
     from public.candidat where id = :'c2'::uuid),
  'l archivage porte Oui, comme Bubble, et sa date');

-- ---------------------------------------------------------------------------
\echo '— la reprise de Bubble ne defait pas une decision d HERACLES'
-- ---------------------------------------------------------------------------
-- Ce que ferait MAJBUBBLE : recopier CLOTURE et ARCHIVER tels que Bubble les a.
update public.candidat set cloture = null, archive = null where id = :'c1'::uuid;
update public.candidat set cloture = 'Lui-même', archive = 'Non' where id = :'c2'::uuid;
update public.candidat set cloture = 'Autre', archive = 'Non' where id = :'c5'::uuid;

select public.verifier(
  (select cloture = 'Lui-même' from public.candidat where id = :'c1'::uuid),
  'un dossier cloture dans HERACLES le reste');
select public.verifier(
  (select archive = 'Oui' from public.candidat where id = :'c2'::uuid),
  'un dossier archive dans HERACLES le reste');
select public.verifier(
  (select archive = 'Non' and cloture = 'Autre' from public.candidat where id = :'c5'::uuid),
  'un dossier que Bubble seul a refermé suit Bubble');

-- ---------------------------------------------------------------------------
\echo '— les dates des dossiers refermes'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.dates_des_dossiers_refermes()) = 5,
    'un referent d Agen voit les cinq dossiers refermes de sa loge');
  select public.verifier(
    (select not clos_estime and clos_le is not null
       from public.dates_des_dossiers_refermes() where candidat_id = :'c1'::uuid),
    'la cloture faite dans HERACLES a sa vraie date');
  select public.verifier(
    (select clos_estime and not archive_estime
       from public.dates_des_dossiers_refermes() where candidat_id = :'c2'::uuid),
    'cloture approchee par Bubble, archivage date par HERACLES');
  select public.verifier(
    (select clos_le is null from public.dates_des_dossiers_refermes() where candidat_id = :'c3'::uuid),
    'sans date Bubble, la date reste inconnue');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"abababab-7100-0000-0000-000000000003"}';
  select public.verifier(
    not exists (select 1 from public.dates_des_dossiers_refermes()
                 where candidat_id in (:'c1'::uuid, :'c2'::uuid)),
    'Auch ne voit rien d Agen');
commit;

-- ---------------------------------------------------------------------------
\echo '— recopier la date de Bubble, ou repousser, n est pas une retouche'
-- ---------------------------------------------------------------------------
-- Préparer une date ancienne sans passer par les déclencheurs, qui la garderaient.
set session_replication_role = replica;
update public.candidat set maj_le = timestamptz '2020-01-01 00:00+00' where id = :'c3'::uuid;
reset session_replication_role;
update public.candidat set bubble_modifie_le = now() - interval '5 months' where id = :'c3'::uuid;
select public.verifier(
  (select maj_le = timestamptz '2020-01-01 00:00+00' from public.candidat where id = :'c3'::uuid),
  'la date de Bubble recopiee laisse la date de mise a jour');
update public.candidat set archivage_reporte_au = current_date + 30 where id = :'c3'::uuid;
select public.verifier(
  (select maj_le = timestamptz '2020-01-01 00:00+00' from public.candidat where id = :'c3'::uuid),
  'repousser l archivage aussi');
update public.candidat set ville = 'Nérac' where id = :'c3'::uuid;
select public.verifier(
  (select maj_le > timestamptz '2020-01-01 00:00+00' from public.candidat where id = :'c3'::uuid),
  'une vraie retouche, elle, renouvelle la date');

\o
\echo '0071 — cloture et archivage : tout est vert.'
