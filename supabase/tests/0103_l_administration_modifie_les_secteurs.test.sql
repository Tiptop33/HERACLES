-- Tests de la migration 0103_l_administration_modifie_les_secteurs.sql.
--
-- Qui est qui :
--   · Rémi    référent du candidat, loge Nord    — modifie, comme avant
--   · Victor  autre référent de la loge Nord     — lit, ne modifie toujours pas
--   · Ada     administratrice, sans fiche de référent — modifie et confirme
--
-- Données fabriquées : aucune personne réelle.

\set ON_ERROR_STOP on
\o /dev/null

\set remi   'cccccccc-0103-0000-0000-000000000001'
\set victor 'cccccccc-0103-0000-0000-000000000002'
\set ada    'cccccccc-0103-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',   'remi0103@example.org',   '{"role":"referent"}'),
  (:'victor', 'victor0103@example.org', '{"role":"referent"}'),
  (:'ada',    'ada0103@example.org',    '{"role":"referent"}')
on conflict (id) do nothing;
update public.profil set role = 'admin' where id = :'ada';

insert into public.loge (bubble_id, nom) values ('loge-0103-nord', 'Nord — 0103')
on conflict (bubble_id) do nothing;
select id as nord from public.loge where bubble_id = 'loge-0103-nord' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0103-remi',   :'remi',   'REMI',   'Rémi',   :'nord'::uuid),
  ('ref-0103-victor', :'victor', 'VICTOR', 'Victor', :'nord'::uuid)
on conflict (bubble_id) do nothing;
select id as r_remi from public.referent where bubble_id = 'ref-0103-remi' \gset

insert into public.candidat (bubble_id, nom, prenom, loge_id, referent_id) values
  ('cand-0103', 'Essai', 'Dominique', :'nord'::uuid, :'r_remi'::uuid)
on conflict (bubble_id) do nothing;
select id as cand from public.candidat where bubble_id = 'cand-0103' \gset

-- Un secteur proposé par le candidat, pas encore confirmé.
insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
values (:'cand'::uuid, 1, 'F', 'candidat');

\o
\echo '— Ada, administratrice : la fiche lui dit qu''elle peut modifier'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.verifier(
    (public.secteurs_du_candidat(:'cand'::uuid) ->> 'modifiable')::boolean,
    'l''administration voit les secteurs modifiables');

  select public.verifier(
    (public.confirmer_un_secteur_du_candidat(:'cand'::uuid, 'F') -> 'secteurs' -> 0 ->> 'confirme_le') is not null,
    'l''administration confirme un secteur proposé, même sans fiche de référent');

  select public.verifier(
    (select string_agg(e ->> 'code', ',' order by (e ->> 'rang')::int)
       from jsonb_array_elements(public.ecrire_les_secteurs_du_candidat(:'cand'::uuid, array['43', 'F']) -> 'secteurs') e)
      = '43,F',
    'l''administration pose la liste, dans l''ordre');
commit;

select public.verifier(
  (select confirme_le is not null and confirme_par is null and propose_par = 'referent'
     from public.candidat_secteur where candidat_id = :'cand'::uuid and code = '43'),
  'un secteur ajouté par l''administration est confirmé d''office, sans signataire');
select public.verifier(
  (select propose_par = 'candidat' and confirme_le is not null
     from public.candidat_secteur where candidat_id = :'cand'::uuid and code = 'F'),
  'le secteur du candidat garde son origine et sa confirmation');

\echo '— Rémi, référent du candidat : rien ne change pour lui'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  select public.verifier(
    jsonb_array_length(public.ecrire_les_secteurs_du_candidat(:'cand'::uuid, array['43']) -> 'secteurs') = 1,
    'le référent modifie toujours');
commit;

\echo '— Victor, autre référent de la loge : toujours en lecture seule'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'victor' || '"}', true);
  select public.verifier(
    not (public.secteurs_du_candidat(:'cand'::uuid) ->> 'modifiable')::boolean,
    'un autre référent de la loge lit sans modifier');
  do $$
  begin
    perform public.ecrire_les_secteurs_du_candidat(
      (select id from public.candidat where bubble_id = 'cand-0103'), array['F']);
    raise exception 'ÉCHEC — un autre référent de la loge modifie les secteurs';
  exception when insufficient_privilege then
    raise notice '  ok — refusé à un autre référent de la loge';
  end;
  $$;
commit;
