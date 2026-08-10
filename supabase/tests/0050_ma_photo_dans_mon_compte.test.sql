-- Tests de la migration 0050_ma_photo_dans_mon_compte.sql.
--
--   · Anna  référente — celle qui gère sa photo
--   · Bilal référent  de la même loge — sa fiche ne doit jamais bouger
--   · Carla compte sans fiche de référent

\set ON_ERROR_STOP on
\o /dev/null

\set anna  'aaaaaaaa-5000-0000-0000-000000000171'
\set bilal 'aaaaaaaa-5000-0000-0000-000000000172'
\set carla 'aaaaaaaa-5000-0000-0000-000000000173'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'anna',  'anna0050@example.org',  '{"role":"referent"}'),
  (:'bilal', 'bilal0050@example.org', '{"role":"referent"}'),
  (:'carla', 'carla0050@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0050-tours', 'Tours — 0050')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0050-anna',  :'anna',  'Anna',  'A', 'anna0050@example.org',
   (select id from public.loge where bubble_id = 'loge-0050-tours')),
  ('ref-0050-bilal', :'bilal', 'Bilal', 'B', 'bilal0050@example.org',
   (select id from public.loge where bubble_id = 'loge-0050-tours'))
on conflict do nothing;

-- Bilal vient de Bubble : il porte l'adresse d'origine et la copie.
update public.referent
   set photo_url    = 'https://s3.amazonaws.com/appforest_uf/bilal-0050.jpg',
       photo_chemin = 'referent/photo/bilal-0050.jpg'
 where bubble_id = 'ref-0050-bilal';

select id as r_anna  from public.referent where bubble_id = 'ref-0050-anna'  \gset
select id as r_bilal from public.referent where bubble_id = 'ref-0050-bilal' \gset

-- ---------------------------------------------------------------------------
\echo '— je depose ma photo, sans que personne ait a le faire pour moi'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000171"}';

  select public.verifier(
    public.poser_ma_photo('referent/photo/' || :'r_anna' || '.jpg') is null,
    'aucun fichier precedent a effacer');

  select public.verifier(
    (select photo_chemin from public.referent where id = :'r_anna'::uuid)
      = 'referent/photo/' || :'r_anna' || '.jpg',
    'le chemin est range sur ma fiche');
commit;

-- ---------------------------------------------------------------------------
\echo '— la remplacer rend le chemin de celle qu on remplace'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000171"}';

  select public.verifier(
    public.poser_ma_photo('referent/photo/' || :'r_anna' || '.png')
      = 'referent/photo/' || :'r_anna' || '.jpg',
    'la fonction rend le chemin remplace');
commit;

-- ---------------------------------------------------------------------------
\echo '— je ne peux pas designer la fiche d un autre, ni son fichier'
-- ---------------------------------------------------------------------------
do $$
declare
  bilal uuid := (select id from public.referent where bubble_id = 'ref-0050-bilal');
  interdits text[];
  mauvais text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000171"}';

  interdits := array[
    -- Le cas qui justifie la contrainte étroite : m'attribuer le visage d'un
    -- collègue de ma loge en désignant son fichier.
    'referent/photo/' || bilal::text || '.jpg',
    'referent/photo/bilal-0050.jpg',
    -- Sortir du dossier des photos.
    'candidat/cv/dossier-secret.pdf',
    'referent/photo/../../candidat/cv/dossier-secret.pdf',
    -- Un format qui n'est pas une image.
    'referent/photo/' || (select id from public.referent
                           where bubble_id = 'ref-0050-anna')::text || '.svg',
    -- Le bon nom, mais sans format.
    'referent/photo/' || (select id from public.referent
                           where bubble_id = 'ref-0050-anna')::text
  ];

  foreach mauvais in array interdits loop
    begin
      perform public.poser_ma_photo(mauvais);
      raise exception 'ÉCHEC — le chemin « % » a été accepté', mauvais;
    exception when check_violation then
      raise notice '  ok — refusé : %', mauvais;
    end;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et la fiche du collegue n a pas bouge'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select photo_chemin from public.referent where id = :'r_bilal'::uuid)
    = 'referent/photo/bilal-0050.jpg',
  'la photo de Bilal est intacte');

select public.verifier(
  (select photo_chemin from public.referent where id = :'r_anna'::uuid)
    = 'referent/photo/' || :'r_anna' || '.png',
  'et la mienne est restee celle que j avais posee');

-- ---------------------------------------------------------------------------
\echo '— je retire ma photo, et recupere le fichier a effacer'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000171"}';

  select public.verifier(
    public.retirer_ma_photo() = 'referent/photo/' || :'r_anna' || '.png',
    'la fonction rend le chemin du fichier a effacer');

  select public.verifier(
    (select photo_chemin from public.referent where id = :'r_anna'::uuid) is null,
    'ma fiche ne designe plus aucune photo');
commit;

-- ---------------------------------------------------------------------------
\echo '— retirer deux fois de suite ne provoque rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000171"}';
  select public.verifier(
    public.retirer_ma_photo() is null,
    'rien a effacer la seconde fois');
commit;

-- ---------------------------------------------------------------------------
\echo '— retirer n a touche que ma fiche'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select photo_chemin from public.referent where id = :'r_bilal'::uuid)
    = 'referent/photo/bilal-0050.jpg',
  'celle de Bilal est toujours la');

-- ---------------------------------------------------------------------------
\echo '— un compte sans fiche de referent n a pas de photo a gerer'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000173"}';

  begin
    perform public.poser_ma_photo('referent/photo/x.jpg');
    raise exception 'ÉCHEC — un compte sans fiche a pu poser une photo';
  exception when no_data_found then
    raise notice '  ok — aucune fiche, aucun depot';
  end;

  begin
    perform public.retirer_ma_photo();
    raise exception 'ÉCHEC — un compte sans fiche a pu retirer une photo';
  exception when no_data_found then
    raise notice '  ok — aucune fiche, aucun retrait';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une photo reprise de Bubble se retire aussi, adresse comprise'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5000-0000-0000-000000000172"}';
  select public.retirer_ma_photo();
commit;

-- Le contrôle qui donne son sens au précédent : c'est la requête de
-- `outils/rapatrier-fichiers.mjs`. Si la fiche y répondait encore, la reprise
-- du 5 décembre remettrait le visage en place.
select public.verifier(
  (select count(*) from public.referent
    where id = :'r_bilal'::uuid
      and photo_url is not null
      and photo_chemin is null) = 0,
  'la prochaine reprise Bubble ne la retelechargera pas');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.poser_ma_photo('referent/photo/x.jpg');
    raise exception 'ÉCHEC — anon a pu poser une photo';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne depose pas';
  end;

  begin
    perform public.retirer_ma_photo();
    raise exception 'ÉCHEC — anon a pu retirer une photo';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne retire pas';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0050_ma_photo_dans_mon_compte.sql sont passés.'
