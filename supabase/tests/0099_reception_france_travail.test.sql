-- Tests de la migration 0099_reception_france_travail.sql.
--
-- Qui est qui :
--   · la route de réception — clé de service, personne de connecté
--   · Rémi    référent        — voit les offres reçues sur l'écran France Travail
--   · Camille compte candidat — ne peut rien déposer
--
-- Ce qu'on éprouve :
--   * une offre telle que France Travail la renvoie devient une ligne, champ
--     par champ, département déduit du lieu ;
--   * le contact du recruteur n'est gardé nulle part ;
--   * une offre déjà connue — reçue hier, ou reprise de Bubble — est mise à
--     jour, pas doublée, et garde son `bubble_id` ;
--   * une valeur mal formée laisse sa colonne vide sans faire échouer la page ;
--     une entrée sans identifiant est ignorée ; un doublon dans la page compte
--     une fois ;
--   * l'offre reçue sort dans les menus et la liste de l'écran ;
--   * seule la clé de service dépose.
--
-- Données fabriquées : offres, entreprises et contacts inventés.

\set ON_ERROR_STOP on
\o /dev/null

\set remi    'eeeeeeee-0099-0000-0000-000000000001'
\set camille 'eeeeeeee-0099-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',    'remi0099@example.org',    '{"role":"referent"}'),
  (:'camille', 'camille0099@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;

-- Une offre reprise de Bubble, vieille de six mois, que France Travail renvoie.
insert into public.offre_emploi (bubble_id, source_id, intitule, departement, date_actualisation) values
  ('offre-0099-bubble', 'FT0099B', 'Essai 0099 ancien intitulé', '33', now() - interval '180 days')
on conflict (bubble_id) do nothing;

-- ===========================================================================
\echo '— la clé de service dépose une page'
set role service_role;
select public.recevoir_offres_france_travail(jsonb_build_array(
  jsonb_build_object(
    'id', 'FT0099A',
    'intitule', 'Essai 0099 électricien',
    'description', 'Description inventée.',
    'dateCreation', to_char(now() - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'dateActualisation', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'lieuTravail', jsonb_build_object('libelle', '47 - AGEN', 'codePostal', '47000', 'commune', '47001',
                                      'latitude', 44.2, 'longitude', 0.62),
    'romeCode', 'F1602', 'romeLibelle', 'Électricité bâtiment',
    'appellationlibelle', 'Électricien / Électricienne du bâtiment',
    'entreprise', jsonb_build_object('nom', 'Entreprise Essai 0099', 'entrepriseAdaptee', false),
    'typeContrat', 'CDI', 'typeContratLibelle', 'Contrat à durée indéterminée',
    'natureContrat', 'Contrat travail',
    'experienceExige', 'D', 'experienceLibelle', 'Débutant accepté',
    'salaire', jsonb_build_object('libelle', 'Mensuel de 2000 Euros'),
    'dureeTravailLibelle', '35H', 'dureeTravailLibelleConverti', 'Temps plein',
    'alternance', false, 'nombrePostes', 2, 'accessibleTH', true,
    'qualificationLibelle', 'Ouvrier qualifié',
    'codeNAF', '43.21A', 'secteurActivite', '43', 'secteurActiviteLibelle', 'Installation électrique',
    'trancheEffectifEtab', '10 à 19 salariés',
    'origineOffre', jsonb_build_object('urlOrigine', 'https://exemple.test/offre/FT0099A'),
    'contact', jsonb_build_object('nom', 'Mme CONTACT-0099 Inventée', 'courriel', 'contact0099@example.org')),
  jsonb_build_object(
    'id', 'FT0099B',
    'intitule', 'Essai 0099 nouvel intitulé',
    'dateActualisation', to_char(now() - interval '3 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'lieuTravail', jsonb_build_object('libelle', '33 - BORDEAUX'),
    'codeNAF', '10.71C'),
  -- mal formée : chaque colonne fautive reste vide
  jsonb_build_object(
    'id', 'FT0099C',
    'intitule', '   ',
    'nombrePostes', 'plusieurs',
    'alternance', 'peut-être',
    'dateCreation', 'hier',
    'lieuTravail', jsonb_build_object('latitude', 'nord')),
  -- sans identifiant, ou pas un objet : ignorées
  jsonb_build_object('intitule', 'Essai 0099 sans identifiant'),
  '"pas une offre"'::jsonb,
  -- la même deux fois dans la page : une seule ligne
  jsonb_build_object('id', 'FT0099A', 'intitule', 'Essai 0099 électricien',
    'dateActualisation', to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'lieuTravail', jsonb_build_object('libelle', '47 - AGEN', 'codePostal', '47000'),
    'codeNAF', '43.21A')
)) as compte \gset
reset role;

select public.verifier(
  :'compte'::jsonb = '{"recues": 3, "creees": 2, "mises_a_jour": 1}'::jsonb,
  'trois offres reconnues : deux créées, une mise à jour — ni l''entrée sans identifiant, ni le doublon');

select public.verifier(
  (select intitule = 'Essai 0099 électricien'
      and departement = '47' and lieu_code_insee = '47001' and lieu_latitude = 44.2
      and rome_code = 'F1602' and code_naf = '43.21A' and secteur_code = '43'
      and entreprise_nom = 'Entreprise Essai 0099' and entreprise_adaptee = false
      and type_contrat = 'CDI' and salaire_libelle = 'Mensuel de 2000 Euros'
      and duree_travail_type = 'Temps plein' and alternance = false
      and nombre_postes = 2 and accessible_th = true
      and entreprise_taille = '10 à 19 salariés'
      and url_origine = 'https://exemple.test/offre/FT0099A'
      and date_actualisation > now() - interval '2 days'
      and bubble_id is null
     from public.offre_emploi where source_id = 'FT0099A'),
  'chaque champ de France Travail est dans sa colonne, le département déduit du lieu');

select public.verifier(
  not exists (select 1 from public.offre_emploi e
               where e.source_id like 'FT0099%'
                 and to_jsonb(e)::text ~* 'contact-?0099'),
  'le contact du recruteur n''est gardé nulle part');

select public.verifier(
  (select count(*) = 1 and bool_and(bubble_id = 'offre-0099-bubble')
      and bool_and(intitule = 'Essai 0099 nouvel intitulé')
      and bool_and(date_actualisation > now() - interval '1 day')
      and bool_and(departement = '33')
     from public.offre_emploi where source_id = 'FT0099B'),
  'l''offre reprise de Bubble est mise à jour, pas doublée, et garde son identifiant Bubble');

select public.verifier(
  (select intitule is null and nombre_postes is null and alternance is null
      and date_creation is null and date_actualisation is null and lieu_latitude is null
      and departement is null
     from public.offre_emploi where source_id = 'FT0099C'),
  'des valeurs mal formées laissent leurs colonnes vides, sans faire échouer la page');

-- ===========================================================================
\echo '— rejouer la même page ne crée rien'
set role service_role;
select public.verifier(
  public.recevoir_offres_france_travail(
    '[{"id": "FT0099A", "intitule": "Essai 0099 électricien confirmé", "codeNAF": "43.21A",
       "lieuTravail": {"libelle": "47 - AGEN"}}]'::jsonb)
    = '{"recues": 1, "creees": 0, "mises_a_jour": 1}'::jsonb,
  'une offre déjà reçue est mise à jour');
select public.verifier(
  public.recevoir_offres_france_travail('[]'::jsonb)
    = '{"recues": 0, "creees": 0, "mises_a_jour": 0}'::jsonb,
  'une page vide ne fait rien, et le dit');
reset role;

select public.verifier(
  (select count(*) = 1 and bool_and(date_actualisation > now() - interval '2 days')
      and bool_and(date_creation is not null)
     from public.offre_emploi where source_id = 'FT0099A'),
  'toujours une seule ligne ; les dates connues ne sont pas effacées par une réponse qui les tait');

-- ===========================================================================
\echo '— Rémi, référent : l''offre reçue est sur l''écran France Travail'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0099-0000-0000-000000000001"}', true);
  select public.verifier(
    (select public.filtres_des_offres()->'departements' @> '["47","33"]'::jsonb),
    'le Lot-et-Garonne et la Gironde sont proposés');
  select public.verifier(
    (select jsonb_agg(o->>'intitule' order by o->>'intitule')
              = '["Essai 0099 électricien confirmé"]'::jsonb
       from jsonb_array_elements(public.offres_en_cours(array['47'], 'F', 200, 0)->'offres') o
      where o->>'intitule' like 'Essai 0099 %'),
    'Lot-et-Garonne, construction : l''offre reçue');
  select public.verifier(
    (select count(*) = 1
       from jsonb_array_elements(public.offres_en_cours(array['33'], null, 200, 0)->'offres') o
      where o->>'intitule' = 'Essai 0099 nouvel intitulé'),
    'l''offre de Bubble, rafraîchie, redevient une offre en cours');
commit;

-- ===========================================================================
\echo '— déposer : la clé de service, et personne d''autre'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0099-0000-0000-000000000001"}', true);
  begin
    perform public.recevoir_offres_france_travail('[]'::jsonb);
    raise exception 'ÉCHEC — un référent a déposé des offres';
  exception when insufficient_privilege then
    raise notice '  ok — un référent ne dépose pas';
  end;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0099-0000-0000-000000000002"}', true);
  begin
    perform public.recevoir_offres_france_travail('[{"id": "FT0099X"}]'::jsonb);
    raise exception 'ÉCHEC — un compte candidat a déposé des offres';
  exception when insufficient_privilege then
    raise notice '  ok — un compte candidat non plus';
  end;
end
$$;

select public.verifier(
  not has_function_privilege('anon', 'public.recevoir_offres_france_travail(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.recevoir_offres_france_travail(jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.recevoir_offres_france_travail(jsonb)', 'execute'),
  'ni anon ni authenticated n''exécutent la fonction ; service_role, oui');

do $$
begin
  set local role service_role;
  begin
    perform public.recevoir_offres_france_travail('{"id": "FT0099X"}'::jsonb);
    raise exception 'ÉCHEC — autre chose qu''une liste a été accepté';
  exception when invalid_parameter_value then
    raise notice '  ok — autre chose qu''une liste est refusé';
  end;
  begin
    perform public.recevoir_offres_france_travail(
      (select jsonb_agg(jsonb_build_object('id', 'FT0099-' || n)) from generate_series(1, 1001) n));
    raise exception 'ÉCHEC — 1 001 offres en un appel';
  exception when invalid_parameter_value then
    raise notice '  ok — plus de mille offres en un appel sont refusées';
  end;
end
$$;

-- --- Ménage ----------------------------------------------------------------
delete from public.offre_emploi where source_id like 'FT0099%';
delete from auth.users where id in (:'remi', :'camille');

\echo ''
\echo 'Tous les contrôles de 0099_reception_france_travail.sql sont passés.'
