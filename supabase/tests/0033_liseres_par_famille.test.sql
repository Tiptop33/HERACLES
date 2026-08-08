-- Tests de la migration 0033_liseres_par_famille.sql.
--
-- La liste rend une colonne de plus. Deux choses à éprouver : qu'elle dit la
-- bonne famille pour chacun des quatre libellés de Bubble, et qu'elle n'a rien
-- ouvert au passage — une colonne ajoutée à une fonction `security definer`
-- est l'endroit rêvé pour laisser filer une ligne qu'on n'a pas le droit de
-- voir.

\set ON_ERROR_STOP on
\o /dev/null

\set ada   'cccccccc-0033-0000-0000-00000000000a'
\set bruno 'cccccccc-0033-0000-0000-00000000000b'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',   'ada.0033@example.org',   '{"role":"referent","nom":"Lovelace","prenom":"Ada"}'),
  (:'bruno', 'bruno.0033@example.org', '{"role":"referent","nom":"Latour","prenom":"Bruno"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0033-guyenne', 'Guyenne — 0033'),
  ('loge-0033-quercy',  'Quercy — 0033')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0033-ada',   :'ada',   'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0033-guyenne')),
  ('ref-0033-bruno', :'bruno', 'Latour',   'Bruno',
   (select id from public.loge where bubble_id = 'loge-0033-quercy'))
on conflict do nothing;

-- Les quatre libellés de Bubble, plus les deux qui ne disent rien.
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0033-emploi',     'Un',    'Emma',  'emploi',              (select id from public.loge where bubble_id = 'loge-0033-guyenne'), (select id from public.referent where bubble_id = 'ref-0033-ada'), now()),
  ('cand-0033-changement', 'Deux',  'Elias', 'changement d''Emploi', (select id from public.loge where bubble_id = 'loge-0033-guyenne'), (select id from public.referent where bubble_id = 'ref-0033-ada'), now()),
  ('cand-0033-altern',     'Trois', 'Alix',  'stage en alternance', (select id from public.loge where bubble_id = 'loge-0033-guyenne'), (select id from public.referent where bubble_id = 'ref-0033-ada'), now()),
  ('cand-0033-stage',      'Quatre','Sacha', 'stage',               (select id from public.loge where bubble_id = 'loge-0033-guyenne'), (select id from public.referent where bubble_id = 'ref-0033-ada'), now()),
  ('cand-0033-vide',       'Cinq',  'Vera',  null,                  (select id from public.loge where bubble_id = 'loge-0033-guyenne'), (select id from public.referent where bubble_id = 'ref-0033-ada'), now()),
  ('cand-0033-inconnu',    'Six',   'Ivan',  'CDI',                 (select id from public.loge where bubble_id = 'loge-0033-guyenne'), (select id from public.referent where bubble_id = 'ref-0033-ada'), now());

-- Chez Bruno, à Quercy : Ada ne doit jamais le voir.
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, referent_id, cree_le) values
  ('cand-0033-ailleurs', 'Sept', 'Alba', 'stage',
   (select id from public.loge where bubble_id = 'loge-0033-quercy'),
   (select id from public.referent where bubble_id = 'ref-0033-bruno'), now());

-- ---------------------------------------------------------------------------
\echo '— chaque rang porte la famille qui colorera son lisere'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0033-0000-0000-00000000000a"}';

  select public.verifier(
    (select famille from public.candidats_de_la_loge() where prenom = 'Emma')  = 'emploi'
      and (select famille from public.candidats_de_la_loge() where prenom = 'Elias') = 'changement'
      and (select famille from public.candidats_de_la_loge() where prenom = 'Alix')  = 'alternance'
      and (select famille from public.candidats_de_la_loge() where prenom = 'Sacha') = 'stage',
    'les quatre libellés de Bubble donnent les quatre couleurs');

  -- Le rang restera sans liseré. C'est voulu : une couleur au hasard dirait
  -- quelque chose de faux, l'absence de couleur ne dit rien.
  select public.verifier(
    (select famille from public.candidats_de_la_loge() where prenom = 'Vera')  is null
      and (select famille from public.candidats_de_la_loge() where prenom = 'Ivan') is null,
    'une colonne vide ou un libellé inconnu ne reçoivent aucune couleur');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste dit la meme chose que les pastilles de l accueil'
-- ---------------------------------------------------------------------------
-- Les deux viennent de `famille_de_recherche()`, et c'est tout l'intérêt :
-- compter les rangs d'une couleur doit donner la pastille correspondante.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0033-0000-0000-00000000000a"}';

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where famille = 'stage')
      = (select urgence_stage from public.accueil_chiffres()),
    'autant de liserés orange dans la liste que la pastille « Stage » n''en annonce');

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where famille = 'changement')
      = (select urgence_changement from public.accueil_chiffres()),
    'et de même pour « Changement d''emploi »');
commit;

-- ---------------------------------------------------------------------------
\echo '— une colonne de plus n a ouvert aucune ligne de plus'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0033-0000-0000-00000000000a"}';

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where prenom = 'Alba') = 0,
    'le candidat de Quercy ne paraît pas dans la liste d''Ada');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cccccccc-0033-0000-0000-00000000000b"}';

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where prenom = 'Alba') = 1
      and (select count(*) from public.candidats_de_la_loge() where prenom = 'Emma') = 0,
    'et Bruno voit le sien, pas ceux de Guyenne');
commit;

\echo '— et personne ne l appelle sans etre connecte'
select public.verifier(
  not has_function_privilege('anon', 'public.candidats_de_la_loge()', 'execute'),
  'anon n''a pas le droit d''appeler la liste');

\echo ''
\echo 'Tous les contrôles de 0033_liseres_par_famille.sql sont passés.'
