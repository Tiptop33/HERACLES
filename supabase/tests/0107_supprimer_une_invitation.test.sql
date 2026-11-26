-- Tests de la migration 0107_supprimer_une_invitation.sql.
--
-- Quatre promesses : seul un administrateur supprime, toute invitation se
-- supprime quel que soit son état, le compte né d'une invitation acceptée
-- reste intact, et la suppression ne passe que par la fonction.

\set ON_ERROR_STOP on
\o /dev/null

\set chef     'cccccccc-0107-0000-0000-00000000000a'
\set simple   'cccccccc-0107-0000-0000-00000000000b'
\set invite   'cccccccc-0107-0000-0000-00000000000c'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef',   'chef-0107@example.org',   '{"role":"referent"}'),
  (:'simple', 'simple-0107@example.org', '{"role":"referent"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = :'chef';

select public.emettre_invitation(:'chef', 'attente-0107@example.org', 'referent',
  null, 'empreinte-0107-attente');
select public.emettre_invitation(:'chef', 'acceptee-0107@example.org', 'referent',
  null, 'empreinte-0107-acceptee');
select public.emettre_invitation(:'chef', 'perimee-0107@example.org', 'referent',
  null, 'empreinte-0107-perimee');
select public.emettre_invitation(:'chef', 'revoquee-0107@example.org', 'referent',
  null, 'empreinte-0107-revoquee');
select public.emettre_invitation(:'chef', 'garde-0107@example.org', 'referent',
  null, 'empreinte-0107-garde');

-- L'invitation acceptée a donné un compte, comme à l'arrivée par le lien.
update public.invitation set etat = 'acceptee', repondu_le = now()
 where jeton_empreinte = 'empreinte-0107-acceptee';
insert into auth.users (id, email, raw_user_meta_data) values
  (:'invite', 'acceptee-0107@example.org', '{"role":"referent"}')
on conflict do nothing;
update public.invitation set expire_le = now() - interval '1 day'
 where jeton_empreinte = 'empreinte-0107-perimee';
update public.invitation set etat = 'refusee'
 where jeton_empreinte = 'empreinte-0107-revoquee';

\echo '— un simple référent ne supprime pas'
do $$
begin
  begin
    perform public.supprimer_invitation('cccccccc-0107-0000-0000-00000000000b'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0107-attente'));
    raise exception 'ÉCHEC — un référent a supprimé une invitation';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur supprime';
  end;
end
$$;
select public.verifier(
  exists (select 1 from public.invitation where jeton_empreinte = 'empreinte-0107-attente'),
  'l''invitation est toujours là');

\echo '— un administrateur supprime une invitation, quel que soit son état'
select public.supprimer_invitation(:'chef', id)
  from public.invitation
 where jeton_empreinte in ('empreinte-0107-attente', 'empreinte-0107-acceptee',
                           'empreinte-0107-perimee', 'empreinte-0107-revoquee');

select public.verifier(
  not exists (select 1 from public.invitation
               where jeton_empreinte in ('empreinte-0107-attente', 'empreinte-0107-acceptee',
                                         'empreinte-0107-perimee', 'empreinte-0107-revoquee')),
  'en attente, acceptée, périmée et révoquée : les quatre sont parties');
select public.verifier(
  exists (select 1 from public.invitation where jeton_empreinte = 'empreinte-0107-garde'),
  'les autres invitations restent');

\echo '— le compte né d une invitation acceptée reste intact'
select public.verifier(
  exists (select 1 from public.profil where id = :'invite'),
  'le profil de la personne invitée existe toujours');

\echo '— une invitation déjà supprimée est signalée'
do $$
begin
  begin
    perform public.supprimer_invitation('cccccccc-0107-0000-0000-00000000000a'::uuid,
      gen_random_uuid());
    raise exception 'ÉCHEC — la suppression d''une invitation inconnue est passée sous silence';
  exception when no_data_found then
    raise notice '  ok — invitation inconnue';
  end;
end
$$;

\echo '— la table n a toujours aucune policy de suppression'
-- Refus net (aucun droit sur la table) ou suppression muette (la RLS ne
-- laisse rien voir) : les deux conviennent, seule compte la ligne restée.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0107-0000-0000-00000000000a"}';
  do $$
  begin
    delete from public.invitation where jeton_empreinte = 'empreinte-0107-garde';
  exception when insufficient_privilege then
    null;
  end
  $$;
commit;
select public.verifier(
  exists (select 1 from public.invitation where jeton_empreinte = 'empreinte-0107-garde'),
  'même un administrateur ne supprime rien directement depuis le navigateur');

\echo '— la fonction n est pas appelable depuis le navigateur'
select public.verifier(
  not has_function_privilege('authenticated', 'public.supprimer_invitation(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.supprimer_invitation(uuid, uuid)', 'execute'),
  'réservée à la clé service_role, après contrôle de la session');

\echo ''
\echo 'Tous les contrôles de 0107_supprimer_une_invitation.sql sont passés.'
