-- Tests de la migration 0051_revenir_dans_qui_est_la.sql.
--
--   · Ada  référente à Tours-0051, celle qui regarde la colonne
--   · Bora référent  à Tours-0051, celui qui va et vient
--
-- Ce que 0042 éprouvait déjà, et qui doit continuer de valoir : une seconde
-- connexion ne décale pas l'heure de début. Ce qu'il ne rejouait pas, et qui
-- est tout l'objet de cette migration : la même reconnexion **après** que le
-- garde-fou des douze heures a fait son œuvre.

\set ON_ERROR_STOP on
\o /dev/null

\set ada  'aaaaaaaa-5100-0000-0000-000000000181'
\set bora 'aaaaaaaa-5100-0000-0000-000000000182'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',  'ada0051@example.org',  '{"role":"referent"}'),
  (:'bora', 'bora0051@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0051-tours', 'Tours — 0051')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0051-ada',  :'ada',  'Ada',  'A', 'ada0051@example.org',
   (select id from public.loge where bubble_id = 'loge-0051-tours')),
  ('ref-0051-bora', :'bora', 'Bora', 'B', 'bora0051@example.org',
   (select id from public.loge where bubble_id = 'loge-0051-tours'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— une premiere connexion pose l heure'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000182"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil where id = :'bora') is not null,
  'Bora est marque connecte');

-- ---------------------------------------------------------------------------
\echo '— Ada le voit dans sa colonne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000181"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'Bora est dans la colonne d Ada');
commit;

-- ---------------------------------------------------------------------------
\echo '— la promesse de 0042 tient : un second onglet ne decale rien'
-- ---------------------------------------------------------------------------
select connecte_depuis as debut_bora from public.profil where id = :'bora' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000182"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil where id = :'bora') = :'debut_bora'::timestamptz,
  'l heure de debut n a pas bouge');

-- ---------------------------------------------------------------------------
\echo '— apres douze heures, il sort de la colonne'
-- ---------------------------------------------------------------------------
-- On ne ferme pas la session : on fait vieillir son heure de début. C'est
-- exactement ce qui arrive quand on ferme un onglet sans se déconnecter.
update public.profil set connecte_depuis = now() - interval '13 hours' where id = :'bora';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000181"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'la colonne d Ada est vide');
commit;

-- ---------------------------------------------------------------------------
\echo '— et s il revient, il reparait : c est tout l objet de 0051'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000182"}';
  select public.je_me_connecte();
commit;

-- Avant 0051, `coalesce` gardait la vieille heure : Bora restait invisible
-- pour toujours, à moins de se déconnecter explicitement une fois.
select public.verifier(
  (select connecte_depuis from public.profil where id = :'bora') > now() - interval '1 minute',
  'l heure est repartie de maintenant');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000181"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'Bora est de retour dans la colonne d Ada');
commit;

-- ---------------------------------------------------------------------------
\echo '— la limite est la meme des deux cotes'
-- ---------------------------------------------------------------------------
-- Onze heures : `les_connectes()` le compte encore. `je_me_connecte()` doit
-- donc garder son heure — sinon une session vivante d'un côté serait close de
-- l'autre, et l'on reparaîtrait une fois sur deux.
update public.profil set connecte_depuis = now() - interval '11 hours' where id = :'bora';
select connecte_depuis as onze_h from public.profil where id = :'bora' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000182"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil where id = :'bora') = :'onze_h'::timestamptz,
  'a onze heures la session est vivante : l heure ne bouge pas');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000181"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'et les_connectes() le compte toujours');
commit;

-- ---------------------------------------------------------------------------
\echo '— se deconnecter puis revenir ouvre bien une session neuve'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000182"}';
  select public.je_me_deconnecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil where id = :'bora') is null,
  'la deconnexion efface l heure');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5100-0000-0000-000000000182"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil where id = :'bora') > now() - interval '1 minute',
  'et revenir repose une heure fraiche');

-- ---------------------------------------------------------------------------
\echo '— je_me_connecte ne touche qu a la ligne de l appelant'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select connecte_depuis from public.profil where id = :'ada') is null,
  'Ada n a jamais ete marquee connectee');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.je_me_connecte();
    raise exception 'ÉCHEC — anon a pu se marquer connecté';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne se marque pas connecté';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0051_revenir_dans_qui_est_la.sql sont passés.'
