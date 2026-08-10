-- Tests de la migration 0054_me_pointer_a_l_ouverture.sql.
--
--   · Iris  référente à Tours-0054 — celle qui ouvre l'appel, en ligne
--   · Jo    référent  à Tours-0054 — en ligne dès l'ouverture
--   · Kim   référente à Tours-0054 — jamais connectée
--   · Lior  référent  à Tours-0054 — tient l'appel du second jour, à distance

\set ON_ERROR_STOP on
\o /dev/null

\set iris 'aaaaaaaa-5400-0000-0000-000000000191'
\set jo   'aaaaaaaa-5400-0000-0000-000000000192'
\set kim  'aaaaaaaa-5400-0000-0000-000000000193'
\set lior 'aaaaaaaa-5400-0000-0000-000000000194'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'iris', 'iris0054@example.org', '{"role":"referent"}'),
  (:'jo',   'jo0054@example.org',   '{"role":"referent"}'),
  (:'kim',  'kim0054@example.org',  '{"role":"referent"}'),
  (:'lior', 'lior0054@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values ('loge-0054-tours', 'Tours — 0054')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0054-iris', :'iris', 'Iris', 'I', 'iris0054@example.org',
   (select id from public.loge where bubble_id = 'loge-0054-tours')),
  ('ref-0054-jo',   :'jo',   'Jo',   'J', 'jo0054@example.org',
   (select id from public.loge where bubble_id = 'loge-0054-tours')),
  ('ref-0054-kim',  :'kim',  'Kim',  'K', 'kim0054@example.org',
   (select id from public.loge where bubble_id = 'loge-0054-tours')),
  ('ref-0054-lior', :'lior', 'Lior', 'L', 'lior0054@example.org',
   (select id from public.loge where bubble_id = 'loge-0054-tours'))
on conflict do nothing;

select id as r_iris from public.referent where bubble_id = 'ref-0054-iris' \gset
select id as r_jo   from public.referent where bubble_id = 'ref-0054-jo'   \gset
select id as r_kim  from public.referent where bubble_id = 'ref-0054-kim'  \gset
select id as r_lior from public.referent where bubble_id = 'ref-0054-lior' \gset

update public.profil set connecte_depuis = now() where id in (:'iris', :'jo');

-- ---------------------------------------------------------------------------
\echo '— celle qui ouvre l appel est marquee presente'
-- ---------------------------------------------------------------------------
-- Le manque que corrige 0054 : sa ligne était la seule restée vide sur une
-- feuille par ailleurs remplie.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000191"}';
  select public.ouvrir_une_reunion(current_date, 'Temple') as seance \gset
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_iris'::uuid) = 'Présent',
  'Iris, qui vient d ouvrir l appel, est presente');

select public.verifier(
  (select appele_par from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_iris'::uuid) = :'r_iris'::uuid,
  'et c est bien elle qui l a pose');

-- ---------------------------------------------------------------------------
\echo '— les connectes le sont toujours, et les autres toujours pas'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_jo'::uuid) = 'Présent',
  'Jo, en ligne, reste pointe par 0053');

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_kim'::uuid) = 0,
  'Kim, jamais connectee, n est toujours pas marquee');

-- ---------------------------------------------------------------------------
\echo '— mon propre etat pose a la main n est pas ecrase'
-- ---------------------------------------------------------------------------
-- Lior tient l'appel du lendemain, mais suit la réunion de loin : il se note
-- excusé. Rouvrir la feuille ne doit pas le déclarer présent.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000194"}';
  select public.ouvrir_une_reunion(current_date - 1, 'Temple') as demain \gset
  select public.pointer_a_l_appel(:'demain'::uuid, :'r_lior'::uuid, 'Excusé');
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'demain'::uuid
     and referent_id = :'r_lior'::uuid) = 'Excusé',
  'Lior s est note excuse');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000194"}';
  select public.ouvrir_une_reunion(current_date - 1, 'Temple');
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'demain'::uuid
     and referent_id = :'r_lior'::uuid) = 'Excusé',
  'et rouvrir la feuille le laisse excuse');

-- ---------------------------------------------------------------------------
\echo '— rouvrir ne pose pas une seconde ligne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000191"}';
  select public.ouvrir_une_reunion(current_date, 'Temple');
commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_iris'::uuid) = 1,
  'une seule ligne pour Iris, quel que soit le nombre d ouvertures');

-- ---------------------------------------------------------------------------
\echo '— la colonne de gauche ne montre toujours que les autres'
-- ---------------------------------------------------------------------------
-- Ce que 0054 ne devait PAS changer : `les_connectes()` exclut toujours
-- l'appelant, sans quoi chacun se verrait dans sa propre colonne.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()
      where referent_id = :'r_iris'::uuid) = 0,
    'Iris ne figure pas dans sa propre colonne');
commit;

-- ---------------------------------------------------------------------------
\echo '— et le bouton de groupe ne se coche toujours pas lui-meme'
-- ---------------------------------------------------------------------------
-- L'autre chose que 0054 ne devait pas changer : « Présents : les N en ligne »
-- reste un raccourci du geste un à un. On ne se coche pas soi-même en cochant
-- quelqu'un d'autre.
--
-- Kim ouvre seule en ligne, sans quoi son ouverture pointerait Jo — et l'on ne
-- saurait plus si sa ligne vient du bouton ou de l'ouverture de quelqu'un
-- d'autre.
update public.profil set connecte_depuis = null where id in (:'iris', :'jo');
update public.profil set connecte_depuis = now() where id = :'kim';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000193"}';
  select public.ouvrir_une_reunion(current_date - 2, 'Temple') as chez_kim \gset
commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'chez_kim'::uuid) = 1,
  'seule Kim est sur sa feuille : personne d autre n etait en ligne');

-- Jo arrive ensuite, et clique le bouton sans avoir rien ouvert. Il pose les
-- autres — Kim est déjà notée, il n'y a donc rien à poser — mais pas lui.
update public.profil set connecte_depuis = now() where id = :'jo';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5400-0000-0000-000000000192"}';
  select public.pointer_les_connectes(:'chez_kim'::uuid);
commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'chez_kim'::uuid
     and referent_id = :'r_jo'::uuid) = 0,
  'Jo, qui a clique le bouton sans ouvrir, ne s est pas marque');

select public.verifier(
  (select etat from public.appel where reunion_id = :'chez_kim'::uuid
     and referent_id = :'r_kim'::uuid) = 'Présent',
  'tandis que Kim, qui a ouvert, l est');

\echo ''
\echo 'Tous les contrôles de 0054_me_pointer_a_l_ouverture.sql sont passés.'
