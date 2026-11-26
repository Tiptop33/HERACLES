-- Tests de la migration 0106_modifier_une_invitation.sql.
--
-- Deux promesses : seul un administrateur modifie, et la modification ne passe
-- que par la fonction. (La troisième, « seule une invitation en attente se
-- modifie », a été levée par 0108.)

\set ON_ERROR_STOP on
\o /dev/null

\set chef     'cccccccc-0106-0000-0000-00000000000a'
\set simple   'cccccccc-0106-0000-0000-00000000000b'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef',   'chef-0106@example.org',   '{"role":"referent"}'),
  (:'simple', 'simple-0106@example.org', '{"role":"referent"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = :'chef';

insert into public.loge (bubble_id, nom) values
  ('loge-0106-a', 'Loge A 0106'),
  ('loge-0106-b', 'Loge B 0106')
on conflict do nothing;

select public.emettre_invitation(:'chef', 'attente-0106@example.org', 'referent',
  (select id from public.loge where bubble_id = 'loge-0106-a'), 'empreinte-0106-attente');
select public.emettre_invitation(:'chef', 'acceptee-0106@example.org', 'referent',
  null, 'empreinte-0106-acceptee');
update public.invitation set etat = 'acceptee', repondu_le = now()
 where jeton_empreinte = 'empreinte-0106-acceptee';
select public.emettre_invitation(:'chef', 'perimee-0106@example.org', 'referent',
  null, 'empreinte-0106-perimee');
update public.invitation set expire_le = now() - interval '1 day'
 where jeton_empreinte = 'empreinte-0106-perimee';

\echo '— un administrateur change le rôle et la loge d une invitation en attente'
select public.modifier_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0106-attente'),
  'admin',
  (select id from public.loge where bubble_id = 'loge-0106-b'));

select public.verifier(
  (select role::text from public.invitation where jeton_empreinte = 'empreinte-0106-attente') = 'admin',
  'le rôle est changé');
select public.verifier(
  (select loge_id from public.invitation where jeton_empreinte = 'empreinte-0106-attente')
    = (select id from public.loge where bubble_id = 'loge-0106-b'),
  'la loge est changée');
select public.verifier(
  (select etat from public.invitation where jeton_empreinte = 'empreinte-0106-attente') = 'envoyee',
  'l''invitation reste en attente : son lien vaut toujours');

\echo '— retirer la loge est permis'
select public.modifier_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0106-attente'),
  'referent', null);
select public.verifier(
  (select loge_id from public.invitation where jeton_empreinte = 'empreinte-0106-attente') is null,
  'aucune loge pour l''instant');

\echo '— un simple référent ne modifie pas'
do $$
begin
  begin
    perform public.modifier_invitation('cccccccc-0106-0000-0000-00000000000b'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0106-attente'),
      'admin', null);
    raise exception 'ÉCHEC — un référent a modifié une invitation';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur modifie';
  end;
end
$$;

-- Une invitation acceptée ou périmée se modifie désormais, compte compris :
-- 0108 a levé cette limite, et son test l'éprouve.

\echo '— une loge inconnue est refusée'
do $$
begin
  begin
    perform public.modifier_invitation('cccccccc-0106-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0106-attente'),
      'referent', gen_random_uuid());
    raise exception 'ÉCHEC — une loge inexistante a été acceptée';
  exception when foreign_key_violation then
    raise notice '  ok — la loge doit exister';
  end;
end
$$;

\echo '— la fonction n est pas appelable depuis le navigateur'
select public.verifier(
  not has_function_privilege('authenticated',
    'public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)', 'execute'),
  'réservée à la clé service_role, après contrôle de la session');

\echo '— la vue montre la loge choisie, toujours sans empreinte'
select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'invitation_visible'
      and column_name = 'loge_id') = 1,
  'loge_id est dans la vue');
select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'invitation_visible'
      and column_name = 'jeton_empreinte') = 0,
  'jeton_empreinte n''y est toujours pas');

\echo ''
\echo 'Tous les contrôles de 0106_modifier_une_invitation.sql sont passés.'
