-- Tests de la migration 0031_urgences_par_type.sql.
--
-- Deux choses à éprouver, et la seconde est la plus facile à perdre de vue :
-- le périmètre — les dossiers en cours de la loge, accompagnés ou non — et le
-- fait qu'un type illisible ne se range plus dans « Emploi » faute de mieux.
--
-- Une loge, les quatre libellés relevés chez Bubble, plus les deux cas qui ne
-- disent rien : une colonne vide et un libellé inconnu.

\set ON_ERROR_STOP on
\o /dev/null

\set ada 'aaaaaaaa-0031-0000-0000-00000000000a'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada', 'ada.0031@example.org', '{"role":"referent","nom":"Lovelace","prenom":"Ada"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0031', 'Guyenne — 0031')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0031-ada', :'ada', 'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0031'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— les quatre libelles de Bubble, ranges comme l association les entend'
-- ---------------------------------------------------------------------------
-- Depuis 0032, « changement d'Emploi » a sa propre pastille : les quatre
-- valeurs de Bubble donnent donc quatre familles, une chacune.
select public.verifier(
  public.famille_de_recherche('emploi')                   = 'emploi'
    and public.famille_de_recherche('changement d''Emploi') = 'changement'
    and public.famille_de_recherche('stage en alternance')  = 'alternance'
    and public.famille_de_recherche('stage')                = 'stage',
  'les quatre valeurs relevées sur les 107 fiches trouvent chacune sa pastille');

-- Le mot « stage » ouvre le libellé de l'alternance : c'est l'ordre des tests,
-- et non le hasard, qui décide. Si un jour on inverse, ce contrôle tombe.
select public.verifier(
  public.famille_de_recherche('stage en alternance') <> 'stage',
  '« stage en alternance » est une alternance, malgré le mot qui l''ouvre');

select public.verifier(
  public.famille_de_recherche(null)   is null
    and public.famille_de_recherche('')     is null
    and public.famille_de_recherche('   ')  is null
    and public.famille_de_recherche('CDI')  is null
    and public.famille_de_recherche('Autre, à préciser') is null,
  'ce qu''on ne reconnaît pas reste sans famille, au lieu de grossir « Emploi »');

-- ---------------------------------------------------------------------------
-- Six dossiers en cours : deux emplois, une alternance, un stage, et deux dont
-- le type ne dit rien. Plus un clôturé, qui ne compte nulle part.
-- ---------------------------------------------------------------------------
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, cree_le) values
  ('cand-0031-emploi1', 'Un',     'Emma',  'emploi',              (select id from public.loge where bubble_id = 'loge-0031'), now()),
  ('cand-0031-emploi2', 'Deux',   'Elias', 'changement d''Emploi', (select id from public.loge where bubble_id = 'loge-0031'), now()),
  ('cand-0031-altern',  'Trois',  'Alix',  'stage en alternance', (select id from public.loge where bubble_id = 'loge-0031'), now()),
  ('cand-0031-stage',   'Quatre', 'Sacha', 'stage',               (select id from public.loge where bubble_id = 'loge-0031'), now()),
  ('cand-0031-vide',    'Cinq',   'Vera',  null,                  (select id from public.loge where bubble_id = 'loge-0031'), now()),
  ('cand-0031-inconnu', 'Six',    'Ivan',  'CDI',                 (select id from public.loge where bubble_id = 'loge-0031'), now()),
  ('cand-0031-clos',    'Sept',   'Clara', 'emploi',              (select id from public.loge where bubble_id = 'loge-0031'), now());
update public.candidat set cloture = 'Lui-même' where bubble_id = 'cand-0031-clos';

-- Deux de ces dossiers sont accompagnés : les pastilles doivent les compter
-- quand même. C'est tout l'objet du changement de périmètre.
update public.candidat set referent_id = (select id from public.referent where bubble_id = 'ref-0031-ada')
 where bubble_id in ('cand-0031-emploi1', 'cand-0031-altern');

-- ---------------------------------------------------------------------------
\echo '— les pastilles comptent les dossiers en cours, accompagnes ou non'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0031-0000-0000-00000000000a"}';

  -- Un seul emploi depuis 0032 : Elias, qui porte « changement d'Emploi », a
  -- quitté cette pastille pour la sienne.
  select public.verifier(
    (select urgence_emploi from public.accueil_chiffres()) = 1,
    'un emploi — celui qu''Ada accompagne déjà');

  select public.verifier(
    (select urgence_alternance from public.accueil_chiffres()) = 1,
    'une alternance, accompagnée elle aussi');

  select public.verifier(
    (select urgence_stage from public.accueil_chiffres()) = 1,
    'un stage, que personne n''a encore pris');
commit;

-- ---------------------------------------------------------------------------
\echo '— un type illisible ne gonfle plus « Emploi »'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0031-0000-0000-00000000000a"}';

  -- Six dossiers en cours, quatre pastilles remplies : Vera et Ivan manquent
  -- à l'appel, et c'est ce qu'on veut. Avant 0031 ils auraient dit « Emploi »
  -- tous les deux, et le cadre aurait annoncé quatre emplois pour deux.
  select public.verifier(
    (select urgence_emploi + urgence_alternance + urgence_stage + urgence_changement
       from public.accueil_chiffres()) = 4,
    'quatre dossiers rangés sur six en cours — les deux illisibles restent dehors');

  select public.verifier(
    (select mes_candidats + en_attente from public.accueil_chiffres()) = 6,
    'les six sont pourtant bien là, comptés par les deux premiers cadres');
commit;

-- ---------------------------------------------------------------------------
\echo '— le dossier cloture ne compte dans aucune pastille'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0031-0000-0000-00000000000a"}';

  -- Clara porte « emploi » et un dossier refermé : si elle entrait, la
  -- première pastille dirait deux.
  select public.verifier(
    (select urgence_emploi from public.accueil_chiffres()) = 1,
    'Clara est clôturée : son emploi ne compte plus');
commit;

\echo ''
\echo 'Tous les contrôles de 0031_urgences_par_type.sql sont passés.'
