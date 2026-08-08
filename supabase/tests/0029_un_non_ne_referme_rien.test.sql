-- Tests de la migration 0029_un_non_ne_referme_rien.sql.
--
-- Le point de bascule : `ARCHIVER` est un oui/non rempli sur les 107 fiches.
-- Si un « Non » referme un dossier, tous les dossiers sont clos et tous les
-- compteurs tombent à zéro. C'est ce qui arrivait.
--
-- On éprouve donc la règle mot à mot, puis on vérifie qu'un candidat « Non »
-- se compte à nouveau — à l'accueil comme dans l'annuaire.

\set ON_ERROR_STOP on
\o /dev/null

\set ada 'eeeeeeee-0029-0000-0000-00000000000a'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada', 'ada.0029@example.org', '{"role":"referent","nom":"Lovelace","prenom":"Ada"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0029', 'Guyenne — 0029')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0029-ada', :'ada', 'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0029'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— une negation ne referme rien, une raison referme'
-- ---------------------------------------------------------------------------
select public.verifier(
  public.mot_de_fermeture('Non')     is null
    and public.mot_de_fermeture('non')    is null
    and public.mot_de_fermeture('  NON ') is null
    and public.mot_de_fermeture('Aucun')  is null
    and public.mot_de_fermeture('Aucune') is null
    and public.mot_de_fermeture('0')      is null,
  'les six façons d''écrire « non » ne referment rien');

select public.verifier(
  public.mot_de_fermeture(null) is null
    and public.mot_de_fermeture('')     is null
    and public.mot_de_fermeture('   ')  is null,
  'une colonne vide non plus');

select public.verifier(
  public.mot_de_fermeture('Oui')             = 'Oui'
    and public.mot_de_fermeture('Lui-même')  = 'Lui-même'
    and public.mot_de_fermeture('Heraclés')  = 'Heraclés'
    and public.mot_de_fermeture('Autre ,,,') = 'Autre ,,,'
    and public.mot_de_fermeture(' Sans nouvelles ') = 'Sans nouvelles',
  'les valeurs relevées chez Bubble referment, et rendent leur motif');

-- Le mot est écarté sur la négation entière, pas sur ses premières lettres :
-- sans la frontière de mot, « Nonobstant » ou « Aucunement » passeraient pour
-- des « non ».
select public.verifier(
  public.mot_de_fermeture('Nonobstant') = 'Nonobstant'
    and public.mot_de_fermeture('Noté')  = 'Noté',
  'un mot qui commence par « non » sans être « non » referme bien');

-- ---------------------------------------------------------------------------
\echo '— le dossier « ARCHIVER = Non » est un dossier en cours'
-- ---------------------------------------------------------------------------
insert into public.candidat (bubble_id, nom, prenom, type_emploi, loge_id, cree_le) values
  ('cand-0029-encours',  'EnCours',  'Elia',  'CDI', (select id from public.loge where bubble_id = 'loge-0029'), now()),
  ('cand-0029-archive',  'Archive',  'Aristide', 'CDI', (select id from public.loge where bubble_id = 'loge-0029'), now()),
  ('cand-0029-cloture',  'Cloture',  'Clara', 'CDI', (select id from public.loge where bubble_id = 'loge-0029'), now()),
  ('cand-0029-suivi',    'Suivi',    'Sami',  'CDI', (select id from public.loge where bubble_id = 'loge-0029'), now());

update public.candidat set archive = 'Non' where bubble_id like 'cand-0029-%';
update public.candidat set archive = 'Oui'      where bubble_id = 'cand-0029-archive';
update public.candidat set cloture = 'Lui-même' where bubble_id = 'cand-0029-cloture';
update public.candidat set referent_id = (select id from public.referent where bubble_id = 'ref-0029-ada')
 where bubble_id = 'cand-0029-suivi';

select public.verifier(
  (select public.candidat_est_clos(c.*) from public.candidat c
    where c.bubble_id = 'cand-0029-encours') = false,
  '« Non » sans clôture : le dossier est en cours');

select public.verifier(
  (select public.candidat_est_clos(c.*) from public.candidat c
    where c.bubble_id = 'cand-0029-archive') = true,
  '« Oui » : le dossier est archivé');

select public.verifier(
  (select public.candidat_est_clos(c.*) from public.candidat c
    where c.bubble_id = 'cand-0029-cloture') = true,
  'clôturé par quelqu''un, même avec « ARCHIVER = Non » : refermé quand même');

-- ---------------------------------------------------------------------------
\echo '— et les compteurs cessent d afficher zero'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-0029-0000-0000-00000000000a"}';

  select public.verifier(
    (select mes_candidats from public.accueil_chiffres()) = 1,
    'le candidat qu''Ada accompagne se compte, bien qu''il porte « ARCHIVER = Non »');

  select public.verifier(
    (select en_attente from public.accueil_chiffres()) = 1,
    'et celui que personne n''a pris attend un référent, au lieu de disparaître');

  select public.verifier(
    (select candidats_suivis from public.annuaire_referents() where c_est_moi) = 1,
    'la carte de l''annuaire cesse d''annoncer « aucun candidat accompagné »');
commit;

\echo ''
\echo 'Tous les contrôles de 0029_un_non_ne_referme_rien.sql sont passés.'
