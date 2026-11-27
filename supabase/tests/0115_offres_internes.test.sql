-- Tests de la migration 0115_offres_internes.sql.
--
-- Qui est qui :
--   · Rémi  référent — saisit une offre
--   · Inès  compte « chercheur » — n'a pas l'écran des offres internes
--
-- Ce qu'on éprouve :
--   * l'offre saisie paraît dans « Offres internes », et plus dans la liste ni
--     dans les menus de « Offres externes », qui ne montrent que France Travail ;
--   * une offre de France Travail ne paraît pas dans « Offres internes » ;
--   * une offre saisie passée trente jours sort de « Offres internes » ;
--   * un compte candidat est refusé ; anon n'exécute rien.
--
-- Données fabriquées, dans une transaction annulée à la fin.

\set ON_ERROR_STOP on
\o /dev/null

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0115-0000-0000-000000000001', 'remi0115@example.org', '{"role":"referent"}'),
  ('dddddddd-0115-0000-0000-000000000002', 'ines0115@example.org', '{"role":"chercheur"}')
on conflict do nothing;

-- Une offre de France Travail à Bordeaux, dans la construction.
insert into public.offre_emploi (source_id, intitule, lieu_code_postal, code_naf, date_creation, date_actualisation)
values ('ft-0115', 'Plaquiste 0115', '33000', '43.31Z', now(), now());

-- Une offre saisie dans les Pyrénées-Atlantiques, section Q — que France
-- Travail n'a pas aujourd'hui dans ce test : ni le département 64 ni la
-- section Q ne doivent apparaître dans les menus à cause d'elle.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0115-0000-0000-000000000001"}', true);
select public.saisir_une_offre('{"type_offre":"emploi","intitule":"Aide-soignant 0115","entreprise":"Clinique 0115",
  "code_postal":"64100","ville":"Bayonne","contrat":"CDI","secteur":"Q"}'::jsonb) as offre \gset

-- ===========================================================================
\echo '— « Offres internes » : les offres saisies, et elles seules'
select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_internes_en_cours()) e
                   where e->>'id' = :'offre' and e->>'type_offre' = 'emploi'
                     and e->>'type_contrat_libelle' = 'CDI' and e->>'lieu_libelle' = 'Bayonne')),
  'l''offre saisie paraît dans les offres internes, avec son type et son contrat');

select public.verifier(
  (select not exists (select 1 from jsonb_array_elements(public.offres_internes_en_cours()) e
                       where e->>'intitule' = 'Plaquiste 0115')),
  'une offre de France Travail n''y paraît pas');

-- ===========================================================================
\echo '— « Offres externes » : France Travail seulement'
select public.verifier(
  (select not exists (select 1 from jsonb_array_elements(public.offres_en_cours(null, null, 200, 0, '0115')->'offres') e
                       where e->>'id' = :'offre')),
  'l''offre saisie ne paraît plus parmi les offres de France Travail');

select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_en_cours(null, null, 200, 0, 'plaquiste 0115')->'offres') e
                   where e->>'type_offre' is null)),
  'l''offre de France Travail, oui');

select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_en_cours(array['64'], 'Q', 200, 0, '0115')->'offres') e
                   where e->>'id' = :'offre')) is false,
  'même filtrée sur son département et son secteur');
reset role;

-- Les menus : rien que France Travail. On compare avec et sans l'offre saisie,
-- pour ne pas dépendre des offres que d'autres tests auraient laissées.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0115-0000-0000-000000000001"}', true);
select public.filtres_des_offres() as avec \gset
reset role;
delete from public.offre_emploi where id = :'offre';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0115-0000-0000-000000000001"}', true);
select public.verifier(
  public.filtres_des_offres() = :'avec'::jsonb,
  'les menus de « Offres externes » ne tiennent pas compte des offres saisies');

-- ===========================================================================
\echo '— passé trente jours, elle sort des offres internes en cours'
select public.saisir_une_offre('{"type_offre":"stage","intitule":"Stagiaire 0115","entreprise":"Clinique 0115",
  "code_postal":"64100","ville":"Bayonne","secteur":"Q"}'::jsonb) as vieille \gset
reset role;
update public.offre_emploi set date_creation = now() - interval '31 days',
                               date_actualisation = now() - interval '31 days'
 where id = :'vieille';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0115-0000-0000-000000000001"}', true);
select public.verifier(
  (select not exists (select 1 from jsonb_array_elements(public.offres_internes_en_cours()) e
                       where e->>'id' = :'vieille')),
  'sortie des offres internes en cours');
select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_saisies_echues()) e
                   where e->>'id' = :'vieille')),
  'et rangée parmi les offres saisies sorties de la liste');

-- ===========================================================================
\echo '— les droits'
select set_config('request.jwt.claims', '{"sub":"dddddddd-0115-0000-0000-000000000002"}', true);
do $$
begin
  begin
    perform public.offres_internes_en_cours();
    raise exception 'ÉCHEC — un compte candidat a lu les offres internes';
  exception when insufficient_privilege then
    raise notice '  ok — un compte candidat n''a pas l''écran des offres internes';
  end;
end
$$;
reset role;

select public.verifier(
  not has_function_privilege('anon', 'public.offres_internes_en_cours()', 'execute'),
  'anon n''exécute pas offres_internes_en_cours');

rollback;

\o
\echo
\echo 'Tous les contrôles de 0115_offres_internes.sql sont passés.'
