-- Tests de la migration 0047_ma_photo.sql.
--
--   · Ana   référente à Tours-0047, photo rapatriée — elle a un visage
--   · Bruno référent  à Tours-0047, aucune photo
--   · Cléo  référente à Tours-0047, `photo_url` de Bubble mais rien de
--            rapatrié : l'application n'a rien à servir
--   · Dan   compte sans fiche de référent — un administrateur, par exemple

\set ON_ERROR_STOP on
\o /dev/null

\set ana   'aaaaaaaa-4700-0000-0000-000000000141'
\set bruno 'aaaaaaaa-4700-0000-0000-000000000142'
\set cleo  'aaaaaaaa-4700-0000-0000-000000000143'
\set dan   'aaaaaaaa-4700-0000-0000-000000000144'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ana',   'ana0047@example.org',   '{"role":"referent"}'),
  (:'bruno', 'bruno0047@example.org', '{"role":"referent"}'),
  (:'cleo',  'cleo0047@example.org',  '{"role":"referent"}'),
  (:'dan',   'dan0047@example.org',   '{"role":"admin"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0047-tours', 'Tours — 0047')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0047-ana',   :'ana',   'Ana',   'A', 'ana0047@example.org',
   (select id from public.loge where bubble_id = 'loge-0047-tours')),
  ('ref-0047-bruno', :'bruno', 'Bruno', 'B', 'bruno0047@example.org',
   (select id from public.loge where bubble_id = 'loge-0047-tours')),
  ('ref-0047-cleo',  :'cleo',  'Cléo',  'C', 'cleo0047@example.org',
   (select id from public.loge where bubble_id = 'loge-0047-tours'))
on conflict do nothing;

-- Ana a son fichier rapatrié ; Cléo n'a que l'adresse d'origine chez Bubble.
update public.referent
   set photo_chemin = 'referent/photo/ana-0047.jpg'
 where bubble_id = 'ref-0047-ana';

update public.referent
   set photo_url = 'https://s3.amazonaws.com/appforest_uf/cleo-0047.jpg'
 where bubble_id = 'ref-0047-cleo';

select id as r_ana from public.referent where bubble_id = 'ref-0047-ana' \gset

-- ---------------------------------------------------------------------------
\echo '— celle qui a une photo la voit annoncee, avec l identifiant de sa fiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4700-0000-0000-000000000141"}';

  select public.verifier(
    (select count(*) from public.ma_photo()) = 1,
    'ma_photo() rend une ligne et une seule');

  select public.verifier(
    (select a_une_photo from public.ma_photo()) is true,
    'Ana a un visage a montrer');

  -- L'identifiant rendu est celui de la **fiche**, pas celui du compte : c'est
  -- toute la raison d'être de cette fonction. Les confondre servirait une
  -- adresse de photo qui ne mène nulle part.
  select public.verifier(
    (select referent_id from public.ma_photo()) = :'r_ana'::uuid,
    'c est l identifiant de la fiche de referent qui est rendu');

  select public.verifier(
    (select referent_id from public.ma_photo())
      is distinct from 'aaaaaaaa-4700-0000-0000-000000000141'::uuid,
    'et non celui du compte');
commit;

-- ---------------------------------------------------------------------------
\echo '— celui qui n a pas de photo est annonce sans, mais existe bien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4700-0000-0000-000000000142"}';

  -- La nuance qui compte : la ligne est là, seul le visage manque. Rendre
  -- zéro ligne confondrait « pas de photo » et « pas de fiche ».
  select public.verifier(
    (select count(*) from public.ma_photo()) = 1,
    'Bruno a bien une fiche');

  select public.verifier(
    (select a_une_photo from public.ma_photo()) is false,
    'mais aucun visage a montrer');
commit;

-- ---------------------------------------------------------------------------
\echo '— une photo restee chez Bubble ne compte pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4700-0000-0000-000000000143"}';

  -- Le piège que cette migration évite : `photo_url` est renseignée, mais le
  -- fichier n'a jamais été rapatrié. L'annoncer afficherait un cadre vide,
  -- puisque la route ne sert que `photo_chemin` (0015).
  select public.verifier(
    (select a_une_photo from public.ma_photo()) is false,
    'Cleo n a que l adresse Bubble : rien a servir');
commit;

-- ---------------------------------------------------------------------------
\echo '— un compte sans fiche de referent n a pas de photo du tout'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4700-0000-0000-000000000144"}';

  select public.verifier(
    (select count(*) from public.ma_photo()) = 0,
    'Dan n a pas de fiche : la fonction ne rend rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— personne ne voit la photo d un autre par cette fonction'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4700-0000-0000-000000000142"}';

  -- `security definer` lit `referent` sans passer par la RLS : il faut donc
  -- vérifier que le `where` referme bien la fonction sur la seule ligne de
  -- l'appelant, sans quoi elle ouvrirait toute la table.
  select public.verifier(
    (select referent_id from public.ma_photo()) is distinct from :'r_ana'::uuid,
    'Bruno ne recupere pas la fiche d Ana');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.ma_photo();
    raise exception 'ÉCHEC — anon a pu demander ma photo';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0047_ma_photo.sql sont passés.'
