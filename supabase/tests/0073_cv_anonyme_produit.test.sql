-- Tests de la migration 0073_cv_anonyme_produit.sql.
--
--   · Rémi   référent du dossier 7301 à Pau-0073  — valide
--   · Paule  marraine du même dossier, à Pau-0073 — valide aussi depuis 0074
--   · Odile  autre référente de Pau-0073          — valide aussi depuis 0074
--   · Teo    référent à Tarbes-0073               — ne voit rien
--
-- Le lien public se teste en `anon` : c'est ainsi qu'il s'ouvre.

\set ON_ERROR_STOP on
\o /dev/null

\set remi  'cdcdcdcd-7300-0000-0000-000000000001'
\set paule 'cdcdcdcd-7300-0000-0000-000000000002'
\set odile 'cdcdcdcd-7300-0000-0000-000000000003'
\set teo   'cdcdcdcd-7300-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',  'remi0073@example.org',  '{"role":"referent"}'),
  (:'paule', 'paule0073@example.org', '{"role":"referent"}'),
  (:'odile', 'odile0073@example.org', '{"role":"referent"}'),
  (:'teo',   'teo0073@example.org',   '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0073-pau',    'Pau — 0073'),
  ('loge-0073-tarbes', 'Tarbes — 0073')
on conflict do nothing;
select id as l_pau    from public.loge where bubble_id = 'loge-0073-pau' \gset
select id as l_tarbes from public.loge where bubble_id = 'loge-0073-tarbes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0073-remi',  :'remi',  'RAMOND', 'Rémi',  :'l_pau'::uuid),
  ('ref-0073-paule', :'paule', 'PEYRET', 'Paule', :'l_pau'::uuid),
  ('ref-0073-odile', :'odile', 'ORTIZ',  'Odile', :'l_pau'::uuid),
  ('ref-0073-teo',   :'teo',   'TAPIE',  'Teo',   :'l_tarbes'::uuid)
on conflict do nothing;
select id as r_remi  from public.referent where bubble_id = 'ref-0073-remi' \gset
select id as r_paule from public.referent where bubble_id = 'ref-0073-paule' \gset

-- 7301 : un dossier complet, suivi par Rémi, présenté par Paule.
-- 7302 : un fichier déposé, jamais validé.
-- 7303 : clôturé.
-- 7304 : ni emploi recherché ni métier.
insert into public.candidat
  (numero, nom, prenom, email, telephone, age, ville, adresse, loge_id, referent_id, parrain_id,
   type_emploi, emploi_recherche, metier_libelle, mobilite_geographique, experiences, competences, cloture) values
  (7301, 'SECRET', 'Sabine', 'sabine@exemple.org', '0600007301', 41, 'Pau', '1 rue Inventée',
   :'l_pau'::uuid, :'r_remi'::uuid, :'r_paule'::uuid,
   'emploi', 'Assistante de direction', null, 'Agglomération',
   '2019-2025 — Assistante, PME du bâtiment : agenda, courrier', 'Pack Office', null),
  (7302, 'FICHIER', 'Fanny', null, null, null, null, null,
   :'l_pau'::uuid, :'r_remi'::uuid, null,
   'stage', 'Stage de comptabilité', null, null, null, null, null),
  (7303, 'CLOS', 'Claude', null, null, null, null, null,
   :'l_pau'::uuid, :'r_remi'::uuid, null,
   'emploi', 'Magasinier', null, null, null, null, 'Lui-même'),
  (7304, 'VIDE', 'Vincent', null, null, null, null, null,
   :'l_pau'::uuid, :'r_remi'::uuid, null,
   'emploi', null, null, null, null, null, null);

update public.candidat set cv_anonyme_chemin = 'candidats/7302/cv-anonyme.pdf' where numero = 7302;

select id as c1, cv_anonyme_jeton as j1 from public.candidat where numero = 7301 \gset
select id as c2, cv_anonyme_jeton as j2 from public.candidat where numero = 7302 \gset
select id as c3, cv_anonyme_jeton as j3 from public.candidat where numero = 7303 \gset
select id as c4 from public.candidat where numero = 7304 \gset

-- ---------------------------------------------------------------------------
\echo '— avant validation, le lien ne sert que les fichiers deposes'
-- ---------------------------------------------------------------------------
begin;
  set local role anon;
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j1'::uuid)) = 0
      and (select count(*) from public.cv_anonyme_public(:'j1'::uuid)) = 0,
    'un CV non valide, sans fichier : rien');
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j2'::uuid)) = 0
      and (select chemin from public.cv_anonyme_public(:'j2'::uuid)) = 'candidats/7302/cv-anonyme.pdf',
    'un fichier depose : son chemin, comme avant, et aucun champ de la fiche');
commit;

-- ---------------------------------------------------------------------------
\echo '— hors de la loge, on ne valide pas'
-- ---------------------------------------------------------------------------
-- Depuis 0074, tout référent de la loge valide — la marraine et Odile siègent
-- à Pau : leur cas est éprouvé dans le test de 0074. Reste le refus.
do $$
declare
  dossier uuid := (select id from public.candidat where numero = 7301);
  qui text;
begin
  foreach qui in array array[
    'cdcdcdcd-7300-0000-0000-000000000004'   -- un referent d'une autre loge
  ] loop
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', qui)::text, true);
    begin
      perform public.valider_cv_anonyme(dossier, true);
      raise exception 'ÉCHEC — % a valide un CV qu il ne suit pas', qui;
    exception when insufficient_privilege then
      raise notice '  ok — % ne valide pas', qui;
    end;
  end loop;
  -- Un dossier qui n'existe pas : le même refus.
  begin
    perform public.valider_cv_anonyme(gen_random_uuid(), true);
    raise exception 'ÉCHEC — un dossier inexistant ne refuse pas comme les autres';
  exception when insufficient_privilege then
    raise notice '  ok — un dossier inexistant, meme refus';
  end;
end
$$;

-- La marraine peut modifier la fiche (0006) : pas se valider le CV par la table.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000002"}';
  update public.candidat
     set cv_anonyme_valide_le = now(), cv_anonyme_valide_par = :'r_paule'::uuid
   where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and cv_anonyme_valide_par is null
     from public.candidat where id = :'c1'::uuid),
  'une validation ecrite directement dans la table ne passe pas');

do $$
declare
  dossier uuid := (select id from public.candidat where numero = 7301);
begin
  perform set_config('role', 'anon', true);
  begin
    perform public.valider_cv_anonyme(dossier, true);
    raise exception 'ÉCHEC — anon valide un CV';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne valide rien';
  end;
  begin
    perform public.etat_du_cv_anonyme(dossier);
    raise exception 'ÉCHEC — anon lit l etat d un CV';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne lit pas l etat';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— le referent valide ; les refus qui ont une raison'
-- ---------------------------------------------------------------------------
-- Une date connue, posée sans les déclencheurs, pour voir si la validation la touche.
set session_replication_role = replica;
update public.candidat set maj_le = '2026-01-01T00:00:00Z' where id = :'c1'::uuid;
set session_replication_role = origin;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000001"}';
  select public.verifier(public.valider_cv_anonyme(:'c3'::uuid, true) = 'ferme',
    'un dossier clos ne se valide pas');
  select public.verifier(public.valider_cv_anonyme(:'c4'::uuid, true) = 'incomplet',
    'un CV sans emploi ni metier ne se valide pas');
  select public.verifier(public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide',
    'le referent valide le CV de son dossier');
commit;

select public.verifier(
  (select cv_anonyme_valide_le is not null and cv_anonyme_valide_par = :'r_remi'::uuid
     from public.candidat where id = :'c1'::uuid),
  'la validation est datee et signee du referent');
select public.verifier(
  (select maj_le = '2026-01-01T00:00:00Z'::timestamptz from public.candidat where id = :'c1'::uuid),
  'la validation ne change pas la derniere mise a jour de la fiche');

-- ---------------------------------------------------------------------------
\echo '— l etat, tel que le bandeau de la fiche l affiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000001"}';
  select public.verifier(
    (select valide_le is not null and valide_par = 'Rémi RAMOND' and peut_valider
       from public.etat_du_cv_anonyme(:'c1'::uuid)),
    'le referent voit qui a valide, et qu il peut valider');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000003"}';
  select public.verifier(
    (select valide_le is not null and peut_valider from public.etat_du_cv_anonyme(:'c1'::uuid)),
    'une autre referente de la loge voit l etat, et peut valider (0074)');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000004"}';
  select public.verifier(
    (select count(*) from public.etat_du_cv_anonyme(:'c1'::uuid)) = 0,
    'un referent d une autre loge ne voit rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— valide, le CV sort par le lien public, sans rien qui identifie'
-- ---------------------------------------------------------------------------
insert into public.mise_en_page (document, reglages)
values ('cv_anonyme', '{"contact.adresse":"commission@exemple.org"}')
on conflict (document) do update set reglages = excluded.reglages;

begin;
  set local role anon;
  select public.verifier(
    (select numero = 7301
            and emploi_recherche = 'Assistante de direction'
            and experiences like '2019-2025%'
            and valide_le is not null
       from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'anon obtient les champs du CV valide');
  select public.verifier(
    (select reglages ->> 'contact.adresse' = 'commission@exemple.org'
       from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'et les reglages de sa mise en page, que la table ne lui donne pas');
commit;

-- `secretaire_email` (0076) est l'adresse du Secrétaire de la loge, le contact
-- imprimé sur le CV : pas une donnée du candidat. On l'écarte de la recherche.
select public.verifier(
  replace(pg_get_function_result('public.cv_anonyme_valide_public(uuid)'::regprocedure), 'secretaire_email text', '')
    !~* '(\mnom\M|prenom|email|telephone|\mage\M|ville|adresse|situation|photo|loge|referent|parrain)',
  'le lien public ne rend aucune colonne qui identifie la personne');

-- ---------------------------------------------------------------------------
\echo '— l affiche et l affichette portent le lien d un CV valide'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000001"}';
  select public.verifier(
    (select cv_anonyme_jeton from public.commission_du_candidat(:'c1'::uuid)) = :'j1'::uuid,
    'le jeton d un CV valide, pour le QR code de l affichette');
  select public.verifier(
    (select cv_anonyme_jeton from public.commission_du_candidat(:'c4'::uuid)) is null,
    'ni fichier ni validation : pas de jeton');
commit;

-- ---------------------------------------------------------------------------
\echo '— une fiche modifiee : le CV est a relire'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000002"}';
  update public.candidat
     set experiences = experiences || E'\n2015-2019 — Secrétaire, Sabine SECRET Conseil : accueil'
   where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and cv_anonyme_valide_par is null
     from public.candidat where id = :'c1'::uuid),
  'une experience ajoutee efface la validation');

begin;
  set local role anon;
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j1'::uuid)) = 0,
    'et le lien public s eteint jusqu a la relecture');
commit;

-- Une modification qui ne touche rien d'imprime ne demande pas de relecture.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000001"}';
  select public.verifier(public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide', 'revalide');
  update public.candidat set telephone = '0600009999' where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is not null from public.candidat where id = :'c1'::uuid),
  'le telephone change : le CV reste valide, il ne l imprime pas');

-- La reprise de Bubble, sans session, efface aussi.
update public.candidat set competences = 'Pack Office, Sage' where id = :'c1'::uuid;
select public.verifier(
  (select cv_anonyme_valide_le is null from public.candidat where id = :'c1'::uuid),
  'une modification venue de la reprise efface la validation');

-- ---------------------------------------------------------------------------
\echo '— retirer la validation'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000001"}';
  select public.verifier(public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide', 'valide de nouveau');
  select public.verifier(public.valider_cv_anonyme(:'c1'::uuid, false) = 'retire', 'puis retire');
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and cv_anonyme_valide_par is null
     from public.candidat where id = :'c1'::uuid),
  'retiree, la validation est effacee');

-- ---------------------------------------------------------------------------
\echo '— un dossier referme eteint le lien, meme valide'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7300-0000-0000-000000000001"}';
  select public.verifier(public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide', 'valide avant la cloture');
commit;
update public.candidat set cloture = 'Lui-même' where id = :'c1'::uuid;
begin;
  set local role anon;
  select public.verifier(
    (select count(*) from public.cv_anonyme_valide_public(:'j1'::uuid)) = 0,
    'le dossier clos, le CV valide ne sort plus');
commit;

-- ---------------------------------------------------------------------------
\echo '— la mise en page accepte le CV anonyme, et pas n importe quoi'
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.mise_en_page (document) values ('lettre');
  raise exception 'ÉCHEC — un document inconnu entre dans la mise en page';
exception when check_violation then
  raise notice '  ok — un document inconnu est refuse';
end
$$;

\o
\echo '0073 — le CV anonyme produit et valide : tout est vert.'
