-- ---------------------------------------------------------------------------
-- 0100 — chercher un mot dans les offres en cours
--
-- Ce que ça change : l'écran « France Travail » a un champ de recherche. Les
-- mots tapés se cherchent dans l'intitulé de l'offre, le métier (appellation
-- et libellé ROME), l'entreprise, le lieu et la description — sans tenir
-- compte des accents ni des majuscules. Plusieurs mots : l'offre doit les
-- porter TOUS, où que ce soit (« boulanger agen » : l'un dans l'intitulé,
-- l'autre dans le lieu). La recherche s'ajoute aux filtres de département et
-- de secteur ; elle ne les remplace pas.
--
-- Pourquoi dans la base : la liste est paginée ici (0097), avec son total. Un
-- filtre écrit dans la page ne verrait que les cinquante offres de la page.
--
-- La recherche est bornée : 120 caractères, six mots. Les caractères `%` et
-- `_`, qui sont des jokers pour LIKE, se cherchent pour ce qu'ils sont.
--
-- Un mot se cherche n'importe où, pas seulement en début de mot : « plomb »
-- trouve « plombier ». Le texte cherché est rangé d'avance dans une colonne
-- (voir plus bas) ; sans index pour l'instant, la lecture complète de vingt
-- mille offres reste rapide. Si la table grossit beaucoup, un index trigramme
-- (`pg_trgm`) sur cette colonne sera le pas suivant.
--
-- Accès : inchangé — référents et administration.
--
-- Rejouable. La fonction prend un argument de plus ; l'ancienne, à quatre
-- arguments, est retirée ensuite : deux fonctions du même nom rendraient
-- l'appel ambigu. Les migrations 0097 et 0098, rejouées à chaque déploiement,
-- la recréent ; celle-ci la retire de nouveau.
-- ---------------------------------------------------------------------------

-- Le texte d'une offre dans lequel on cherche, déjà sans accents ni
-- majuscules, rangé dans une colonne que la base tient à jour elle-même.
--
-- Pourquoi une colonne, et non un calcul à la volée : retirer les accents
-- d'une description de mille cinq cents caractères, vingt mille fois par
-- recherche, prenait cinq secondes (mesuré sur 20 000 offres fabriquées).
-- Calculé une fois, à l'écriture de l'offre, la même recherche prend une
-- fraction de seconde.
--
-- `||` et `coalesce`, pas `concat_ws` : une colonne calculée n'accepte que des
-- fonctions immuables, et `concat_ws` ne l'est pas.
alter table public.offre_emploi
  add column if not exists texte_cherche text
  generated always as (
    public.naf_sans_accent(
         coalesce(intitule, '')            || ' ' || coalesce(appellation_libelle, '') || ' '
      || coalesce(rome_libelle, '')        || ' ' || coalesce(entreprise_nom, '')      || ' '
      || coalesce(lieu_libelle, '')        || ' ' || coalesce(description, ''))
  ) stored;

comment on column public.offre_emploi.texte_cherche is
  'Intitulé, métier, entreprise, lieu et description, sans accents ni '
  'majuscules : ce dans quoi cherche l''écran France Travail. Tenu par la base.';

-- Une première écriture, jamais mise en ligne, calculait ce texte à la volée.
drop function if exists public.texte_cherchable_d_une_offre(public.offre_emploi);

-- Les mots d'une recherche, prêts pour LIKE : sans accents, jokers neutralisés,
-- entourés de « % ». Six au plus, sur les 120 premiers caractères.
create or replace function public.mots_d_une_recherche(la_recherche text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg('%' || replace(replace(replace(m.mot, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                            order by m.rang), '{}')
    from (select mot, rang
            from regexp_split_to_table(
                   public.naf_sans_accent(left(coalesce(la_recherche, ''), 120)), '\s+')
                 with ordinality as t(mot, rang)
           where mot <> ''
           order by rang
           limit 6) m
$$;

revoke all on function public.mots_d_une_recherche(text) from public, anon, authenticated;

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
                       'type_contrat_libelle', p.type_contrat_libelle)
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
  '(tous, sans accents), avec le total. Réservée aux référents et à '
  'l''administration ; 200 lignes par page au plus.';

revoke all on function public.offres_en_cours(text[], text, integer, integer, text) from public, anon;
grant execute on function public.offres_en_cours(text[], text, integer, integer, text)
  to authenticated, service_role;

drop function if exists public.offres_en_cours(text[], text, integer, integer);
