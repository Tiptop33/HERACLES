-- ---------------------------------------------------------------------------
-- 0102 — la date de parution dans la liste des offres en cours
--
-- Ce que ça change : chaque ligne de la liste « Offres d'emploi en cours »
-- dit quand l'annonce est parue. La fonction qui sert la liste de l'écran
-- « France Travail » rend donc un champ de plus, `date_creation` — la date à
-- laquelle France Travail a publié l'offre. C'est la date de parution, pas
-- celle de la dernière actualisation : une offre parue il y a trois semaines
-- et réactualisée hier reste en tête de liste, mais dit bien « parue le… ».
--
-- Rien d'autre ne change : mêmes arguments, mêmes filtres, même ordre, mêmes
-- droits. `create or replace` suffit — le type de retour (jsonb) est le même.
--
-- Vide quand France Travail ne l'a pas donnée : la ligne ne dit alors rien,
-- plutôt qu'une date inventée.
-- ---------------------------------------------------------------------------

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
           o.date_creation,
           coalesce(o.date_actualisation, o.date_creation) as quand
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and (coalesce(cardinality(les_departements), 0) = 0
            or public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                           o.lieu_code_insee, o.lieu_libelle)
               = any (les_departements))
       and (nullif(btrim(le_secteur), '') is null
            or public.section_naf_d_une_offre(o.code_naf) = btrim(le_secteur))
       -- Tous les mots, où que ce soit dans le texte de l'offre.
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
                       'date_creation', p.date_creation)
                     order by p.quand desc, p.id)
                from la_page p),
             '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

comment on function public.offres_en_cours(text[], text, integer, integer, text) is
  'Une page des offres en cours de l''écran France Travail, filtrées par '
  'départements (l''un ou l''autre), par secteur (section NAF) et par mots '
  '(tous, sans accents), avec le total. Chaque offre porte sa date de parution. '
  'Réservée aux référents et à '
  'l''administration ; 200 lignes par page au plus.';

revoke all on function public.offres_en_cours(text[], text, integer, integer, text) from public, anon;
grant execute on function public.offres_en_cours(text[], text, integer, integer, text)
  to authenticated, service_role;
