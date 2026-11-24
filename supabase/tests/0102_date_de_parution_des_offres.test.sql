-- Tests de la migration 0102_date_de_parution_des_offres.sql.
--
-- Qui est qui :
--   · Rémi  référent — lit la liste des offres en cours
--
-- Ce qu'on éprouve :
--   * chaque offre de la liste porte sa date de parution — celle de création
--     chez France Travail, pas celle de la dernière actualisation ;
--   * une offre sans date de création le dit par un vide, pas par une autre
--     date ;
--   * l'ordre de la liste reste celui de l'actualisation ;
--   * rien d'autre n'a bougé : les autres champs sont toujours là, et il n'y
--     a toujours qu'une fonction de ce nom.
--
-- Données fabriquées. On ne juge que nos offres, reconnues à « zz0102 ».

\set ON_ERROR_STOP on
\o /dev/null

\set remi 'eeeeeeee-0102-0000-0000-000000000001'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi', 'remi0102@example.org', '{"role":"referent"}')
on conflict (id) do nothing;

--   a : parue il y a 20 jours, réactualisée il y a une heure — en tête
--   b : parue et actualisée il y a 2 jours
--   c : sans date de création, actualisée il y a 3 jours
insert into public.offre_emploi (bubble_id, intitule, entreprise_nom, date_creation, date_actualisation) values
  ('offre-0102-a', 'Essai a zz0102', 'Entreprise Essai 0102', date_trunc('day', now()) - interval '20 days', now() - interval '1 hour'),
  ('offre-0102-b', 'Essai b zz0102', null, date_trunc('day', now()) - interval '2 days', now() - interval '2 days'),
  ('offre-0102-c', 'Essai c zz0102', null, null, now() - interval '3 days')
on conflict (bubble_id) do nothing;

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0102-0000-0000-000000000001"}', true);

  create temporary table liste_0102 on commit drop as
  select o, rang
    from jsonb_array_elements(public.offres_en_cours(null, null, 200, 0, 'zz0102')->'offres')
         with ordinality as t(o, rang);

  \echo '— la date de parution, sur chaque ligne'
  select public.verifier(
    (select array_agg(o->>'intitule' order by rang)
              = array['Essai a zz0102', 'Essai b zz0102', 'Essai c zz0102'] from liste_0102),
    'l''ordre reste celui de l''actualisation : a, réactualisée il y a une heure, en tête');
  select public.verifier(
    (select (o->>'date_creation')::timestamptz = date_trunc('day', now()) - interval '20 days'
       from liste_0102 where o->>'intitule' = 'Essai a zz0102'),
    'a dit sa parution d''il y a vingt jours — pas sa réactualisation d''il y a une heure');
  select public.verifier(
    (select (o->>'date_creation')::timestamptz = date_trunc('day', now()) - interval '2 days'
       from liste_0102 where o->>'intitule' = 'Essai b zz0102'),
    'b dit sa parution d''il y a deux jours');
  select public.verifier(
    (select o ? 'date_creation' and o->>'date_creation' is null
       from liste_0102 where o->>'intitule' = 'Essai c zz0102'),
    'c, sans date de création, rend un vide — pas sa date d''actualisation');
  select public.verifier(
    (select bool_and(o ?& array['id', 'intitule', 'entreprise_nom', 'lieu_libelle', 'type_contrat_libelle'])
        and bool_or(o->>'entreprise_nom' = 'Entreprise Essai 0102') from liste_0102),
    'les autres champs de la ligne sont toujours là');
commit;

select public.verifier(
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'offres_en_cours'),
  'toujours une seule fonction offres_en_cours');

-- --- Ménage ----------------------------------------------------------------
delete from public.offre_emploi where bubble_id like 'offre-0102-%';
delete from auth.users where id = :'remi';

\echo ''
\echo 'Tous les contrôles de 0102_date_de_parution_des_offres.sql sont passés.'
