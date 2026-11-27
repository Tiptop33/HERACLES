-- Tests de la migration 0116_duree_des_offres_saisies.sql.
--
-- Ce qu'on éprouve :
--   * une offre saisie sortie de la liste depuis moins de six mois reste —
--     prolongeable ; depuis plus de six mois, la purge la supprime, et la
--     trace de son auteur avec elle ;
--   * une offre saisie prolongée hier, même publiée il y a un an, reste ;
--   * la règle des offres de France Travail ne change pas — soixante jours ;
--   * le nombre rendu compte les deux sortes ;
--   * seule la clé de service purge, toujours.
--
-- Données fabriquées, dans une transaction annulée à la fin : la purge
-- supprime pour de bon.

\set ON_ERROR_STOP on
\o /dev/null

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0116-0000-0000-000000000001', 'remi0116@example.org', '{"role":"referent"}')
on conflict do nothing;

-- Quatre offres saisies, par la fonction de saisie, puis vieillies à la main :
--   a : sortie de la liste il y a cinq mois (dernière mise en ligne : 30 j + 5 mois) — reste
--   b : sortie de la liste il y a six mois et deux jours — part
--   c : publiée il y a un an, prolongée hier — reste
--   d : sortie de la liste il y a un an — part
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0116-0000-0000-000000000001"}', true);
select public.saisir_une_offre(jsonb_build_object('type_offre', 'stage', 'intitule', 'Offre 0116 ' || l,
         'entreprise', 'Entreprise 0116', 'code_postal', '33000', 'ville', 'Bordeaux', 'secteur', 'F'))
  from unnest(array['a', 'b', 'c', 'd']) l;
reset role;

update public.offre_emploi set date_creation = now() - interval '30 days' - interval '5 months',
                               date_actualisation = now() - interval '30 days' - interval '5 months'
 where intitule = 'Offre 0116 a';
update public.offre_emploi set date_creation = now() - interval '30 days' - interval '6 months' - interval '2 days',
                               date_actualisation = now() - interval '30 days' - interval '6 months' - interval '2 days'
 where intitule = 'Offre 0116 b';
update public.offre_emploi set date_creation = now() - interval '1 year',
                               date_actualisation = now() - interval '1 day'
 where intitule = 'Offre 0116 c';
update public.offre_emploi set date_creation = now() - interval '1 year' - interval '30 days',
                               date_actualisation = now() - interval '1 year' - interval '30 days'
 where intitule = 'Offre 0116 d';

select array_agg(id) as auteurs_avant from public.offre_emploi where intitule in ('Offre 0116 b', 'Offre 0116 d') \gset

-- Et deux offres de France Travail : 59 jours (reste), 61 jours (part).
insert into public.offre_emploi (source_id, intitule, date_actualisation, date_creation) values
  ('ft-0116-a', 'France Travail 0116 a', now() - interval '59 days', now() - interval '59 days'),
  ('ft-0116-b', 'France Travail 0116 b', now() - interval '61 days', now() - interval '61 days');

-- ===========================================================================
\echo '— seule la clé de service purge'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0116-0000-0000-000000000001"}', true);
  begin
    perform public.purger_les_offres_anciennes();
    raise exception 'ÉCHEC — un référent a purgé les offres';
  exception when insufficient_privilege then
    raise notice '  ok — un référent ne purge pas';
  end;
  reset role;
end
$$;

-- ===========================================================================
\echo '— la purge'
set local role service_role;
select public.purger_les_offres_anciennes() as purgees \gset
reset role;

select public.verifier(:purgees >= 3,
  'la purge rend au moins nos trois offres supprimées — deux saisies, une de France Travail');

select public.verifier(
  (select array_agg(intitule order by intitule) = array['Offre 0116 a', 'Offre 0116 c']
     from public.offre_emploi where intitule like 'Offre 0116 %'),
  'restent l''offre sortie depuis cinq mois et celle prolongée hier ; partent celles sorties depuis plus de six mois');

select public.verifier(
  not exists (select 1 from public.offre_saisie where offre_id = any (:'auteurs_avant'::uuid[])),
  'la trace de leur auteur part avec elles');

select public.verifier(
  (select array_agg(source_id order by source_id) = array['ft-0116-a']
     from public.offre_emploi where source_id like 'ft-0116-%'),
  'les offres de France Travail gardent leur règle : 59 jours reste, 61 jours part');

-- Une marge plus longue pour France Travail ne change rien aux offres saisies.
set local role service_role;
select public.purger_les_offres_anciennes(400) as second \gset
reset role;
select public.verifier(
  (select count(*) = 2 from public.offre_emploi where intitule like 'Offre 0116 %'),
  'la marge de France Travail ne touche pas aux offres saisies');

rollback;

\o
\echo
\echo 'Tous les contrôles de 0116_duree_des_offres_saisies.sql sont passés.'
