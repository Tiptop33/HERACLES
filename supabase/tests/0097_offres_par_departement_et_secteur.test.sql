-- Tests de la migration 0097_offres_par_departement_et_secteur.sql.
--
-- Qui est qui :
--   · Rémi    référent        — choisit ses départements et son secteur
--   · Camille compte candidat — n'a pas cet écran
--
-- Ce qu'on éprouve :
--   * le département se lit dans le texte de Bubble, sinon dans le code
--     postal — Corse et outre-mer compris ;
--   * les menus ne proposent que les départements et les secteurs qui portent
--     une offre en cours ;
--   * plusieurs départements : l'un ou l'autre ; département et secteur :
--     l'un et l'autre ; une offre de plus de trente jours ne sort jamais ;
--   * la limite est bornée par la base ;
--   * ni un compte candidat ni une personne non connectée n'obtient rien.
--
-- Chaque contrôle d'accès se joue en devenant la personne (CLAUDE.md).
-- Données fabriquées : offres, entreprises et lieux inventés. D'autres tests
-- laissent peut-être des offres dans la base : on ne compte que les nôtres,
-- reconnues à leur intitulé.

\set ON_ERROR_STOP on
\o /dev/null

\set remi    'eeeeeeee-0097-0000-0000-000000000001'
\set camille 'eeeeeeee-0097-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',    'remi0097@example.org',    '{"role":"referent"}'),
  (:'camille', 'camille0097@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;

-- --- Fixtures --------------------------------------------------------------
--   a : Gironde par le texte, construction (43.21A → F)
--   b : Lot-et-Garonne par le code postal, industrie (10.71C → C)
--   c : Gironde par « 33 - Gironde », code NAF sans point (4321A → F)
--   d : Corse-du-Sud par le code postal, sans code NAF
--   e : Guadeloupe par le code postal, industrie
--   f : Paris, trop ancienne — ne doit jamais sortir
--   g : sans lieu ni secteur — visible sans filtre seulement
insert into public.offre_emploi
  (bubble_id, intitule, departement, lieu_code_postal, code_naf, date_actualisation, date_creation) values
  ('offre-0097-a', 'Essai 0097 a', '33',           '33000', '43.21A', now() - interval '1 day',  null),
  ('offre-0097-b', 'Essai 0097 b', null,           '47000', '10.71C', now() - interval '2 days', null),
  ('offre-0097-c', 'Essai 0097 c', '33 - Gironde', null,    '4321A',  null,                      now() - interval '3 days'),
  ('offre-0097-d', 'Essai 0097 d', '',             '20000', null,     now() - interval '4 days', null),
  ('offre-0097-e', 'Essai 0097 e', null,           '97100', '10.71C', now() - interval '5 days', null),
  ('offre-0097-f', 'Essai 0097 f', '75',           '75001', '43.21A', now() - interval '60 days', null),
  ('offre-0097-g', 'Essai 0097 g', null,           null,    null,     now() - interval '6 days', null)
on conflict (bubble_id) do nothing;

-- ===========================================================================
\echo '— le département : le texte d''abord, le code postal ensuite'
select public.verifier(
  public.departement_d_une_offre('33', null) = '33'
    and public.departement_d_une_offre('33 - Gironde', '47000') = '33'
    and public.departement_d_une_offre('2a', null) = '2A'
    and public.departement_d_une_offre('974 - La Réunion', null) = '974'
    and public.departement_d_une_offre('1', null) = '01',
  'le texte de Bubble donne le numéro, quelle que soit sa suite');
select public.verifier(
  public.departement_d_une_offre(null, '47000') = '47'
    and public.departement_d_une_offre('Gironde', '33000') = '33'
    and public.departement_d_une_offre('', '20000') = '2A'
    and public.departement_d_une_offre(null, '20200') = '2B'
    and public.departement_d_une_offre(null, '97100') = '971',
  'à défaut, le code postal — Corse et outre-mer compris');
select public.verifier(
  public.departement_d_une_offre(null, null) is null
    and public.departement_d_une_offre('France', '3300') is null,
  'rien de reconnaissable : pas de département, plutôt qu''un faux');

-- ===========================================================================
\echo '— Rémi, référent : ce que les menus proposent'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0097-0000-0000-000000000001"}', true);

  select public.verifier(
    (select public.filtres_des_offres()->'departements' @> '["33","47","2A","971"]'::jsonb),
    'les départements des offres en cours sont proposés');
  select public.verifier(
    (select not exists (
       select 1 from public.offres_en_cours(array['75'], null, 200) o
        where o.intitule like 'Essai 0097 %')),
    'Paris ne rend aucune de nos offres : la seule y est trop ancienne');
  select public.verifier(
    (select count(*) = 2
       from jsonb_array_elements(public.filtres_des_offres()->'secteurs') s
      where s->>0 in ('C', 'F') and s->>1 <> ''),
    'les secteurs C et F sont proposés, avec leur intitulé');

  -- =========================================================================
  \echo '— Rémi : la liste, filtrée'
  select public.verifier(
    (select count(*) = 6 from public.offres_en_cours(null, null, 200) o
      where o.intitule like 'Essai 0097 %'),
    'sans filtre : les six offres en cours, pas la septième');
  select public.verifier(
    (select array_agg(o.intitule order by o.intitule) = array['Essai 0097 a', 'Essai 0097 c']
       from public.offres_en_cours(array['33'], null, 200) o
      where o.intitule like 'Essai 0097 %'),
    'la Gironde : a et c');
  select public.verifier(
    (select array_agg(o.intitule order by o.intitule)
              = array['Essai 0097 a', 'Essai 0097 b', 'Essai 0097 c', 'Essai 0097 d']
       from public.offres_en_cours(array['33', '47', '2A'], null, 200) o
      where o.intitule like 'Essai 0097 %'),
    'trois départements : l''un ou l''autre');
  select public.verifier(
    (select array_agg(o.intitule order by o.intitule) = array['Essai 0097 b', 'Essai 0097 e']
       from public.offres_en_cours(null, 'C', 200) o
      where o.intitule like 'Essai 0097 %'),
    'l''industrie : b et e');
  select public.verifier(
    (select array_agg(o.intitule order by o.intitule) = array['Essai 0097 b']
       from public.offres_en_cours(array['33', '47'], 'C', 200) o
      where o.intitule like 'Essai 0097 %'),
    'départements et secteur : l''un et l''autre');
  select public.verifier(
    (select count(*) = 6 from public.offres_en_cours('{}', '  ', 200) o
      where o.intitule like 'Essai 0097 %'),
    'une liste vide et un secteur blanc ne filtrent rien');
  select public.verifier(
    (select count(*) = 1 from public.offres_en_cours(null, null, 0)),
    'une limite nulle ou négative rend une ligne, pas une erreur');
  select public.verifier(
    (select count(*) <= 200 from public.offres_en_cours(null, null, 100000)),
    'la limite est bornée à 200 par la base');
  select public.verifier(
    (select (array_agg(o.intitule))[1] = 'Essai 0097 a'
       from public.offres_en_cours(array['33'], null, 200) o
      where o.intitule like 'Essai 0097 %'),
    'les plus récemment actualisées d''abord');
commit;

-- ===========================================================================
\echo '— Camille, compte candidat : ni les menus, ni la liste'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0097-0000-0000-000000000002"}', true);
  begin
    perform public.filtres_des_offres();
    raise exception 'ÉCHEC — un compte candidat a lu les menus';
  exception when insufficient_privilege then
    raise notice '  ok — les menus lui sont refusés';
  end;
  begin
    perform * from public.offres_en_cours(null, null, 10);
    raise exception 'ÉCHEC — un compte candidat a lu la liste';
  exception when insufficient_privilege then
    raise notice '  ok — la liste lui est refusée';
  end;
  begin
    perform public.section_naf_d_une_offre('43.21A');
    raise exception 'ÉCHEC — la nomenclature se lit par la fonction interne';
  exception when insufficient_privilege then
    raise notice '  ok — la fonction interne lui est fermée';
  end;
end
$$;

\echo '— une personne non connectée : rien'
select public.verifier(
  not has_function_privilege('anon', 'public.filtres_des_offres()', 'execute')
    and not has_function_privilege('anon', 'public.offres_en_cours(text[], text, integer)', 'execute')
    and not has_function_privilege('anon', 'public.section_naf_d_une_offre(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.section_naf_d_une_offre(text)', 'execute'),
  'anon n''exécute aucune des fonctions ; la lecture de la nomenclature reste interne');

-- --- Ménage ----------------------------------------------------------------
delete from public.offre_emploi where bubble_id like 'offre-0097-%';
delete from auth.users where id in (:'remi', :'camille');

\echo ''
\echo 'Tous les contrôles de 0097_offres_par_departement_et_secteur.sql sont passés.'
