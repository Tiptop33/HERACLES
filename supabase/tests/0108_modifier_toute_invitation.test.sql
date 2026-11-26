-- Tests de la migration 0108_modifier_toute_invitation.sql.
--
-- Ce qu'on éprouve :
--   * une invitation acceptée : le rôle du compte et la loge de sa fiche
--     changent ; une fiche naît si le compte devient référent ; on ne change
--     pas son propre rôle ; on ne retire pas le rôle de référent à qui
--     accompagne des candidats ;
--   * une invitation périmée se modifie aussi ;
--   * changer l'adresse d'une invitation pas encore acceptée pose un nouveau
--     jeton, rend le compte vide de l'ancienne adresse et lui seul, et refuse
--     une adresse qui a déjà un compte ;
--   * une invitation acceptée prend la nouvelle adresse de connexion, fiche
--     référent comprise ;
--   * rien de tout cela n'est appelable depuis le navigateur.

\set ON_ERROR_STOP on
\o /dev/null

\set chef      'cccccccc-0108-0000-0000-00000000000a'
\set simple    'cccccccc-0108-0000-0000-00000000000b'
\set accepte   'cccccccc-0108-0000-0000-00000000000c'
\set candidat  'cccccccc-0108-0000-0000-00000000000d'
\set vide      'cccccccc-0108-0000-0000-00000000000e'
\set occupe    'cccccccc-0108-0000-0000-00000000000f'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef',     'chef-0108@example.org',     '{"role":"referent"}'),
  (:'simple',   'simple-0108@example.org',   '{"role":"referent"}'),
  (:'occupe',   'occupe-0108@example.org',   '{"role":"referent"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = :'chef';

insert into public.loge (bubble_id, nom) values
  ('loge-0108-a', 'Loge A 0108'),
  ('loge-0108-b', 'Loge B 0108')
on conflict do nothing;

-- Deux invitations acceptées : l'une donne un compte de base sans fiche,
-- l'autre un référent qui accompagne un candidat.
select public.emettre_invitation(:'chef', 'accepte-0108@example.org', 'chercheur',
  null, 'empreinte-0108-accepte');
-- Le compte naît après l'invitation, comme à l'arrivée par le lien.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'accepte',  'accepte-0108@example.org',  '{}'),
  (:'candidat', 'candidat-0108@example.org', '{}')
on conflict do nothing;
update public.invitation set etat = 'acceptee', repondu_le = now(), profil_id = :'accepte'
 where jeton_empreinte = 'empreinte-0108-accepte';

select public.emettre_invitation(:'chef', 'suivi-0108@example.org', 'referent',
  (select id from public.loge where bubble_id = 'loge-0108-a'), 'empreinte-0108-suivi');
update public.invitation set etat = 'acceptee', repondu_le = now(), profil_id = :'simple'
 where jeton_empreinte = 'empreinte-0108-suivi';
insert into public.referent (nom, prenom, email, loge_id, profil_id)
values ('Suivi', 'Référent', 'simple-0108@example.org',
        (select id from public.loge where bubble_id = 'loge-0108-a'), :'simple');
insert into public.candidat (nom, prenom, profil_id, referent_id)
values ('Candidat', '0108', :'candidat',
        (select id from public.referent where profil_id = :'simple'));

-- Une invitation périmée, et une en attente dont l'envoi a laissé un compte vide.
select public.emettre_invitation(:'chef', 'perimee-0108@example.org', 'referent',
  null, 'empreinte-0108-perimee');
update public.invitation set expire_le = now() - interval '1 day'
 where jeton_empreinte = 'empreinte-0108-perimee';

select public.emettre_invitation(:'chef', 'faute-0108@example.org', 'referent',
  null, 'empreinte-0108-faute');
insert into auth.users (id, email, raw_user_meta_data) values
  (:'vide', 'faute-0108@example.org', '{}')
on conflict do nothing;

\echo '— une invitation acceptée : le compte devient référent, et sa fiche naît'
select public.modifier_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-accepte'),
  'referent', (select id from public.loge where bubble_id = 'loge-0108-b'));
select public.verifier(
  (select role::text from public.profil where id = :'accepte') = 'referent',
  'le rôle du compte a changé');
select public.verifier(
  (select loge_id from public.referent where profil_id = :'accepte')
    = (select id from public.loge where bubble_id = 'loge-0108-b'),
  'sa fiche référent est née, dans la loge choisie');
select public.verifier(
  (select role::text from public.invitation where jeton_empreinte = 'empreinte-0108-accepte') = 'referent',
  'l''invitation dit la même chose que le compte');

\echo '— une invitation acceptée : la loge de la fiche suit'
select public.modifier_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-accepte'),
  'referent', (select id from public.loge where bubble_id = 'loge-0108-a'));
select public.verifier(
  (select loge_id from public.referent where profil_id = :'accepte')
    = (select id from public.loge where bubble_id = 'loge-0108-a'),
  'la fiche a changé de loge');
select public.verifier(
  (select count(*) from public.referent where profil_id = :'accepte') = 1,
  'aucune seconde fiche');

\echo '— on ne retire pas le rôle de référent à qui accompagne des candidats'
do $$
begin
  begin
    perform public.modifier_invitation('cccccccc-0108-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-suivi'),
      'chercheur', null);
    raise exception 'ÉCHEC — un référent qui accompagne un candidat a perdu son rôle';
  exception when restrict_violation then
    raise notice '  ok — refusé tant qu''il accompagne des candidats';
  end;
end
$$;
select public.verifier(
  (select role::text from public.profil where id = 'cccccccc-0108-0000-0000-00000000000b') = 'referent',
  'son rôle est intact');

\echo '— on ne change pas son propre rôle'
select public.emettre_invitation(:'chef', 'moi-0108@example.org', 'admin', null, 'empreinte-0108-moi');
update public.invitation set etat = 'acceptee', repondu_le = now(), profil_id = :'chef'
 where jeton_empreinte = 'empreinte-0108-moi';
do $$
begin
  begin
    perform public.modifier_invitation('cccccccc-0108-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-moi'),
      'referent', null);
    raise exception 'ÉCHEC — un administrateur a changé son propre rôle';
  exception when check_violation then
    raise notice '  ok — son propre rôle ne change pas';
  end;
end
$$;

\echo '— une invitation périmée se modifie aussi'
select public.modifier_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-perimee'),
  'admin', (select id from public.loge where bubble_id = 'loge-0108-b'));
select public.verifier(
  (select role::text from public.invitation where jeton_empreinte = 'empreinte-0108-perimee') = 'admin',
  'le rôle de l''invitation périmée a changé');

\echo '— une nouvelle adresse pour une invitation en attente'
\o
select public.readresser_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-faute'),
  '  Bonne-0108@Example.org ', 'empreinte-0108-bonne') as ancien_compte \gset
\o /dev/null
select public.verifier(:'ancien_compte' = :'vide',
  'le compte vide de l''ancienne adresse est rendu, pour être retiré');
select public.verifier(
  (select email from public.invitation where jeton_empreinte = 'empreinte-0108-bonne') = 'bonne-0108@example.org',
  'l''adresse est changée, en minuscules');
select public.verifier(
  not exists (select 1 from public.invitation where jeton_empreinte = 'empreinte-0108-faute'),
  'l''ancien jeton ne vaut plus');
select public.verifier(
  (select etat = 'envoyee' and expire_le > now() + interval '6 days'
     from public.invitation where jeton_empreinte = 'empreinte-0108-bonne'),
  'en attente, pour sept jours');

\echo '— une invitation périmée repart à une nouvelle adresse, et vit à nouveau'
\o
select public.readresser_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-perimee'),
  'renouvelee-0108@example.org', 'empreinte-0108-renouvelee') is null as rien_a_retirer \gset
\o /dev/null
select public.verifier(:'rien_a_retirer', 'aucun compte à retirer quand l''ancien envoi n''en a pas laissé');
select public.verifier(
  (select etat = 'envoyee' and expire_le > now()
     from public.invitation where jeton_empreinte = 'empreinte-0108-renouvelee'),
  'l''invitation est de nouveau en attente');

\echo '— le compte d un candidat n est jamais rendu pour être retiré'
select public.emettre_invitation(:'chef', 'autre-0108@example.org', 'referent',
  null, 'empreinte-0108-autre');
update public.invitation set email = 'candidat-0108@example.org'
 where jeton_empreinte = 'empreinte-0108-autre';
\o
select public.readresser_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-autre'),
  'ailleurs-0108@example.org', 'empreinte-0108-ailleurs') is null as candidat_protege \gset
\o /dev/null
select public.verifier(:'candidat_protege', 'un compte relié à une fiche candidat reste');

\echo '— une adresse qui a déjà un compte est refusée'
do $$
begin
  begin
    perform public.readresser_invitation('cccccccc-0108-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-bonne'),
      'occupe-0108@example.org', 'empreinte-0108-occupe');
    raise exception 'ÉCHEC — une invitation est partie vers une adresse qui a un compte';
  exception when unique_violation then
    raise notice '  ok — adresse déjà prise';
  end;
end
$$;

\echo '— une invitation acceptée ne se réadresse pas : c est le compte qui change'
do $$
begin
  begin
    perform public.readresser_invitation('cccccccc-0108-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-accepte'),
      'neuve-0108@example.org', 'empreinte-0108-neuve');
    raise exception 'ÉCHEC — une invitation acceptée a reçu un nouveau jeton';
  exception when invalid_parameter_value then
    raise notice '  ok — refusé';
  end;
end
$$;

\echo '— une invitation acceptée prend la nouvelle adresse de connexion'
-- Ce que fait la route chez l'authentification, avant d'appeler la fonction.
update auth.users set email = 'nouvelle-0108@example.org' where id = :'accepte';
select public.noter_adresse_du_compte(:'chef',
  (select id from public.invitation where jeton_empreinte = 'empreinte-0108-accepte'),
  'Nouvelle-0108@example.org');
select public.verifier(
  (select email from public.invitation where jeton_empreinte = 'empreinte-0108-accepte') = 'nouvelle-0108@example.org',
  'l''invitation porte la nouvelle adresse');
select public.verifier(
  (select email from public.referent where profil_id = :'accepte') = 'nouvelle-0108@example.org',
  'la fiche référent aussi');

do $$
begin
  begin
    perform public.noter_adresse_du_compte('cccccccc-0108-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-accepte'),
      'inventee-0108@example.org');
    raise exception 'ÉCHEC — une adresse que le compte n''a pas a été notée';
  exception when invalid_parameter_value then
    raise notice '  ok — seule l''adresse réelle du compte se note';
  end;
end
$$;

\echo '— un simple référent ne touche à rien'
do $$
begin
  begin
    perform public.readresser_invitation('cccccccc-0108-0000-0000-00000000000b'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-bonne'),
      'pirate-0108@example.org', 'empreinte-0108-pirate');
    raise exception 'ÉCHEC — un référent a réadressé une invitation';
  exception when insufficient_privilege then
    raise notice '  ok — réadresser est réservé aux administrateurs';
  end;
  begin
    perform public.noter_adresse_du_compte('cccccccc-0108-0000-0000-00000000000b'::uuid,
      (select id from public.invitation where jeton_empreinte = 'empreinte-0108-accepte'),
      'nouvelle-0108@example.org');
    raise exception 'ÉCHEC — un référent a noté une adresse';
  exception when insufficient_privilege then
    raise notice '  ok — noter une adresse est réservé aux administrateurs';
  end;
end
$$;

\echo '— rien n est appelable depuis le navigateur'
select public.verifier(
  not has_function_privilege('authenticated', 'public.readresser_invitation(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.readresser_invitation(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.noter_adresse_du_compte(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.noter_adresse_du_compte(uuid, uuid, text)', 'execute')
  and not has_function_privilege('authenticated',
    'public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)', 'execute'),
  'réservées à la clé service_role, après contrôle de la session');

\echo ''
\echo 'Tous les contrôles de 0108_modifier_toute_invitation.sql sont passés.'
