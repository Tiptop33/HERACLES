-- Tests de la migration 0087_secteurs_d_activite_naf.sql.
--
-- Ce qu'on éprouve :
--   * les 21 sections NAF sont là, de A à U, et aucune autre lettre seule ;
--   * leurs intitulés sont ceux de l'INSEE — on en contrôle quelques-uns,
--     dont les plus longs et ceux qui portent une apostrophe ;
--   * la migration se rejoue sans doubler et sans écraser une correction ;
--   * la table reste fermée : les ajouter n'a ouvert aucun accès.

\set ON_ERROR_STOP on
\o /dev/null

\echo '— les 21 secteurs, de A à U'
select public.verifier(
  (select string_agg(code, '' order by code)
     from public.code_naf where code ~ '^[A-Z]$')
  = 'ABCDEFGHIJKLMNOPQRSTU',
  'les sections A à U sont toutes là, et aucune autre lettre seule');

\echo '— des intitulés conformes à la nomenclature'
select public.verifier(
  (select intitule from public.code_naf where code = 'F') = 'Construction'
    and (select intitule from public.code_naf where code = 'I') = 'Hébergement et restauration'
    and (select intitule from public.code_naf where code = 'Q') = 'Santé humaine et action sociale',
  'Construction, Hébergement et restauration, Santé humaine et action sociale');

select public.verifier(
  (select intitule from public.code_naf where code = 'D')
    = 'Production et distribution d''électricité, de gaz, de vapeur et d''air conditionné'
  and (select intitule from public.code_naf where code = 'T')
    like 'Activités des ménages en tant qu''employeurs ; %pour usage propre',
  'les intitulés à apostrophe et le plus long sont entiers');

\echo '— rejouable, sans écraser une correction'
begin;
  update public.code_naf set intitule = 'Construction (corrigé)' where code = 'F';
  \ir ../migrations/0087_secteurs_d_activite_naf.sql
  select public.verifier(
    (select count(*) from public.code_naf where code ~ '^[A-Z]$') = 21,
    'rejouée, la migration ne double aucun secteur');
  select public.verifier(
    (select intitule from public.code_naf where code = 'F') = 'Construction (corrigé)',
    'et laisse en place un intitulé corrigé en base');
rollback;

\echo '— toujours fermée'
select public.verifier(
  not has_table_privilege('anon', 'public.code_naf', 'select')
    and not has_table_privilege('authenticated', 'public.code_naf', 'select'),
  'remplir la table n''a ouvert aucun accès');

\o
\echo '0087 — les 21 secteurs d''activité : tout est vert.'
