-- Tests de la migration 0109_journal_des_connexions.sql.
--
--   · Chef   administrateur, celui qui lit le tableau
--   · Rose   référente à Agen-0109, celle dont les connexions sont notées
--   · Sami   référent  à Agen-0109, qui ne doit rien lire
--   · Cléo   candidate (compte sans fiche référent) : rien n'est noté pour elle

\set ON_ERROR_STOP on
\o /dev/null

\set chef 'aaaaaaaa-0109-0000-0000-000000000001'
\set rose 'aaaaaaaa-0109-0000-0000-000000000002'
\set sami 'aaaaaaaa-0109-0000-0000-000000000003'
\set cleo 'aaaaaaaa-0109-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef', 'chef0109@example.org', '{"role":"referent"}'),
  (:'rose', 'rose0109@example.org', '{"role":"referent"}'),
  (:'sami', 'sami0109@example.org', '{"role":"referent"}'),
  (:'cleo', 'cleo0109@example.org', '{"role":"chercheur"}');

update public.profil set role = 'admin' where id = :'chef';

insert into public.loge (bubble_id, nom) values
  ('loge-0109-agen', 'Agen — 0109')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0109-rose', :'rose', 'Rose', 'R', 'rose0109@example.org',
   (select id from public.loge where bubble_id = 'loge-0109-agen')),
  ('ref-0109-sami', :'sami', 'Sami', 'S', 'sami0109@example.org',
   (select id from public.loge where bubble_id = 'loge-0109-agen'))
on conflict do nothing;

select id as rose_ref from public.referent where bubble_id = 'ref-0109-rose' \gset
select id as sami_ref from public.referent where bubble_id = 'ref-0109-sami' \gset

-- ---------------------------------------------------------------------------
\echo '— se connecter ouvre une ligne au journal'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000002"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'rose_ref') = 1,
  'une connexion pour Rose');

-- ---------------------------------------------------------------------------
\echo '— les signes de vie la prolongent, sans en ouvrir une autre'
-- ---------------------------------------------------------------------------
-- La connexion a commencé il y a dix minutes ; le dernier passage date d'une
-- minute.
update public.connexion_referent
   set debut = now() - interval '10 minutes', dernier_signe = now() - interval '1 minute'
 where referent_id = :'rose_ref';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000002"}';
  select public.je_suis_la();
  -- Un second onglet qui se reconnecte : toujours la même connexion.
  select public.je_me_connecte();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'rose_ref') = 1,
  'toujours une seule ligne');
select public.verifier(
  (select dernier_signe > now() - interval '5 seconds'
      and debut < now() - interval '9 minutes'
     from public.connexion_referent where referent_id = :'rose_ref'),
  'le dernier signe avance, le debut ne bouge pas');

-- ---------------------------------------------------------------------------
\echo '— trente minutes de silence : le retour ouvre une connexion neuve'
-- ---------------------------------------------------------------------------
update public.connexion_referent
   set debut = now() - interval '3 hours', dernier_signe = now() - interval '2 hours'
 where referent_id = :'rose_ref';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000002"}';
  select public.je_suis_la();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'rose_ref') = 2,
  'deux connexions : celle du matin, celle du retour');
select public.verifier(
  (select dernier_signe < now() - interval '119 minutes'
     from public.connexion_referent
    where referent_id = :'rose_ref' order by debut limit 1),
  'la premiere garde sa fin : une heure de duree, pas trois');

-- ---------------------------------------------------------------------------
\echo '— se deconnecter note l heure et clot la connexion'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000002"}';
  select public.je_me_deconnecte();
commit;

select public.verifier(
  (select deconnecte_le is not null
     from public.connexion_referent
    where referent_id = :'rose_ref' order by debut desc limit 1),
  'la deconnexion est notee');
select public.verifier(
  (select count(*) from public.connexion_referent
    where referent_id = :'rose_ref' and deconnecte_le is not null) = 1,
  'et la connexion du matin, close par le silence, n est pas retouchee');

-- ---------------------------------------------------------------------------
\echo '— un onglet oublie ne rouvre rien apres la deconnexion'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000002"}';
  select public.je_suis_la();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'rose_ref') = 2,
  'toujours deux lignes');

-- ---------------------------------------------------------------------------
\echo '— se reconnecter apres une deconnexion ouvre une troisieme connexion'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000002"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'rose_ref') = 3,
  'trois connexions');

-- ---------------------------------------------------------------------------
\echo '— une candidate n est pas journalisee'
-- ---------------------------------------------------------------------------
select count(*) as avant from public.connexion_referent \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000004"}';
  select public.je_me_connecte();
  select public.je_suis_la();
  select public.je_me_deconnecte();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent) = :avant,
  'rien de plus au journal');

-- ---------------------------------------------------------------------------
\echo '— l administrateur lit le tableau, avec le nom, la loge et la duree'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents()
      where referent_id = :'rose_ref') = 3,
    'les trois connexions de Rose');
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents()
      where referent_id = :'rose_ref' and nom = 'Rose' and loge_nom = 'Agen — 0109') = 3,
    'avec son nom et sa loge');
  select public.verifier(
    (select duree_secondes between 3590 and 3610
       from public.les_connexions_des_referents()
      where referent_id = :'rose_ref' order by debut limit 1),
    'la connexion du matin a dure une heure');
  select public.verifier(
    (select en_cours from public.les_connexions_des_referents()
      where referent_id = :'rose_ref' order by debut desc limit 1),
    'la derniere est en cours');
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents()
      where referent_id = :'rose_ref' and en_cours) = 1,
    'et elle seule');
  select public.verifier(
    (select count(*) from public.connexion_referent where referent_id = :'rose_ref') = 3,
    'la table se lit aussi en direct pour un administrateur');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent ne lit rien : ni les autres, ni lui-meme'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000003"}';
  select public.je_me_connecte();
  select public.verifier(
    (select count(*) from public.les_connexions_des_referents()) = 0,
    'la fonction ne rend rien a Sami');
  select public.verifier(
    (select count(*) from public.connexion_referent) = 0,
    'la table non plus');
commit;

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'sami_ref') = 1,
  'sa connexion a pourtant bien ete notee');

-- ---------------------------------------------------------------------------
\echo '— personne n ecrit dans le journal a la main'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0109-0000-0000-000000000001"}', true);
  begin
    delete from public.connexion_referent;
    raise exception 'ÉCHEC — un administrateur a pu effacer le journal';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.noter_ma_connexion(false);
    raise exception 'ÉCHEC — noter_ma_connexion() s appelle en direct';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end
$$;

begin;
  set local role anon;
  do $$
  begin
    perform count(*) from public.connexion_referent;
    raise exception 'ÉCHEC — un anonyme lit le journal';
  exception when insufficient_privilege then
    null;
  end
  $$;
commit;

-- ---------------------------------------------------------------------------
\echo '— douze mois : les vieilles lignes partent a la connexion suivante'
-- ---------------------------------------------------------------------------
insert into public.connexion_referent (referent_id, debut, dernier_signe) values
  (:'sami_ref', now() - interval '13 months', now() - interval '13 months'),
  (:'sami_ref', now() - interval '11 months', now() - interval '11 months');

-- Sami revient après un long silence : une connexion neuve, donc une purge.
update public.connexion_referent set dernier_signe = debut
 where referent_id = :'sami_ref';
update public.connexion_referent
   set debut = debut - interval '1 hour', dernier_signe = dernier_signe - interval '1 hour'
 where referent_id = :'sami_ref' and debut > now() - interval '1 day';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0109-0000-0000-000000000003"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select count(*) from public.connexion_referent
    where referent_id = :'sami_ref' and debut < now() - interval '12 months') = 0,
  'la ligne de treize mois est partie');
select public.verifier(
  (select count(*) from public.connexion_referent
    where referent_id = :'sami_ref' and debut < now() - interval '10 months') = 1,
  'celle de onze mois reste');

-- ---------------------------------------------------------------------------
\echo '— supprimer la fiche d un referent emporte ses connexions'
-- ---------------------------------------------------------------------------
delete from public.referent where id = :'sami_ref';

select public.verifier(
  (select count(*) from public.connexion_referent where referent_id = :'sami_ref') = 0,
  'plus rien au journal pour Sami');
