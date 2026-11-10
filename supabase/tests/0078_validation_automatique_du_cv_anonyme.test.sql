-- Tests de la migration 0078_validation_automatique_du_cv_anonyme.sql.
--
--   · Paul   référent des dossiers, à Nîmes-0078
--   · Rita   autre référente de Nîmes-0078
--
-- Les fiches sont créées sans session, comme par la reprise de Bubble ; elles
-- sont ensuite modifiées sous la session de Paul, comme depuis l'écran.

\set ON_ERROR_STOP on
\o /dev/null

\set paul 'cacacaca-7800-0000-0000-000000000001'
\set rita 'cacacaca-7800-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'paul', 'paul0078@example.org', '{"role":"referent"}'),
  (:'rita', 'rita0078@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values ('loge-0078-nimes', 'Nîmes — 0078')
on conflict do nothing;
select id as l_nimes from public.loge where bubble_id = 'loge-0078-nimes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0078-paul', :'paul', 'PONS',   'Paul', :'l_nimes'::uuid),
  ('ref-0078-rita', :'rita', 'RIBERA', 'Rita', :'l_nimes'::uuid)
on conflict do nothing;
select id as r_paul from public.referent where bubble_id = 'ref-0078-paul' \gset
select id as r_rita from public.referent where bubble_id = 'ref-0078-rita' \gset

-- Toutes ont un CV original, sauf mention contraire.
insert into public.candidat
  (numero, nom, prenom, email, telephone, adresse, loge_id, referent_id,
   type_emploi, emploi_recherche, metier_libelle, experiences, competences,
   cv_chemin, cv_url, cv_anonyme_chemin, cloture) values
  -- propre
  (7801, 'GARRIGUE', 'Paula', 'paula@exemple.org', '06 01 02 03 04', '5 rue Fresque, 30000 Nîmes',
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Aide-soignante', null,
   '2019-2025 — Aide-soignante, EHPAD : soins, accueil', 'Écoute, rigueur',
   'candidats/7801/cv.pdf', null, null, null),
  -- son nom, accentué autrement, dans les expériences
  (7802, 'LEFÈVRE', 'Marc', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Magasinier', null,
   '2020 — Magasinier, entreprise Lefevre et fils', null,
   'candidats/7802/cv.pdf', null, null, null),
  -- un numéro de téléphone
  (7803, 'AUBRAC', 'Lise', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Vendeuse', null,
   null, 'Joignable au 06.11.22.33.44',
   'candidats/7803/cv.pdf', null, null, null),
  -- une adresse électronique
  (7804, 'CAUSSE', 'Noé', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Jardinier', null,
   'Références : contact@paysages-exemple.org', null,
   'candidats/7804/cv.pdf', null, null, null),
  -- son adresse
  (7805, 'DURFORT', 'Ines', null, null, '3 impasse des Mimosas, 30000 Nîmes',
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Secrétaire', null,
   'Travail à domicile, 3 impasse des Mimosas', null,
   'candidats/7805/cv.pdf', null, null, null),
  -- pas de CV original
  (7806, 'ESPEROU', 'Jean', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Cuisinier', null,
   null, null, null, null, null, null),
  -- un CV anonyme déposé par la commission
  (7807, 'FONTANES', 'Lou', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Comptable', null,
   null, null, 'candidats/7807/cv.pdf', null, 'candidats/7807/cv-anonyme.pdf', null),
  -- dossier refermé
  (7808, 'GANGES', 'Eva', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Serveuse', null,
   null, null, 'candidats/7808/cv.pdf', null, null, 'Lui-même'),
  -- ni emploi recherché ni métier
  (7809, 'HÉRAULT', 'Tom', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', null, null,
   null, null, 'candidats/7809/cv.pdf', null, null, null),
  -- des années et des dates, qui ne sont pas des numéros ; CV encore chez Bubble
  (7810, 'ISSIRAC', 'Zoé', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Assistante', null,
   '2000 - 2005, 2010 2015 2020 ; du 01.02.2019 - 31.12.2020, Nîmes', null,
   null, 'https://exemple.org/cv-7810.pdf', null, null),
  -- son téléphone, écrit sans le zéro
  (7811, 'JONQUIERES', 'Ada', null, '+33 6 98 76 54 32', null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Caissière', null,
   null, 'Disponible : 6 98 76 54 32', 'candidats/7811/cv.pdf', null, null, null),
  -- un lien web
  (7812, 'LUNEL', 'Max', null, null, null,
   :'l_nimes'::uuid, :'r_paul'::uuid, 'emploi', 'Graphiste', null,
   'Portfolio sur www.exemple.org/portfolio', null, 'candidats/7812/cv.pdf', null, null, null);

select id as c1, cv_anonyme_jeton as j1 from public.candidat where numero = 7801 \gset

-- ---------------------------------------------------------------------------
\echo '— un CV original, rien de suspect : HERACLES valide'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select cv_anonyme_valide_le is not null and cv_anonyme_valide_auto
      and cv_anonyme_valide_par is null
     from public.candidat where numero = 7801),
  'le dossier propre est valide des sa creation, au nom de HERACLES');
select public.verifier(
  (select cv_anonyme_valide_auto from public.candidat where numero = 7810),
  'les annees et les dates ne passent pas pour des numeros, et un CV chez Bubble compte');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  select public.verifier(
    (select valide_par = 'HERACLES' and valide_le is not null
       from public.etat_du_cv_anonyme(:'c1'::uuid)),
    'le bandeau dit « par HERACLES »');
commit;

-- ---------------------------------------------------------------------------
\echo '— quelque chose de suspect : le CV reste a valider'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select bool_and(cv_anonyme_valide_le is null and not cv_anonyme_valide_auto)
     from public.candidat where numero in (7802, 7803, 7804, 7805, 7811, 7812)),
  'nom, telephone, courriel, adresse, numero du candidat, lien : rien n est valide');
select public.verifier(
  (select public.cv_anonyme_suspect(c) like 'le nom ou le prénom du candidat, dans « Expériences »'
     from public.candidat c where numero = 7802),
  'le nom est reconnu sans accent ni casse');
select public.verifier(
  (select public.cv_anonyme_suspect(c) like 'un numéro de téléphone%' from public.candidat c where numero = 7803),
  'un numero de telephone est reconnu');
select public.verifier(
  (select public.cv_anonyme_suspect(c) like 'une adresse électronique%' from public.candidat c where numero = 7804),
  'une adresse electronique est reconnue');
select public.verifier(
  (select public.cv_anonyme_suspect(c) like 'l''adresse du candidat%' from public.candidat c where numero = 7805),
  'l adresse du candidat est reconnue');
select public.verifier(
  (select public.cv_anonyme_suspect(c) like 'le téléphone du candidat%' from public.candidat c where numero = 7811),
  'le telephone du candidat est reconnu, ecrit autrement');
select public.verifier(
  (select public.cv_anonyme_suspect(c) like 'un lien web%' from public.candidat c where numero = 7812),
  'un lien web est reconnu');

select public.verifier(
  (select bool_and(cv_anonyme_valide_le is null)
     from public.candidat where numero in (7806, 7807, 7808, 7809)),
  'sans CV original, avec un CV anonyme depose, referme ou sans emploi : rien n est valide');

-- ---------------------------------------------------------------------------
\echo '— une fiche modifiee se revalide d elle-meme, si elle reste propre'
-- ---------------------------------------------------------------------------
select cv_anonyme_valide_le as v0 from public.candidat where id = :'c1'::uuid \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat set experiences = experiences || ' — recommandée par Paula'
   where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and not cv_anonyme_valide_auto
     from public.candidat where id = :'c1'::uuid),
  'le prenom ajoute dans les experiences : la validation tombe');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat set experiences = '2019-2025 — Aide-soignante, EHPAD : soins, accueil, nuit'
   where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_auto and cv_anonyme_valide_le > :'v0'::timestamptz
     from public.candidat where id = :'c1'::uuid),
  'corrigee, la fiche est revalidee par HERACLES, a un nouvel instant');

-- ---------------------------------------------------------------------------
\echo '— un referent retire : HERACLES ne revalide pas avant la prochaine modification'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, false) = 'retire',
    'Paul retire la validation de HERACLES');
  update public.candidat set telephone = '06 01 02 03 05' where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and cv_anonyme_retire_le is not null
     from public.candidat where id = :'c1'::uuid),
  'un changement hors du CV ne la fait pas revenir');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat set competences = 'Écoute, rigueur, patience' where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_auto and cv_anonyme_valide_le is not null and cv_anonyme_retire_le is null
     from public.candidat where id = :'c1'::uuid),
  'un champ imprime modifie : HERACLES revalide');

-- ---------------------------------------------------------------------------
\echo '— HERACLES retire ce qu il a valide quand ce n est plus propre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat set nom = 'EHPAD' where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and not cv_anonyme_valide_auto
     from public.candidat where id = :'c1'::uuid),
  'le nom corrige se retrouve dans les experiences : validation retiree');

-- Une validation de referent, elle, tient : une personne a relu.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000002"}';
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide',
    'Rita relit et valide a la main');
commit;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat set telephone = '06 01 02 03 06' where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_par = :'r_rita'::uuid and not cv_anonyme_valide_auto
      and cv_anonyme_valide_le is not null
     from public.candidat where id = :'c1'::uuid),
  'la validation de Rita tient quand l identite change hors du CV');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat set nom = 'GARRIGUE' where id = :'c1'::uuid;
  update public.candidat set competences = 'Écoute, rigueur' where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_auto from public.candidat where id = :'c1'::uuid),
  'apres une modification du CV, HERACLES reprend la main');

-- ---------------------------------------------------------------------------
\echo '— les colonnes ne s ecrivent pas par la table'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  update public.candidat
     set cv_anonyme_valide_le = now(), cv_anonyme_valide_auto = true, ville = 'Nîmes'
   where numero = 7802;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null and not cv_anonyme_valide_auto and ville = 'Nîmes'
     from public.candidat where numero = 7802),
  'un referent ne se donne pas la validation de HERACLES par la table');

-- ---------------------------------------------------------------------------
\echo '— la copie d une validation de HERACLES se range a la premiere ouverture'
-- ---------------------------------------------------------------------------
select cv_anonyme_valide_le as v1 from public.candidat where id = :'c1'::uuid \gset

begin;
  set local role anon;
  select public.verifier(
    (select fige_chemin is null and valide_le = :'v1'::timestamptz
       from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'validee par HERACLES, le lien n a pas encore de copie');
  select public.verifier(
    (select count(*) from public.figer_cv_anonyme_public(:'j1'::uuid, :'v1'::timestamptz - interval '1 second')) = 0,
    'une autre validation que celle en cours ne se fige pas');
  select chemin as k1, coalesce(ancien, '') as a1
    from public.figer_cv_anonyme_public(:'j1'::uuid, :'v1'::timestamptz) \gset
  select public.verifier(
    (select count(*) from public.figer_cv_anonyme_public(:'j1'::uuid, :'v1'::timestamptz)) = 0,
    'la seconde ouverture ne fige rien');
  select public.verifier(
    (select fige_chemin = :'k1' from public.cv_anonyme_valide_public(:'j1'::uuid)),
    'le lien sert maintenant la copie');
commit;

select public.verifier(
  :'k1' ~ ('^candidats/' || :'c1' || '/cv-anonyme-valide-[0-9]+\.pdf$'),
  'la copie est rangee sous le candidat, au nom de sa validation');

-- Le referent qui fige d apres une lecture perimee ne fige rien.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cacacaca-7800-0000-0000-000000000001"}';
  select public.verifier(
    (select issue = 'perimee'
       from public.figer_cv_anonyme(:'c1'::uuid, :'v1'::timestamptz - interval '1 second')),
    'une validation lue avant une modification ne se fige pas');
commit;

-- ---------------------------------------------------------------------------
\echo '— les dossiers deja en base sont valides par la migration'
-- ---------------------------------------------------------------------------
alter table public.candidat disable trigger candidat_relire_le_cv_anonyme;
insert into public.candidat (numero, nom, prenom, loge_id, type_emploi, emploi_recherche, cv_chemin)
values (7820, 'MASSANE', 'Rose', :'l_nimes'::uuid, 'emploi', 'Fleuriste', 'candidats/7820/cv.pdf');
alter table public.candidat enable trigger candidat_relire_le_cv_anonyme;

select public.verifier(
  (select cv_anonyme_valide_le is null from public.candidat where numero = 7820),
  'avant la migration, un dossier ancien n est pas valide');
select maj_le as maj_avant from public.candidat where numero = 7820 \gset

\ir ../migrations/0078_validation_automatique_du_cv_anonyme.sql

select public.verifier(
  (select cv_anonyme_valide_auto and cv_anonyme_valide_le is not null
      and maj_le = :'maj_avant'::timestamptz
     from public.candidat where numero = 7820),
  'la migration le valide, sans toucher sa date de mise a jour');
select public.verifier(
  (select bool_and(cv_anonyme_valide_le is null)
     from public.candidat where numero in (7802, 7803, 7804, 7805, 7806, 7807, 7808, 7809)),
  'et laisse a valider ce qui est suspect ou incomplet');

\o
\echo '0078 — la validation automatique du CV anonyme : tout est vert.'
