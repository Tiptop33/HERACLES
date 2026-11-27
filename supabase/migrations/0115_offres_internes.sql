-- ---------------------------------------------------------------------------
-- 0115 — les offres saisies ont leur écran : « Offres internes »
--
-- Ce que ça change : les offres saisies à la main (0114) quittent l'écran
-- « Offres externes » pour l'écran « Offres internes », jusqu'ici grisé dans
-- la famille « Emploi » (décision du 27 novembre 2026, rectifiant celle du
-- matin : « offres externes, c'est plutôt offres internes »).
--
--   · « Offres externes » ne montre plus que les offres de France Travail :
--     sa liste (`offres_en_cours`) et ses deux menus (`filtres_des_offres`)
--     écartent les offres saisies ;
--   · « Offres internes » lit les offres saisies en cours par une fonction à
--     elle, `offres_internes_en_cours` — une liste simple, sans recherche ni
--     filtre : elles sont peu nombreuses ;
--   · rien ne change ailleurs : l'accueil et la page du candidat montrent
--     toujours les deux sortes d'offres, et les offres saisies sorties de la
--     liste se lisent toujours par `offres_saisies_echues` (0114).
--
-- Accès : référents et administration, comme les deux écrans. Rejouable :
-- `create or replace`, sans changement de type de retour.
-- ---------------------------------------------------------------------------

-- 1. « Offres externes » : France Travail seulement ---------------------------

-- Même fonction qu'en 0114, à une condition près : `origine = 'france_travail'`.
create or replace function public.offres_en_cours(
  les_departements text[]  default null,
  le_secteur       text    default null,
  limite           integer default 50,
  decalage         integer default 0,
  la_recherche     text    default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultat jsonb;
  mots     text[] := public.mots_d_une_recherche(la_recherche);
begin
  if not public.est_referent_ou_admin() then
    raise exception 'Les offres sont réservées aux référents'
      using errcode = 'insufficient_privilege';
  end if;

  with retenues as (
    select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
           o.type_offre, o.date_creation,
           coalesce(o.date_actualisation, o.date_creation) as quand
      from public.offre_emploi o
     where o.origine = 'france_travail'
       and coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and (coalesce(cardinality(les_departements), 0) = 0
            or public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                           o.lieu_code_insee, o.lieu_libelle)
               = any (les_departements))
       and (nullif(btrim(le_secteur), '') is null
            or public.section_naf_d_une_offre(o.code_naf) = btrim(le_secteur))
       and (cardinality(mots) = 0
            or o.texte_cherche like all (mots))
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
                       'type_contrat_libelle', p.type_contrat_libelle,
                       'type_offre', p.type_offre,
                       'date_creation', p.date_creation)
                     order by p.quand desc, p.id)
                from la_page p),
             '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

comment on function public.offres_en_cours(text[], text, integer, integer, text) is
  'Une page des offres de France Travail en cours — l''écran Offres externes —, '
  'filtrées par départements (l''un ou l''autre), par secteur (section NAF) et '
  'par mots (tous, sans accents), avec le total. Les offres saisies à la main '
  'ont leur écran (offres_internes_en_cours, 0115). Réservée aux référents et '
  'à l''administration ; 200 lignes par page au plus.';

revoke all on function public.offres_en_cours(text[], text, integer, integer, text) from public, anon;
grant execute on function public.offres_en_cours(text[], text, integer, integer, text)
  to authenticated, service_role;

-- Même fonction qu'en 0098, à la même condition près : les menus ne proposent
-- que ce que la liste peut montrer.
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
     where o.origine = 'france_travail'
       and coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
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
  'offre de France Travail en cours : ce que proposent les deux menus de '
  'l''écran Offres externes.';

revoke all on function public.filtres_des_offres() from public, anon;
grant execute on function public.filtres_des_offres() to authenticated, service_role;

-- 2. « Offres internes » : les offres saisies en cours -------------------------

-- Toutes les offres saisies encore en ligne, de tous les référents, les plus
-- récemment publiées ou prolongées d'abord. Deux cents au plus : au-delà,
-- l'écran demandera une recherche.
create or replace function public.offres_internes_en_cours()
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'intitule', x.intitule, 'entreprise_nom', x.entreprise_nom,
           'lieu_libelle', x.lieu_libelle, 'type_contrat_libelle', x.type_contrat_libelle,
           'type_offre', x.type_offre, 'date_creation', x.date_creation)
         order by x.quand desc, x.id), '[]'::jsonb)
    into resultat
    from (select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
                 o.type_offre, o.date_creation,
                 coalesce(o.date_actualisation, o.date_creation) as quand
            from public.offre_emploi o
           where o.origine = 'saisie'
             and coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
           order by quand desc, o.id
           limit 200) x;

  return resultat;
end
$$;

comment on function public.offres_internes_en_cours() is
  'Les offres saisies à la main encore en ligne — l''écran Offres internes. '
  'Réservée aux référents et à l''administration ; 200 au plus.';

revoke all on function public.offres_internes_en_cours() from public, anon;
grant execute on function public.offres_internes_en_cours() to authenticated;
