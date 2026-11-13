-- Tests de la migration 0092_secteurs_du_candidat_a_l_ecran.sql.
--
-- Qui est qui :
--   · Rémi    référent du candidat, loge Nord    — lit, modifie, confirme
--   · Paula   parraine le candidat, loge Nord    — de même
--   · Victor  autre référent de la loge Nord     — lit, ne modifie pas
--   · Sami    référent de la loge Sud            — ne lit rien
--   · Ada     administratrice                    — lit, ne modifie pas (comme la fiche)
--   · le candidat, sans compte, par le lien de sa candidature
--
-- Données fabriquées : aucune personne réelle.

\set ON_ERROR_STOP on
\o /dev/null

\set remi   'cccccccc-0092-0000-0000-000000000001'
\set paula  'cccccccc-0092-0000-0000-000000000002'
\set victor 'cccccccc-0092-0000-0000-000000000003'
\set sami   'cccccccc-0092-0000-0000-000000000004'
\set ada    'cccccccc-0092-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'remi',   'remi0092@example.org',   '{"role":"referent"}'),
  (:'paula',  'paula0092@example.org',  '{"role":"referent"}'),
  (:'victor', 'victor0092@example.org', '{"role":"referent"}'),
  (:'sami',   'sami0092@example.org',   '{"role":"referent"}'),
  (:'ada',    'ada0092@example.org',    '{"role":"referent"}')
on conflict (id) do nothing;
update public.profil set role = 'admin' where id = :'ada';

insert into public.loge (bubble_id, nom) values
  ('loge-0092-nord', 'Nord — 0092'),
  ('loge-0092-sud',  'Sud — 0092')
on conflict (bubble_id) do nothing;
select id as nord from public.loge where bubble_id = 'loge-0092-nord' \gset
select id as sud  from public.loge where bubble_id = 'loge-0092-sud' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0092-remi',   :'remi',   'REMI',   'Rémi',   :'nord'::uuid),
  ('ref-0092-paula',  :'paula',  'PAULA',  'Paula',  :'nord'::uuid),
  ('ref-0092-victor', :'victor', 'VICTOR', 'Victor', :'nord'::uuid),
  ('ref-0092-sami',   :'sami',   'SAMI',   'Sami',   :'sud'::uuid)
on conflict (bubble_id) do nothing;
select id as r_remi  from public.referent where bubble_id = 'ref-0092-remi' \gset
select id as r_paula from public.referent where bubble_id = 'ref-0092-paula' \gset

insert into public.candidat (bubble_id, nom, prenom, loge_id, referent_id, parrain_id, secteur_activite_libelle) values
  ('cand-0092', 'Essai', 'Camille', :'nord'::uuid, :'r_remi'::uuid, :'r_paula'::uuid, 'BTP')
on conflict (bubble_id) do nothing;
select id as cand from public.candidat where bubble_id = 'cand-0092' \gset

-- Le lien de sa candidature, comme la route le hache.
select encode(sha256('jeton-0092-candidat'::bytea), 'hex') as e_c \gset
insert into public.parrainage (loge_id, candidat_id, jeton_candidat_empreinte, candidat_expire_le)
values (:'nord'::uuid, :'cand'::uuid, :'e_c', now() + interval '30 days');

-- ===========================================================================
\echo '— le candidat propose ses secteurs, par son lien'
begin;
  set local role service_role;
  select public.verifier(public.candidat_de_la_candidature(:'e_c') = :'cand'::uuid,
    'le lien désigne le candidat');
  select public.proposer_les_secteurs_de_la_candidature(:'e_c', array['43', 'H']);
  select public.verifier(
    exists (select 1 from public.rechercher_secteur_par_la_candidature(:'e_c', 'boulangerie') where code = '10'),
    'il cherche un secteur');
  select public.verifier(
    jsonb_array_length(public.sections_et_divisions_par_la_candidature(:'e_c')) = 21 + 88,
    'et parcourt les 21 sections et 88 divisions');
  select public.proposer_les_secteurs_de_la_candidature(:'e_c', array[]::text[]);
commit;

select public.verifier(
  (select string_agg(code || ':' || propose_par || ':' || (confirme_le is null)::text, ' ' order by rang)
     from public.candidat_secteur where candidat_id = :'cand') = '43:candidat:true H:candidat:true',
  'deux secteurs, dans l''ordre, proposés par le candidat, à confirmer — et une liste vide n''a rien effacé');

do $$
declare
  e text := encode(sha256('jeton-0092-candidat'::bytea), 'hex');
begin
  set local role service_role;
  begin
    perform public.proposer_les_secteurs_de_la_candidature(e, array['43', '41', '42', '56']);
    raise exception 'ÉCHEC — quatre secteurs ont été proposés';
  exception when check_violation then
    raise notice '  ok — refusé : quatre secteurs';
  end;
  begin
    perform public.proposer_les_secteurs_de_la_candidature(e, array['43', '43']);
    raise exception 'ÉCHEC — le même secteur deux fois';
  exception when check_violation then
    raise notice '  ok — refusé : le même secteur deux fois';
  end;
  begin
    perform public.proposer_les_secteurs_de_la_candidature(e, array['43.21A']);
    raise exception 'ÉCHEC — une sous-classe a été proposée';
  exception when check_violation then
    raise notice '  ok — refusé : une sous-classe, trop fine pour un candidat (0088)';
  end;
  begin
    perform public.proposer_les_secteurs_de_la_candidature(encode(sha256('autre'::bytea), 'hex'), array['43']);
    raise exception 'ÉCHEC — un lien inconnu a proposé';
  exception when invalid_authorization_specification then
    raise notice '  ok — refusé : un lien inconnu';
  end;
end
$$;

-- ===========================================================================
\echo '— Rémi, référent du candidat : il voit, confirme, corrige'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);

  select public.verifier(
    (public.secteurs_du_candidat(:'cand'::uuid) ->> 'modifiable')::boolean
      and public.secteurs_du_candidat(:'cand'::uuid) ->> 'repris_de_bubble' = 'BTP'
      and jsonb_array_length(public.secteurs_du_candidat(:'cand'::uuid) -> 'secteurs') = 2,
    'il voit deux secteurs à confirmer, et le texte repris de Bubble');
  select public.verifier(
    (public.secteurs_du_candidat(:'cand'::uuid) -> 'secteurs' -> 0 ->> 'section') = 'F'
      and (public.secteurs_du_candidat(:'cand'::uuid) -> 'secteurs' -> 1 ->> 'section') = 'H',
    'chaque secteur porte sa section — une section est la sienne');

  select public.confirmer_un_secteur_du_candidat(:'cand'::uuid, '43');
  select public.verifier(
    (public.secteurs_du_candidat(:'cand'::uuid) -> 'secteurs' -> 0 ->> 'confirme_par') = 'Rémi REMI',
    'confirmer note qui a confirmé');
  select public.verifier(
    public.secteurs_du_candidat(:'cand'::uuid) ->> 'repris_de_bubble' = 'BTP',
    'tant qu''un secteur reste à confirmer, le texte de Bubble reste affiché');

  -- Il réordonne, retire H, ajoute 49.
  select public.ecrire_les_secteurs_du_candidat(:'cand'::uuid, array['49', '43']);
commit;

select public.verifier(
  (select string_agg(code || ':' || propose_par || ':' || (confirme_le is not null)::text, ' ' order by rang)
     from public.candidat_secteur where candidat_id = :'cand') = '49:referent:true 43:candidat:true',
  'ce qu''il ajoute est confirmé d''office ; ce qu''il garde garde son origine');

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'remi' || '"}', true);
  select public.verifier(
    public.secteurs_du_candidat(:'cand'::uuid) ->> 'repris_de_bubble' is null,
    'tout est confirmé : le texte de Bubble ne s''affiche plus');
commit;

do $$
declare
  cand uuid := (select id from public.candidat where bubble_id = 'cand-0092');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"cccccccc-0092-0000-0000-000000000001"}', true);
  begin
    perform public.ecrire_les_secteurs_du_candidat(cand, array['41', '42', '43', '56']);
    raise exception 'ÉCHEC — quatre secteurs ont été écrits';
  exception when check_violation then
    raise notice '  ok — refusé : quatre secteurs';
  end;
  begin
    perform public.ecrire_les_secteurs_du_candidat(cand, array['43.2']);
    raise exception 'ÉCHEC — un groupe a été choisi';
  exception when check_violation then
    raise notice '  ok — refusé : un groupe, trop fin pour un candidat';
  end;
end
$$;

\echo '— Paula, sa marraine, modifie aussi'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'paula' || '"}', true);
  select public.verifier(
    (public.secteurs_du_candidat(:'cand'::uuid) ->> 'modifiable')::boolean,
    'la marraine du candidat peut modifier');
commit;

\echo '— Victor, référent de la loge : il lit, ne modifie pas'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'victor' || '"}', true);
  select public.verifier(
    public.secteurs_du_candidat(:'cand'::uuid) is not null
      and not (public.secteurs_du_candidat(:'cand'::uuid) ->> 'modifiable')::boolean,
    'Victor lit, en lecture seule');
  select public.verifier(
    exists (select 1 from public.rechercher_secteur_pour_un_candidat('restauration') where code = '56')
      and jsonb_array_length(public.sections_et_divisions_pour_un_candidat()) = 109,
    'un référent cherche et parcourt la liste');
commit;

do $$
declare
  cand uuid := (select id from public.candidat where bubble_id = 'cand-0092');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"cccccccc-0092-0000-0000-000000000003"}', true);
  begin
    perform public.ecrire_les_secteurs_du_candidat(cand, array['56']);
    raise exception 'ÉCHEC — Victor a modifié';
  exception when insufficient_privilege then
    raise notice '  ok — refusé : modifier sans être le référent ni le parrain';
  end;
  begin
    perform public.confirmer_un_secteur_du_candidat(cand, '43');
    raise exception 'ÉCHEC — Victor a confirmé';
  exception when insufficient_privilege then
    raise notice '  ok — refusé : confirmer';
  end;
end
$$;

\echo '— Sami, d''une autre loge : rien'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'sami' || '"}', true);
  select public.verifier(public.secteurs_du_candidat(:'cand'::uuid) is null,
    'Sami ne lit pas les secteurs d''un candidat d''une autre loge');
commit;

\echo '— Ada, administratrice : elle lit, comme la fiche'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.verifier(
    public.secteurs_du_candidat(:'cand'::uuid) is not null
      and not (public.secteurs_du_candidat(:'cand'::uuid) ->> 'modifiable')::boolean,
    'l''administration lit, sans modifier — comme la fiche');
commit;

\echo '— une personne non connectée, et les fonctions du lien'
do $$
begin
  set local role anon;
  begin
    perform public.secteurs_du_candidat((select id from public.candidat where bubble_id = 'cand-0092'));
    raise exception 'ÉCHEC — une personne non connectée lit les secteurs';
  exception when insufficient_privilege then
    raise notice '  ok — refusé à une personne non connectée';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"cccccccc-0092-0000-0000-000000000001"}', true);
  begin
    perform public.proposer_les_secteurs_de_la_candidature(encode(sha256('jeton-0092-candidat'::bytea), 'hex'), array['43']);
    raise exception 'ÉCHEC — une session appelle une fonction du lien';
  exception when insufficient_privilege then
    raise notice '  ok — les fonctions du lien ne sont qu''à la clé de service';
  end;
end
$$;

\echo '— la candidature envoyée, le lien ne propose plus rien'
update public.candidat set candidature_completee_le = now() where id = :'cand';
do $$
begin
  set local role service_role;
  begin
    perform public.proposer_les_secteurs_de_la_candidature(encode(sha256('jeton-0092-candidat'::bytea), 'hex'), array['43']);
    raise exception 'ÉCHEC — un lien usé a proposé';
  exception when invalid_authorization_specification then
    raise notice '  ok — refusé : la fiche est déjà envoyée';
  end;
end
$$;

-- --- Ménage ----------------------------------------------------------------
delete from public.parrainage where candidat_id = :'cand';
delete from public.candidat where id = :'cand';
delete from public.referent where bubble_id like 'ref-0092-%';
delete from public.loge where bubble_id like 'loge-0092-%';

\o
\echo '0092 — les secteurs du candidat, à l''écran : tout est vert.'
