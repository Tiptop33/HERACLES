-- Tests de la migration 0010_administration_invitations.sql.
--
-- L'écran d'administration ouvre deux lectures. Ce fichier vérifie qu'elles
-- s'arrêtent aux administrateurs, et que la vue ne laisse pas filer l'empreinte
-- des jetons — qui suffirait à fabriquer un lien d'entrée.

\set ON_ERROR_STOP on
\o /dev/null

\set patron   'bbbbbbbb-0000-0000-0000-00000000000a'
\set referent 'bbbbbbbb-0000-0000-0000-00000000000b'

\echo '— est_admin dit vrai à qui de droit'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000a"}';
  select public.verifier((select public.est_admin()), 'le patron est administrateur');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}';
  select public.verifier(not (select public.est_admin()), 'un simple référent ne l''est pas');
commit;

\echo '— un administrateur voit les invitations'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000a"}';
  select public.verifier((select count(*) from public.invitation) > 0,
    'il lit les invitations émises');
  select public.verifier((select count(*) from public.invitation_visible) > 0,
    'et la vue qui les met en forme');
  select public.verifier(
    (select count(*) from public.loge) >= 2,
    'il lit toutes les loges, pour choisir où inviter');
commit;

\echo '— un référent, non'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}';
  select public.verifier((select count(*) from public.invitation) = 0,
    'aucune invitation ne lui est visible');
  select public.verifier((select count(*) from public.invitation_visible) = 0,
    'la vue ne le contourne pas — elle obéit à la policy de qui la lit');
commit;

\echo '— la vue ne montre jamais l empreinte du jeton'
select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'invitation_visible'
      and column_name = 'jeton_empreinte') = 0,
  'jeton_empreinte n''est pas dans la vue : ce qui n''est pas montré ne peut pas fuir');

\echo '— un administrateur ne peut pas écrire directement dans la table'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-0000-0000-0000-00000000000a"}', true);
  begin
    insert into public.invitation (email, jeton_empreinte) values ('pirate@example.org', 'x');
    raise exception 'ÉCHEC — une invitation a été fabriquée sans passer par la fonction';
  exception when insufficient_privilege then
    raise notice '  ok — émettre passe par emettre_invitation, qui vérifie le droit';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-0000-0000-0000-00000000000a"}', true);
  begin
    update public.invitation set etat = 'acceptee';
    raise exception 'ÉCHEC — un état d''invitation a été forcé';
  exception when insufficient_privilege then
    raise notice '  ok — on ne force pas l''état d''une invitation à la main';
  end;
end
$$;

\echo '— et une personne non connectée ne voit rien du tout'
select public.verifier(
  public.refuse('anon', 'invitation') and public.refuse('anon', 'invitation_visible'),
  'ni la table ni la vue ne sont adressables sans être connecté');

\echo ''
\echo 'Tous les contrôles de 0010_administration_invitations.sql sont passés.'
