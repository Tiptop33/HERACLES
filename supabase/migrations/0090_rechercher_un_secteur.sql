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
-- (0087), tous niveaux confondus, puis chaque trouvaille remonte à ce qu'on
-- peut choisir — sa division, ou la section elle-même si c'est une section qui
-- répond. Le niveau fin sert à trouver, jamais à choisir.
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
-- Ordre des réponses : d'abord ce qui répond par son propre intitulé (une
-- section, puis une division), ensuite ce qui répond par un niveau plus fin ;
-- à égalité, la division qui répond le plus souvent. Vingt réponses au plus.
--
-- Limite connue : la nomenclature décrit des activités, pas des métiers. Ce
-- qui se dit comme l'activité se trouve (« boulangerie », « maçon » par
-- « maçonnerie », « plombier » par « plomberie », « comptable »). Un nom de
-- métier, non : « vendeur », « secrétaire », « aide-soignant » ne trouvent
-- rien, et « cuisinier » mène à « 31 — Fabrication de meubles », par
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
create or replace function public.rechercher_secteur(recherche text)
returns table (
  /** Le code à choisir : une division (« 10 ») ou une section (« F »). */
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
  -- Tous les mots de la demande dans le même intitulé.
  par_mot as (
    select n.code, n.niveau
      from public.code_naf n
     where exists (select 1 from mots)
       and not exists (
         select 1 from mots
          where not exists (
            select 1
              from regexp_split_to_table(public.naf_sans_accent(n.intitule), '[^a-z0-9]+') as w
             where starts_with(w, mots.racine)))
  ),
  trouvailles as (
    select * from par_code
    union
    select * from par_mot
  ),
  -- Chaque trouvaille remonte à ce qu'on peut choisir. Sous la section, les
  -- deux premiers chiffres d'un code sont ceux de sa division (format imposé
  -- par 0086).
  cibles as (
    select case when t.niveau = 'section' then t.code else left(t.code, 2) end as cible,
           case t.niveau
             when 'section'  then 1
             when 'division' then 2
             when 'groupe'   then 3
             when 'classe'   then 4
             else 5
           end as profondeur
      from trouvailles t
  ),
  classees as (
    select x.cible,
           row_number() over (order by min(x.profondeur), count(*) desc, x.cible) as rang
      from cibles x
     group by x.cible
  )
  select c.code, c.intitule, c.niveau,
         coalesce(s.code, c.code), coalesce(s.intitule, c.intitule),
         k.rang::integer
    from classees k
    join public.code_naf c on c.code = k.cible
    left join public.code_naf s on s.code = c.parent
   where k.rang <= 20
   order by k.rang
$$;

comment on function public.rechercher_secteur(text) is
  'Trouve, à partir d''un mot ou d''un début de code, les sections et '
  'divisions NAF à proposer. Cherche dans les cinq niveaux, ne rend que ce '
  'qui se choisit. Vingt réponses au plus, la meilleure en tête.';

revoke all on function public.rechercher_secteur(text) from public, anon, authenticated;
grant execute on function public.rechercher_secteur(text) to service_role;
