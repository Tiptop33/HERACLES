-- Tests de la migration 0053_pointer_a_l_ouverture.sql.
--
--   · Ana  référente à Tours-0053 — celle qui ouvre l'appel, en ligne
--   · Bo   référent  à Tours-0053 — en ligne dès l'ouverture
--   · Cleo référente à Tours-0053 — en ligne, mais notée « Absent » à la main
--   · Dim  référent  à Tours-0053 — jamais connecté
--   · Eve  référente à Tours-0053 — se connecte après l'ouverture
--   · Flo  référente à Blois-0053 — une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set ana  'aaaaaaaa-5300-0000-0000-000000000191'
\set bo   'aaaaaaaa-5300-0000-0000-000000000192'
\set cleo 'aaaaaaaa-5300-0000-0000-000000000193'
\set dim  'aaaaaaaa-5300-0000-0000-000000000194'
\set eve  'aaaaaaaa-5300-0000-0000-000000000195'
\set flo  'aaaaaaaa-5300-0000-0000-000000000196'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ana',  'ana0053@example.org',  '{"role":"referent"}'),
  (:'bo',   'bo0053@example.org',   '{"role":"referent"}'),
  (:'cleo', 'cleo0053@example.org', '{"role":"referent"}'),
  (:'dim',  'dim0053@example.org',  '{"role":"referent"}'),
  (:'eve',  'eve0053@example.org',  '{"role":"referent"}'),
  (:'flo',  'flo0053@example.org',  '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0053-tours', 'Tours — 0053'),
  ('loge-0053-blois', 'Blois — 0053')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0053-ana',  :'ana',  'Ana',  'A', 'ana0053@example.org',
   (select id from public.loge where bubble_id = 'loge-0053-tours')),
  ('ref-0053-bo',   :'bo',   'Bo',   'B', 'bo0053@example.org',
   (select id from public.loge where bubble_id = 'loge-0053-tours')),
  ('ref-0053-cleo', :'cleo', 'Cleo', 'C', 'cleo0053@example.org',
   (select id from public.loge where bubble_id = 'loge-0053-tours')),
  ('ref-0053-dim',  :'dim',  'Dim',  'D', 'dim0053@example.org',
   (select id from public.loge where bubble_id = 'loge-0053-tours')),
  ('ref-0053-eve',  :'eve',  'Eve',  'E', 'eve0053@example.org',
   (select id from public.loge where bubble_id = 'loge-0053-tours')),
  ('ref-0053-flo',  :'flo',  'Flo',  'F', 'flo0053@example.org',
   (select id from public.loge where bubble_id = 'loge-0053-blois'))
on conflict do nothing;

select id as r_ana  from public.referent where bubble_id = 'ref-0053-ana'  \gset
select id as r_bo   from public.referent where bubble_id = 'ref-0053-bo'   \gset
select id as r_cleo from public.referent where bubble_id = 'ref-0053-cleo' \gset
select id as r_dim  from public.referent where bubble_id = 'ref-0053-dim'  \gset
select id as r_eve  from public.referent where bubble_id = 'ref-0053-eve'  \gset

-- Qui est là au moment où l'appel s'ouvre : Ana, qui le tient, Bo et Cleo.
-- Dim n'est jamais venu, Eve arrivera après.
update public.profil set connecte_depuis = now()
 where id in (:'ana', :'bo', :'cleo');

-- ---------------------------------------------------------------------------
\echo '— ouvrir l appel pointe ceux qui sont en ligne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5300-0000-0000-000000000191"}';
  select public.ouvrir_une_reunion(current_date, 'Temple') as seance \gset
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_bo'::uuid) = 'Présent',
  'Bo est presente des l ouverture, sans un clic');

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_cleo'::uuid) = 'Présent',
  'Cleo aussi');

-- ---------------------------------------------------------------------------
\echo '— celle qui ouvre l appel ne se pointe pas elle-meme'
-- ---------------------------------------------------------------------------
-- `les_connectes()` exclut l'appelant (0042) : sa case reste la seule vide, et
-- c'est la première chose qu'on remarquera sur l'écran.
select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_ana'::uuid) = 0,
  'la ligne d Ana reste a cocher');

-- ---------------------------------------------------------------------------
\echo '— celui qui n est pas en ligne n est pas pointe'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_dim'::uuid) = 0,
  'Dim, jamais connecte, n est pas marque present');

-- ---------------------------------------------------------------------------
\echo '— un etat pose a la main n est jamais ecrase'
-- ---------------------------------------------------------------------------
-- Cleo est bien en ligne, mais elle n'était pas là : quelqu'un l'a notée
-- absente. Rouvrir la feuille ne doit pas défaire cette réponse.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5300-0000-0000-000000000191"}';
  select public.pointer_a_l_appel(:'seance'::uuid, :'r_cleo'::uuid, 'Absent');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5300-0000-0000-000000000191"}';
  select public.ouvrir_une_reunion(current_date, 'Temple') as rouverte \gset
commit;

select public.verifier(
  :'rouverte' = :'seance',
  'rouvrir tombe bien sur la meme feuille');

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_cleo'::uuid) = 'Absent',
  'Cleo reste absente');

-- ---------------------------------------------------------------------------
\echo '— le retardataire est pointe quand on rouvre l appel'
-- ---------------------------------------------------------------------------
-- Eve se connecte après l'ouverture. Elle n'est pas dans la feuille ; le
-- bouton « Présents : les N en ligne » (0052) la rattrape, et rouvrir l'appel
-- aussi.
select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_eve'::uuid) = 0,
  'Eve n etait pas la a l ouverture');

update public.profil set connecte_depuis = now() where id = :'eve';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5300-0000-0000-000000000191"}';
  select public.ouvrir_une_reunion(current_date, 'Temple');
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_eve'::uuid) = 'Présent',
  'Eve, arrivee depuis, est pointee a la reouverture');

-- ---------------------------------------------------------------------------
\echo '— la feuille ne compte que ce qui a ete pose'
-- ---------------------------------------------------------------------------
-- Bo et Eve présents, Cleo absente, Ana et Dim encore à appeler.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5300-0000-0000-000000000191"}';

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid) where etat = 'Présent') = 2,
    'deux presents');

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid) where etat is null) = 2,
    'et deux personnes restent a appeler');
commit;

-- ---------------------------------------------------------------------------
\echo '— l ouverture ne pointe jamais au-dela de sa loge'
-- ---------------------------------------------------------------------------
-- Flo ouvre l'appel de Blois le même jour. Tours est en ligne au complet ;
-- rien de tout cela ne doit entrer dans sa feuille, ni la sienne bouger celle
-- de Tours.
update public.profil set connecte_depuis = now() where id = :'flo';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5300-0000-0000-000000000196"}';
  select public.ouvrir_une_reunion(current_date, 'Blois') as chez_flo \gset
commit;

select public.verifier(
  :'chez_flo' <> :'seance',
  'chaque loge tient sa propre feuille');

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'chez_flo'::uuid) = 0,
  'Blois n a personne d autre en ligne : sa feuille s ouvre vide');

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid) = 3,
  'et la feuille de Tours n a pas bouge');

\echo ''
\echo 'Tous les contrôles de 0053_pointer_a_l_ouverture.sql sont passés.'
