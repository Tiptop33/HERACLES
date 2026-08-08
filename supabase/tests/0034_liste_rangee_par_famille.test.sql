-- Tests de la migration 0034_liste_rangee_par_famille.sql.
--
-- Deux choses, et la seconde se perd facilement de vue : que les familles
-- sortent dans l'ordre voulu, et qu'à l'intérieur d'une famille le numéro
-- ordonne encore. Un tri qui grouperait bien mais mélangerait les numéros
-- rendrait la liste inutilisable pour qui cherche une fiche par son numéro.

\set ON_ERROR_STOP on
\o /dev/null

\set ada 'dddddddd-0034-0000-0000-00000000000a'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada', 'ada.0034@example.org', '{"role":"referent","nom":"Lovelace","prenom":"Ada"}');

insert into public.loge (bubble_id, nom) values ('loge-0034', 'Guyenne — 0034')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0034-ada', :'ada', 'Lovelace', 'Ada',
   (select id from public.loge where bubble_id = 'loge-0034'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— l ordre des familles est ecrit a un seul endroit'
-- ---------------------------------------------------------------------------
select public.verifier(
  public.rang_de_la_famille('emploi')     = 1
    and public.rang_de_la_famille('alternance') = 2
    and public.rang_de_la_famille('stage')      = 3
    and public.rang_de_la_famille('changement') = 4
    and public.rang_de_la_famille(null)         = 5
    and public.rang_de_la_famille('bizarre')    = 5,
  'emploi, alternance, stage, changement — et le reste à la fin');

-- ---------------------------------------------------------------------------
-- Les numéros sont posés à contre-emploi exprès : le premier de la liste par
-- numéro (3401) est un stage, le dernier (3408) un emploi. Si le tri par
-- famille ne s'appliquait pas, l'ordre obtenu serait exactement l'inverse.
-- ---------------------------------------------------------------------------
insert into public.candidat (bubble_id, nom, prenom, numero, type_emploi, loge_id, cree_le) values
  ('cand-0034-a', 'Un',    'Sacha', 3401, 'stage',                (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-b', 'Deux',  'Vera',  3402, null,                   (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-c', 'Trois', 'Elias', 3403, 'changement d''Emploi',  (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-d', 'Quatre','Alix',  3404, 'stage en alternance',  (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-e', 'Cinq',  'Nina',  3405, 'stage',                (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-f', 'Six',   'Omar',  3406, 'stage en alternance',  (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-g', 'Sept',  'Emma',  3407, 'emploi',               (select id from public.loge where bubble_id = 'loge-0034'), now()),
  ('cand-0034-h', 'Huit',  'Sofia', 3408, 'emploi',               (select id from public.loge where bubble_id = 'loge-0034'), now());

-- ---------------------------------------------------------------------------
\echo '— la liste sort par famille, puis par numero'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0034-0000-0000-00000000000a"}';

  select public.verifier(
    (select array_agg(numero order by rang)
       from (select numero, row_number() over () as rang
               from public.candidats_de_la_loge()
              where numero between 3401 and 3408) t)
      = array[3407, 3408, 3404, 3406, 3401, 3405, 3403, 3402],
    'emploi (3407, 3408), alternance (3404, 3406), stage (3401, 3405), changement (3403), sans famille (3402)');

  -- Dit autrement, et sans dépendre des numéros : les familles se suivent
  -- sans jamais revenir en arrière.
  select public.verifier(
    (select bool_and(r >= precedent)
       from (select public.rang_de_la_famille(famille) as r,
                    lag(public.rang_de_la_famille(famille), 1, 0) over () as precedent
               from public.candidats_de_la_loge()
              where numero between 3401 and 3408) t),
    'les blocs se suivent : aucune famille ne réapparaît après une autre');
commit;

-- ---------------------------------------------------------------------------
\echo '— le numero ordonne toujours a l interieur d une famille'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0034-0000-0000-00000000000a"}';

  select public.verifier(
    (select array_agg(numero order by rang)
       from (select numero, row_number() over () as rang
               from public.candidats_de_la_loge()
              where numero between 3401 and 3408 and famille = 'stage') t)
      = array[3401, 3405],
    'les deux stages restent dans l''ordre de leurs numéros');
commit;

-- ---------------------------------------------------------------------------
\echo '— ranger n a rien ouvert'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-0034-0000-0000-00000000000a"}';

  select public.verifier(
    (select count(*) from public.candidats_de_la_loge() where numero between 3401 and 3408) = 8,
    'les huit dossiers de sa loge, ni plus ni moins');
commit;

select public.verifier(
  not has_function_privilege('anon', 'public.candidats_de_la_loge()', 'execute'),
  'anon n''a toujours pas le droit d''appeler la liste');

\echo ''
\echo 'Tous les contrôles de 0034_liste_rangee_par_famille.sql sont passés.'
