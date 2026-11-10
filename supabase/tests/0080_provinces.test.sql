-- Tests de la migration 0080_provinces.sql.
--
-- Ce qu'on éprouve :
--   * la table porte le nom, l'image d'origine et son chemin de rapatriement ;
--   * le dépliage de `bubble_brut` reconnaît le nom et l'image sous des clés
--     qu'on ne connaît pas d'avance, et dit ce qu'il n'a pas reconnu ;
--   * il se rejoue sans doubler, garde une image déjà rapatriée, et oublie son
--     chemin quand l'adresse change chez Bubble ;
--   * les loges rejoignent leur province ; une province absente laisse la loge
--     sans lien, et le compte le dit ;
--   * l'application ne peut pas lancer le dépliage ;
--   * la lecture est ouverte aux référents et à l'administration, et à eux
--     seuls : ni un compte chercheur, ni une personne non connectée ;
--     personne n'écrit depuis l'application ;
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
    where table_schema = 'public' and table_name = 'province'
      and column_name in ('bubble_id', 'nom', 'image_url', 'image_chemin')) = 4,
  'bubble_id, nom, image_url et image_chemin sont là');

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
  (select nom = 'Province de l''Essai'
      and image_url = '//essai0080.cdn.bubble.io/f1/blason.png'
     from public.province where bubble_id = 'prov-b-0080'),
  '« NOM PROVINCE » et une image du CDN de Bubble');
select public.verifier(
  (select nom = 'Autre Province'
      and image_url = 'https://s3.amazonaws.com/appforest_uf/f2/logo.jpg'
     from public.province where bubble_id = 'prov-b-0081'),
  '« Name » et une image de l''ancien dépôt — le lien du site n''est pas pris pour l''image');
select public.verifier(
  (select cree_le = '2024-01-15T09:00:00Z'::timestamptz
      and cree_par_bubble_id = 'admin_user_essai'
     from public.province where bubble_id = 'prov-b-0080'),
  'la date de création et l''auteur Bubble sont conservés');

\echo '— la loge rejoint sa province'
select public.verifier(
  (select p.nom
     from public.loge l
     join public.province p on p.id = l.province_id
    where l.bubble_id = 'loge-b-0080') = 'Province de l''Essai',
  'la loge trouve le nom de sa province par la clé étrangère');
select public.verifier(
  (select province_id is null from public.loge where bubble_id = 'loge-b-0081'),
  'la loge dont la province manque reste sans lien, et garde son identifiant Bubble');

\echo '— rejouer ne double rien, et garde une image déjà rapatriée'
update public.province set image_chemin = 'province/image/prov-b-0080/blason.png'
 where bubble_id = 'prov-b-0080';

select public.verifier(
  (select deversees = 3 and creees = 0 from public.deverser_provinces_bubble()),
  'second passage : trois mises à jour, aucune création');
select public.verifier(
  (select count(*) from public.province where bubble_id like 'prov-b-008%') = 3,
  'toujours trois provinces');
select public.verifier(
  (select image_chemin = 'province/image/prov-b-0080/blason.png'
     from public.province where bubble_id = 'prov-b-0080'),
  'l''image rapatriée garde son chemin');

\echo '— une image changée chez Bubble sera rapatriée de nouveau'
update public.bubble_brut
   set donnees = jsonb_set(donnees, '{Image}', '"//essai0080.cdn.bubble.io/f9/nouveau.png"')
 where type_bubble = 'province' and bubble_id = 'prov-b-0080';
select * from public.deverser_provinces_bubble();

select public.verifier(
  (select image_url = '//essai0080.cdn.bubble.io/f9/nouveau.png' and image_chemin is null
     from public.province where bubble_id = 'prov-b-0080'),
  'la nouvelle adresse est prise, l''ancien chemin oublié');

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
    (select count(*) from public.province where bubble_id like 'prov-b-008%') = 3,
    'il voit les trois provinces');
commit;

\echo '— un administrateur aussi'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0080-0000-0000-00000000000a"}';
  select public.verifier(
    (select count(*) from public.province where bubble_id like 'prov-b-008%') = 3,
    'il voit les trois provinces');
commit;

\echo '— un compte chercheur, non : l''écran n''est pas le sien'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0080-0000-0000-00000000000c"}';
  select public.verifier(
    (select count(*) from public.province) = 0,
    'aucune province ne lui est visible');
  select public.verifier(
    not (select public.est_referent_ou_admin()),
    'est_referent_ou_admin le dit');
commit;

\echo '— une personne non connectée ne voit rien'
select public.verifier(
  public.refuse('anon', 'province'),
  'la table n''est pas adressable sans être connecté');

-- --- Aucune écriture depuis l'application ----------------------------------
-- Le seul écran lit. Les provinces arrivent par la reprise : ni un référent ni
-- même un administrateur n'écrit ici.
\echo '— un référent ne peut ni créer, ni corriger, ni retirer une province'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0080-0000-0000-00000000000b"}', true);
  begin
    insert into public.province (nom) values ('Province pirate');
    raise exception 'ÉCHEC — un référent a créé une province';
  exception when insufficient_privilege then
    raise notice '  ok — créer est refusé';
  end;
  begin
    update public.province set nom = 'Renommée' where bubble_id = 'prov-b-0080';
    raise exception 'ÉCHEC — un référent a renommé une province';
  exception when insufficient_privilege then
    raise notice '  ok — corriger est refusé';
  end;
  begin
    delete from public.province where bubble_id = 'prov-b-0080';
    raise exception 'ÉCHEC — un référent a retiré une province';
  exception when insufficient_privilege then
    raise notice '  ok — retirer est refusé';
  end;
end
$$;

\echo '— un administrateur non plus : aucun écran ne le demande encore'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0080-0000-0000-00000000000a"}', true);
  begin
    insert into public.province (nom) values ('Province administrée');
    raise exception 'ÉCHEC — une province a été créée depuis l''application';
  exception when insufficient_privilege then
    raise notice '  ok — l''écriture viendra avec l''écran qui la justifie';
  end;
end
$$;

-- --- Suivi du rapatriement -------------------------------------------------
\echo '— la vue des fichiers à rapatrier compte l''image des provinces'
select public.verifier(
  (select total >= 2 and restants >= 2 from public.fichiers_a_rapatrier
    where source = 'province' and genre = 'image'),
  'les images de province attendent d''être rapatriées');

\echo ''
\echo 'Tous les contrôles de 0080_provinces.sql sont passés.'
