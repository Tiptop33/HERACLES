-- Tests de la migration 0011_accueil.sql.
--
-- L'accueil montre des chiffres sur des candidats que celui qui regarde n'a
-- pas le droit de lire. Tout l'enjeu est là : que les compteurs soient justes,
-- et que rien d'autre ne passe par la même porte.
--
-- Trois personnes, deux loges :
--   · Ada    référente à Guyenne, suit un candidat
--   · Bruno  référent à Quercy — il ne doit rien voir de Guyenne
--   · Chloé  administratrice, sans loge — elle voit tout

\set ON_ERROR_STOP on
\o /dev/null

\set ada   'cccccccc-0000-0000-0000-00000000000a'
\set bruno 'cccccccc-0000-0000-0000-00000000000b'
\set chloe 'cccccccc-0000-0000-0000-00000000000c'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',   'ada@example.org',   '{"role":"referent","nom":"Lovelace","prenom":"Ada"}'),
  (:'bruno', 'bruno@example.org', '{"role":"referent","nom":"Latour","prenom":"Bruno"}'),
  (:'chloe', 'chloe@example.org', '{"role":"referent","nom":"Delaunay","prenom":"Chloé"}');
update public.profil set role = 'admin' where id = :'chloe';

insert into public.loge (bubble_id, nom) values
  ('loge-0011-guyenne', 'Guyenne — 0011'),
  ('loge-0011-quercy',  'Quercy — 0011')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0011-ada',   :'ada',   'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne')),
  ('ref-0011-bruno', :'bruno', 'Latour',   'Bruno',
   (select id from public.loge where bubble_id = 'loge-0011-quercy'))
on conflict do nothing;

-- À Guyenne : un candidat suivi par Ada, et trois qui n'attendent personne
-- encore — un par famille de recherche.
insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0011-suivi', 'Suivi', 'Sam', 'Bordeaux', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne'),
   (select id from public.referent where bubble_id = 'ref-0011-ada'),
   now() - interval '10 days');

-- « emploi » et non « CDD » : depuis 0031, seuls les libellés de la liste
-- Bubble désignent une famille. L'intention de ce jeu d'essai — un candidat
-- par famille de recherche — demande donc le mot que Bubble emploie.
insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, cree_le) values
  ('cand-0011-emploi',     'Attente', 'Emma', 'Bordeaux', 'emploi',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne'), now() - interval '3 days'),
  ('cand-0011-alternance', 'Attente', 'Alix', 'Talence',  'Contrat d''alternance',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne'), now() - interval '2 days'),
  ('cand-0011-stage',      'Attente', 'Sacha', 'Pessac',  'Stage conventionné',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne'), now() - interval '1 day'),
  -- Clôturé : il n'attend plus personne, il ne doit compter nulle part.
  ('cand-0011-clos',       'Clos',    'Camille', 'Bègles', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne'), now());
update public.candidat set cloture = 'A trouvé un emploi' where bubble_id = 'cand-0011-clos';

-- À Quercy : un seul, en attente. Il ne doit jamais apparaître chez Ada.
insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, cree_le) values
  ('cand-0011-ailleurs', 'Ailleurs', 'Alba', 'Cahors', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0011-quercy'), now());

insert into public.document (bubble_id, nom, type_document, lien_url, loge_id) values
  ('doc-0011-guyenne', 'Compte-rendu de septembre', 'Compte-rendu', 'https://exemple.invalid/cr.pdf',
   (select id from public.loge where bubble_id = 'loge-0011-guyenne')),
  ('doc-0011-quercy',  'Affiche du forum',          'Affiche',      'https://exemple.invalid/aff.pdf',
   (select id from public.loge where bubble_id = 'loge-0011-quercy'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— la famille de recherche se lit dans le libelle libre de Bubble'
-- ---------------------------------------------------------------------------
-- Depuis 0031, il n'y a plus d'« emploi par défaut » : ce qui ne se reconnaît
-- pas ne se range nulle part. Les trois familles, elles, se lisent comme avant.
select public.verifier(
  public.famille_de_recherche('Contrat d''alternance') = 'alternance'
    and public.famille_de_recherche('Apprentissage')      = 'alternance'
    and public.famille_de_recherche('stage en alternance') = 'alternance'
    and public.famille_de_recherche('Stage conventionné') = 'stage'
    -- Sa propre famille depuis 0032, et non plus « emploi ».
    and public.famille_de_recherche('changement d''Emploi') = 'changement'
    and public.famille_de_recherche('emploi') = 'emploi',
  'alternance, stage et emploi se reconnaissent dans le libellé libre de Bubble');

select public.verifier(
  public.famille_de_recherche(null)  is null
    and public.famille_de_recherche('')    is null
    and public.famille_de_recherche('CDI') is null,
  'et ce qu''on ne reconnaît pas ne devient pas un emploi pour autant');

-- ---------------------------------------------------------------------------
\echo '— les chiffres d une referente ne parlent que de sa loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000a"}';

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 1,
    'Ada suit un candidat');

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) = 3,
    'trois attendent encore quelqu''un — le clôturé n''en est pas, celui de Quercy non plus');

  -- Depuis 0031 ces trois-là comptent les dossiers **en cours de la loge**, et
  -- non plus les seuls candidats en attente. Sam, que suit Ada, porte « CDI » :
  -- un libellé qu'on ne reconnaît pas, et qui n'entre donc dans aucune pastille.
  select public.verifier(
    (select urgence_emploi from public.accueil_chiffres()) = 1
      and (select urgence_alternance from public.accueil_chiffres()) = 1
      and (select urgence_stage from public.accueil_chiffres()) = 1,
    'un par famille, comme les trois pastilles de la maquette');

  select public.verifier(
    (select referents from public.accueil_chiffres()) = 1,
    'elle compte les référents de sa loge, pas ceux de Quercy');
commit;

-- ---------------------------------------------------------------------------
\echo '— et les demandes en attente non plus ne franchissent pas la loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000a"}';

  select public.verifier(
    (select count(*) from public.demandes_en_attente(10)) = 3,
    'trois demandes, celles de sa loge');

  select public.verifier(
    (select count(*) from public.demandes_en_attente(10) where prenom = 'Alba') = 0,
    'le candidat de Quercy n''y est pas');

  select public.verifier(
    (select count(*) from public.demandes_en_attente(10) where prenom = 'Camille') = 0,
    'le dossier clôturé n''attend plus personne');

  select public.verifier(
    (select prenom from public.demandes_en_attente(1)) = 'Sacha',
    'la plus récente vient en tête, et la limite est respectée');
commit;

-- ---------------------------------------------------------------------------
\echo '— la fonction ne rend que ce que la carte affiche'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'demandes_en_attente'
      and column_name in ('telephone', 'email', 'cv_url', 'presentation')) = 0,
  'ni téléphone, ni e-mail, ni CV : on les connaîtra en accompagnant, pas avant');

-- ---------------------------------------------------------------------------
\echo '— Bruno, a Quercy, voit son propre monde et pas celui d Ada'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000b"}';

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) = 1,
    'un seul en attente chez lui');

  select public.verifier(
    (select count(*) from public.demandes_en_attente(10) where prenom in ('Emma', 'Alix', 'Sacha')) = 0,
    'aucun candidat de Guyenne ne lui parvient');

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 0,
    'il n''accompagne personne, et le compteur le dit');
commit;

-- ---------------------------------------------------------------------------
\echo '— une administratrice voit toutes les loges'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000c"}';

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) >= 4,
    'les quatre en attente, des deux loges');

  select public.verifier(
    (select count(*) from public.demandes_en_attente(24) where prenom = 'Alba') = 1,
    'y compris celui de Quercy');
commit;

-- ---------------------------------------------------------------------------
\echo '— les documents s arretent a la loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000a"}';
  select public.verifier(
    (select count(*) from public.document where bubble_id = 'doc-0011-guyenne') = 1
      and (select count(*) from public.document where bubble_id = 'doc-0011-quercy') = 0,
    'Ada lit le compte-rendu de sa loge, pas l''affiche de Quercy');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000c"}';
  select public.verifier(
    (select count(*) from public.document where bubble_id in ('doc-0011-guyenne', 'doc-0011-quercy')) = 2,
    'l''administratrice lit les deux');
commit;

\echo '— et personne ne lit ces documents sans etre connecte'
select public.verifier(
  public.refuse('anon', 'document'),
  'sans session, la table n''est même pas adressable');

-- ---------------------------------------------------------------------------
\echo '— la lecture ligne a ligne des candidats n a pas ete elargie'
-- ---------------------------------------------------------------------------
-- Le point qui compte : les compteurs passent par une fonction précisément
-- pour ne pas ouvrir la table. Si un jour quelqu'un ajoutait une policy pour
-- « simplifier », ce contrôle tomberait.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-00000000000a"}';
  select public.verifier(
    (select count(*) from public.candidat where bubble_id like 'cand-0011-attente%') = 0
      and (select count(*) from public.candidat where bubble_id = 'cand-0011-ailleurs') = 0,
    'Ada compte les candidats en attente sans pouvoir lire une seule de leurs fiches');
commit;

\echo ''
\echo 'Tous les contrôles de 0011_accueil.sql sont passés.'
