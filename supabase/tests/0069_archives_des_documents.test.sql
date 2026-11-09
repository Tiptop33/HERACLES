-- Tests de la migration 0069_archives_des_documents.sql.
--
--   · Anne   Secrétaire à Lyon-0069   — archive, efface
--   · Paul   sans titre à Lyon-0069   — archive, n'efface pas
--   · Victor Vénérable  à Caen-0069   — efface, mais pas chez Anne
--   · Iris   administratrice, sans loge — efface partout

\set ON_ERROR_STOP on
\o /dev/null

\set anne   'eeeeeeee-6900-0000-0000-000000000001'
\set paul   'eeeeeeee-6900-0000-0000-000000000002'
\set victor 'eeeeeeee-6900-0000-0000-000000000003'
\set iris   'eeeeeeee-6900-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'anne',   'anne0069@example.org',   '{"role":"referent"}'),
  (:'paul',   'paul0069@example.org',   '{"role":"referent"}'),
  (:'victor', 'victor0069@example.org', '{"role":"referent"}'),
  (:'iris',   'iris0069@example.org',   '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'iris';

insert into public.loge (bubble_id, nom) values
  ('loge-0069-lyon', 'Lyon — 0069'),
  ('loge-0069-caen', 'Caen — 0069')
on conflict do nothing;

select id as l_lyon from public.loge where bubble_id = 'loge-0069-lyon' \gset
select id as l_caen from public.loge where bubble_id = 'loge-0069-caen' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, loge_id) values
  ('ref-0069-anne',   :'anne',   'ARNAUD', 'Anne',   'Secrétaire', :'l_lyon'::uuid),
  ('ref-0069-paul',   :'paul',   'PERRIN', 'Paul',   null,         :'l_lyon'::uuid),
  ('ref-0069-victor', :'victor', 'VIDAL',  'Victor', 'Vénérable Maître', :'l_caen'::uuid)
on conflict do nothing;

insert into public.reunion (loge_id, tenue_le) values
  (:'l_lyon'::uuid, date '2026-10-28'),
  (:'l_caen'::uuid, date '2026-10-28');

select id as r_lyon from public.reunion where loge_id = :'l_lyon'::uuid \gset
select id as r_caen from public.reunion where loge_id = :'l_caen'::uuid \gset

insert into public.candidat (numero, nom, prenom, loge_id) values
  (6901, 'BLANC', 'Chloé', :'l_lyon'::uuid),
  (6902, 'DURAND', 'Émile', :'l_caen'::uuid);

select id as c_lyon from public.candidat where numero = 6901 \gset
select id as c_caen from public.candidat where numero = 6902 \gset

-- Deux PDF repris de Bubble, à Lyon : un compte rendu, et un CV anonyme que
-- l'accueil ne montre pas.
insert into public.document (bubble_id, nom, type_document, lien_url, loge_id, cree_le) values
  ('pdf-0069-cr',  'Compte-rendu du Mercredi 14 Octobre 2026', 'compte-rendu',
   'https://example.org/cr.pdf', :'l_lyon'::uuid, timestamptz '2026-10-14 20:00+02'),
  ('pdf-0069-cva', 'CV anonyme 6901', 'cva',
   'https://example.org/cva.pdf', :'l_lyon'::uuid, timestamptz '2026-10-14 20:00+02');

-- Rejouer la migration recopie la date de création dans `date_document`.
update public.document
   set date_document = (cree_le at time zone 'Europe/Paris')::date
 where bubble_id like 'pdf-0069-%';

select id as d_bubble from public.document where bubble_id = 'pdf-0069-cr' \gset

\set f1 '/11111111-0000-0000-0000-000000000001.pdf'
\set f2 '/11111111-0000-0000-0000-000000000002.pdf'
\set f3 '/11111111-0000-0000-0000-000000000003.pdf'
\set f4 '/11111111-0000-0000-0000-000000000004.pdf'

-- ---------------------------------------------------------------------------
\echo '— toute la loge archive, et le meme nom remplace l exemplaire'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000002"}';

  select public.verifier(
    public.archiver_un_document(:'r_lyon'::uuid, 'compte-rendu', 'Compte-Rendu du 28-10-2026',
      'archives/' || :'l_lyon' || :'f1') is null,
    'un referent sans titre archive le compte rendu de sa reunion');
  select public.verifier(
    public.archiver_un_document(:'r_lyon'::uuid, 'compte-rendu', 'Compte-Rendu du 28-10-2026',
      'archives/' || :'l_lyon' || :'f2') = 'archives/' || :'l_lyon' || :'f1',
    'le redemander remplace l exemplaire, et rend le fichier a jeter');
  select public.verifier(
    public.archiver_un_document(:'r_lyon'::uuid, 'compte-rendu', 'Compte-Rendu du 28-10-2026',
      'archives/' || :'l_lyon' || :'f2') is null,
    'le meme fichier rendu deux fois n est pas un ancien a jeter');
  select public.verifier(
    public.archiver_un_document(:'r_lyon'::uuid, 'affiche', 'Affiche du 28-10-2026',
      'archives/' || :'l_lyon' || :'f3') is null,
    'l affiche s archive aussi');
  select public.verifier(
    public.archiver_un_document(:'r_lyon'::uuid, 'affichette', '6901 du jour',
      'archives/' || :'l_lyon' || :'f4', :'c_lyon'::uuid) is null,
    'et l affichette, avec son dossier');
commit;

select public.verifier(
  (select count(*) from public.document
    where loge_id = :'l_lyon'::uuid and nom = 'Compte-Rendu du 28-10-2026') = 1,
  'un seul exemplaire par nom');
select public.verifier(
  (select date_document from public.document
    where loge_id = :'l_lyon'::uuid and type_document = 'compte-rendu' and bubble_id is null)
    = date '2026-10-28',
  'le compte rendu est date du jour de la reunion');
select public.verifier(
  (select reunion_id from public.document
    where loge_id = :'l_lyon'::uuid and type_document = 'affiche') = :'r_lyon'::uuid,
  'et rattache a sa reunion');
select public.verifier(
  (select date_document from public.document where type_document = 'affichette'
      and loge_id = :'l_lyon'::uuid)
    = (now() at time zone 'Europe/Paris')::date,
  'l affichette est datee du jour ou elle est tiree');

-- ---------------------------------------------------------------------------
\echo '— ce qui ne s archive pas'
-- ---------------------------------------------------------------------------
do $$
declare
  essais text[][] := array[
    -- [reunion, sorte, chemin, candidat, intitule]
    array['caen', 'compte-rendu', 'caen', '', 'la reunion d une autre loge'],
    array['lyon', 'cva',          'lyon', '', 'un type de document inconnu'],
    array['lyon', 'compte-rendu', 'caen', '', 'un fichier range pour une autre loge'],
    array['lyon', 'compte-rendu', 'cv',   '', 'le CV d un candidat'],
    array['lyon', 'compte-rendu', '../',  '', 'un chemin qui remonte'],
    array['lyon', 'affichette',   'lyon', 'caen', 'l affichette d un dossier d une autre loge'],
    array['lyon', 'affichette',   'lyon', '',     'une affichette sans dossier']
  ];
  e text[];
  -- Lus AVANT de changer de rôle : `reunion` est fermée aux sessions, et un
  -- refus de lecture ici passerait pour le refus qu'on veut éprouver.
  l_lyon uuid := (select id from public.loge where bubble_id = 'loge-0069-lyon');
  l_caen uuid := (select id from public.loge where bubble_id = 'loge-0069-caen');
  r_lyon uuid := (select r.id from public.reunion r join public.loge l on l.id = r.loge_id
                   where l.bubble_id = 'loge-0069-lyon');
  r_caen uuid := (select r.id from public.reunion r join public.loge l on l.id = r.loge_id
                   where l.bubble_id = 'loge-0069-caen');
  c_caen uuid := (select id from public.candidat where numero = 6902);
  chemin text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-6900-0000-0000-000000000002"}', true);

  foreach e slice 1 in array essais loop
    chemin := case e[3]
      when 'lyon' then 'archives/' || l_lyon || '/22222222-0000-0000-0000-000000000001.pdf'
      when 'caen' then 'archives/' || l_caen || '/22222222-0000-0000-0000-000000000001.pdf'
      when 'cv'   then 'candidat/cv/6901.pdf'
      else 'archives/' || l_lyon || '/../candidat/cv/6901.pdf'
    end;
    begin
      perform public.archiver_un_document(
        case e[1] when 'lyon' then r_lyon else r_caen end,
        e[2], 'Essai', chemin,
        case e[4] when 'caen' then c_caen end);
      raise exception 'ÉCHEC — accepte : %', e[5];
    exception
      when insufficient_privilege or invalid_parameter_value then
        raise notice '  ok — refuse : %', e[5];
    end;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— l accueil : la periode, les trois types, la loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000002"}';

  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)) = 4,
    'Paul voit le compte rendu, l affiche, l affichette et le compte rendu de Bubble');
  select public.verifier(
    not exists (select 1 from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)
                 where type_document not in ('compte-rendu', 'affiche', 'affichette')),
    'mais pas le CV anonyme repris de Bubble');
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '2026-10-15', current_date + 365)
      where type_document = 'compte-rendu') = 1,
    'la periode ecarte ce qui la precede');
  select public.verifier(
    (select nom from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)
      where type_document = 'compte-rendu' limit 1) = 'Compte-Rendu du 28-10-2026',
    'le plus recent en tete');
  select public.verifier(
    not exists (select 1 from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)
                 where effacable),
    'et aucune corbeille pour qui n a pas le titre');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000001"}';
  select public.verifier(
    (select bool_and(effacable)
       from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)),
    'la Secretaire a la corbeille sur chaque ligne de sa loge');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000003"}';
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)) = 0,
    'le Venerable de Caen ne voit rien de Lyon');
commit;

-- ---------------------------------------------------------------------------
\echo '— effacer : le titre, puis la loge'
-- ---------------------------------------------------------------------------
select id as d_cr from public.document
 where loge_id = :'l_lyon'::uuid and nom = 'Compte-Rendu du 28-10-2026' \gset

do $$
declare
  cible uuid := (select id from public.document where nom = 'Compte-Rendu du 28-10-2026');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-6900-0000-0000-000000000002"}', true);
  begin
    perform public.effacer_un_document(cible);
    raise exception 'ÉCHEC — un referent sans titre a efface un PDF';
  exception when insufficient_privilege then
    raise notice '  ok — un referent sans titre n efface pas';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000003"}';
  select public.verifier(
    (select issue from public.effacer_un_document(:'d_cr'::uuid)) = 'introuvable',
    'le Venerable de Caen n efface pas un PDF de Lyon');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000001"}';
  select public.verifier(
    (select chemin from public.effacer_un_document(:'d_cr'::uuid))
      = 'archives/' || :'l_lyon' || :'f2',
    'la Secretaire efface, et recoit le fichier a retirer du seau');
  select public.verifier(
    (select issue from public.effacer_un_document(:'d_cr'::uuid)) = 'introuvable',
    'un PDF deja efface est introuvable');
  select public.verifier(
    (select issue from public.effacer_un_document(:'d_bubble'::uuid)) = 'efface',
    'un PDF de Bubble s efface aussi');
commit;

select public.verifier(
  not exists (select 1 from public.document where id = :'d_cr'::uuid),
  'le PDF d HERACLES a quitte la base');
select public.verifier(
  (select efface_le is not null from public.document where id = :'d_bubble'::uuid),
  'celui de Bubble reste, marque efface');

-- La reprise finale repasse sur la ligne : l'upsert ne touche pas à `efface_le`.
insert into public.document (bubble_id, nom, type_document, lien_url, loge_id)
values ('pdf-0069-cr', 'Compte-rendu du Mercredi 14 Octobre 2026', 'compte-rendu',
        'https://example.org/cr.pdf', :'l_lyon'::uuid)
on conflict (bubble_id) do update set nom = excluded.nom, lien_url = excluded.lien_url;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.document where id = :'d_bubble'::uuid) = 0,
    'un PDF efface ne se lit plus, meme repris');
  select public.verifier(
    (select count(*) from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)
      where type_document = 'compte-rendu') = 0,
    'et ne revient pas a l accueil');
commit;

select public.verifier(
  (select restants from public.fichiers_a_rapatrier where source = 'document')
    = (select count(*) from public.document
        where lien_url is not null and chemin is null and efface_le is null),
  'le rapatriement ne compte plus le PDF efface');

-- ---------------------------------------------------------------------------
\echo '— l administratrice efface partout'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000003"}';
  select public.archiver_un_document(:'r_caen'::uuid, 'affiche', 'Affiche du 28-10-2026',
    'archives/' || :'l_caen' || :'f1');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000004"}';
  select public.verifier(
    (select bool_and(effacable)
       from public.documents_de_l_accueil(date '2026-09-01', current_date + 365)),
    'l administratrice a la corbeille sur toutes les lignes, de toutes les loges');
  select public.verifier(
    (select issue from public.effacer_un_document(
       (select id from public.document
         where loge_id = :'l_caen'::uuid and nom = 'Affiche du 28-10-2026'))) = 'efface',
    'et efface l affiche de Caen');
commit;

-- ---------------------------------------------------------------------------
\echo '— le dossier supprime emporte ses affichettes'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-6900-0000-0000-000000000001"}';
  select public.verifier(
    (select ('archives/' || :'l_lyon' || :'f4') = any (fichiers)
       from public.supprimer_un_candidat(:'c_lyon'::uuid)),
    'la suppression rend le fichier de l affichette, a retirer du seau');
commit;

select public.verifier(
  not exists (select 1 from public.document where type_document = 'affichette'
                and loge_id = :'l_lyon'::uuid),
  'et l affichette a quitte la base avec le dossier');

-- ---------------------------------------------------------------------------
\echo '— la table ne s ecrit pas en direct'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-6900-0000-0000-000000000001"}', true);
  begin
    insert into public.document (nom, type_document, chemin)
    values ('Essai', 'compte-rendu', 'candidat/cv/6901.pdf');
    raise exception 'ÉCHEC — une session ecrit dans document en direct';
  exception when insufficient_privilege then
    raise notice '  ok — tout passe par les fonctions';
  end;
end
$$;

\o
\echo '0069 — les archives des documents : tout est vert.'
