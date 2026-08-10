-- Tests de la migration 0049_retirer_une_photo.sql.
--
--   · Alix  administratrice — celle qui a le droit
--   · Bruno référent        — celui qui ne l'a pas
--   · Chloé référente       — reprise de Bubble, photo rapatriée
--   · Diane référente       — jamais de photo

\set ON_ERROR_STOP on
\o /dev/null

\set alix  'aaaaaaaa-4900-0000-0000-000000000161'
\set bruno 'aaaaaaaa-4900-0000-0000-000000000162'
\set chloe 'aaaaaaaa-4900-0000-0000-000000000163'
\set diane 'aaaaaaaa-4900-0000-0000-000000000164'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alix',  'alix0049@example.org',  '{"role":"referent"}'),
  (:'bruno', 'bruno0049@example.org', '{"role":"referent"}'),
  (:'chloe', 'chloe0049@example.org', '{"role":"referent"}'),
  (:'diane', 'diane0049@example.org', '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'alix';

insert into public.loge (bubble_id, nom) values
  ('loge-0049-tours', 'Tours — 0049')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0049-bruno', :'bruno', 'Bruno', 'B', 'bruno0049@example.org',
   (select id from public.loge where bubble_id = 'loge-0049-tours')),
  ('ref-0049-chloe', :'chloe', 'Chloé', 'C', 'chloe0049@example.org',
   (select id from public.loge where bubble_id = 'loge-0049-tours')),
  ('ref-0049-diane', :'diane', 'Diane', 'D', 'diane0049@example.org',
   (select id from public.loge where bubble_id = 'loge-0049-tours'))
on conflict do nothing;

-- Chloé vient de Bubble : elle porte les deux, l'adresse d'origine et la copie.
update public.referent
   set photo_url    = 'https://s3.amazonaws.com/appforest_uf/chloe-0049.jpg',
       photo_chemin = 'referent/photo/chloe-0049.jpg'
 where bubble_id = 'ref-0049-chloe';

-- Bruno aussi, pour éprouver qu'un refus ne touche à rien.
update public.referent
   set photo_url    = 'https://s3.amazonaws.com/appforest_uf/bruno-0049.jpg',
       photo_chemin = 'referent/photo/bruno-0049.jpg'
 where bubble_id = 'ref-0049-bruno';

select id as r_chloe from public.referent where bubble_id = 'ref-0049-chloe' \gset
select id as r_diane from public.referent where bubble_id = 'ref-0049-diane' \gset

-- ---------------------------------------------------------------------------
\echo '— un referent ne retire la photo de personne, pas meme la sienne'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4900-0000-0000-000000000162"}';
  begin
    perform public.retirer_la_photo_du_referent(
      (select id from public.referent where bubble_id = 'ref-0049-bruno'));
    raise exception 'ÉCHEC — un référent a pu retirer une photo';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur retire une photo';
  end;
end
$$;

select public.verifier(
  (select photo_chemin from public.referent where bubble_id = 'ref-0049-bruno')
    = 'referent/photo/bruno-0049.jpg',
  'le refus n a rien efface');

-- ---------------------------------------------------------------------------
\echo '— une administratrice retire la photo, et recupere le fichier a effacer'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4900-0000-0000-000000000161"}';

  -- Ce retour est toute la raison d'être du `returns text` : sans lui, le
  -- visage resterait dans le seau après qu'on a demandé de l'enlever.
  select public.verifier(
    public.retirer_la_photo_du_referent(:'r_chloe'::uuid) = 'referent/photo/chloe-0049.jpg',
    'la fonction rend le chemin du fichier a effacer');
commit;

select public.verifier(
  (select photo_chemin from public.referent where id = :'r_chloe'::uuid) is null,
  'la fiche ne designe plus aucune photo');

-- ---------------------------------------------------------------------------
\echo '— et l adresse Bubble part avec, sans quoi la photo reviendrait'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select photo_url from public.referent where id = :'r_chloe'::uuid) is null,
  'l adresse d origine a ete effacee elle aussi');

-- Le contrôle qui donne son sens au précédent : c'est exactement la requête
-- de `outils/rapatrier-fichiers.mjs`. Si la fiche y répondait encore, la
-- prochaine reprise remettrait le visage en place.
select public.verifier(
  (select count(*) from public.referent
    where id = :'r_chloe'::uuid
      and photo_url is not null
      and photo_chemin is null) = 0,
  'la prochaine reprise Bubble ne la retelechargera pas');

-- ---------------------------------------------------------------------------
\echo '— retirer une photo qui n existe pas ne provoque rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4900-0000-0000-000000000161"}';

  -- Le geste se rejoue sans dommage : rien à effacer, donc rien n'est rendu.
  select public.verifier(
    public.retirer_la_photo_du_referent(:'r_diane'::uuid) is null,
    'aucun fichier a effacer pour qui n avait pas de photo');

  select public.verifier(
    public.retirer_la_photo_du_referent(:'r_chloe'::uuid) is null,
    'et retirer deux fois de suite ne rend rien la seconde fois');
commit;

-- ---------------------------------------------------------------------------
\echo '— une fiche inconnue ne se retire pas'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4900-0000-0000-000000000161"}';
  begin
    perform public.retirer_la_photo_du_referent(
      '00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — une fiche inconnue a été retirée';
  exception when no_data_found then
    raise notice '  ok — fiche inconnue, rien n''est écrit';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— la fiche voisine n a pas bouge'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select photo_chemin from public.referent where bubble_id = 'ref-0049-bruno')
    = 'referent/photo/bruno-0049.jpg',
  'retirer une photo ne touche qu a la fiche visee');

-- ---------------------------------------------------------------------------
\echo '— on peut redeposer apres avoir retire'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4900-0000-0000-000000000161"}';

  -- Retirer ne condamne pas la fiche : les deux gestes se suivent.
  select public.verifier(
    public.poser_la_photo_du_referent(:'r_chloe'::uuid, 'referent/photo/chloe-neuve.png')
      is null,
    'la fiche etait bien sans photo, on en repose une');

  select public.verifier(
    (select photo_chemin from public.referent where id = :'r_chloe'::uuid)
      = 'referent/photo/chloe-neuve.png',
    'et la nouvelle photo est en place');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.retirer_la_photo_du_referent('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu retirer une photo';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0049_retirer_une_photo.sql sont passés.'
