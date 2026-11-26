-- Tests de la migration 0109_modifier_un_compte.sql.
--
-- Ce qu'on éprouve :
--   * `lister_comptes` : rien pour qui n'est pas administrateur ; ni les
--     comptes des candidats, ni ceux jamais ouverts ; la loge de la fiche ;
--   * `modifier_compte` : le rôle et la loge changent, une fiche naît, les
--     invitations acceptées suivent ; et ses refus — son propre rôle, le
--     référent qui accompagne, le compte d'un candidat, la loge sans fiche ;
--   * `modifier_invitation` garde son comportement de 0108 ;
--   * rien n'est appelable depuis le navigateur, sauf la liste.

\set ON_ERROR_STOP on
\o /dev/null

\set chef      'cccccccc-0109-0000-0000-00000000000a'
\set ref       'cccccccc-0109-0000-0000-00000000000b'
\set base      'cccccccc-0109-0000-0000-00000000000c'
\set candidat  'cccccccc-0109-0000-0000-00000000000d'
\set ferme     'cccccccc-0109-0000-0000-00000000000e'
\set invite    'cccccccc-0109-0000-0000-00000000000f'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef',     'chef-0109@example.org',     '{"role":"referent"}'),
  (:'ref',      'ref-0109@example.org',      '{"role":"referent"}'),
  (:'base',     'base-0109@example.org',     '{}'),
  (:'candidat', 'candidat-0109@example.org', '{}')
on conflict do nothing;
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  (:'ferme',    'ferme-0109@example.org',    '{}', null)
on conflict do nothing;
update public.profil set role = 'admin' where id = :'chef';

insert into public.loge (bubble_id, nom) values
  ('loge-0109-a', 'Loge A 0109'),
  ('loge-0109-b', 'Loge B 0109')
on conflict do nothing;

-- Le référent a sa fiche, dans la loge A, et accompagne un candidat.
insert into public.referent (nom, prenom, email, loge_id, profil_id)
select 'Ref', 'Zéro-cent-neuf', 'ref-0109@example.org', l.id, :'ref'
  from public.loge l where l.bubble_id = 'loge-0109-a'
on conflict do nothing;
insert into public.candidat (nom, prenom, profil_id, referent_id)
values ('Candidat', '0109', :'candidat',
        (select id from public.referent where profil_id = :'ref' limit 1));

\echo '— la liste n est rien pour un référent'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0109-0000-0000-00000000000b"}';
  select public.verifier((select count(*) from public.lister_comptes()) = 0,
    'un référent ne voit aucun compte');
commit;

\echo '— la liste d un administrateur'
create temporary table vus as select * from public.lister_comptes() where false;
grant insert on vus to authenticated;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0109-0000-0000-00000000000a"}';
  insert into vus select * from public.lister_comptes();
commit;
select public.verifier(exists (select 1 from vus where id = :'ref'), 'le référent est listé');
select public.verifier(
  (select loge_nom from vus where id = :'ref') = 'Loge A 0109',
  'avec la loge de sa fiche');
select public.verifier(exists (select 1 from vus where id = :'base' and not a_une_fiche),
  'un compte de base, sans fiche, est listé');
select public.verifier(not exists (select 1 from vus where id = :'candidat'),
  'le compte d''un candidat n''est pas listé');
select public.verifier(not exists (select 1 from vus where id = :'ferme'),
  'un compte jamais ouvert n''est pas listé');
select public.verifier((select c_est_moi from vus where id = :'chef'),
  'l''administrateur se reconnaît');

\echo '— changer la loge d un référent'
select public.modifier_compte(:'chef', :'ref', 'referent',
  (select id from public.loge where bubble_id = 'loge-0109-b'));
select public.verifier(
  (select loge_id from public.referent where profil_id = :'ref')
    = (select id from public.loge where bubble_id = 'loge-0109-b'),
  'la fiche a changé de loge');

\echo '— un compte de base devient référent : sa fiche naît'
select public.modifier_compte(:'chef', :'base', 'referent',
  (select id from public.loge where bubble_id = 'loge-0109-a'));
select public.verifier(
  (select role::text from public.profil where id = :'base') = 'referent',
  'le rôle a changé');
select public.verifier(
  (select email from public.referent where profil_id = :'base') = 'base-0109@example.org',
  'sa fiche porte son adresse');
select public.verifier(
  (select loge_id from public.referent where profil_id = :'base')
    = (select id from public.loge where bubble_id = 'loge-0109-a'),
  'et la loge choisie');

\echo '— les invitations acceptées du compte suivent'
select public.emettre_invitation(:'chef', 'invite-0109@example.org', 'referent',
  null, 'empreinte-0109-invite');
insert into auth.users (id, email, raw_user_meta_data) values
  (:'invite', 'invite-0109@example.org', '{}')
on conflict do nothing;
update public.invitation set etat = 'acceptee', repondu_le = now(), profil_id = :'invite'
 where jeton_empreinte = 'empreinte-0109-invite';
select public.modifier_compte(:'chef', :'invite', 'admin',
  (select id from public.loge where bubble_id = 'loge-0109-b'));
select public.verifier(
  (select role::text = 'admin' and loge_id = (select id from public.loge where bubble_id = 'loge-0109-b')
     from public.invitation where jeton_empreinte = 'empreinte-0109-invite'),
  'l''invitation dit la même chose que le compte');

\echo '— modifier_invitation passe toujours par la même règle'
select public.modifier_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0109-invite'),
  'referent', (select id from public.loge where bubble_id = 'loge-0109-a'));
select public.verifier(
  (select role::text from public.profil where id = :'invite') = 'referent',
  'le compte a suivi l''invitation');
select public.verifier(
  (select loge_id from public.referent where profil_id = :'invite')
    = (select id from public.loge where bubble_id = 'loge-0109-a'),
  'sa fiche aussi');

\echo '— les refus'
do $$
begin
  begin
    perform public.modifier_compte('cccccccc-0109-0000-0000-00000000000a'::uuid,
      'cccccccc-0109-0000-0000-00000000000b'::uuid, 'chercheur', null);
    raise exception 'ÉCHEC — un référent qui accompagne a perdu son rôle';
  exception when restrict_violation then
    raise notice '  ok — pas tant qu''il accompagne des candidats';
  end;

  begin
    perform public.modifier_compte('cccccccc-0109-0000-0000-00000000000a'::uuid,
      'cccccccc-0109-0000-0000-00000000000a'::uuid, 'referent', null);
    raise exception 'ÉCHEC — un administrateur a changé son propre rôle';
  exception when check_violation then
    raise notice '  ok — son propre rôle ne change pas';
  end;

  begin
    perform public.modifier_compte('cccccccc-0109-0000-0000-00000000000a'::uuid,
      'cccccccc-0109-0000-0000-00000000000d'::uuid, 'referent', null);
    raise exception 'ÉCHEC — le compte d''un candidat est devenu référent';
  exception when invalid_parameter_value then
    raise notice '  ok — le compte d''un candidat ne se modifie pas ici';
  end;

  begin
    perform public.modifier_compte('cccccccc-0109-0000-0000-00000000000b'::uuid,
      'cccccccc-0109-0000-0000-00000000000c'::uuid, 'admin', null);
    raise exception 'ÉCHEC — un référent a modifié un compte';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur modifie';
  end;
end
$$;

-- Un compte de base sans fiche ne garde pas de loge.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0109-0000-0000-000000000010', 'nu-0109@example.org', '{}')
on conflict do nothing;
do $$
begin
  begin
    perform public.modifier_compte('cccccccc-0109-0000-0000-00000000000a'::uuid,
      'cccccccc-0109-0000-0000-000000000010'::uuid, 'chercheur',
      (select id from public.loge where bubble_id = 'loge-0109-a'));
    raise exception 'ÉCHEC — une loge a été acceptée sans fiche où la poser';
  exception when invalid_parameter_value then
    raise notice '  ok — pas de loge sans fiche';
  end;
end
$$;

\echo '— seule la liste est appelable depuis le navigateur'
select public.verifier(
  not has_function_privilege('authenticated',
    'public.modifier_compte(uuid, uuid, public.role_utilisateur, uuid)', 'execute')
  and not has_function_privilege('anon',
    'public.modifier_compte(uuid, uuid, public.role_utilisateur, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.lister_comptes()', 'execute'),
  'modifier_compte est réservée à la clé service_role ; la liste refuse anon');

\echo ''
\echo 'Tous les contrôles de 0109_modifier_un_compte.sql sont passés.'
