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
--   * depuis 0096, un écusson changé chez Bubble ne remplace plus le nôtre :
--     HERACLES fait foi.
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
  (select nom_de_la_province = 'Province d''Essai Nord'
      and ecusson_provincial_url = '//essai0081.cdn.bubble.io/f1/ecusson-nord.png'
      and cree_le = '2023-03-01T10:00:00Z'::timestamptz
     from public.provinces where bubble_id = 'prov-p-0081a'),
  '« Nom » et « Ecusson » sont lus, la date de création aussi');

select public.verifier(
  (select ecusson_provincial_url = '//s3.amazonaws.com/appforest_uf/f3/ecusson-sud.png'
     from public.provinces where bubble_id = 'prov-p-0081b'),
  '« Ecusson » passe devant une autre adresse de fichier Bubble');

select public.verifier(
  (select p.nom_de_la_province from public.loge l join public.provinces p on p.id = l.province_id
    where l.bubble_id = 'loge-p-0081') = 'Province d''Essai Nord',
  'la loge rejoint sa province');

-- --- Une reprise sans jeton n'efface rien ----------------------------------
\echo '— une reprise sans jeton n''efface ni le nom, ni l''écusson, ni son chemin'
update public.provinces set ecusson_provincial = 'province/image/prov-p-0081a/ecusson-nord.png'
 where bubble_id = 'prov-p-0081a';

-- Ce que Bubble rend sans jeton : l'identifiant, et rien d'autre.
update public.bubble_brut set donnees = jsonb_build_object('_id', bubble_id)
 where type_bubble = 'provinces' and bubble_id in ('prov-p-0081a', 'prov-p-0081b');

select * from public.deverser_provinces_bubble();

select public.verifier(
  (select nom_de_la_province = 'Province d''Essai Nord'
      and ecusson_provincial_url = '//essai0081.cdn.bubble.io/f1/ecusson-nord.png'
      and ecusson_provincial = 'province/image/prov-p-0081a/ecusson-nord.png'
     from public.provinces where bubble_id = 'prov-p-0081a'),
  'nom, écusson et chemin rapatrié sont gardés');
select public.verifier(
  (select cree_le = '2023-03-01T10:00:00Z'::timestamptz
      and cree_par_bubble_id = 'admin_user_essai'
     from public.provinces where bubble_id = 'prov-p-0081a'),
  'la date de création et l''auteur aussi');
select public.verifier(
  (select nom_de_la_province = 'Province d''Essai Sud' from public.provinces where bubble_id = 'prov-p-0081b'),
  'la seconde province garde son nom');
select public.verifier(
  (select count(*) from public.provinces where bubble_id like 'prov-p-0081_') = 2,
  'et rien n''a été doublé');

-- --- Un écusson changé chez Bubble ne remplace plus le nôtre (0096) ---------
-- Jusqu'au 13 novembre 2026, il était repris et rapatrié de nouveau. Depuis,
-- HERACLES fait foi : l'administration a pu déposer le sien.
\echo '— un écusson changé chez Bubble ne remplace pas celui qu''on a'
update public.bubble_brut set donnees = $j${
     "_id": "prov-p-0081a",
     "Nom": "Province d'Essai Nord",
     "Ecusson": "//essai0081.cdn.bubble.io/f9/ecusson-nord-2027.png"
   }$j$::jsonb
 where type_bubble = 'provinces' and bubble_id = 'prov-p-0081a';

select * from public.deverser_provinces_bubble();

select public.verifier(
  (select ecusson_provincial_url = '//essai0081.cdn.bubble.io/f1/ecusson-nord.png'
      and ecusson_provincial = 'province/image/prov-p-0081a/ecusson-nord.png'
     from public.provinces where bubble_id = 'prov-p-0081a'),
  'l''adresse et le chemin connus restent');

\echo '— et le dépliage reste fermé à l''application'
select public.verifier(
  not has_function_privilege('authenticated', 'public.deverser_provinces_bubble()', 'execute'),
  'authenticated ne peut pas l''exécuter');

\echo ''
\echo 'Tous les contrôles de 0081_provinces_au_pluriel.sql sont passés.'
