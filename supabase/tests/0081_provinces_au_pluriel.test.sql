-- Tests de la migration 0081_provinces_au_pluriel.sql.
--
-- Les provinces, sous le nom et avec les champs que Bubble leur donne
-- réellement (relevé du 11 novembre 2026, `/api/1.1/meta`) :
--   type `provinces` ; champs `Nom`, `Ecusson`, `LOGES-OAF`, `Slug`,
--   `Created By`, `Created Date`, `Modified Date`.
--
-- Ce qu'on éprouve :
--   * le type au pluriel est déplié ;
--   * `Ecusson` l'emporte sur une autre adresse de fichier Bubble ;
--   * une reprise sans jeton — des fiches réduites à leur `_id` — n'efface ni
--     le nom, ni l'image, ni son chemin rapatrié, ni les dates ;
--   * un écusson réellement changé est repris, et son chemin oublié.
--
-- Données fabriquées : aucune province réelle, aucune adresse réelle.

\set ON_ERROR_STOP on
\o /dev/null

-- --- Fixtures --------------------------------------------------------------
insert into public.bubble_brut (type_bubble, bubble_id, donnees) values
  ('provinces', 'prov-p-0081a', $j${
     "_id": "prov-p-0081a",
     "Nom": "Province d'Essai Nord",
     "Ecusson": "//essai0081.cdn.bubble.io/f1/ecusson-nord.png",
     "LOGES-OAF": ["loge-p-0081"],
     "Slug": "province-essai-nord",
     "Created By": "admin_user_essai",
     "Created Date": "2023-03-01T10:00:00.000Z",
     "Modified Date": "2024-06-01T10:00:00.000Z"
   }$j$::jsonb),
  -- « Annexe » vient avant « Ecusson » dans l'alphabet, et porte elle aussi
  -- une adresse de fichier Bubble : sans la priorité, elle serait prise.
  ('provinces', 'prov-p-0081b', $j${
     "_id": "prov-p-0081b",
     "Nom": "Province d'Essai Sud",
     "Annexe": "//essai0081.cdn.bubble.io/f2/reglement.pdf",
     "Ecusson": "//s3.amazonaws.com/appforest_uf/f3/ecusson-sud.png"
   }$j$::jsonb)
on conflict (type_bubble, bubble_id) do update set donnees = excluded.donnees;

insert into public.loge (bubble_id, nom, province_bubble_id) values
  ('loge-p-0081', 'Loge d''Essai Nord', 'prov-p-0081a')
on conflict (bubble_id) do nothing;

-- --- Le type au pluriel ----------------------------------------------------
\echo '— le type « provinces » est déplié'
select * from public.deverser_provinces_bubble();

select public.verifier(
  (select nom = 'Province d''Essai Nord'
      and image_url = '//essai0081.cdn.bubble.io/f1/ecusson-nord.png'
      and cree_le = '2023-03-01T10:00:00Z'::timestamptz
     from public.province where bubble_id = 'prov-p-0081a'),
  '« Nom » et « Ecusson » sont lus, la date de création aussi');

select public.verifier(
  (select image_url = '//s3.amazonaws.com/appforest_uf/f3/ecusson-sud.png'
     from public.province where bubble_id = 'prov-p-0081b'),
  '« Ecusson » passe devant une autre adresse de fichier Bubble');

select public.verifier(
  (select p.nom from public.loge l join public.province p on p.id = l.province_id
    where l.bubble_id = 'loge-p-0081') = 'Province d''Essai Nord',
  'la loge rejoint sa province');

-- --- Une reprise sans jeton n'efface rien ----------------------------------
\echo '— une reprise sans jeton n''efface ni le nom, ni l''écusson, ni son chemin'
update public.province set image_chemin = 'province/image/prov-p-0081a/ecusson-nord.png'
 where bubble_id = 'prov-p-0081a';

-- Ce que Bubble rend sans jeton : l'identifiant, et rien d'autre.
update public.bubble_brut set donnees = jsonb_build_object('_id', bubble_id)
 where type_bubble = 'provinces' and bubble_id in ('prov-p-0081a', 'prov-p-0081b');

select * from public.deverser_provinces_bubble();

select public.verifier(
  (select nom = 'Province d''Essai Nord'
      and image_url = '//essai0081.cdn.bubble.io/f1/ecusson-nord.png'
      and image_chemin = 'province/image/prov-p-0081a/ecusson-nord.png'
     from public.province where bubble_id = 'prov-p-0081a'),
  'nom, écusson et chemin rapatrié sont gardés');
select public.verifier(
  (select cree_le = '2023-03-01T10:00:00Z'::timestamptz
      and cree_par_bubble_id = 'admin_user_essai'
     from public.province where bubble_id = 'prov-p-0081a'),
  'la date de création et l''auteur aussi');
select public.verifier(
  (select nom = 'Province d''Essai Sud' from public.province where bubble_id = 'prov-p-0081b'),
  'la seconde province garde son nom');
select public.verifier(
  (select count(*) from public.province where bubble_id like 'prov-p-0081_') = 2,
  'et rien n''a été doublé');

-- --- Un écusson réellement changé est repris -------------------------------
\echo '— un écusson changé chez Bubble est repris, et rapatrié de nouveau'
update public.bubble_brut set donnees = $j${
     "_id": "prov-p-0081a",
     "Nom": "Province d'Essai Nord",
     "Ecusson": "//essai0081.cdn.bubble.io/f9/ecusson-nord-2027.png"
   }$j$::jsonb
 where type_bubble = 'provinces' and bubble_id = 'prov-p-0081a';

select * from public.deverser_provinces_bubble();

select public.verifier(
  (select image_url = '//essai0081.cdn.bubble.io/f9/ecusson-nord-2027.png'
      and image_chemin is null
     from public.province where bubble_id = 'prov-p-0081a'),
  'la nouvelle adresse est prise, l''ancien chemin oublié');

\echo '— et le dépliage reste fermé à l''application'
select public.verifier(
  not has_function_privilege('authenticated', 'public.deverser_provinces_bubble()', 'execute'),
  'authenticated ne peut pas l''exécuter');

\echo ''
\echo 'Tous les contrôles de 0081_provinces_au_pluriel.sql sont passés.'
