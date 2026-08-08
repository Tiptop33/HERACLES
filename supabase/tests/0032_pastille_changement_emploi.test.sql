-- Tests de la migration 0032_pastille_changement_emploi.sql.
--
-- Le point fragile tient en une phrase : « changement d'Emploi » contient le
-- mot « emploi ». Si sa ligne passait après celle de l'emploi, la nouvelle
-- pastille resterait vide à jamais et personne ne s'en apercevrait — le total
-- des quatre resterait juste. C'est donc l'ordre des tests qu'il faut figer,
-- pas seulement le décompte.
--
-- Une loge, les quatre libellés de Bubble, un par dossier.

\set ON_ERROR_STOP on
\o /dev/null

\set ada 'bbbbbbbb-0032-0000-0000-00000000000a'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada', 'ada.0032@example.org', '{"role":"referent","nom":"Lovelace","prenom":"Ada"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0032', 'Guyenne — 0032')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0032-ada', :'ada', 'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0032'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— « changement d Emploi » se reconnait avant « emploi »'
-- ---------------------------------------------------------------------------
select public.verifier(
  public.famille_de_recherche('changement d''Emploi') = 'changement',
  'le libellé exact de Bubble tombe dans la quatrième famille');

-- Le contrôle qui protège l'ordre des lignes : si un jour « emploi » repassait
-- devant, celui-ci tomberait et dirait pourquoi.
select public.verifier(
  public.famille_de_recherche('changement d''Emploi') <> 'emploi',
  'et surtout pas dans « emploi », dont il contient pourtant le mot');

select public.verifier(
  public.famille_de_recherche('Changement d''emploi') = 'changement'
    and public.famille_de_recherche('CHANGEMENT EMPLOI')  = 'changement'
    and public.famille_de_recherche('changement de poste') = 'changement',
  'la casse et la tournure ne changent rien : c''est « changement » qui décide');

-- Les trois autres n'ont pas bougé, et une alternance reste une alternance
-- même si quelqu'un écrit un jour « changement pour une alternance ».
select public.verifier(
  public.famille_de_recherche('emploi')                = 'emploi'
    and public.famille_de_recherche('stage')               = 'stage'
    and public.famille_de_recherche('stage en alternance') = 'alternance'
    and public.famille_de_recherche('changement pour une alternance') = 'alternance',
  'les trois familles d''origine gardent leurs libellés');

select public.verifier(
  public.famille_de_recherche(null) is null
    and public.famille_de_recherche('CDI') is null,
  'et l''illisible reste sans famille');

-- ---------------------------------------------------------------------------
-- Quatre dossiers en cours, un par famille.
-- ---------------------------------------------------------------------------
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, cree_le) values
  ('cand-0032-emploi',     'Un',     'Emma',  'emploi',               (select id from public.loge where bubble_id = 'loge-0032'), now()),
  ('cand-0032-changement', 'Deux',   'Elias', 'changement d''Emploi',  (select id from public.loge where bubble_id = 'loge-0032'), now()),
  ('cand-0032-altern',     'Trois',  'Alix',  'stage en alternance',  (select id from public.loge where bubble_id = 'loge-0032'), now()),
  ('cand-0032-stage',      'Quatre', 'Sacha', 'stage',                (select id from public.loge where bubble_id = 'loge-0032'), now());

-- ---------------------------------------------------------------------------
\echo '— les quatre pastilles de l accueil, une par famille'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"bbbbbbbb-0032-0000-0000-00000000000a"}';

  select public.verifier(
    (select urgence_emploi from public.accueil_chiffres()) = 1
      and (select urgence_alternance from public.accueil_chiffres()) = 1
      and (select urgence_stage      from public.accueil_chiffres()) = 1
      and (select urgence_changement from public.accueil_chiffres()) = 1,
    'un dossier dans chacune des quatre');

  -- Le contrôle que la troisième pastille seule ne donnerait pas : Elias ne
  -- doit compter qu'une fois, et pas des deux côtés.
  select public.verifier(
    (select urgence_emploi + urgence_alternance + urgence_stage + urgence_changement
       from public.accueil_chiffres()) = 4,
    'quatre dossiers, quatre fois comptés — aucun ne tombe dans deux familles');

  select public.verifier(
    (select mes_candidats + en_attente from public.accueil_chiffres()) = 4,
    'et les deux premiers cadres retrouvent bien les mêmes quatre dossiers');
commit;

\echo ''
\echo 'Tous les contrôles de 0032_pastille_changement_emploi.sql sont passés.'
