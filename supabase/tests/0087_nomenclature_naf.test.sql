-- Tests de la migration 0087_nomenclature_naf.sql.
--
-- Ce qu'on éprouve :
--   * les cinq niveaux sont complets : 21, 88, 272, 615, 732 ;
--   * chaque code est rangé sous le niveau juste au-dessus, et toute
--     sous-classe remonte jusqu'à une section ;
--   * des intitulés conformes à l'INSEE, dont ceux qui portent une apostrophe
--     et le plus long ;
--   * la migration se rejoue sans doubler et sans écraser une correction.

\set ON_ERROR_STOP on
\o /dev/null

\echo '— les cinq niveaux, complets'
select public.verifier(
  (select array_agg(n order by o)
     from (select niveau || ' ' || count(*) as n,
                  min(case niveau when 'section' then 1 when 'division' then 2
                                  when 'groupe' then 3 when 'classe' then 4 else 5 end) as o
             from public.code_naf group by niveau) t)
  = array['section 21', 'division 88', 'groupe 272', 'classe 615', 'sous-classe 732'],
  '21 sections, 88 divisions, 272 groupes, 615 classes, 732 sous-classes');

select public.verifier(
  (select string_agg(code, '' order by code) from public.code_naf where niveau = 'section')
  = 'ABCDEFGHIJKLMNOPQRSTU',
  'les sections vont de A à U');

\echo '— chaque code sous son parent'
select public.verifier(
  not exists (
    select 1
      from public.code_naf e
      left join public.code_naf p on p.code = e.parent
     where e.niveau <> 'section'
       and (p.code is null or p.niveau <> case e.niveau
              when 'division' then 'section' when 'groupe' then 'division'
              when 'classe' then 'groupe' else 'classe' end)),
  'chaque code a un parent, exactement un niveau au-dessus');

select public.verifier(
  (with recursive chaine as (
     select code as depart, code, parent from public.code_naf where niveau = 'sous-classe'
     union all
     select c.depart, p.code, p.parent
       from chaine c join public.code_naf p on p.code = c.parent)
   select count(distinct depart) from chaine where parent is null and code ~ '^[A-U]$')
  = 732,
  'les 732 sous-classes remontent jusqu''à une section');

select public.verifier(
  (select parent from public.code_naf where code = '43') = 'F'
    and (select parent from public.code_naf where code = '43.21A') = '43.21'
    and (select parent from public.code_naf where code = '10') = 'C'
    and (select parent from public.code_naf where code = '62') = 'J',
  '43 sous F, 43.21A sous 43.21, 10 sous C, 62 sous J');

\echo '— des intitulés conformes'
select public.verifier(
  (select intitule from public.code_naf where code = 'F') = 'Construction'
    and (select intitule from public.code_naf where code = '43') = 'Travaux de construction spécialisés'
    and (select intitule from public.code_naf where code = '43.21A') = 'Travaux d''installation électrique dans tous locaux'
    and (select intitule from public.code_naf where code = '10.71C') = 'Boulangerie et boulangerie-pâtisserie'
    and (select intitule from public.code_naf where code = '88.10A') = 'Aide à domicile',
  'Construction, 43, 43.21A, 10.71C, 88.10A');

select public.verifier(
  (select intitule from public.code_naf where code = 'D')
    = 'Production et distribution d''électricité, de gaz, de vapeur et d''air conditionné'
  and (select intitule from public.code_naf where code = 'T')
    like 'Activités des ménages en tant qu''employeurs ; %pour usage propre',
  'les intitulés à apostrophe et le plus long sont entiers');

select public.verifier(
  not exists (select 1 from public.code_naf
               where intitule <> btrim(intitule) or intitule ~ '\s{2}'),
  'aucun intitulé n''a d''espace en trop');

\echo '— rejouable, sans écraser une correction'
begin;
  update public.code_naf set intitule = 'Construction (corrigé)' where code = 'F';
  \ir ../migrations/0087_nomenclature_naf.sql
  select public.verifier(
    (select count(*) from public.code_naf) = 1728,
    'rejouée, la migration ne double aucune ligne');
  select public.verifier(
    (select intitule from public.code_naf where code = 'F') = 'Construction (corrigé)',
    'et laisse en place un intitulé corrigé en base');
rollback;

\o
\echo '0087 — la nomenclature NAF, ses 1 728 lignes : tout est vert.'
