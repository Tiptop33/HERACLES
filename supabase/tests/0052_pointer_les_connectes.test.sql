-- Tests de la migration 0052_pointer_les_connectes.sql.
--
--   · Alma  référente à Tours-0052 — celle qui tient l'appel
--   · Bahia référente à Tours-0052 — en ligne, jamais appelée
--   · Ciro  référent  à Tours-0052 — en ligne, déjà noté « Excusé »
--   · Dan   référent  à Tours-0052 — jamais connecté
--   · Elias référent  à Tours-0052 — connecté il y a treize heures
--   · Fara  référente à Blois-0052 — une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set alma  'aaaaaaaa-5200-0000-0000-000000000191'
\set bahia 'aaaaaaaa-5200-0000-0000-000000000192'
\set ciro  'aaaaaaaa-5200-0000-0000-000000000193'
\set dan   'aaaaaaaa-5200-0000-0000-000000000194'
\set elias 'aaaaaaaa-5200-0000-0000-000000000195'
\set fara  'aaaaaaaa-5200-0000-0000-000000000196'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alma',  'alma0052@example.org',  '{"role":"referent"}'),
  (:'bahia', 'bahia0052@example.org', '{"role":"referent"}'),
  (:'ciro',  'ciro0052@example.org',  '{"role":"referent"}'),
  (:'dan',   'dan0052@example.org',   '{"role":"referent"}'),
  (:'elias', 'elias0052@example.org', '{"role":"referent"}'),
  (:'fara',  'fara0052@example.org',  '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0052-tours', 'Tours — 0052'),
  ('loge-0052-blois', 'Blois — 0052')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0052-alma',  :'alma',  'Alma',  'A', 'alma0052@example.org',
   (select id from public.loge where bubble_id = 'loge-0052-tours')),
  ('ref-0052-bahia', :'bahia', 'Bahia', 'B', 'bahia0052@example.org',
   (select id from public.loge where bubble_id = 'loge-0052-tours')),
  ('ref-0052-ciro',  :'ciro',  'Ciro',  'C', 'ciro0052@example.org',
   (select id from public.loge where bubble_id = 'loge-0052-tours')),
  ('ref-0052-dan',   :'dan',   'Dan',   'D', 'dan0052@example.org',
   (select id from public.loge where bubble_id = 'loge-0052-tours')),
  ('ref-0052-elias', :'elias', 'Elias', 'E', 'elias0052@example.org',
   (select id from public.loge where bubble_id = 'loge-0052-tours')),
  ('ref-0052-fara',  :'fara',  'Fara',  'F', 'fara0052@example.org',
   (select id from public.loge where bubble_id = 'loge-0052-blois'))
on conflict do nothing;

select id as r_alma  from public.referent where bubble_id = 'ref-0052-alma'  \gset
select id as r_bahia from public.referent where bubble_id = 'ref-0052-bahia' \gset
select id as r_ciro  from public.referent where bubble_id = 'ref-0052-ciro'  \gset
select id as r_dan   from public.referent where bubble_id = 'ref-0052-dan'   \gset
select id as r_elias from public.referent where bubble_id = 'ref-0052-elias' \gset

-- La réunion, ouverte par Alma — **avant** que personne ne soit en ligne.
--
-- L'ordre compte depuis 0053 : ouvrir l'appel pointe désormais les connectés.
-- Ouvrir d'abord ne laisse donc sur la feuille que la ligne d'Alma — la sienne,
-- posée par 0054 —, et ce qui suit éprouve bien le bouton de 0052, seul. Que
-- l'ouverture pointe, ce sont 0053 et 0054 qui le vérifient.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000191"}';
  select public.ouvrir_une_reunion(current_date, 'Temple') as seance \gset
commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id <> :'r_alma'::uuid) = 0,
  'personne d autre en ligne a l ouverture : le bouton a tout a faire');

-- Qui est là : Alma (elle tient l'appel), Bahia et Ciro. Elias a laissé un
-- onglet ouvert il y a treize heures — le garde-fou l'écarte. Dan n'est jamais
-- venu.
update public.profil set connecte_depuis = now() where id in (:'alma', :'bahia', :'ciro');
update public.profil set connecte_depuis = now() - interval '13 hours' where id = :'elias';

-- Ciro suit la réunion de loin : il est en ligne, mais noté excusé à la main.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000191"}';
  select public.pointer_a_l_appel(:'seance'::uuid, :'r_ciro'::uuid, 'Excusé');
commit;

-- ---------------------------------------------------------------------------
\echo '— le bouton pose Present sur ceux qui sont en ligne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000191"}';

  -- Bahia seule : Ciro est déjà noté, Alma s'exclut, Dan et Elias ne sont pas
  -- en ligne.
  select public.verifier(
    public.pointer_les_connectes(:'seance'::uuid) = 1,
    'une seule case remplie');
commit;

select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_bahia'::uuid) = 'Présent',
  'Bahia est notee presente');

-- ---------------------------------------------------------------------------
\echo '— un etat pose a la main n est jamais ecrase'
-- ---------------------------------------------------------------------------
-- Le cas qui justifie le `on conflict do nothing` : Ciro est bien en ligne,
-- mais quelqu'un l'a noté excusé. C'est une information, pas une case vide.
select public.verifier(
  (select etat from public.appel where reunion_id = :'seance'::uuid
     and referent_id = :'r_ciro'::uuid) = 'Excusé',
  'Ciro reste excuse');

-- ---------------------------------------------------------------------------
\echo '— celui qui tient l appel ne se marque pas lui-meme'
-- ---------------------------------------------------------------------------
-- `les_connectes()` exclut l'appelant, et la feuille ne lui propose pas
-- davantage son propre bouton : les deux disent la même chose.
--
-- Sa ligne est bien sur la feuille depuis 0054, mais elle vient de
-- l'ouverture, pas de ce geste-ci : le bouton n'a rendu qu'une seule case, et
-- c'était celle de Bahia. Ce qui s'éprouve ici est donc la liste que le bouton
-- recopie, où Alma ne peut pas se trouver.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()
      where referent_id = :'r_alma'::uuid) = 0,
    'Alma ne figure pas dans la liste que le bouton recopie');
commit;

-- ---------------------------------------------------------------------------
\echo '— ceux qui ne sont pas en ligne ne sont pas touches'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid
     and referent_id in (:'r_dan'::uuid, :'r_elias'::uuid)) = 0,
  'ni Dan, jamais connecte, ni Elias, parti depuis treize heures');

-- ---------------------------------------------------------------------------
\echo '— rejoue, le geste ne pose rien de plus'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000191"}';
  select public.verifier(
    public.pointer_les_connectes(:'seance'::uuid) = 0,
    'le second passage ne remplit aucune case');
commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid) = 3,
  'la feuille porte toujours trois pointages — Alma, Bahia, Ciro');

-- ---------------------------------------------------------------------------
\echo '— une reunion d une autre loge ne se pointe pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000196"}';
  select public.verifier(
    public.pointer_les_connectes(:'seance'::uuid) is null,
    'Fara, d une autre loge, n obtient rien');
commit;

select public.verifier(
  (select count(*) from public.appel where reunion_id = :'seance'::uuid) = 3,
  'et rien n a bouge sur la feuille');

-- ---------------------------------------------------------------------------
\echo '— la feuille d appel rend bien ce qui vient d etre pose'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5200-0000-0000-000000000191"}';

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid) where etat = 'Présent') = 2,
    'deux presents sur la feuille — Alma par 0054, Bahia par le bouton');

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid) where etat is null) = 2,
    'et deux personnes restent a appeler');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.pointer_les_connectes('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu pointer';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0052_pointer_les_connectes.sql sont passés.'
