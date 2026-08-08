-- Tests de la migration 0030_suivis_de_la_loge.sql.
--
-- « Candidats suivis » et « en attente de référent » décrivent désormais la
-- même chose sous deux angles : les dossiers en cours de la loge, selon qu'ils
-- ont trouvé un référent ou non. Le contrôle qui compte est donc leur somme —
-- si elle ne fait pas le nombre de dossiers en cours, l'un des deux ment.
--
-- Une loge, cinq dossiers en cours : trois accompagnés, deux en attente. Plus
-- un dossier clos et une loge voisine, qui ne doivent apparaître nulle part.

\set ON_ERROR_STOP on
\o /dev/null

\set ada    'ffffffff-0030-0000-0000-00000000000a'
\set bruno  'ffffffff-0030-0000-0000-00000000000b'
\set chloe  'ffffffff-0030-0000-0000-00000000000c'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',   'ada.0030@example.org',   '{"role":"referent","nom":"Lovelace","prenom":"Ada"}'),
  (:'bruno', 'bruno.0030@example.org', '{"role":"referent","nom":"Latour","prenom":"Bruno"}'),
  (:'chloe', 'chloe.0030@example.org', '{"role":"referent","nom":"Delaunay","prenom":"Chloé"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0030-guyenne', 'Guyenne — 0030'),
  ('loge-0030-quercy',  'Quercy — 0030')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0030-ada',   :'ada',   'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0030-guyenne')),
  ('ref-0030-bruno', :'bruno', 'Latour',   'Bruno',
   (select id from public.loge where bubble_id = 'loge-0030-guyenne')),
  ('ref-0030-chloe', :'chloe', 'Delaunay', 'Chloé',
   (select id from public.loge where bubble_id = 'loge-0030-quercy'))
on conflict do nothing;

-- Guyenne : deux dossiers portés par Ada, un par Bruno, deux sans personne.
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0030-ada1',   'Suivi', 'Sam',   'CDI',                   (select id from public.loge where bubble_id = 'loge-0030-guyenne'), (select id from public.referent where bubble_id = 'ref-0030-ada'),   now()),
  ('cand-0030-ada2',   'Suivi', 'Sonia', 'Stage conventionné',    (select id from public.loge where bubble_id = 'loge-0030-guyenne'), (select id from public.referent where bubble_id = 'ref-0030-ada'),   now()),
  ('cand-0030-bruno1', 'Suivi', 'Bilal', 'CDI',                   (select id from public.loge where bubble_id = 'loge-0030-guyenne'), (select id from public.referent where bubble_id = 'ref-0030-bruno'), now());

insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, cree_le) values
  ('cand-0030-libre1', 'Attente', 'Alix',  'Contrat d''alternance', (select id from public.loge where bubble_id = 'loge-0030-guyenne'), now()),
  ('cand-0030-libre2', 'Attente', 'Anouk', 'CDI',                   (select id from public.loge where bubble_id = 'loge-0030-guyenne'), now()),
  -- Clos : il n'est ni suivi ni en attente, il est derrière nous.
  ('cand-0030-clos',   'Clos',    'Camille', 'CDI',                 (select id from public.loge where bubble_id = 'loge-0030-guyenne'), now());
update public.candidat set cloture = 'Lui-même' where bubble_id = 'cand-0030-clos';

-- Quercy : un dossier accompagné, qui ne regarde pas Guyenne.
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0030-ailleurs', 'Ailleurs', 'Alba', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0030-quercy'),
   (select id from public.referent where bubble_id = 'ref-0030-chloe'), now());

-- ---------------------------------------------------------------------------
\echo '— « suivis » compte la loge, et non les seuls dossiers de qui regarde'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0030-0000-0000-00000000000a"}';

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 3,
    'les trois dossiers accompagnés de Guyenne — dont celui de Bruno, qu''Ada ne suit pas');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0030-0000-0000-00000000000b"}';

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 3,
    'Bruno lit le même nombre qu''Ada : c''est celui de la loge, pas le sien');
commit;

-- ---------------------------------------------------------------------------
\echo '— suivis + en attente = les dossiers en cours de la loge'
-- ---------------------------------------------------------------------------
-- Le contrôle qui donne son sens aux deux : ils se lisent côte à côte, et
-- l'un se déduit de l'autre par soustraction. S'ils ne se complètent pas,
-- l'écran ment.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0030-0000-0000-00000000000a"}';

  select public.verifier(
    (select mes_candidats + en_attente from public.accueil_chiffres()) = 5,
    'cinq dossiers en cours à Guyenne : trois suivis, deux en attente');

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) = 2,
    'Alix et Anouk attendent un référent');
commit;

-- ---------------------------------------------------------------------------
\echo '— la loge voisine et les dossiers clos restent dehors'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0030-0000-0000-00000000000c"}';

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 1,
    'Chloé, à Quercy, ne compte que le sien — les trois de Guyenne ne la regardent pas');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0030-0000-0000-00000000000a"}';

  -- Camille est clôturé et porte pourtant un dossier de Guyenne : s'il entrait
  -- quelque part, la somme ferait six.
  select public.verifier(
    (select mes_candidats + en_attente from public.accueil_chiffres()) = 5,
    'le dossier clôturé n''entre ni dans l''un ni dans l''autre');
commit;

-- ---------------------------------------------------------------------------
\echo '— compter n est pas lire'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"ffffffff-0030-0000-0000-00000000000a"}';

  select public.verifier(
    (select count(*) from public.candidat where bubble_id = 'cand-0030-bruno1') = 0,
    'Ada compte le dossier de Bruno sans pouvoir en lire une ligne');
commit;

\echo ''
\echo 'Tous les contrôles de 0030_suivis_de_la_loge.sql sont passés.'
