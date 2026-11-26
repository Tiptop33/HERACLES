-- Tests de la migration 0111_renvoyer_le_lien.sql.
--
-- Ce qu'on éprouve : une invitation périmée, révoquée ou en attente reçoit un
-- nouveau jeton valable sept jours, et l'ancien ne vaut plus ; le compte vide
-- de l'envoi précédent n'empêche rien ; une invitation acceptée, ou une
-- adresse au compte déjà ouvert, est refusée ; seul un administrateur renvoie,
-- et jamais depuis le navigateur.

\set ON_ERROR_STOP on
\o /dev/null

\set chef     'cccccccc-0111-0000-0000-00000000000a'
\set simple   'cccccccc-0111-0000-0000-00000000000b'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef',   'chef-0111@example.org',   '{"role":"referent"}'),
  (:'simple', 'simple-0111@example.org', '{"role":"referent"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = :'chef';

select public.emettre_invitation(:'chef', 'perimee-0111@example.org', 'referent', null, 'e-0111-perimee');
select public.emettre_invitation(:'chef', 'revoquee-0111@example.org', 'referent', null, 'e-0111-revoquee');
select public.emettre_invitation(:'chef', 'attente-0111@example.org', 'referent', null, 'e-0111-attente');
select public.emettre_invitation(:'chef', 'acceptee-0111@example.org', 'referent', null, 'e-0111-acceptee');
select public.emettre_invitation(:'chef', 'ouvert-0111@example.org', 'referent', null, 'e-0111-ouvert');

update public.invitation set expire_le = now() - interval '1 day' where jeton_empreinte = 'e-0111-perimee';
update public.invitation set etat = 'refusee', repondu_le = now() where jeton_empreinte = 'e-0111-revoquee';
update public.invitation set etat = 'acceptee', repondu_le = now() where jeton_empreinte = 'e-0111-acceptee';

-- Le compte vide que l'envoi crée avant le clic : jamais ouvert.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('cccccccc-0111-0000-0000-00000000000c', 'perimee-0111@example.org', '{}', null)
on conflict do nothing;
-- Un compte ouvert par une autre voie.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0111-0000-0000-00000000000d', 'ouvert-0111@example.org', '{}')
on conflict do nothing;

\echo '— une invitation périmée repart, malgré le compte vide de l envoi précédent'
select public.renouveler_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'e-0111-perimee'), 'e-0111-perimee-2');
select public.verifier(
  (select etat = 'envoyee' and expire_le > now() + interval '6 days' and email = 'perimee-0111@example.org'
     from public.invitation where jeton_empreinte = 'e-0111-perimee-2'),
  'en attente pour sept jours, à la même adresse');
select public.verifier(
  not exists (select 1 from public.invitation where jeton_empreinte = 'e-0111-perimee'),
  'l''ancien lien ne vaut plus');

\echo '— une invitation révoquée et une en attente repartent aussi'
select public.renouveler_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'e-0111-revoquee'), 'e-0111-revoquee-2');
select public.renouveler_invitation(:'chef',
  (select id from public.invitation where jeton_empreinte = 'e-0111-attente'), 'e-0111-attente-2');
select public.verifier(
  (select count(*) from public.invitation
    where jeton_empreinte in ('e-0111-revoquee-2', 'e-0111-attente-2') and etat = 'envoyee') = 2,
  'les deux sont en attente, avec leur nouveau lien');

\echo '— les refus'
do $$
begin
  begin
    perform public.renouveler_invitation('cccccccc-0111-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'e-0111-acceptee'), 'e-0111-x1');
    raise exception 'ÉCHEC — une invitation acceptée a reçu un nouveau lien';
  exception when invalid_parameter_value then
    raise notice '  ok — une invitation acceptée ne se renvoie pas';
  end;

  begin
    perform public.renouveler_invitation('cccccccc-0111-0000-0000-00000000000a'::uuid,
      (select id from public.invitation where jeton_empreinte = 'e-0111-ouvert'), 'e-0111-x2');
    raise exception 'ÉCHEC — un lien est reparti vers un compte déjà ouvert';
  exception when unique_violation then
    raise notice '  ok — un compte déjà ouvert n''attend plus de lien';
  end;

  begin
    perform public.renouveler_invitation('cccccccc-0111-0000-0000-00000000000b'::uuid,
      (select id from public.invitation where jeton_empreinte = 'e-0111-attente-2'), 'e-0111-x3');
    raise exception 'ÉCHEC — un référent a renvoyé un lien';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur renvoie';
  end;
end
$$;

\echo '— la fonction n est pas appelable depuis le navigateur'
select public.verifier(
  not has_function_privilege('authenticated', 'public.renouveler_invitation(uuid, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.renouveler_invitation(uuid, uuid, text)', 'execute'),
  'réservée à la clé service_role, après contrôle de la session');

\echo ''
\echo 'Tous les contrôles de 0111_renvoyer_le_lien.sql sont passés.'
