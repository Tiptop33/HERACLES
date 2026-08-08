-- Tests de la migration 0028_accueil_compteurs.sql.
--
-- Trois compteurs qui disaient autre chose que leur étiquette. On éprouve
-- chacun là où il se trompait, et on vérifie qu'aucune ligne de plus n'est
-- devenue lisible au passage.
--
-- Quatre personnes, deux loges :
--   · Ada    référente à Guyenne — elle accompagne, et elle parraine
--   · Bruno  référent à Guyenne, sans compte : une fiche reprise de Bubble
--   · Chloé  administratrice, référente à Quercy
--   · Denis  administrateur sans fiche de référent — donc sans loge

\set ON_ERROR_STOP on
\o /dev/null

\set ada   'dddddddd-0028-0000-0000-00000000000a'
\set chloe 'dddddddd-0028-0000-0000-00000000000c'
\set denis 'dddddddd-0028-0000-0000-00000000000d'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',   'ada.0028@example.org',   '{"role":"referent","nom":"Lovelace","prenom":"Ada"}'),
  (:'chloe', 'chloe.0028@example.org', '{"role":"referent","nom":"Delaunay","prenom":"Chloé"}'),
  (:'denis', 'denis.0028@example.org', '{"role":"referent","nom":"Diderot","prenom":"Denis"}');
update public.profil set role = 'admin' where id in (:'chloe', :'denis');

insert into public.loge (bubble_id, nom) values
  ('loge-0028-guyenne', 'Guyenne — 0028'),
  ('loge-0028-quercy',  'Quercy — 0028')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0028-ada',   :'ada',   'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0028-guyenne')),
  ('ref-0028-bruno', null,     'Latour',   'Bruno',
   (select id from public.loge where bubble_id = 'loge-0028-guyenne')),
  ('ref-0028-chloe', :'chloe', 'Delaunay', 'Chloé',
   (select id from public.loge where bubble_id = 'loge-0028-quercy'))
on conflict do nothing;

-- À Guyenne. Un candidat qu'Ada accompagne, un qu'elle a seulement présenté,
-- et un que personne n'a pris.
insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0028-suivi', 'Suivi', 'Sam', 'Bordeaux', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0028-guyenne'),
   (select id from public.referent where bubble_id = 'ref-0028-ada'),
   now() - interval '10 days');

insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, parrain_id, cree_le) values
  ('cand-0028-parraine', 'Parrainé', 'Paul', 'Talence', 'Contrat d''alternance',
   (select id from public.loge where bubble_id = 'loge-0028-guyenne'),
   (select id from public.referent where bubble_id = 'ref-0028-ada'),
   now() - interval '5 days');

insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, cree_le) values
  ('cand-0028-seul', 'Seul', 'Sonia', 'Pessac', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0028-guyenne'),
   now() - interval '2 days');

-- Le cas qui piégeait le compteur de référents : un candidat qu'Ada accompagne,
-- mais rattaché à Quercy. `loges_visibles()` lui ouvre donc Quercy — pour lire
-- ce dossier, et pour rien d'autre.
insert into public.candidat (bubble_id, nom, prenom, ville, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0028-ailleurs', 'Ailleurs', 'Alba', 'Cahors', 'CDI',
   (select id from public.loge where bubble_id = 'loge-0028-quercy'),
   (select id from public.referent where bubble_id = 'ref-0028-ada'),
   now() - interval '1 day');

-- ---------------------------------------------------------------------------
\echo '— « referents de la loge » compte la loge, et rien qu elle'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000a"}';

  select public.verifier(
    (select referents from public.accueil_chiffres()) = 2,
    'Ada et Bruno : les deux fiches de Guyenne, y compris celle sans compte');

  select public.verifier(
    (select count(*) from public.loges_visibles()) = 2,
    'deux loges lui sont pourtant visibles — la sienne, et celle du candidat qu''elle suit à Quercy');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000c"}';

  select public.verifier(
    (select referents from public.accueil_chiffres()) = 1,
    'l''administratrice compte sa loge à elle, et non les trois fiches du dépôt');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000d"}';

  select public.verifier(
    (select referents from public.accueil_chiffres()) = 0,
    'sans fiche de référent, on n''a pas de loge : le compteur dit zéro');
commit;

-- ---------------------------------------------------------------------------
\echo '— « candidats suivis » ne compte que ceux dont on est le referent'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000a"}';

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 2,
    'Sam et Alba, qu''elle accompagne — Paul, qu''elle a seulement présenté, n''en est pas');
commit;

-- ---------------------------------------------------------------------------
\echo '— « en attente » compte les candidats sans referent, parraines ou non'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000a"}';

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) = 2,
    'Sonia que personne n''a prise, et Paul que son parrain ne suit pas');

  select public.verifier(
    (select urgence_alternance from public.accueil_chiffres()) = 1,
    'Paul pèse sur la pastille de l''alternance : c''est un référent qu''il attend');

  select public.verifier(
    (select count(*) from public.demandes_en_attente(24)
      where prenom in ('Paul', 'Sonia')) = 2,
    'la liste dit la même chose que le chiffre posé juste à côté');

  select public.verifier(
    (select count(*) from public.demandes_en_attente(24) where prenom = 'Sam') = 0,
    'celui qui a un référent n''attend rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— un dossier clos n attend plus personne'
-- ---------------------------------------------------------------------------
update public.candidat set cloture = 'A trouvé un emploi' where bubble_id = 'cand-0028-seul';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000a"}';

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) = 1,
    'il ne reste que Paul');
commit;

update public.candidat set cloture = null where bubble_id = 'cand-0028-seul';

-- ---------------------------------------------------------------------------
\echo '— et rien n a ete ouvert au passage'
-- ---------------------------------------------------------------------------
-- Le point de 0011 tient toujours : les compteurs passent par une fonction
-- pour ne pas ouvrir la table des candidats. Compter n'est pas lire.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0028-0000-0000-00000000000a"}';

  select public.verifier(
    (select count(*) from public.candidat where bubble_id = 'cand-0028-seul') = 0,
    'Ada compte Sonia sans pouvoir lire sa fiche');

  select public.verifier(
    (select count(*) from public.candidat where bubble_id = 'cand-0028-parraine') = 1,
    'Paul, qu''elle parraine, reste lisible : le compteur a changé, pas les droits');
commit;

select public.verifier(
  public.refuse('anon', 'candidat'),
  'sans session, la table n''est même pas adressable');

\echo ''
\echo 'Tous les contrôles de 0028_accueil_compteurs.sql sont passés.'
