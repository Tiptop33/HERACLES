-- Tests de la migration 0080_provinces.sql.
--
-- Ce qu'on éprouve :
--   * la table porte le nom de la province, l'adresse d'origine de son
--     écusson et son chemin de rapatriement (noms du 13 novembre 2026) ;
--   * le dépliage de `bubble_brut` reconnaît le nom et l'image sous des clés
--     qu'on ne connaît pas d'avance, et dit ce qu'il n'a pas reconnu ;
--   * il se rejoue sans doubler, garde une image déjà rapatriée, et — depuis
--     0096 — ne la remplace pas quand l'adresse change chez Bubble ;
--   * les loges rejoignent leur province ; une province absente laisse la loge
--     sans lien, et le compte le dit ;
--   * l'application ne peut pas lancer le dépliage ;
--   * la lecture est ouverte aux référents et à l'administration, et à eux
--     seuls : ni un compte chercheur, ni une personne non connectée ;
--     personne n'écrit directement dans la table (les gestes de
--     l'administration passent par les fonctions de 0096) ;
--   * la vue fichiers_a_rapatrier compte l'image des provinces.
--
-- Données fabriquées : aucune province réelle, aucune adresse réelle.

\set ON_ERROR_STOP on
\o /dev/null

\set admin     'eeeeeeee-0080-0000-0000-00000000000a'
\set referent  'eeeeeeee-0080-0000-0000-00000000000b'
\set chercheur 'eeeeeeee-0080-0000-0000-00000000000c'

-- --- Fixtures --------------------------------------------------------------
-- Jouées comme postgres : la RLS ne s'applique pas ici, on prépare le
-- terrain. Les contrôles d'accès viennent ensuite, en « devenant » l'un ou
-- l'autre.
--
-- Le profil naît avec le compte (déclencheur de 0001), au rôle demandé à
-- l'inscription — jamais « admin », qui ne se choisit pas : on le promeut
-- ensuite, comme le fait le test 0009.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'admin',     'admin-0080@example.org',     '{"role":"referent"}'),
  (:'referent',  'referent-0080@example.org',  '{"role":"referent"}'),
  (:'chercheur', 'chercheur-0080@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;

update public.profil set role = 'admin' where id = :'admin';

-- Trois provinces, telles que la reprise en brut les dépose, sous trois
-- formes : on ne sait pas quelles clés porte le vrai type `PROVINCE`.
--   0080 : « NOM PROVINCE » et une image du CDN, plus une liste (ignorée) ;
--   0081 : « Name » et une image de l'ancien dépôt, plus un lien qui n'est
--          pas un fichier Bubble — il ne doit pas être pris pour l'image ;
--   0082 : ni nom ni image reconnaissables — le compte doit le dire.
insert into public.bubble_brut (type_bubble, bubble_id, donnees) values
  ('province', 'prov-b-0080', $j${
     "_id": "prov-b-0080",
     "NOM PROVINCE": "Province de l'Essai",
     "Image": "//essai0080.cdn.bubble.io/f1/blason.png",
     "LOGES": ["loge-b-0080"],
     "Created By": "admin_user_essai",
     "Created Date": "2024-01-15T09:00:00.000Z",
     "Modified Date": "2024-02-01T09:00:00.000Z"
   }$j$::jsonb),
  ('province', 'prov-b-0081', $j${
     "_id": "prov-b-0081",
     "Name": "Autre Province",
     "Lien site": "https://exemple.test/province",
     "LOGO": "https://s3.amazonaws.com/appforest_uf/f2/logo.jpg"
   }$j$::jsonb),
  ('province', 'prov-b-0082', $j${
     "_id": "prov-b-0082",
     "Description": "une fiche que la détection ne sait pas lire"
   }$j$::jsonb)
on conflict (type_bubble, bubble_id) do update set donnees = excluded.donnees;

insert into public.loge (bubble_id, nom, province_bubble_id) values
  ('loge-b-0080', 'Loge de l''Essai',   'prov-b-0080'),
  ('loge-b-0081', 'Loge sans province', 'prov-b-inconnue')
on conflict (bubble_id) do nothing;

-- --- Structure -------------------------------------------------------------
\echo '— la table porte ce que la carte affiche et ce que la reprise rapatrie'
select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'provinces'
      and column_name in ('bubble_id', 'nom_de_la_province', 'ecusson_provincial_url',
                          'ecusson_provincial')) = 4,
  'bubble_id, nom_de_la_province, ecusson_provincial_url et ecusson_provincial sont là');

select public.verifier(
  to_regclass('public.province') is null,
  'l''ancien nom, au singulier, n''existe plus');

select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'loge'
      and column_name = 'province_id') = 1,
  'la loge a gagné une clé vers sa province');

-- --- Le dépliage -----------------------------------------------------------
\echo '— le dépliage écrit les trois provinces, et dit ce qu''il n''a pas su lire'
create temporary table premier_passage as
  select * from public.deverser_provinces_bubble();

select public.verifier(
  (select deversees = 3 and creees = 3 from premier_passage),
  'trois provinces déversées, trois créées');
select public.verifier(
  (select sans_nom = 1 and sans_image = 1 from premier_passage),
  'une province sans nom ni image reconnaissables — et le compte le dit');
select public.verifier(
  (select loges_orphelines >= 1 from premier_passage),
  'une loge désigne une province que la reprise n''a pas apportée');

\echo '— le nom et l''image sont reconnus sous des clés différentes'
select public.verifier(
  (select nom_de_la_province = 'Province de l''Essai'
      and ecusson_provincial_url = '//essai0080.cdn.bubble.io/f1/blason.png'
     from public.provinces where bubble_id = 'prov-b-0080'),
  '« NOM PROVINCE » et une image du CDN de Bubble');
select public.verifier(
  (select nom_de_la_province = 'Autre Province'
      and ecusson_provincial_url = 'https://s3.amazonaws.com/appforest_uf/f2/logo.jpg'
     from public.provinces where bubble_id = 'prov-b-0081'),
  '« Name » et une image de l''ancien dépôt — le lien du site n''est pas pris pour l''image');
select public.verifier(
  (select cree_le = '2024-01-15T09:00:00Z'::timestamptz
      and cree_par_bubble_id = 'admin_user_essai'
     from public.provinces where bubble_id = 'prov-b-0080'),
  'la date de création et l''auteur Bubble sont conservés');

\echo '— la loge rejoint sa province'
select public.verifier(
  (select p.nom_de_la_province
     from public.loge l
     join public.provinces p on p.id = l.province_id
    where l.bubble_id = 'loge-b-0080') = 'Province de l''Essai',
  'la loge trouve le nom de sa province par la clé étrangère');
select public.verifier(
  (select province_id is null from public.loge where bubble_id = 'loge-b-0081'),
  'la loge dont la province manque reste sans lien, et garde son identifiant Bubble');

\echo '— rejouer ne double rien, et garde une image déjà rapatriée'
update public.provinces set ecusson_provincial = 'province/image/prov-b-0080/blason.png'
 where bubble_id = 'prov-b-0080';

select public.verifier(
  (select deversees = 0 and creees = 0 from public.deverser_provinces_bubble()),
  'second passage : rien de créé, rien de remplacé (0096 : on ne remplit que le vide)');
select public.verifier(
  (select count(*) from public.provinces where bubble_id like 'prov-b-008%') = 3,
  'toujours trois provinces');
select public.verifier(
  (select ecusson_provincial = 'province/image/prov-b-0080/blason.png'
     from public.provinces where bubble_id = 'prov-b-0080'),
  'l''image rapatriée garde son chemin');

-- Jusqu'au 13 novembre 2026, une image changée chez Bubble remplaçait la
-- nôtre. Depuis 0096, HERACLES fait foi : l'administration a pu la déposer.
\echo '— une image changée chez Bubble ne remplace pas celle qu''on a (0096)'
update public.bubble_brut
   set donnees = jsonb_set(donnees, '{Image}', '"//essai0080.cdn.bubble.io/f9/nouveau.png"')
 where type_bubble = 'province' and bubble_id = 'prov-b-0080';
select * from public.deverser_provinces_bubble();

select public.verifier(
  (select ecusson_provincial_url = '//essai0080.cdn.bubble.io/f1/blason.png'
      and ecusson_provincial = 'province/image/prov-b-0080/blason.png'
     from public.provinces where bubble_id = 'prov-b-0080'),
  'l''adresse et le chemin connus restent');

\echo '— l''application ne lance pas le dépliage'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0080-0000-0000-00000000000a"}', true);
  begin
    perform public.deverser_provinces_bubble();
    raise exception 'ÉCHEC — le dépliage a été lancé depuis une session';
  exception when insufficient_privilege then
    raise notice '  ok — même un administrateur ne le lance pas : c''est la reprise qui l''appelle';
  end;
end
$$;

-- --- Lecture : référents et administration, et eux seuls ------------------
\echo '— un référent lit les provinces : c''est son écran'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0080-0000-0000-00000000000b"}';
  select public.verifier(
    (select count(*) from public.provinces where bubble_id like 'prov-b-008%') = 3,
    'il voit les trois provinces');
commit;

\echo '— un administrateur aussi'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0080-0000-0000-00000000000a"}';
  select public.verifier(
    (select count(*) from public.provinces where bubble_id like 'prov-b-008%') = 3,
    'il voit les trois provinces');
commit;

\echo '— un compte chercheur, non : l''écran n''est pas le sien'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0080-0000-0000-00000000000c"}';
  select public.verifier(
    (select count(*) from public.provinces) = 0,
    'aucune province ne lui est visible');
  select public.verifier(
    not (select public.est_referent_ou_admin()),
    'est_referent_ou_admin le dit');
commit;

\echo '— une personne non connectée ne voit rien'
select public.verifier(
  public.refuse('anon', 'provinces'),
  'la table n''est pas adressable sans être connecté');

-- --- Aucune écriture depuis l'application ----------------------------------
-- Personne n'écrit directement dans la table : les provinces arrivent par la
-- reprise, et les gestes de l'administration passent par les fonctions de 0096.
\echo '— un référent ne peut ni créer, ni corriger, ni retirer une province'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0080-0000-0000-00000000000b"}', true);
  begin
    insert into public.provinces (nom_de_la_province) values ('Province pirate');
    raise exception 'ÉCHEC — un référent a créé une province';
  exception when insufficient_privilege then
    raise notice '  ok — créer est refusé';
  end;
  begin
    update public.provinces set nom_de_la_province = 'Renommée' where bubble_id = 'prov-b-0080';
    raise exception 'ÉCHEC — un référent a renommé une province';
  exception when insufficient_privilege then
    raise notice '  ok — corriger est refusé';
  end;
  begin
    delete from public.provinces where bubble_id = 'prov-b-0080';
    raise exception 'ÉCHEC — un référent a retiré une province';
  exception when insufficient_privilege then
    raise notice '  ok — retirer est refusé';
  end;
end
$$;

\echo '— un administrateur non plus, pas directement : il passe par les fonctions de 0096'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0080-0000-0000-00000000000a"}', true);
  begin
    insert into public.provinces (nom_de_la_province) values ('Province administrée');
    raise exception 'ÉCHEC — une province a été créée depuis l''application';
  exception when insufficient_privilege then
    raise notice '  ok — l''écriture directe reste fermée, même à l''administration';
  end;
end
$$;

-- --- Suivi du rapatriement -------------------------------------------------
\echo '— la vue des fichiers à rapatrier compte l''écusson des provinces'
select public.verifier(
  (select total >= 2 and restants >= 1 from public.fichiers_a_rapatrier
    where source = 'provinces' and genre = 'ecusson provincial'),
  'les écussons de province attendent d''être rapatriés');

\echo ''
\echo 'Tous les contrôles de 0080_provinces.sql sont passés.'
