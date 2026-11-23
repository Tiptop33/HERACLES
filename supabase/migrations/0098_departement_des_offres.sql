-- ---------------------------------------------------------------------------
-- 0098 — le département d'une offre, lu partout où il est écrit
--
-- Ce que ça change : sur l'écran « France Travail », le menu « Départements »
-- était vide sur le site d'essai (23 novembre 2026). La migration 0097 ne
-- lisait le département que dans deux colonnes — le texte `departement` et le
-- code postal — et, sur les offres reprises de Bubble, aucune des deux ne le
-- donnait. Il est pourtant écrit ailleurs : France Travail nomme le lieu
-- « 33 - BORDEAUX », et donne le code INSEE de la commune.
--
-- On lit donc, dans l'ordre, et on s'arrête au premier qui répond :
--   1. le texte `departement`, s'il commence par un numéro ;
--   2. le code postal — espaces retirés, et le zéro de tête rendu quand
--      Bubble l'a mangé (« 1000 » pour « 01000 ») ;
--   3. le code INSEE de la commune (« 33063 », « 2A004 », « 97105 ») ;
--   4. le libellé du lieu, s'il commence par « 33 - ».
--
-- Pourquoi une nouvelle fonction plutôt qu'un correctif de l'ancienne : il lui
-- faut deux colonnes de plus, donc deux arguments de plus. L'ancienne, à deux
-- arguments, reste en place — 0097 est rejouée à chaque déploiement et la
-- recrée — mais plus rien ne l'appelle une fois cette migration passée.
--
-- Accès : inchangé. Rejouable : `create or replace`.
-- ---------------------------------------------------------------------------

-- 1. Le département, par quatre chemins ---------------------------------------

create or replace function public.departement_d_une_offre(
  le_departement text, le_code_postal text, le_code_insee text, le_libelle text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           -- 1. le texte de Bubble
           when x.d  ~ '^2[AB]'            then left(x.d, 2)
           when x.d  ~ '^9[78][0-9]'       then left(x.d, 3)
           when x.d  ~ '^[0-9]{2}'         then left(x.d, 2)
           when x.d  ~ '^[1-9]([^0-9]|$)'  then '0' || left(x.d, 1)
           -- 2. le code postal
           when x.cp ~ '^9[78][0-9]{3}$'   then left(x.cp, 3)
           when x.cp ~ '^20[01][0-9]{2}$'  then '2A'
           when x.cp ~ '^20[26][0-9]{2}$'  then '2B'
           when x.cp ~ '^[0-9]{5}$'        then left(x.cp, 2)
           -- 3. le code INSEE de la commune
           when x.ci ~ '^2[AB][0-9]{3}$'   then left(x.ci, 2)
           when x.ci ~ '^9[78][0-9]{3}$'   then left(x.ci, 3)
           when x.ci ~ '^[0-9]{5}$'        then left(x.ci, 2)
           -- 4. « 33 - BORDEAUX »
           when x.l  ~ '^2[AB] *-'         then left(x.l, 2)
           when x.l  ~ '^9[78][0-9] *-'    then left(x.l, 3)
           when x.l  ~ '^[0-9]{2} *-'      then left(x.l, 2)
         end
    from (select upper(btrim(coalesce(le_departement, ''))) as d,
                 -- « 33 000 » → « 33000 » ; « 1000 » → « 01000 »
                 case when p.brut ~ '^[0-9]{4}$' then '0' || p.brut else p.brut end as cp,
                 upper(btrim(coalesce(le_code_insee, ''))) as ci,
                 upper(btrim(coalesce(le_libelle, '')))    as l
            from (select regexp_replace(coalesce(le_code_postal, ''), '\s', '', 'g') as brut) p) x
$$;

comment on function public.departement_d_une_offre(text, text, text, text) is
  'Le numéro de département d''une offre, lu dans l''ordre : le texte repris de '
  'Bubble, le code postal, le code INSEE de la commune, le libellé du lieu.';

revoke all on function public.departement_d_une_offre(text, text, text, text) from public, anon;
grant execute on function public.departement_d_une_offre(text, text, text, text) to authenticated, service_role;

-- 2. Ce que les deux menus proposent — même fonction qu'en 0097, à ceci près
--    qu'elle lit le département par les quatre colonnes ------------------------

-- { "departements": ["33", "47", …],
--   "secteurs":     [["C", "Industrie manufacturière"], ["F", "Construction"], …] }
-- Seulement ce qui porte au moins une offre en cours.
create or replace function public.filtres_des_offres()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultat jsonb;
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Les offres sont réservées aux référents'
      using errcode = 'insufficient_privilege';
  end if;

  with en_cours as (
    select public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                           o.lieu_code_insee, o.lieu_libelle) as dep,
           public.section_naf_d_une_offre(o.code_naf)                        as sec
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
  )
  select jsonb_build_object(
           'departements',
           coalesce((select jsonb_agg(d.dep order by d.dep)
                       from (select distinct e.dep from en_cours e where e.dep is not null) d),
                    '[]'::jsonb),
           'secteurs',
           coalesce((select jsonb_agg(jsonb_build_array(n.code, n.intitule) order by n.code)
                       from public.code_naf n
                      where n.niveau = 'section'
                        and n.code in (select e.sec from en_cours e)),
                    '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

comment on function public.filtres_des_offres() is
  'Les départements et les secteurs (sections NAF) qui portent au moins une '
  'offre en cours : ce que proposent les deux menus de l''écran France Travail.';

revoke all on function public.filtres_des_offres() from public, anon;
grant execute on function public.filtres_des_offres() to authenticated, service_role;

-- 3. La liste — même fonction qu'en 0097, avec la même correction -------------

-- Les offres en cours, les plus récemment actualisées d'abord, page par page :
--   { "total": 4539, "offres": [ { "id": …, "intitule": …, … }, … ] }
-- `total` compte tout ce qui répond aux filtres, pas la seule page : c'est lui
-- qui dit à l'écran combien de pages il y a.
--
-- Sans département ni secteur : toutes. Plusieurs départements : l'un OU
-- l'autre. Département et secteur ensemble : l'un ET l'autre. La taille de la
-- page est bornée ici, pas dans la page web : une adresse trafiquée n'obtient
-- pas dix mille lignes d'un coup.
create or replace function public.offres_en_cours(
  les_departements text[]  default null,
  le_secteur       text    default null,
  limite           integer default 50,
  decalage         integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultat jsonb;
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Les offres sont réservées aux référents'
      using errcode = 'insufficient_privilege';
  end if;

  with retenues as (
    select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
           coalesce(o.date_actualisation, o.date_creation) as quand
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and (coalesce(cardinality(les_departements), 0) = 0
            or public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                           o.lieu_code_insee, o.lieu_libelle)
               = any (les_departements))
       and (nullif(btrim(le_secteur), '') is null
            or public.section_naf_d_une_offre(o.code_naf) = btrim(le_secteur))
  ),
  la_page as (
    select r.* from retenues r
     order by r.quand desc, r.id
     limit least(greatest(coalesce(limite, 50), 1), 200)
    offset greatest(coalesce(decalage, 0), 0)
  )
  select jsonb_build_object(
           'total', (select count(*) from retenues),
           'offres', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', p.id, 'intitule', p.intitule, 'entreprise_nom', p.entreprise_nom,
                       'lieu_libelle', p.lieu_libelle,
                       'type_contrat_libelle', p.type_contrat_libelle)
                     order by p.quand desc, p.id)
                from la_page p),
             '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

comment on function public.offres_en_cours(text[], text, integer, integer) is
  'Une page des offres en cours de l''écran France Travail, filtrées par '
  'départements (l''un ou l''autre) et par secteur (section NAF), avec le total. '
  'Réservée aux référents et à l''administration ; 200 lignes par page au plus.';

revoke all on function public.offres_en_cours(text[], text, integer, integer) from public, anon;
grant execute on function public.offres_en_cours(text[], text, integer, integer) to authenticated, service_role;
