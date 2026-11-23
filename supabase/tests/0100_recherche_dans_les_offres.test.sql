-- Tests de la migration 0100_recherche_dans_les_offres.sql.
--
-- Qui est qui :
--   · Rémi    référent        — cherche un mot dans les offres
--   · Camille compte candidat — n'a pas cet écran
--
-- Ce qu'on éprouve :
--   * un mot se trouve dans l'intitulé, le métier, l'entreprise, le lieu ou la
--     description, sans accents ni majuscules, même au milieu d'un mot ;
--   * plusieurs mots : tous, où qu'ils soient ; l'ordre ne compte pas ;
--   * la recherche s'ajoute aux filtres de département et de secteur ;
--   * `%` et `_` se cherchent pour ce qu'ils sont ; une recherche vide ou
--     blanche ne filtre rien ; une recherche interminable est bornée ;
--   * une offre de plus de trente jours ne sort pas, même si le mot y est ;
--   * le total suit la recherche, page par page ;
--   * l'ancienne fonction à quatre arguments n'existe plus : l'appel sans
--     recherche n'est pas ambigu ;
--   * un compte candidat est refusé.
--
-- Données fabriquées. On ne compte que nos offres, reconnues à « zz0100 ».

\set ON_ERROR_STOP on
\o /dev/null

\set remi    'eeeeeeee-0100-0000-0000-000000000001'
\set camille 'eeeeeeee-0100-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',    'remi0100@example.org',    '{"role":"referent"}'),
  (:'camille', 'camille0100@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;

insert into public.offre_emploi
  (bubble_id, intitule, appellation_libelle, rome_libelle, entreprise_nom, lieu_libelle,
   description, departement, code_naf, date_actualisation) values
  ('offre-0100-a', 'Boulanger zz0100', 'Boulanger / Boulangère', 'Boulangerie - viennoiserie',
   'Fournil de l''Essai', '47 - AGEN', 'Pétrissage et cuisson.', '47', '10.71C', now() - interval '1 day'),
  ('offre-0100-b', 'Électricien zz0100', 'Électricien du bâtiment', 'Électricité bâtiment',
   'Bâti Essai', '33 - BORDEAUX', 'Câblage, 100% chantier, permis_B exigé.', '33', '43.21A', now() - interval '2 days'),
  ('offre-0100-c', 'Vendeur zz0100', 'Vendeur en boulangerie', 'Vente en alimentation',
   'Fournil de l''Essai', '33 - BORDEAUX', 'Accueil de la clientèle.', '33', '10.71C', now() - interval '3 days'),
  ('offre-0100-d', 'Boulanger ancien zz0100', null, null, null, '47 - AGEN', null, '47', '10.71C',
   now() - interval '60 days')
on conflict (bubble_id) do nothing;

-- Les intitulés de nos offres qui répondent, dans l'ordre de la liste.
create or replace function pg_temp.trouve(recherche text, deps text[] default null, secteur text default null)
returns text[]
language sql
as $$
  select coalesce(array_agg(o->>'intitule' order by rang), '{}')
    from jsonb_array_elements(public.offres_en_cours(deps, secteur, 200, 0, recherche)->'offres')
         with ordinality as t(o, rang)
   where o->>'intitule' like '%zz0100'
$$;

-- ===========================================================================
\echo '— les mots d''une recherche'
select public.verifier(
  public.mots_d_une_recherche('  Électricien   BÂTIMENT ') = array['%electricien%', '%batiment%'],
  'sans accents ni majuscules, espaces en trop ignorées');
select public.verifier(
  public.mots_d_une_recherche('100% permis_B') = array['%100\%%', '%permis\_b%'],
  'les jokers de LIKE sont neutralisés');
select public.verifier(
  public.mots_d_une_recherche(null) = '{}' and public.mots_d_une_recherche('   ') = '{}',
  'rien à chercher : aucun mot');
select public.verifier(
  cardinality(public.mots_d_une_recherche('un deux trois quatre cinq six sept huit')) = 6
    and cardinality(public.mots_d_une_recherche(repeat('a', 117) || ' b c')) = 2,
  'six mots au plus, sur les 120 premiers caractères');

-- ===========================================================================
\echo '— Rémi, référent : chercher'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0100-0000-0000-000000000001"}', true);

  select public.verifier(
    pg_temp.trouve('zz0100') = array['Boulanger zz0100', 'Électricien zz0100', 'Vendeur zz0100'],
    'le mot commun : nos trois offres en cours, pas l''ancienne');
  select public.verifier(
    pg_temp.trouve('ELECTRICIEN zz0100') = array['Électricien zz0100']
      and pg_temp.trouve('électricien zz0100') = array['Électricien zz0100'],
    'dans l''intitulé, avec ou sans accent, en majuscules ou non');
  select public.verifier(
    pg_temp.trouve('boulang zz0100') = array['Boulanger zz0100', 'Vendeur zz0100'],
    'un début de mot suffit, et le métier compte : le vendeur en boulangerie sort aussi');
  select public.verifier(
    pg_temp.trouve('fournil zz0100') = array['Boulanger zz0100', 'Vendeur zz0100'],
    'dans le nom de l''entreprise');
  select public.verifier(
    pg_temp.trouve('petrissage zz0100') = array['Boulanger zz0100'],
    'dans la description');
  select public.verifier(
    pg_temp.trouve('bordeaux fournil zz0100') = array['Vendeur zz0100']
      and pg_temp.trouve('zz0100 fournil bordeaux') = array['Vendeur zz0100'],
    'plusieurs mots : tous, où qu''ils soient, dans n''importe quel ordre');
  select public.verifier(
    pg_temp.trouve('boulanger électricien zz0100') = '{}',
    'deux mots que nulle offre ne porte ensemble : rien');
  select public.verifier(
    pg_temp.trouve('100% zz0100') = array['Électricien zz0100']
      and pg_temp.trouve('permis_b zz0100') = array['Électricien zz0100']
      and pg_temp.trouve('permisXb zz0100') = '{}',
    '« % » et « _ » se cherchent pour ce qu''ils sont');

  \echo '— Rémi : la recherche s''ajoute aux filtres'
  select public.verifier(
    pg_temp.trouve('fournil zz0100', array['47']) = array['Boulanger zz0100']
      and pg_temp.trouve('zz0100', array['33'], 'F') = array['Électricien zz0100']
      and pg_temp.trouve('fournil zz0100', array['33'], 'F') = '{}',
    'département, secteur et mots : tout à la fois');
  select public.verifier(
    (select (public.offres_en_cours(null, null, 1, 0, 'fournil zz0100')->>'total')::int = 2
        and jsonb_array_length(public.offres_en_cours(null, null, 1, 1, 'fournil zz0100')->'offres') = 1),
    'le total suit la recherche, et la deuxième page existe');
  select public.verifier(
    (select (public.offres_en_cours(null, null, 1, 0, '   ')->>'total')::int
          = (public.offres_en_cours(null, null, 1, 0)->>'total')::int),
    'une recherche blanche ne filtre rien — et l''appel sans recherche n''est pas ambigu');
commit;

select public.verifier(
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'offres_en_cours'),
  'une seule fonction offres_en_cours : l''ancienne, à quatre arguments, est retirée');

-- ===========================================================================
\echo '— Camille, compte candidat : refusée'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0100-0000-0000-000000000002"}', true);
  begin
    perform public.offres_en_cours(null, null, 10, 0, 'boulanger');
    raise exception 'ÉCHEC — un compte candidat a cherché dans les offres';
  exception when insufficient_privilege then
    raise notice '  ok — la recherche lui est refusée';
  end;
  begin
    perform public.mots_d_une_recherche('boulanger');
    raise exception 'ÉCHEC — la fonction interne est ouverte';
  exception when insufficient_privilege then
    raise notice '  ok — les fonctions internes lui sont fermées';
  end;
end
$$;

select public.verifier(
  not has_function_privilege('anon', 'public.offres_en_cours(text[], text, integer, integer, text)', 'execute'),
  'une personne non connectée n''exécute pas la recherche');

-- --- Ménage ----------------------------------------------------------------
delete from public.offre_emploi where bubble_id like 'offre-0100-%';
delete from auth.users where id in (:'remi', :'camille');

\echo ''
\echo 'Tous les contrôles de 0100_recherche_dans_les_offres.sql sont passés.'
