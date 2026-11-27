-- Tests de la migration 0117_reunion_reservee_a_l_administration.sql.
--
-- Qui est qui :
--   · Adèle    administratrice, fiche de référent à Tarbes-0117 — tient la
--              réunion
--   · Bastien  référent à Tarbes-0117, Secrétaire — n'atteint plus rien de la
--              réunion, même avec le titre qui efface
--   · Chloé    administratrice, fiche à Auch-0117 — administre, mais pas
--              cette loge-là
--
-- Ce qu'on éprouve :
--   * l'administratrice ouvre, pointe, choisit, lit le registre, la feuille et
--     les données des trois documents ;
--   * le référent voit chaque écriture refusée (insufficient_privilege) et
--     chaque lecture vide — et rien n'a bougé en base après ses essais ;
--   * `ma_loge()` ne change pas pour lui : le reste de l'application en dépend ;
--   * une administratrice d'une autre loge ne touche pas à cette réunion ;
--   * anon n'exécute pas la nouvelle fonction.

\set ON_ERROR_STOP on
\o /dev/null

\set adele   'eeeeeeee-1170-0000-0000-000000000001'
\set bastien 'eeeeeeee-1170-0000-0000-000000000002'
\set chloe   'eeeeeeee-1170-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'adele',   'adele0117@example.org',   '{"role":"referent"}'),
  (:'bastien', 'bastien0117@example.org', '{"role":"referent"}'),
  (:'chloe',   'chloe0117@example.org',   '{"role":"referent"}');
update public.profil set role = 'admin' where id in (:'adele', :'chloe');

insert into public.loge (bubble_id, nom) values
  ('loge-0117-tarbes', 'Tarbes — 0117'),
  ('loge-0117-auch',   'Auch — 0117')
on conflict do nothing;

select id as l_tarbes from public.loge where bubble_id = 'loge-0117-tarbes' \gset
select id as l_auch   from public.loge where bubble_id = 'loge-0117-auch' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, college, loge_id) values
  ('ref-0117-adele',   :'adele',   'ADAM',   'Adèle',   'adele0117@example.org',   null,         :'l_tarbes'::uuid),
  ('ref-0117-bastien', :'bastien', 'BRUN',   'Bastien', 'bastien0117@example.org', 'Secrétaire', :'l_tarbes'::uuid),
  ('ref-0117-chloe',   :'chloe',   'COSTE',  'Chloé',   'chloe0117@example.org',   null,         :'l_auch'::uuid)
on conflict do nothing;

select id as r_adele   from public.referent where bubble_id = 'ref-0117-adele' \gset
select id as r_bastien from public.referent where bubble_id = 'ref-0117-bastien' \gset

insert into public.candidat (numero, nom, prenom, loge_id, referent_id, emploi_recherche) values
  (11701, 'DOSSIER', 'Dina', :'l_tarbes'::uuid, :'r_bastien'::uuid, 'MENUISIERE');

select id as c_dina from public.candidat where numero = 11701 \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 30, current_date + 30)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— la regle : une loge pour l administration, aucune pour un referent'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1170-0000-0000-000000000001"}';
  select public.verifier(public.loge_des_reunions() = :'l_tarbes'::uuid,
    'l administratrice tient les reunions de sa loge');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1170-0000-0000-000000000002"}';
  select public.verifier(public.loge_des_reunions() is null,
    'un referent n en tient aucune');
  select public.verifier(public.ma_loge() = :'l_tarbes'::uuid,
    'mais garde sa loge pour tout le reste de l application');
commit;

-- ---------------------------------------------------------------------------
\echo '— l administratrice tient la reunion de bout en bout'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1170-0000-0000-000000000001"}';

  select public.ouvrir_une_reunion(current_date, 'Temple') as seance \gset

  select public.verifier(
    public.pointer_a_l_appel(:'seance'::uuid, :'r_bastien'::uuid, 'Excusé'),
    'elle pointe un referent de sa loge');
  select public.verifier(
    public.choisir_l_affichette(:'seance'::uuid, :'c_dina'::uuid) = 'ok',
    'elle choisit le dossier de l affichette');
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'seance'::uuid, current_date + 14) = 'ok',
    'elle dit la prochaine reunion');

  select public.verifier(
    (select count(*) from public.registre_des_reunions() where id = :'seance'::uuid) = 1,
    'elle lit le registre');
  select public.verifier(
    (select count(*) from public.la_reunion(:'seance'::uuid)) = 1,
    'elle lit la reunion ouverte');
  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid)) = 2,
    'la feuille montre les deux referents de Tarbes');
  select public.verifier(
    (select etat from public.feuille_d_appel(:'seance'::uuid) where referent_id = :'r_adele'::uuid) = 'Présent',
    'et la marque presente, elle qui a ouvert l appel');
  select public.verifier(
    (select count(*) from public.compte_rendu_presences(:'seance'::uuid)) = 2,
    'les presences du compte rendu');
  select public.verifier(
    (select loge_nom from public.commission_de_la_reunion(:'seance'::uuid)) = 'Tarbes — 0117',
    'la commission de la reunion');
  select public.verifier(
    (select count(*) from public.dossiers_en_cours(:'seance'::uuid)) = 1,
    'les dossiers en cours');
  select public.verifier(
    (select numero from public.affichette_de_la_reunion(:'seance'::uuid)) = 11701,
    'le dossier de l affichette');
commit;

select set_config('essai.seance0117', :'seance', false);

-- Ce que l'on compte avant les essais du référent, pour vérifier après
-- qu'ils n'ont rien laissé.
select count(*) as appels_avant from public.appel where reunion_id = :'seance'::uuid \gset

-- ---------------------------------------------------------------------------
\echo '— un referent ne peut plus rien ecrire'
-- ---------------------------------------------------------------------------
do $$
declare
  seance text := current_setting('essai.seance0117');
  geste  text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-1170-0000-0000-000000000002"}', true);

  foreach geste in array array[
    'select public.ouvrir_une_reunion(current_date, ''Ailleurs'')',
    format('select public.pointer_a_l_appel(%L::uuid, public.referent_courant(), ''Présent'')', seance),
    format('select public.pointer_les_connectes(%L::uuid)', seance),
    format('select public.clore_la_feuille(%L::uuid)', seance),
    format('select public.retirer_une_reunion(%L::uuid)', seance),
    format('select public.rendre_une_reunion(%L::uuid)', seance),
    format('select public.effacer_une_reunion(%L::uuid)', seance),
    format('select public.choisir_l_affichette(%L::uuid, null)', seance),
    format('select public.choisir_la_prochaine_reunion(%L::uuid, null)', seance)
  ] loop
    begin
      execute geste;
      raise exception 'ÉCHEC — un referent a passe : %', geste;
    exception when insufficient_privilege then
      raise notice '  ok — refuse : %', geste;
    end;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— ni rien lire'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1170-0000-0000-000000000002"}';

  select public.verifier((select count(*) from public.registre_des_reunions(true)) = 0,
    'le registre est vide pour lui');
  select public.verifier((select count(*) from public.registre_des_retirees()) = 0,
    'les retirees aussi');
  select public.verifier((select count(*) from public.registre_hors_exercice()) = 0,
    'et le hors exercice');
  select public.verifier((select count(*) from public.la_reunion(:'seance'::uuid)) = 0,
    'la reunion ne se lit pas');
  select public.verifier((select count(*) from public.feuille_d_appel(:'seance'::uuid)) = 0,
    'la feuille non plus');
  select public.verifier((select count(*) from public.affichette_de_la_reunion(:'seance'::uuid)) = 0,
    'ni le dossier de l affichette');
  select public.verifier((select count(*) from public.compte_rendu_presences(:'seance'::uuid)) = 0,
    'ni les presences du compte rendu');
  select public.verifier((select count(*) from public.commission_de_la_reunion(:'seance'::uuid)) = 0,
    'ni la commission');
  select public.verifier((select count(*) from public.dossiers_en_cours(:'seance'::uuid)) = 0,
    'ni les dossiers en cours');
commit;

-- ---------------------------------------------------------------------------
\echo '— le titre qui efface ne suffit plus pour une reunion'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1170-0000-0000-000000000002"}';
  -- Le droit du titre reste : il sert aux documents (0069). Il ne vaut plus
  -- pour la réunion, déjà refusée dans la boucle ci-dessus.
  select public.verifier(public.puis_je_effacer_des_reunions(),
    'le Secretaire garde son droit, pour les documents');
commit;

-- ---------------------------------------------------------------------------
\echo '— et ses essais n ont rien laisse'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid) = :appels_avant,
  'aucun pointage pose');
select public.verifier(
  (select retire_le is null and prochaine_le = current_date + 14
          and affichette_candidat_id = :'c_dina'::uuid
     from public.reunion where id = :'seance'::uuid),
  'la reunion n est ni retiree ni retouchee');
select public.verifier(
  (select count(*) from public.reunion where loge_id = :'l_tarbes'::uuid) = 1,
  'et aucune reunion ouverte en plus');

-- ---------------------------------------------------------------------------
\echo '— une administratrice d une autre loge ne touche pas a celle-ci'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1170-0000-0000-000000000003"}';

  select public.verifier((select count(*) from public.la_reunion(:'seance'::uuid)) = 0,
    'elle ne la lit pas');
  select public.verifier(
    public.pointer_a_l_appel(:'seance'::uuid, :'r_bastien'::uuid, 'Absent') = false,
    'elle n y pointe personne');
  select public.verifier(
    public.effacer_une_reunion(:'seance'::uuid) = 'introuvable',
    'elle ne l efface pas');
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
      and referent_id = :'r_bastien'::uuid) = 'Excusé',
  'Bastien est toujours excuse');

-- ---------------------------------------------------------------------------
\echo '— anon n execute pas la regle'
-- ---------------------------------------------------------------------------
select public.verifier(
  not has_function_privilege('anon', 'public.loge_des_reunions()', 'execute'),
  'anon n execute pas loge_des_reunions');

\o
\echo '0117 — la reunion reservee a l administration : tout est vert.'
