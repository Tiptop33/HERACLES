-- Tests de la migration 0098_departement_des_offres.sql.
--
-- Qui est qui :
--   · Rémi  référent — ouvre le menu « Départements »
--
-- Ce qu'on éprouve :
--   * le département se lit, dans l'ordre, dans le texte de Bubble, le code
--     postal, le code INSEE de la commune, puis le libellé du lieu ;
--   * un code postal avec une espace, ou amputé de son zéro, se lit quand même ;
--   * une offre qui n'a QUE son libellé « 33 - BORDEAUX » — le cas du site
--     d'essai — entre dans le menu, et répond au filtre ;
--   * rien de reconnaissable : pas de département, plutôt qu'un faux.
--
-- Données fabriquées : offres et lieux inventés. On ne compte que les nôtres.

\set ON_ERROR_STOP on
\o /dev/null

\set remi 'eeeeeeee-0098-0000-0000-000000000001'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi', 'remi0098@example.org', '{"role":"referent"}')
on conflict (id) do nothing;

-- --- Fixtures --------------------------------------------------------------
--   a : rien que le libellé du lieu, à la manière de France Travail
--   b : rien que le code INSEE
--   c : un code postal amputé de son zéro (Ain)
--   d : un lieu sans numéro — aucun département
insert into public.offre_emploi
  (bubble_id, intitule, departement, lieu_code_postal, lieu_code_insee, lieu_libelle, date_actualisation) values
  ('offre-0098-a', 'Essai 0098 a', null, null,   null,    '40 - MONT DE MARSAN', now() - interval '1 day'),
  ('offre-0098-b', 'Essai 0098 b', null, null,   '24322', null,                  now() - interval '2 days'),
  ('offre-0098-c', 'Essai 0098 c', '',   '1000', null,    'Bourg-en-Bresse',     now() - interval '3 days'),
  ('offre-0098-d', 'Essai 0098 d', null, null,   null,    'France',              now() - interval '4 days')
on conflict (bubble_id) do nothing;

-- ===========================================================================
\echo '— les quatre chemins, dans l''ordre'
select public.verifier(
  public.departement_d_une_offre('33', '47000', '24322', '40 - MONT DE MARSAN') = '33'
    and public.departement_d_une_offre(null, '47000', '24322', '40 - MONT DE MARSAN') = '47'
    and public.departement_d_une_offre(null, null, '24322', '40 - MONT DE MARSAN') = '24'
    and public.departement_d_une_offre(null, null, null, '40 - MONT DE MARSAN') = '40',
  'le texte, puis le code postal, puis le code INSEE, puis le libellé');
select public.verifier(
  public.departement_d_une_offre(null, '33 000', null, null) = '33'
    and public.departement_d_une_offre(null, '1000', null, null) = '01'
    and public.departement_d_une_offre(null, ' 97100 ', null, null) = '971',
  'un code postal avec une espace, ou sans son zéro de tête, se lit quand même');
select public.verifier(
  public.departement_d_une_offre(null, null, '2A004', null) = '2A'
    and public.departement_d_une_offre(null, null, '97105', null) = '971'
    and public.departement_d_une_offre(null, null, null, '2B - BASTIA') = '2B'
    and public.departement_d_une_offre(null, null, null, '974 - ST DENIS') = '974'
    and public.departement_d_une_offre(null, null, null, '33-BORDEAUX') = '33',
  'Corse et outre-mer, par le code INSEE comme par le libellé');
select public.verifier(
  public.departement_d_une_offre(null, null, null, null) is null
    and public.departement_d_une_offre('Gironde', 'abc', '123', 'Bordeaux') is null
    and public.departement_d_une_offre(null, null, null, '33 rue des Essais') is null
    and public.departement_d_une_offre(null, null, null, 'France') is null,
  'rien de reconnaissable : pas de département — une adresse n''est pas un numéro');

-- ===========================================================================
\echo '— Rémi, référent : le menu n''est plus vide'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0098-0000-0000-000000000001"}', true);

  select public.verifier(
    (select public.filtres_des_offres()->'departements' @> '["40","24","01"]'::jsonb),
    'une offre qui n''a que son libellé, son code INSEE ou un code postal amputé entre dans le menu');
  select public.verifier(
    (select jsonb_agg(o->>'intitule') = '["Essai 0098 a"]'::jsonb
       from jsonb_array_elements(public.offres_en_cours(array['40'], null, 200, 0)->'offres') o
      where o->>'intitule' like 'Essai 0098 %'),
    'les Landes : l''offre reconnue à son seul libellé');
  select public.verifier(
    (select count(*) = 3
       from jsonb_array_elements(public.offres_en_cours(array['40', '24', '01'], null, 200, 0)->'offres') o
      where o->>'intitule' like 'Essai 0098 %'),
    'trois départements : a, b et c — pas d, qui n''en a aucun');
  select public.verifier(
    (select count(*) = 4
       from jsonb_array_elements(public.offres_en_cours(null, null, 200, 0)->'offres') o
      where o->>'intitule' like 'Essai 0098 %'),
    'sans filtre, d reste visible');
commit;

-- --- Ménage ----------------------------------------------------------------
delete from public.offre_emploi where bubble_id like 'offre-0098-%';
delete from auth.users where id = :'remi';

\echo ''
\echo 'Tous les contrôles de 0098_departement_des_offres.sql sont passés.'
