-- Tests de la migration 0113_effacer_un_compte.sql.
--
-- Ce qu'on éprouve :
--   * seul un administrateur prépare l'effacement d'un compte ;
--   * les refus — son propre compte, le compte d'un candidat, le référent qui
--     accompagne encore des candidats, un compte inconnu — ne retirent rien ;
--   * un compte effaçable perd ses invitations acceptées, pas celles des autres ;
--   * le retrait du compte, fait ensuite par l'API d'authentification, emporte
--     le profil et laisse la fiche référent, détachée ;
--   * la fonction n'est pas appelable depuis le navigateur.

\set ON_ERROR_STOP on
\o /dev/null

\set chef      'cccccccc-0113-0000-0000-00000000000a'
\set ref       'cccccccc-0113-0000-0000-00000000000b'
\set parti     'cccccccc-0113-0000-0000-00000000000c'
\set candidat  'cccccccc-0113-0000-0000-00000000000d'
\set autre     'cccccccc-0113-0000-0000-00000000000e'

-- Les invitations d'abord : on n'invite pas une adresse qui a déjà un compte.
-- Trois acceptées : deux pour le compte à effacer — l'une reliée par le
-- compte, l'autre par la seule adresse —, une pour quelqu'un d'autre.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef',     'chef-0113@example.org',     '{"role":"referent"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = :'chef';

select public.emettre_invitation(:'chef', 'Parti-0113@example.org', 'referent',
  null, 'empreinte-0113-parti-ancienne');
update public.invitation set etat = 'acceptee', repondu_le = now()
 where jeton_empreinte = 'empreinte-0113-parti-ancienne';
select public.emettre_invitation(:'chef', 'parti-0113@example.org', 'referent',
  null, 'empreinte-0113-parti');
select public.emettre_invitation(:'chef', 'autre-0113@example.org', 'referent',
  null, 'empreinte-0113-autre');

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ref',      'ref-0113@example.org',      '{"role":"referent"}'),
  (:'parti',    'parti-0113@example.org',    '{"role":"referent"}'),
  (:'candidat', 'candidat-0113@example.org', '{}'),
  (:'autre',    'autre-0113@example.org',    '{"role":"referent"}')
on conflict do nothing;

update public.invitation set etat = 'acceptee', repondu_le = now(), profil_id = :'parti'
 where jeton_empreinte = 'empreinte-0113-parti';
update public.invitation set etat = 'acceptee', repondu_le = now(), profil_id = :'autre'
 where jeton_empreinte = 'empreinte-0113-autre';

-- Deux fiches référent : l'une accompagne un candidat, l'autre personne.
insert into public.referent (nom, prenom, email, profil_id) values
  ('Ref',   'Zéro-cent-treize', 'ref-0113@example.org',   :'ref'),
  ('Parti', 'Zéro-cent-treize', 'parti-0113@example.org', :'parti')
on conflict do nothing;
insert into public.candidat (nom, prenom, profil_id, referent_id)
values ('Candidat', '0113', :'candidat',
        (select id from public.referent where profil_id = :'ref' limit 1));

\echo '— les refus'
do $$
begin
  begin
    perform public.preparer_effacement_compte('cccccccc-0113-0000-0000-00000000000b'::uuid,
      'cccccccc-0113-0000-0000-00000000000c'::uuid);
    raise exception 'ÉCHEC — un référent a effacé un compte';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur efface';
  end;

  begin
    perform public.preparer_effacement_compte('cccccccc-0113-0000-0000-00000000000a'::uuid,
      'cccccccc-0113-0000-0000-00000000000a'::uuid);
    raise exception 'ÉCHEC — un administrateur a effacé son propre compte';
  exception when check_violation then
    raise notice '  ok — pas son propre compte';
  end;

  begin
    perform public.preparer_effacement_compte('cccccccc-0113-0000-0000-00000000000a'::uuid,
      'cccccccc-0113-0000-0000-00000000000d'::uuid);
    raise exception 'ÉCHEC — le compte d''un candidat a été effacé';
  exception when invalid_parameter_value then
    raise notice '  ok — pas le compte d''un candidat';
  end;

  begin
    perform public.preparer_effacement_compte('cccccccc-0113-0000-0000-00000000000a'::uuid,
      'cccccccc-0113-0000-0000-00000000000b'::uuid);
    raise exception 'ÉCHEC — un référent qui accompagne a été effacé';
  exception when restrict_violation then
    raise notice '  ok — pas tant qu''il accompagne des candidats';
  end;

  begin
    perform public.preparer_effacement_compte('cccccccc-0113-0000-0000-00000000000a'::uuid,
      gen_random_uuid());
    raise exception 'ÉCHEC — l''effacement d''un compte inconnu est passé sous silence';
  exception when no_data_found then
    raise notice '  ok — compte inconnu';
  end;
end
$$;
select public.verifier(
  (select count(*) from public.invitation where jeton_empreinte like 'empreinte-0113-%') = 3,
  'aucun refus n''a retiré d''invitation');

\echo '— un compte effaçable : ses invitations acceptées partent'
select public.preparer_effacement_compte(:'chef', :'parti');
select public.verifier(
  not exists (select 1 from public.invitation
               where jeton_empreinte in ('empreinte-0113-parti', 'empreinte-0113-parti-ancienne')),
  'reliées par le compte ou par la seule adresse : les deux sont parties');
select public.verifier(
  exists (select 1 from public.invitation where jeton_empreinte = 'empreinte-0113-autre'),
  'l''invitation d''un autre compte reste');
select public.verifier(
  exists (select 1 from public.profil where id = :'parti'),
  'la fonction ne retire pas le compte elle-même');

\echo '— le retrait du compte emporte le profil et laisse la fiche'
-- Ce que fait ensuite l'API d'authentification.
delete from auth.users where id = :'parti';
select public.verifier(
  not exists (select 1 from public.profil where id = :'parti'),
  'le profil est parti avec le compte');
select public.verifier(
  (select profil_id is null from public.referent where email = 'parti-0113@example.org'),
  'la fiche référent reste, détachée du compte');

\echo '— la fonction n est pas appelable depuis le navigateur'
select public.verifier(
  not has_function_privilege('authenticated', 'public.preparer_effacement_compte(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.preparer_effacement_compte(uuid, uuid)', 'execute'),
  'réservée à la clé service_role, après contrôle de la session');

\echo ''
\echo 'Tous les contrôles de 0113_effacer_un_compte.sql sont passés.'
