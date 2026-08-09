-- Tests de la migration 0043_exercice_2025_2026.sql.
--
-- Ce qu'on éprouve : la correction s'applique une fois, et ne repasse jamais
-- par-dessus un réglage postérieur. C'est tout l'enjeu — le serveur rejoue
-- toutes les migrations à chaque déploiement, et ces dates commandent toute
-- l'assiduité.
--
-- La ligne de réglages existe déjà : les tests précédents l'ont posée. On la
-- ramène ici dans l'état où la reprise Bubble l'avait laissée.

\set ON_ERROR_STOP on
\o /dev/null

-- ---------------------------------------------------------------------------
\echo '— la fin reprise de Bubble est corrigee'
-- ---------------------------------------------------------------------------
update public.parametre
   set date_depart = '2025-09-01', date_fin = '2026-07-31'
 where id;

\i supabase/migrations/0043_exercice_2025_2026.sql

select public.verifier(
  (select date_fin::date from public.parametre where id) = date '2026-08-31',
  'l''exercice va désormais jusqu''au 31 août 2026');

select public.verifier(
  (select date_depart::date from public.parametre where id) = date '2025-09-01',
  'et part toujours du 1er septembre 2025');

-- ---------------------------------------------------------------------------
\echo '— une date posee ensuite ne se fait pas ecraser'
-- ---------------------------------------------------------------------------
-- Le cas qui compte : l'an prochain, quelqu'un avance l'exercice, et le
-- déploiement suivant rejoue 0043. Elle doit se taire.
update public.parametre
   set date_depart = '2026-09-01', date_fin = '2027-08-31'
 where id;

\i supabase/migrations/0043_exercice_2025_2026.sql

select public.verifier(
  (select date_fin::date from public.parametre where id) = date '2027-08-31'
    and (select date_depart::date from public.parametre where id) = date '2026-09-01',
  'le déploiement suivant ne défait pas le réglage de l''année d''après');

-- ---------------------------------------------------------------------------
\echo '— mais une fin absente est bien posee'
-- ---------------------------------------------------------------------------
update public.parametre set date_depart = null, date_fin = null where id;

\i supabase/migrations/0043_exercice_2025_2026.sql

select public.verifier(
  (select date_fin::date from public.parametre where id) = date '2026-08-31'
    and (select date_depart::date from public.parametre where id) = date '2025-09-01',
  'sans dates du tout, la migration en pose');

-- ---------------------------------------------------------------------------
\echo '— et la migration ne cree jamais la ligne de reglages'
-- ---------------------------------------------------------------------------
-- Ce n'est pas son travail, et une base neuve n'a rien à corriger. Le vérifier
-- ici plutôt que de le supposer : c'est ce qui a cassé le test 0002 au premier
-- jet, la ligne étant créée avant qu'il ne la pose lui-même.
begin;
  delete from public.parametre where id;

  \i supabase/migrations/0043_exercice_2025_2026.sql

  select public.verifier(
    (select count(*) from public.parametre) = 0,
    'sur une base sans réglages, elle ne pose rien');
rollback;

-- On laisse l'exercice réel pour les tests qui suivent.
select public.verifier(
  (select date_fin::date from public.parametre where id) = date '2026-08-31',
  'et le rollback a bien rendu la ligne corrigée');

\echo ''
\echo 'Tous les contrôles de 0043_exercice_2025_2026.sql sont passés.'
