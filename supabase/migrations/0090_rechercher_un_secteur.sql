-- ---------------------------------------------------------------------------
-- 0090 — trouver un secteur par un mot
--
-- Ce que ça change : taper « boulangerie » propose « 10 — Industries
-- alimentaires » ; taper « coiffeur », « 96 — Autres services
-- personnels » ; taper « 43.21 », « 43 — Travaux de construction
-- spécialisés ». Décision du 12 novembre 2026 : certains intitulés officiels
-- ne parlent pas à un candidat, la recherche par mot les lui fait trouver.
--
-- Comment : le mot est cherché dans les 1 728 intitulés de la nomenclature
-- (0087), tous niveaux confondus.
--
--   * pour un candidat (par défaut), chaque trouvaille remonte à ce qu'il
--     peut choisir — sa division, ou la section elle-même si c'est une
--     section qui répond. Le niveau fin sert à trouver, pas à choisir ;
--   * pour une loge (`precis => true`), chaque trouvaille est rendue telle
--     quelle, jusqu'à la sous-classe : la loge coche aussi précis qu'elle le
--     veut (0089). « installation électrique » propose alors « 43.21 —
--     Installation électrique » puis « 43.21A — Travaux d'installation
--     électrique dans tous locaux ».
--
--   * accents et majuscules ignorés : « electricite » trouve « électricité » ;
--   * un mot cherche aussi ses variantes : on garde son début (« coiffeur » →
--     « coiff ») pour trouver « coiffure ». Au moins quatre lettres, trois de
--     moins que le mot ;
--   * plusieurs mots : tous doivent se trouver dans le même intitulé
--     (« aide domicile » → « 88.10A — Aide à domicile ») ;
--   * les petits mots (« de », « des », « pour »…) sont ignorés ;
--   * un début de code (« 43 », « 43.21 », « 43.21A ») cherche par le code.
--
-- Ordre des réponses, pour un candidat : d'abord ce qui répond par son propre
-- intitulé (une section, puis une division), ensuite ce qui répond par un
-- niveau plus fin ; à égalité, la division qui répond le plus souvent. Pour
-- une loge : l'intitulé que la demande explique le mieux. Vingt réponses au
-- plus.
--
-- Limite connue : la nomenclature décrit des activités, pas des métiers. Ce
-- qui se dit comme l'activité se trouve (« boulangerie », « maçon » par
-- « maçonnerie », « plombier » par « plomberie », « comptable »). Un nom de
-- métier, non : « vendeur », « secrétaire », « aide-soignant » ne trouvent
-- rien, « électricien » trouve la production d'électricité mais pas
-- l'installation électrique, et « cuisinier » mène à « 31 — Fabrication de
-- meubles », par
-- « meubles de cuisine ». Une liste de synonymes (« cuisinier » →
-- « 56 — Restauration ») corrigera ces cas ; elle reste à décider.
--
-- Accès : réservée à la clé de service pour l'instant. Les écrans qui
-- s'en serviront ouvriront l'exécution à qui en a besoin.
-- ---------------------------------------------------------------------------

-- 1. Comparer sans accents ni majuscules -----------------------------------
-- `translate` plutôt que l'extension `unaccent` : rien à installer, et la
-- fonction reste immuable. Les ligatures passent d'abord : « œuvre » → « oeuvre ».
create or replace function public.naf_sans_accent(texte text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(
    replace(replace(replace(replace(coalesce(texte, ''),
      'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy'))
$$;

comment on function public.naf_sans_accent(text) is
  'Le texte en minuscules, sans accents ni ligatures. Sert à la recherche de '
  'secteur.';

revoke all on function public.naf_sans_accent(text) from public, anon, authenticated;
grant execute on function public.naf_sans_accent(text) to service_role;

-- 2. La recherche ------------------------------------------------------------
-- Une première version, jamais déployée, n'avait pas `precis` : on la retire
-- pour ne pas laisser deux fonctions du même nom.
drop function if exists public.rechercher_secteur(text);

create or replace function public.rechercher_secteur(recherche text, precis boolean default false)
returns table (
  /** Le code proposé : une section ou une division ; avec `precis`, tout niveau. */
  code              text,
  intitule          text,
  niveau            text,
  /** La section qui la contient — elle-même, pour une section. */
  section           text,
  section_intitule  text,
  /** 1 = la meilleure réponse. */
  rang              integer
)
language sql
stable
security definer
set search_path = public
as $$
  with demande as (
    select btrim(coalesce(recherche, '')) as texte
  ),
  mots as (
    select distinct left(m, greatest(4, length(m) - 3)) as racine
      from demande,
           regexp_split_to_table(public.naf_sans_accent(demande.texte), '[^a-z0-9]+') as m
     where length(m) >= 3
       and m not in ('les', 'des', 'aux', 'par', 'pour', 'une', 'sur', 'dans',
                     'avec', 'sans', 'hors', 'que', 'qui', 'son', 'ses', 'leur', 'leurs')
  ),
  -- Un début de code, strictement : deux chiffres, puis le reste d'un code.
  par_code as (
    select n.code, n.niveau
      from demande, public.code_naf n
     where upper(demande.texte) ~ '^[0-9]{2}(\.[0-9]{0,2}[A-Z]?)?$'
       and starts_with(n.code, upper(demande.texte))
  ),
  -- Tous les mots de la demande dans le même intitulé. La couverture dit la
  -- part de l'intitulé que la demande explique : « Installation électrique »
  -- (1 mot sur 2) répond mieux à « électricien » que « Fabrication de
  -- moteurs, génératrices et transformateurs électriques… » (1 sur 9).
  par_mot as (
    select n.code, n.niveau,
           (select count(*) filter (where exists (select 1 from mots where starts_with(w, mots.racine)))::numeric
                   / greatest(count(*), 1)
              from unnest(i.mots) as w) as couverture
      from public.code_naf n
      cross join lateral (
        select array_agg(w) as mots
          from regexp_split_to_table(public.naf_sans_accent(n.intitule), '[^a-z0-9]+') as w
         where length(w) >= 3
           and w not in ('les', 'des', 'aux', 'par', 'pour', 'une', 'sur', 'dans',
                         'avec', 'sans', 'hors', 'que', 'qui', 'son', 'ses', 'leur', 'leurs', 'tous')
      ) as i
     where exists (select 1 from mots)
       and not exists (
         select 1 from mots
          where not exists (select 1 from unnest(i.mots) as w where starts_with(w, mots.racine)))
  ),
  trouvailles as (
    select code, niveau, 1::numeric as couverture from par_code
    union all
    select code, niveau, couverture from par_mot
  ),
  -- Sans `precis`, chaque trouvaille remonte à ce qu'un candidat peut
  -- choisir. Sous la section, les deux premiers chiffres d'un code sont ceux
  -- de sa division (format imposé par 0086).
  --
  -- Avec `precis`, chaque trouvaille reste elle-même — sauf une sous-classe
  -- qui répète mot pour mot l'intitulé de sa classe (« 35.11 » et « 35.11Z —
  -- Production d'électricité ») : la classe suffit, la liste n'en montre
  -- qu'une.
  cibles as (
    select case when precis or t.niveau = 'section' then t.code else left(t.code, 2) end as cible,
           case t.niveau
             when 'section'  then 1
             when 'division' then 2
             when 'groupe'   then 3
             when 'classe'   then 4
             else 5
           end as profondeur,
           t.couverture
      from trouvailles t
     where not (precis and t.niveau = 'sous-classe' and exists (
             select 1 from public.code_naf e, public.code_naf p
              where e.code = t.code and p.code = e.parent and p.intitule = e.intitule))
  ),
  -- Pour un candidat : ce qui répond par son propre intitulé d'abord (une
  -- section, puis une division), puis la division qui répond le plus souvent.
  -- Pour une loge : la meilleure couverture d'abord, puis le niveau le plus
  -- large.
  classees as (
    select x.cible,
           row_number() over (order by case when precis then max(x.couverture) end desc nulls last,
                                       min(x.profondeur), count(*) desc, x.cible) as rang
      from cibles x
     group by x.cible
  )
  -- La section de chaque réponse : elle-même pour une section, sinon celle de
  -- sa division.
  select c.code, c.intitule, c.niveau, s.code, s.intitule, k.rang::integer
    from classees k
    join public.code_naf c on c.code = k.cible
    left join public.code_naf d on d.code = left(c.code, 2) and c.niveau <> 'section'
    join public.code_naf s on s.code = case when c.niveau = 'section' then c.code else d.parent end
   where k.rang <= 20
   order by k.rang
$$;

comment on function public.rechercher_secteur(text, boolean) is
  'Trouve, à partir d''un mot ou d''un début de code, les secteurs NAF à '
  'proposer. Cherche dans les cinq niveaux. Par défaut, ne rend que des '
  'sections et des divisions (candidat) ; avec precis, tout niveau (loge). '
  'Vingt réponses au plus, la meilleure en tête.';

revoke all on function public.rechercher_secteur(text, boolean) from public, anon, authenticated;
grant execute on function public.rechercher_secteur(text, boolean) to service_role;
