-- Tests de la migration 0101_purge_des_offres_anciennes.sql.
--
-- Qui est qui :
--   · la route de réception — clé de service, personne de connecté
--   · Rémi    référent        — ne purge rien
--   · Camille compte candidat — non plus
--
-- Ce qu'on éprouve :
--   * une offre de plus de soixante jours part ; à cinquante-neuf jours elle
--     reste, comme une offre en cours ;
--   * l'âge se lit dans la date d'actualisation, sinon de création, sinon de
--     réception — une offre sans aucune date ne reste pas pour toujours, une
--     offre ancienne mais réactualisée hier reste ;
--   * la fonction rend le nombre de lignes supprimées, et zéro au second
--     passage ;
--   * elle refuse moins de trente et un jours : les offres en cours ne
--     peuvent pas être vidées par une faute de frappe ;
--   * seule la clé de service purge.
--
-- Données fabriquées. Tout se joue dans une transaction annulée à la fin : la
-- purge supprime pour de bon, et les offres que d'autres tests auraient
-- laissées ne doivent pas en pâtir.

\set ON_ERROR_STOP on
\o /dev/null

\set remi    'eeeeeeee-0101-0000-0000-000000000001'
\set camille 'eeeeeeee-0101-0000-0000-000000000002'

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',    'remi0101@example.org',    '{"role":"referent"}'),
  (:'camille', 'camille0101@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;

--   a : en cours — actualisée hier
--   b : hors écran mais dans la marge — 59 jours
--   c : 61 jours — part
--   d : reprise de Bubble, six mois — part
--   e : créée il y a un an, réactualisée hier — reste
--   f : sans date d'actualisation, créée il y a 90 jours — part
--   g : sans aucune date de France Travail, reçue il y a 90 jours — part
--   h : sans aucune date de France Travail, reçue aujourd'hui — reste
insert into public.offre_emploi (source_id, bubble_id, intitule, date_actualisation, date_creation, cree_le) values
  ('P0101A', null,              'Essai 0101 a', now() - interval '1 day',   now() - interval '2 days',  now()),
  ('P0101B', null,              'Essai 0101 b', now() - interval '59 days', now() - interval '59 days', now() - interval '59 days'),
  ('P0101C', null,              'Essai 0101 c', now() - interval '61 days', now() - interval '61 days', now() - interval '61 days'),
  ('P0101D', 'offre-0101-bubble','Essai 0101 d', now() - interval '180 days', now() - interval '181 days', now() - interval '100 days'),
  ('P0101E', null,              'Essai 0101 e', now() - interval '1 day',   now() - interval '365 days', now() - interval '365 days'),
  ('P0101F', null,              'Essai 0101 f', null,                       now() - interval '90 days', now()),
  ('P0101G', null,              'Essai 0101 g', null,                       null,                       now() - interval '90 days'),
  ('P0101H', null,              'Essai 0101 h', null,                       null,                       now());

-- ===========================================================================
\echo '— purger : la clé de service, et personne d''autre'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0101-0000-0000-000000000001"}', true);
  begin
    perform public.purger_les_offres_anciennes();
    raise exception 'ÉCHEC — un référent a purgé les offres';
  exception when insufficient_privilege then
    raise notice '  ok — un référent ne purge pas';
  end;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0101-0000-0000-000000000002"}', true);
  begin
    perform public.purger_les_offres_anciennes(60);
    raise exception 'ÉCHEC — un compte candidat a purgé les offres';
  exception when insufficient_privilege then
    raise notice '  ok — un compte candidat non plus';
  end;
  reset role;
end
$$;

select public.verifier(
  not has_function_privilege('anon', 'public.purger_les_offres_anciennes(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.purger_les_offres_anciennes(integer)', 'execute')
    and has_function_privilege('service_role', 'public.purger_les_offres_anciennes(integer)', 'execute'),
  'ni anon ni authenticated n''exécutent la purge ; service_role, oui');

select public.verifier(
  (select count(*) = 8 from public.offre_emploi where source_id like 'P0101%'),
  'les refus n''ont rien supprimé');

-- ===========================================================================
\echo '— le garde-fou : jamais moins de trente et un jours'
do $$
begin
  set local role service_role;
  begin
    perform public.purger_les_offres_anciennes(30);
    raise exception 'ÉCHEC — une purge à 30 jours a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — 30 jours est refusé';
  end;
  begin
    perform public.purger_les_offres_anciennes(0);
    raise exception 'ÉCHEC — une purge à 0 jour a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — 0 jour est refusé';
  end;
  begin
    perform public.purger_les_offres_anciennes(null);
    raise exception 'ÉCHEC — une purge sans durée a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — une durée absente est refusée';
  end;
  reset role;
end
$$;

select public.verifier(
  (select count(*) = 8 from public.offre_emploi where source_id like 'P0101%'),
  'le garde-fou n''a rien laissé passer');

-- ===========================================================================
\echo '— la purge, par la clé de service'
set local role service_role;
-- D'autres tests ont pu laisser de vieilles offres : on ne juge que les nôtres.
select public.purger_les_offres_anciennes() >= 4 as purge_faite \gset
select public.purger_les_offres_anciennes() as second_passage \gset
reset role;

select public.verifier(:'purge_faite'::boolean, 'la purge rend le nombre de lignes supprimées — au moins nos quatre');
select public.verifier(:second_passage = 0, 'un second passage ne trouve plus rien');

select public.verifier(
  (select array_agg(source_id order by source_id) = array['P0101A', 'P0101B', 'P0101E', 'P0101H']
     from public.offre_emploi where source_id like 'P0101%'),
  'restent : l''offre en cours, celle de 59 jours, l''ancienne réactualisée hier, et celle reçue aujourd''hui sans date');

select public.verifier(
  not exists (select 1 from public.offre_emploi where bubble_id = 'offre-0101-bubble'),
  'l''offre reprise de Bubble, vieille de six mois, est partie');

-- Une marge plus longue épargne davantage.
insert into public.offre_emploi (source_id, intitule, date_actualisation) values
  ('P0101I', 'Essai 0101 i', now() - interval '80 days');
set local role service_role;
select public.purger_les_offres_anciennes(90) as a_90 \gset
reset role;
select public.verifier(
  :a_90 = 0 and exists (select 1 from public.offre_emploi where source_id = 'P0101I'),
  'à 90 jours, une offre de 80 jours reste');

rollback;

\echo ''
\echo 'Tous les contrôles de 0101_purge_des_offres_anciennes.sql sont passés.'
