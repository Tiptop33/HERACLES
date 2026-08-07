-- Tests de la migration 0009_invitations.sql.
--
-- Deux promesses à tenir : « seul un administrateur peut inviter », et « un
-- lien ne vaut que pour l'adresse à laquelle il a été envoyé ».

\set ON_ERROR_STOP on
\o /dev/null

\set patron   'bbbbbbbb-0000-0000-0000-00000000000a'
\set referent 'bbbbbbbb-0000-0000-0000-00000000000b'
\set invitee  'bbbbbbbb-0000-0000-0000-00000000000c'
\set autre    'bbbbbbbb-0000-0000-0000-00000000000d'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'patron',   'patron@example.org',   '{"role":"referent","nom":"Lo Cascio","prenom":"M"}'),
  (:'referent', 'simple@example.org',   '{"role":"referent"}');
update public.profil set role = 'admin' where id = :'patron';

insert into public.loge (bubble_id, nom) values ('loge-guyenne', 'Guyenne et Gascogne')
on conflict do nothing;

\echo '— la table ne s ecrit jamais directement'
-- Cette migration-ci n'ouvre rien. Depuis, l'écran d'administration
-- (migration 0010) a ouvert la **lecture** aux seuls administrateurs, et son
-- test le prouve. Ce qui se vérifie ici, c'est que l'écriture, elle, est restée
-- fermée à tout le monde : émettre et révoquer passent par des fonctions qui
-- vérifient le droit. Une policy d'écriture permettrait de fabriquer une
-- invitation sans ce contrôle.
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'invitation'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0,
  'aucune policy d''écriture sur les invitations');

select public.verifier(
  public.refuse('anon', 'invitation'),
  'sans être connecté, la table n''est même pas adressable');

\echo '— seul un administrateur invite'
do $$
begin
  begin
    perform public.emettre_invitation(
      'bbbbbbbb-0000-0000-0000-00000000000b'::uuid, 'quelquun@example.org',
      'referent', null, 'empreinte-refusee');
    raise exception 'ÉCHEC — un référent a pu émettre une invitation';
  exception when insufficient_privilege then
    raise notice '  ok — un simple référent ne peut pas inviter';
  end;
end
$$;

select public.verifier(
  public.emettre_invitation(:'patron', 'Invitee@Example.ORG', 'referent',
    (select id from public.loge where bubble_id = 'loge-guyenne'),
    'empreinte-1') is not null,
  'un administrateur, lui, émet bien une invitation');

select public.verifier(
  (select email from public.invitation where jeton_empreinte = 'empreinte-1') = 'invitee@example.org',
  'l''adresse est rangée en minuscules — « Invitee@Example.ORG » et « invitee@example.org » sont la même personne');

\echo '— ce que l écran a le droit de lire'
select public.verifier(
  (select loge_nom from public.invitation_par_empreinte('empreinte-1')) = 'Guyenne et Gascogne'
    and (select invite_par_nom from public.invitation_par_empreinte('empreinte-1')) = 'M Lo Cascio'
    and (select valable from public.invitation_par_empreinte('empreinte-1')),
  'la loge, celui qui invite, et la validité — de quoi remplir l''écran');

select public.verifier(
  (select count(*) from public.invitation_par_empreinte('jeton-inventé')) = 0,
  'un jeton inventé ne renvoie rien');

\echo '— on n invite pas quelqu un qui est déjà entré'
do $$
begin
  begin
    perform public.emettre_invitation(
      'bbbbbbbb-0000-0000-0000-00000000000a'::uuid, 'simple@example.org',
      'referent', null, 'empreinte-doublon');
    raise exception 'ÉCHEC — invitation émise vers un compte existant';
  exception when unique_violation then
    raise notice '  ok — une adresse déjà inscrite ne se réinvite pas';
  end;
end
$$;

\echo '— une seconde invitation révoque la première'
select public.emettre_invitation(:'patron', 'invitee@example.org', 'referent',
  (select id from public.loge where bubble_id = 'loge-guyenne'), 'empreinte-2');
select public.verifier(
  (select etat from public.invitation where jeton_empreinte = 'empreinte-1') = 'refusee',
  'l''ancien lien cesse de valoir');
select public.verifier(
  not (select valable from public.invitation_par_empreinte('empreinte-1')),
  'et il se déclare caduc');

\echo '— un lien ne vaut que pour son adresse'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'autre', 'autre@example.org', '{}');
do $$
begin
  begin
    perform public.accepter_invitation('empreinte-2',
      'bbbbbbbb-0000-0000-0000-00000000000d'::uuid, 'Jean', 'Pirate');
    raise exception 'ÉCHEC — un lien intercepté a servi à un autre compte';
  exception when insufficient_privilege then
    raise notice '  ok — le lien refuse un compte dont l''adresse ne correspond pas';
  end;
end
$$;

\echo '— accepter : le rôle, la loge et la fiche suivent'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'invitee', 'invitee@example.org', '{}');
select public.verifier(
  (select role from public.profil where id = :'invitee') = 'chercheur',
  'avant acceptation, le compte n''est qu''un compte ordinaire');

select public.accepter_invitation('empreinte-2', :'invitee', 'Claire', 'Vasseur');

select public.verifier(
  (select role from public.profil where id = :'invitee') = 'referent',
  'le rôle porté par l''invitation est posé');
select public.verifier(
  (select prenom || ' ' || nom from public.profil where id = :'invitee') = 'Claire Vasseur',
  'le nom saisi à la création du compte est repris');
select public.verifier(
  (select l.nom from public.referent r join public.loge l on l.id = r.loge_id
     where r.profil_id = :'invitee') = 'Guyenne et Gascogne',
  'et la fiche de référent est créée, rattachée à la bonne loge');

\echo '— une invitation ne sert qu une fois'
do $$
begin
  begin
    perform public.accepter_invitation('empreinte-2',
      'bbbbbbbb-0000-0000-0000-00000000000c'::uuid, 'Claire', 'Vasseur');
    raise exception 'ÉCHEC — invitation acceptée deux fois';
  exception when invalid_parameter_value then
    raise notice '  ok — la seconde acceptation est refusée';
  end;
end
$$;

\echo '— refuser'
select public.emettre_invitation(:'patron', 'refusante@example.org', 'referent', null, 'empreinte-3');
select public.refuser_invitation('empreinte-3');
select public.verifier(
  not (select valable from public.invitation_par_empreinte('empreinte-3'))
    and (select motif from public.invitation_par_empreinte('empreinte-3')) = 'revoquee',
  'une invitation refusée cesse de valoir');

\echo ''
\echo 'Tous les contrôles de 0009_invitations.sql sont passés.'
