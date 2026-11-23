-- ---------------------------------------------------------------------------
-- 0097 — les offres en cours, par département et par secteur d'activité
--
-- Ce que ça change : l'écran « France Travail » (l'ancien « Offres externes »)
-- laisse choisir un ou plusieurs départements et un secteur d'activité, et ne
-- montre que les offres en cours qui y répondent. Les deux menus ne proposent
-- que ce qui existe : les départements et les secteurs où il y a, aujourd'hui,
-- au moins une offre en cours.
--
-- Pourquoi des fonctions, et non un filtre écrit dans la page :
--   · le secteur d'une offre se lit dans la nomenclature (`code_naf`, 0086),
--     qui est fermée — ni policy, ni droit de table. La page ne peut pas faire
--     la jointure elle-même ;
--   · le département d'une offre n'est pas fiable tel que Bubble le donne :
--     la colonne `departement` est du texte libre, parfois vide. On le déduit
--     une fois, ici, du texte quand il commence par un numéro, sinon du code
--     postal — plutôt que de l'écrire deux fois, en SQL et dans la page.
--
-- « En cours » garde le sens du compteur de l'accueil (0011) : actualisée — à
-- défaut créée — depuis moins de trente jours.
--
-- Le secteur est la SECTION de la NAF (21 grands secteurs, « F —
-- Construction ») : `offre_emploi.code_naf` est une sous-classe (« 43.21A »),
-- ses deux premiers chiffres donnent la division, qui donne la section.
--
-- Accès : référents et administration, comme l'écran. Un compte chercheur est
-- refusé, une personne non connectée n'a pas le droit d'exécuter. Rien de
-- personnel ici : une offre ne dit rien d'un candidat ni d'un référent.
--
-- Rejouable : `create or replace`, sans changement de type de retour.
-- ---------------------------------------------------------------------------

-- 1. Le département d'une offre ------------------------------------------------

-- « 33 », « 33 - Gironde », « 2A », « 971 » dans le texte ; sinon le code
-- postal : deux chiffres, trois outre-mer, et la Corse partagée entre 2A
-- (200xx, 201xx) et 2B (202xx, 206xx). Vide quand rien ne se reconnaît :
-- l'offre reste visible sans filtre, elle ne se range dans aucun département.
create or replace function public.departement_d_une_offre(le_departement text, le_code_postal text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when x.d  ~ '^2[AB]'            then left(x.d, 2)
           when x.d  ~ '^9[78][0-9]'       then left(x.d, 3)
           when x.d  ~ '^[0-9]{2}'         then left(x.d, 2)
           when x.d  ~ '^[1-9]([^0-9]|$)'  then '0' || left(x.d, 1)
           when x.cp ~ '^9[78][0-9]{3}$'   then left(x.cp, 3)
           when x.cp ~ '^20[01][0-9]{2}$'  then '2A'
           when x.cp ~ '^20[26][0-9]{2}$'  then '2B'
           when x.cp ~ '^[0-9]{5}$'        then left(x.cp, 2)
         end
    from (select upper(btrim(coalesce(le_departement, ''))) as d,
                 btrim(coalesce(le_code_postal, ''))        as cp) x
$$;

comment on function public.departement_d_une_offre(text, text) is
  'Le numéro de département d''une offre : lu dans le texte repris de Bubble '
  'quand il commence par un numéro, sinon déduit du code postal.';

revoke all on function public.departement_d_une_offre(text, text) from public, anon;
grant execute on function public.departement_d_une_offre(text, text) to authenticated, service_role;

-- 2. Le secteur d'une offre ----------------------------------------------------

-- « 43.21A », « 4321A » ou « 43 » → « F ». `security definer` : la
-- nomenclature est fermée. Elle n'est appelée que par les fonctions ci-dessous.
create or replace function public.section_naf_d_une_offre(le_code_naf text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select n.parent
    from public.code_naf n
   where n.niveau = 'division'
     and n.code = left(regexp_replace(coalesce(le_code_naf, ''), '[^0-9A-Za-z]', '', 'g'), 2)
$$;

revoke all on function public.section_naf_d_une_offre(text) from public, anon, authenticated;

-- 3. Ce que les deux menus proposent -------------------------------------------

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
    select public.departement_d_une_offre(o.departement, o.lieu_code_postal) as dep,
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

-- 4. La liste -------------------------------------------------------------------

-- Les offres en cours, les plus récemment actualisées d'abord. Sans
-- département ni secteur : toutes. Plusieurs départements : l'un OU l'autre.
-- Département et secteur ensemble : l'un ET l'autre. La limite est bornée ici,
-- pas dans la page : une adresse trafiquée n'obtient pas dix mille lignes.
create or replace function public.offres_en_cours(
  les_departements text[]  default null,
  le_secteur       text    default null,
  limite           integer default 50)
returns table (id uuid, intitule text, entreprise_nom text, lieu_libelle text,
               type_contrat_libelle text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Les offres sont réservées aux référents'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and (coalesce(cardinality(les_departements), 0) = 0
            or public.departement_d_une_offre(o.departement, o.lieu_code_postal)
               = any (les_departements))
       and (nullif(btrim(le_secteur), '') is null
            or public.section_naf_d_une_offre(o.code_naf) = btrim(le_secteur))
     order by coalesce(o.date_actualisation, o.date_creation) desc, o.id
     limit least(greatest(coalesce(limite, 50), 1), 200);
end
$$;

comment on function public.offres_en_cours(text[], text, integer) is
  'Les offres en cours de l''écran France Travail, filtrées par départements '
  '(l''un ou l''autre) et par secteur (section NAF). Réservée aux référents et '
  'à l''administration ; 200 lignes au plus.';

revoke all on function public.offres_en_cours(text[], text, integer) from public, anon;
grant execute on function public.offres_en_cours(text[], text, integer) to authenticated, service_role;
