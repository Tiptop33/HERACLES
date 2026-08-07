-- Tests de la migration 0015_photos_referents.sql.
--
-- Une photo n'est pas un détail d'affichage : c'est le visage de quelqu'un.
-- Chez Bubble, ces fichiers pendaient à un CDN public. Ici, le chemin ne doit
-- sortir de la base que pour qui a déjà le droit de voir la fiche.
--
--   · Paul    référent à Reims-0015, avec une photo rapatriée
--   · Rosa    référente à Reims-0015 — elle doit pouvoir voir celle de Paul
--   · Sacha   référent à Tours-0015 — il ne doit rien obtenir
--   · Théa    administratrice

\set ON_ERROR_STOP on
\o /dev/null

\set paul   'cccccccc-0000-0000-0000-000000000015'
\set rosa   'cccccccc-0000-0000-0000-000000000016'
\set sacha  'cccccccc-0000-0000-0000-000000000017'
\set thea   'cccccccc-0000-0000-0000-000000000018'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'paul',  'paul0015@example.org',  '{"role":"referent","nom":"Eluard","prenom":"Paul"}'),
  (:'rosa',  'rosa0015@example.org',  '{"role":"referent","nom":"Bonheur","prenom":"Rosa"}'),
  (:'sacha', 'sacha0015@example.org', '{"role":"referent","nom":"Guitry","prenom":"Sacha"}'),
  (:'thea',  'thea0015@example.org',  '{"role":"referent","nom":"Musa","prenom":"Théa"}');
update public.profil set role = 'admin' where id = :'thea';

insert into public.loge (bubble_id, nom) values
  ('loge-0015-reims', 'Reims — 0015'),
  ('loge-0015-tours', 'Tours — 0015')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id,
                             photo_url, photo_chemin) values
  ('ref-0015-paul', :'paul', 'Eluard', 'Paul', 'paul0015@example.org',
   (select id from public.loge where bubble_id = 'loge-0015-reims'),
   'https://cdn.bubble.io/paul.jpg', 'referent/photo/ref-0015-paul.jpg'),
  ('ref-0015-rosa', :'rosa', 'Bonheur', 'Rosa', 'rosa0015@example.org',
   (select id from public.loge where bubble_id = 'loge-0015-reims'), null, null),
  -- Photo chez Bubble, pas encore rapatriée : elle ne compte pas. Cette
  -- adresse-là cessera de répondre à la fermeture.
  ('ref-0015-pasrap', null, 'Pasrapatriee', 'Paule', 'paule0015@example.org',
   (select id from public.loge where bubble_id = 'loge-0015-reims'),
   'https://cdn.bubble.io/paule.jpg', null),
  ('ref-0015-sacha', :'sacha', 'Guitry', 'Sacha', 'sacha0015@example.org',
   (select id from public.loge where bubble_id = 'loge-0015-tours'), null, null)
on conflict do nothing;

-- Les identifiants sont relevés ici, hors session : Rosa ne peut PAS lire la
-- ligne de Paul dans la table — c'est ce que garantit 0012. Un sous-`select`
-- écrit dans les tests ci-dessous rendrait null, et l'on croirait la fonction
-- fautive alors que ce serait la RLS qui fait son travail.
select id as ref_paul from public.referent where bubble_id = 'ref-0015-paul' \gset
select id as ref_rosa from public.referent where bubble_id = 'ref-0015-rosa' \gset

-- ---------------------------------------------------------------------------
\echo '— l annuaire dit qui a un visage, et seulement pour la copie rapatriee'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000016"}';

  select public.verifier(
    (select a_une_photo from public.annuaire_referents() where nom = 'Eluard') = true,
    'Paul a une photo rapatriée : la carte la montrera');

  select public.verifier(
    (select a_une_photo from public.annuaire_referents() where nom = 'Bonheur') = false,
    'Rosa n''en a pas : ses initiales resteront');

  select public.verifier(
    (select a_une_photo from public.annuaire_referents() where nom = 'Pasrapatriee') = false,
    'une photo restée chez Bubble ne compte pas — cette adresse mourra avec l''application');
commit;

-- ---------------------------------------------------------------------------
\echo '— le chemin ne sort que pour qui voit deja la fiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000016"}';

  select public.verifier(
    (select public.chemin_photo_referent(:'ref_paul'::uuid))
     = 'referent/photo/ref-0015-paul.jpg',
    'Rosa, de la même loge, obtient le chemin de la photo de Paul');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000017"}';

  select public.verifier(
    (select public.chemin_photo_referent(:'ref_paul'::uuid)) is null,
    'Sacha, de Tours, n''obtient rien — pas même l''emplacement du fichier');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000018"}';

  select public.verifier(
    (select public.chemin_photo_referent(:'ref_paul'::uuid)) is not null,
    'l''administratrice, oui');
commit;

-- ---------------------------------------------------------------------------
\echo '— rien pour une fiche sans photo, ni pour un identifiant inventé'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000016"}';

  select public.verifier(
    (select public.chemin_photo_referent(:'ref_rosa'::uuid)) is null,
    'aucune photo, aucun chemin');

  select public.verifier(
    (select public.chemin_photo_referent(
       '00000000-0000-0000-0000-000000000000'::uuid)) is null,
    'un identifiant qui n''existe pas ne renseigne sur rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— et l annuaire ne laisse toujours pas filtrer le chemin du fichier'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'annuaire_referents'
      and p.parameter_name = 'photo_chemin') = 0,
  'la fonction ne rend pas `photo_chemin` : la page n''a pas à savoir où sont rangés les fichiers');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.chemin_photo_referent('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu demander le chemin d''une photo';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0015_photos_referents.sql sont passés.'
