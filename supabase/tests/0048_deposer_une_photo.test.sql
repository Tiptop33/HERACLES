-- Tests de la migration 0048_deposer_une_photo.sql.
--
--   · Alix  administratrice — celle qui a le droit
--   · Bruno référent        — celui qui ne l'a pas
--   · Chloé référente       — la fiche que l'on photographie

\set ON_ERROR_STOP on
\o /dev/null

\set alix  'aaaaaaaa-4800-0000-0000-000000000151'
\set bruno 'aaaaaaaa-4800-0000-0000-000000000152'
\set chloe 'aaaaaaaa-4800-0000-0000-000000000153'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alix',  'alix0048@example.org',  '{"role":"referent"}'),
  (:'bruno', 'bruno0048@example.org', '{"role":"referent"}'),
  (:'chloe', 'chloe0048@example.org', '{"role":"referent"}');

-- Le rôle d'administrateur ne se demande pas à l'inscription (0001) : il se
-- pose en base, comme dans les autres tests.
update public.profil set role = 'admin' where id = :'alix';

insert into public.loge (bubble_id, nom) values
  ('loge-0048-tours', 'Tours — 0048')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0048-bruno', :'bruno', 'Bruno', 'B', 'bruno0048@example.org',
   (select id from public.loge where bubble_id = 'loge-0048-tours')),
  ('ref-0048-chloe', :'chloe', 'Chloé', 'C', 'chloe0048@example.org',
   (select id from public.loge where bubble_id = 'loge-0048-tours'))
on conflict do nothing;

select id as r_chloe from public.referent where bubble_id = 'ref-0048-chloe' \gset

-- ---------------------------------------------------------------------------
\echo '— une administratrice pose une premiere photo'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000151"}';

  -- Pas de photo avant : la fonction ne rend donc rien à effacer.
  select public.verifier(
    public.poser_la_photo_du_referent(:'r_chloe'::uuid, 'referent/photo/chloe-1.jpg') is null,
    'aucun fichier precedent a effacer');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000151"}';

  select public.verifier(
    (select photo_chemin from public.referent where id = :'r_chloe'::uuid)
      = 'referent/photo/chloe-1.jpg',
    'le chemin est bien range sur la fiche');
commit;

-- ---------------------------------------------------------------------------
\echo '— la remplacer rend le chemin de celle qu on remplace'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000151"}';

  -- Ce retour est toute la raison d'être du `returns text` : sans lui,
  -- l'ancien fichier resterait dans le seau pour toujours.
  select public.verifier(
    public.poser_la_photo_du_referent(:'r_chloe'::uuid, 'referent/photo/chloe-2.png')
      = 'referent/photo/chloe-1.jpg',
    'la fonction rend le chemin remplace');

  select public.verifier(
    (select photo_chemin from public.referent where id = :'r_chloe'::uuid)
      = 'referent/photo/chloe-2.png',
    'et la fiche porte desormais la nouvelle');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent ne photographie personne, pas meme lui'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000152"}';
  begin
    perform public.poser_la_photo_du_referent(
      (select id from public.referent where bubble_id = 'ref-0048-bruno'),
      'referent/photo/bruno.jpg');
    raise exception 'ÉCHEC — un référent a pu poser une photo';
  exception when insufficient_privilege then
    raise notice '  ok — seul un administrateur change une photo';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et la fiche visee n a pas bouge'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select photo_chemin from public.referent where bubble_id = 'ref-0048-bruno') is null,
  'le refus n a rien ecrit');

-- ---------------------------------------------------------------------------
\echo '— un chemin hors du dossier des photos est refuse'
-- ---------------------------------------------------------------------------
do $$
declare
  chloe uuid := (select id from public.referent where bubble_id = 'ref-0048-chloe');
  interdits text[] := array[
    -- Le cas qui justifie la contrainte : faire servir un CV comme un visage,
    -- donc sous le contrôle d'accès de la photo et non sous celui du CV.
    'candidat/cv/dossier-secret.pdf',
    -- Sortir du dossier par un chemin relatif.
    'referent/photo/../../candidat/cv/dossier-secret.pdf',
    -- Un sous-dossier : le nom doit rester un nom de fichier.
    'referent/photo/sous/dossier.jpg',
    -- Le dossier lui-même, sans fichier.
    'referent/photo/',
    -- Une adresse, qui n'est pas un chemin de stockage.
    'https://exemple.test/photo.jpg'
  ];
  mauvais text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000151"}';

  foreach mauvais in array interdits loop
    begin
      perform public.poser_la_photo_du_referent(chloe, mauvais);
      raise exception 'ÉCHEC — le chemin « % » a été accepté', mauvais;
    exception when check_violation then
      raise notice '  ok — refusé : %', mauvais;
    end;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— un chemin nul est refuse lui aussi'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000151"}';
  begin
    perform public.poser_la_photo_du_referent(
      (select id from public.referent where bubble_id = 'ref-0048-chloe'), null);
    raise exception 'ÉCHEC — un chemin nul a été accepté';
  exception when check_violation then
    raise notice '  ok — un chemin nul ne pose aucune photo';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et la photo de Chloe est restee celle qu on avait posee'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select photo_chemin from public.referent where bubble_id = 'ref-0048-chloe')
    = 'referent/photo/chloe-2.png',
  'aucun refus n a abime la fiche');

-- ---------------------------------------------------------------------------
\echo '— une fiche inconnue ne se photographie pas'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-4800-0000-0000-000000000151"}';
  begin
    perform public.poser_la_photo_du_referent(
      '00000000-0000-0000-0000-000000000000'::uuid, 'referent/photo/personne.jpg');
    raise exception 'ÉCHEC — une fiche inconnue a été photographiée';
  exception when no_data_found then
    raise notice '  ok — fiche inconnue, rien n''est écrit';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.poser_la_photo_du_referent(
      '00000000-0000-0000-0000-000000000000'::uuid, 'referent/photo/personne.jpg');
    raise exception 'ÉCHEC — anon a pu poser une photo';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0048_deposer_une_photo.sql sont passés.'
