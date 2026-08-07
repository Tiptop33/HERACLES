-- Tests de la migration 0019_poste_de_travail.sql.
--
-- La liste s'élargit à la loge ; la fiche ne bouge pas. C'est toute la
-- question de ce fichier : ce qui s'ouvre, et surtout ce qui ne s'ouvre pas.
--
--   · Chloé   référente à Metz-0019, elle suit Un et parraine Deux
--   · Damien  référent à Metz-0019 — il suit Trois
--   · Émile   référent à Nice-0019 — il ne doit rien voir de Metz
--   · Flore   administratrice, sans loge

\set ON_ERROR_STOP on
\o /dev/null

\set chloe  'aaaaaaaa-3333-0000-0000-000000000019'
\set damien 'aaaaaaaa-3333-0000-0000-000000000020'
\set emile  'aaaaaaaa-3333-0000-0000-000000000021'
\set flore  'aaaaaaaa-3333-0000-0000-000000000022'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chloe',  'chloe0019@example.org',  '{"role":"referent","nom":"Chloe","prenom":"C"}'),
  (:'damien', 'damien0019@example.org', '{"role":"referent","nom":"Damien","prenom":"D"}'),
  (:'emile',  'emile0019@example.org',  '{"role":"referent","nom":"Emile","prenom":"E"}'),
  (:'flore',  'flore0019@example.org',  '{"role":"referent","nom":"Flore","prenom":"F"}');
update public.profil set role = 'admin' where id = :'flore';

insert into public.loge (bubble_id, nom) values
  ('loge-0019-metz', 'Metz — 0019'),
  ('loge-0019-nice', 'Nice — 0019')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0019-chloe',  :'chloe',  'Chloe',  'C', 'chloe0019@example.org',
   (select id from public.loge where bubble_id = 'loge-0019-metz')),
  ('ref-0019-damien', :'damien', 'Damien', 'D', 'damien0019@example.org',
   (select id from public.loge where bubble_id = 'loge-0019-metz')),
  ('ref-0019-emile',  :'emile',  'Emile',  'E', 'emile0019@example.org',
   (select id from public.loge where bubble_id = 'loge-0019-nice'))
on conflict do nothing;

insert into public.candidat (bubble_id, nom, prenom, age, metier_libelle, ville,
                             loge_id, referent_id, parrain_id, photo_chemin) values
  -- Suivi par Chloé.
  ('cand-0019-un', 'Un', 'Alpha', 34, 'Consultant RH', 'Metz',
   (select id from public.loge where bubble_id = 'loge-0019-metz'),
   (select id from public.referent where bubble_id = 'ref-0019-chloe'), null,
   'candidat/photo/un.jpg'),
  -- Parrainé par Chloé, suivi par Damien.
  ('cand-0019-deux', 'Deux', 'Beta', 28, 'Comptable', 'Metz',
   (select id from public.loge where bubble_id = 'loge-0019-metz'),
   (select id from public.referent where bubble_id = 'ref-0019-damien'),
   (select id from public.referent where bubble_id = 'ref-0019-chloe'), null),
  -- Sans référent : c'est un « urgent ».
  ('cand-0019-trois', 'Trois', 'Gamma', 45, null, 'Metz',
   (select id from public.loge where bubble_id = 'loge-0019-metz'), null, null, null),
  -- Une autre loge.
  ('cand-0019-nice', 'Nice', 'Delta', 22, 'Soudeur', 'Nice',
   (select id from public.loge where bubble_id = 'loge-0019-nice'),
   (select id from public.referent where bubble_id = 'ref-0019-emile'), null, null)
on conflict do nothing;

update public.candidat set emploi_recherche = 'Agent de maintenance'
 where bubble_id = 'cand-0019-trois';

-- ---------------------------------------------------------------------------
\echo '— une referente voit toute sa loge, pas seulement ses suivis'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000019"}';

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge()
      where nom in ('Un', 'Deux', 'Trois')) = 3,
    'Chloé voit les trois candidats de Metz — celui de Damien compris');

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where nom = 'Nice') = 0,
    'et jamais celui de Nice');
commit;

-- ---------------------------------------------------------------------------
\echo '— les deux colonnes qui portent les filtres de la maquette'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000019"}';

  select public.verifier(
    (select array_agg(nom order by nom) from public.candidats_de_la_loge()
      where c_est_mon_suivi) = array['Deux', 'Un'],
    '« Mes suivis » : celui qu''elle suit et celui qu''elle parraine');

  select public.verifier(
    (select array_agg(nom) from public.candidats_de_la_loge()
      where sans_referent) = array['Trois'],
    '« Urgents » : celui que personne n''accompagne');

  select public.verifier(
    (select referent_nom from public.candidats_de_la_loge() where nom = 'Deux') = 'D Damien',
    'la liste nomme qui accompagne');

  select public.verifier(
    (select metier from public.candidats_de_la_loge() where nom = 'Trois')
      = 'Agent de maintenance',
    'faute de métier, la liste montre l''emploi recherché — jamais une case vide');

  select public.verifier(
    (select a_une_photo from public.candidats_de_la_loge() where nom = 'Un') = true
      and (select a_une_photo from public.candidats_de_la_loge() where nom = 'Deux') = false,
    'et dit qui a un visage à montrer');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste ne rend rien de ce qu on lit dans une fiche'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'candidats_de_la_loge'
      and p.parameter_name in ('email', 'telephone', 'adresse', 'cv_chemin',
                               'appreciation', 'competences')) = 0,
  'ni coordonnées, ni CV, ni appréciation : une liste n''est pas une fiche');

-- ---------------------------------------------------------------------------
\echo '— et la fiche, elle, n a pas bouge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000019"}';

  -- Chloé voit Trois dans sa liste, mais ne peut pas ouvrir sa fiche : c'est
  -- toute la différence entre « ce que l'écran montre » et « ce que la table
  -- laisse lire ». La RLS de 0006 est intacte.
  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where nom = 'Trois') = 1
      and (select count(*) from public.candidat where bubble_id = 'cand-0019-trois') = 0,
    'Chloé lit Trois dans la liste, pas dans la table');
commit;

-- ---------------------------------------------------------------------------
\echo '— une administratrice sans loge voit tout le monde'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000022"}';

  -- On compte par loge, et non par nom : une administratrice voit aussi les
  -- candidats fabriqués par les autres fichiers de tests, dont plusieurs
  -- s'appellent « Un » ou « Deux ». C'est justement la preuve qu'elle voit
  -- tout — encore faut-il que le contrôle ne s'y noie pas.
  select public.verifier(
    (select count(*) from public.candidats_de_la_loge()
      where loge_nom in ('Metz — 0019', 'Nice — 0019')) = 4,
    'Flore voit les deux loges — sans elle, personne ne voit les 118 fiches');

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where c_est_mon_suivi) = 0,
    'et n''accompagne personne : « Mes suivis » est vide pour elle');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent d une autre loge ne voit rien de Metz'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000021"}';

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge()
      where nom in ('Un', 'Deux', 'Trois')) = 0,
    'Émile reste à Nice');
commit;

-- ---------------------------------------------------------------------------
\echo '— la photo ne sort que pour qui voit deja la personne'
-- ---------------------------------------------------------------------------
select id as cand_un from public.candidat where bubble_id = 'cand-0019-un' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000019"}';
  select public.verifier(
    (select public.chemin_photo_candidat(:'cand_un'::uuid)) = 'candidat/photo/un.jpg',
    'Chloé obtient le chemin de la photo');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000021"}';
  select public.verifier(
    (select public.chemin_photo_candidat(:'cand_un'::uuid)) is null,
    'Émile n''obtient rien — pas même l''emplacement du fichier');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.candidats_de_la_loge();
    raise exception 'ÉCHEC — la liste répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0019_poste_de_travail.sql sont passés.'
