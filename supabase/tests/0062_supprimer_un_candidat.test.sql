-- Tests de la migration 0062_supprimer_un_candidat.sql.
--
-- Les barrières à éprouver, et ce qui part avec le dossier :
--
--   · Vera   Vénérable à Lyon-0062     — peut supprimer, dans sa loge
--   · Tom    Trésorier à Lyon-0062     — ne peut pas
--   · Sam    Secrétaire à Brest-0062   — peut supprimer, mais pas à Lyon
--   · Zoé    administratrice, sans loge — peut supprimer partout
--
-- Quatre dossiers à Lyon : un ouvert dans HERACLES (supprimable), un repris de
-- Bubble, un qui a un compte, et un second libre pour l'administratrice.

\set ON_ERROR_STOP on
\o /dev/null

\set vera 'aaaaaaaa-6262-0000-0000-000000000001'
\set tom  'aaaaaaaa-6262-0000-0000-000000000002'
\set sam  'aaaaaaaa-6262-0000-0000-000000000003'
\set zoe  'aaaaaaaa-6262-0000-0000-000000000004'
\set kim  'aaaaaaaa-6262-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'vera', 'vera0062@example.org', '{"role":"referent","nom":"Vera","prenom":"V"}'),
  (:'tom',  'tom0062@example.org',  '{"role":"referent","nom":"Tom","prenom":"T"}'),
  (:'sam',  'sam0062@example.org',  '{"role":"referent","nom":"Sam","prenom":"S"}'),
  (:'zoe',  'zoe0062@example.org',  '{"role":"admin"}'),
  -- Une candidate qui a un compte de connexion.
  (:'kim',  'kim0062@example.org',  '{"role":"chercheur","nom":"Kim","prenom":"K"}')
on conflict do nothing;

-- `admin` ne se demande pas à l'inscription : on le pose à la main.
update public.profil set role = 'admin' where id = :'zoe';

insert into public.loge (bubble_id, nom) values
  ('loge-0062-lyon',  'Lyon — 0062'),
  ('loge-0062-brest', 'Brest — 0062')
on conflict do nothing;

select id as lyon  from public.loge where bubble_id = 'loge-0062-lyon'  \gset
select id as brest from public.loge where bubble_id = 'loge-0062-brest' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, college, loge_id) values
  ('ref-0062-vera', :'vera', 'Vera', 'V', 'vera0062@example.org', ' Vénérable Maître ', :'lyon'),
  ('ref-0062-tom',  :'tom',  'Tom',  'T', 'tom0062@example.org',  'Trésorier',          :'lyon'),
  ('ref-0062-sam',  :'sam',  'Sam',  'S', 'sam0062@example.org',  'Secrétaire',         :'brest')
on conflict do nothing;

select id as r_vera from public.referent where bubble_id = 'ref-0062-vera' \gset

-- Les dossiers. `bubble_id` vide : ouverts dans HERACLES.
insert into public.candidat (id, loge_id, numero, nom, prenom, cv_chemin, photo_chemin) values
  ('cccccccc-6262-0000-0000-000000000001', :'lyon', 901, 'Libre', 'Léa',
   'candidat/cv/cccccccc-6262-0000-0000-000000000001.pdf',
   'candidat/photo/cccccccc-6262-0000-0000-000000000001.jpg'),
  ('cccccccc-6262-0000-0000-000000000004', :'lyon', 904, 'Libre', 'Max', null, null),
  ('cccccccc-6262-0000-0000-000000000005', :'brest', 905, 'Libre', 'Noé', null, null)
on conflict do nothing;

insert into public.candidat (id, bubble_id, loge_id, numero, nom, prenom) values
  ('cccccccc-6262-0000-0000-000000000002', 'cand-bubble-0062', :'lyon', 902, 'Bubble', 'Bob')
on conflict do nothing;

insert into public.candidat (id, profil_id, loge_id, numero, nom, prenom) values
  ('cccccccc-6262-0000-0000-000000000003', :'kim', :'lyon', 903, 'Compte', 'Kim')
on conflict do nothing;

\set libre  'cccccccc-6262-0000-0000-000000000001'
\set bubble 'cccccccc-6262-0000-0000-000000000002'
\set compte 'cccccccc-6262-0000-0000-000000000003'
\set max    'cccccccc-6262-0000-0000-000000000004'
\set noe    'cccccccc-6262-0000-0000-000000000005'

-- Ce qui doit partir avec Léa : deux notes de journal et l'invitation qui a
-- ouvert son dossier. Et une invitation d'ailleurs, qui doit rester.
insert into public.suivi (candidat_id, auteur_id, texte) values
  (:'libre', :'r_vera', 'Premier appel'),
  (:'libre', :'r_vera', 'Entretien fixé');

insert into public.parrainage (loge_id, envoye_par, parrain_email, jeton_parrain_empreinte,
                               candidat_id, candidat_email)
values (:'lyon', :'r_vera', 'parrain0062@example.org', 'empreinte-0062-lea',
        :'libre', 'lea0062@example.org'),
       (:'lyon', :'r_vera', 'autre0062@example.org', 'empreinte-0062-autre',
        :'max', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— le droit suit le titre, comme pour les réunions'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000001"}';
  select public.verifier(public.puis_je_supprimer_des_candidats(),
    'la Vénérable peut supprimer, malgré la casse et les espaces du titre');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000003"}';
  select public.verifier(public.puis_je_supprimer_des_candidats(),
    'le Secrétaire aussi');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000004"}';
  select public.verifier(public.puis_je_supprimer_des_candidats(),
    'l''administratrice aussi, sans fiche de référent');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000002"}';
  select public.verifier(public.puis_je_supprimer_des_candidats() = false,
    'le Trésorier, non');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste ne promet la corbeille que là où elle marchera'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000001"}';

  select public.verifier(
    (select supprimable from public.candidats_de_la_loge() where id = :'libre'::uuid),
    'Léa, ouverte dans HERACLES : supprimable');
  select public.verifier(
    (select supprimable from public.candidats_de_la_loge() where id = :'bubble'::uuid) = false,
    'Bob, repris de Bubble : non');
  select public.verifier(
    (select supprimable from public.candidats_de_la_loge() where id = :'compte'::uuid) = false,
    'Kim, qui a un compte : non');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000002"}';
  select public.verifier(
    (select bool_or(supprimable) from public.candidats_de_la_loge()) = false,
    'pour le Trésorier, aucune fiche n''est supprimable');
  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where id = :'libre'::uuid) = 1,
    'et la liste lui montre toujours les mêmes dossiers');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000004"}';
  select public.verifier(
    (select supprimable from public.candidats_de_la_loge() where id = :'noe'::uuid),
    'pour l''administratrice, Noé de Brest est supprimable');
commit;

-- ---------------------------------------------------------------------------
\echo '— les refus'
-- ---------------------------------------------------------------------------
-- Sans titre, la fonction lève : c'est une porte fermée, pas un cas de figure.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6262-0000-0000-000000000002"}', true);
  perform public.supprimer_un_candidat('cccccccc-6262-0000-0000-000000000001');
  raise exception 'ÉCHEC — le Trésorier a pu supprimer';
exception
  when insufficient_privilege then
    raise notice '  ok — le Trésorier est refusé';
end
$$;
reset role;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000003"}';
  select public.verifier(
    (select issue from public.supprimer_un_candidat(:'libre'::uuid)) = 'introuvable',
    'le Secrétaire de Brest ne voit pas Léa de Lyon');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000001"}';
  select public.verifier(
    (select issue from public.supprimer_un_candidat(:'bubble'::uuid)) = 'bubble',
    'Bob, repris de Bubble, ne se supprime pas — il reviendrait à la reprise');
  select public.verifier(
    (select issue from public.supprimer_un_candidat(:'compte'::uuid)) = 'compte',
    'Kim, qui a un compte, ne se supprime pas');
  select public.verifier(
    (select issue from public.supprimer_un_candidat(:'noe'::uuid)) = 'introuvable',
    'la Vénérable de Lyon ne voit pas Noé de Brest');
commit;

select public.verifier(
  (select count(*) from public.candidat
    where id in (:'bubble'::uuid, :'compte'::uuid, :'noe'::uuid)) = 3,
  'après ces refus, les trois dossiers sont intacts');

-- ---------------------------------------------------------------------------
\echo '— supprimer emporte le journal, l invitation, et rend les fichiers'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000001"}';

  create temporary table resultat on commit drop as
    select * from public.supprimer_un_candidat(:'libre'::uuid);

  select public.verifier((select issue from resultat) = 'supprime',
    'la Vénérable supprime Léa');
  select public.verifier(
    (select fichiers from resultat) = array[
      'candidat/cv/cccccccc-6262-0000-0000-000000000001.pdf',
      'candidat/photo/cccccccc-6262-0000-0000-000000000001.jpg'],
    'et reçoit les chemins de son CV et de sa photo, à retirer du seau');
  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where id = :'libre'::uuid) = 0,
    'Léa a quitté la liste');
  select public.verifier(
    (select issue from public.supprimer_un_candidat(:'libre'::uuid)) = 'introuvable',
    'une seconde suppression ne trouve plus rien');
commit;

-- Lu hors session : `suivi` et `parrainage` sont fermées à `authenticated`.
select public.verifier(
  (select count(*) from public.candidat where id = :'libre'::uuid) = 0,
  'la ligne n''est plus en base');
select public.verifier(
  (select count(*) from public.suivi where candidat_id = :'libre'::uuid) = 0,
  'son journal est parti, par la cascade');
select public.verifier(
  (select count(*) from public.parrainage where jeton_parrain_empreinte = 'empreinte-0062-lea') = 0,
  'l''invitation qui l''a ouverte aussi, avec son adresse');
select public.verifier(
  (select count(*) from public.parrainage where jeton_parrain_empreinte = 'empreinte-0062-autre') = 1,
  'l''invitation d''un autre dossier est restée');

-- ---------------------------------------------------------------------------
\echo '— l administratrice supprime dans toutes les loges'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6262-0000-0000-000000000004"}';
  select public.verifier(
    (select issue from public.supprimer_un_candidat(:'noe'::uuid)) = 'supprime',
    'Noé de Brest est supprimé par l''administratrice');
  select public.verifier(
    (select fichiers from public.supprimer_un_candidat(:'max'::uuid)) = array[]::text[],
    'Max, sans fichier : la liste des chemins est vide, pas nulle');
commit;

-- ---------------------------------------------------------------------------
\echo '— personne d anonyme'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  perform public.supprimer_un_candidat('cccccccc-6262-0000-0000-000000000002');
  raise exception 'ÉCHEC — un visiteur anonyme a pu appeler la fonction';
exception
  when insufficient_privilege then
    raise notice '  ok — un visiteur anonyme ne peut même pas l''appeler';
end
$$;
reset role;

\echo ''
\echo 'Tous les contrôles de 0062_supprimer_un_candidat.sql sont passés.'
