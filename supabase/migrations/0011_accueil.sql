-- ---------------------------------------------------------------------------
-- 0011 — l'écran d'accueil
--
-- Ce que ça change : en arrivant, une personne voit l'état de son
-- accompagnement — combien de candidats elle suit, combien attendent encore
-- quelqu'un, les comptes-rendus de sa loge et les offres qui bougent encore.
--
-- Deux façons d'ouvrir un accès, et le choix n'est pas indifférent :
--
--   * `document` reçoit une **policy**, parce qu'un écran en listera les
--     lignes une à une, avec leur lien.
--
--   * les compteurs et les demandes en attente passent par des **fonctions
--     `security definer`**, parce qu'ils portent sur des candidats que
--     l'appelant n'a pas le droit de lire. Une policy qui ouvrirait ces
--     lignes donnerait tout de la fiche — téléphone, CV, parcours — pour
--     afficher un nombre. La fonction, elle, ne rend que ce que l'écran
--     montre : un prénom, une ville, un type de recherche.
--
-- Le pool « en attente », c'est précisément ce qu'un référent peut reprendre :
-- les candidats de sa loge que personne n'accompagne encore.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Les documents de la loge
-- ---------------------------------------------------------------------------
grant select on public.document to authenticated;

drop policy if exists document_lecture_loge on public.document;
create policy document_lecture_loge on public.document
  for select
  to authenticated
  using (
    loge_id in (select public.loges_visibles())
    or public.est_admin()
  );

comment on policy document_lecture_loge on public.document is
  'Les documents de ses propres loges. Un administrateur les voit toutes.';

-- ---------------------------------------------------------------------------
-- 2. Ce qu'on appelle « clos »
--    Bubble range la clôture dans deux colonnes de texte libre. Une ligne est
--    close dès que l'une des deux porte quelque chose.
-- ---------------------------------------------------------------------------
create or replace function public.candidat_est_clos(c public.candidat)
returns boolean
language sql
immutable
as $$
  select coalesce(nullif(trim(c.cloture), ''), nullif(trim(c.archive), '')) is not null
$$;

comment on function public.candidat_est_clos(public.candidat) is
  'Vrai si le dossier est clôturé ou archivé — les deux colonnes de Bubble.';

-- ---------------------------------------------------------------------------
-- 3. À quelle famille de recherche appartient un candidat
--    `type_emploi` vient d'une liste de choix Bubble, en texte libre. On s'en
--    tient à ce que la maquette affiche : emploi, alternance, stage.
-- ---------------------------------------------------------------------------
create or replace function public.famille_de_recherche(type_emploi text)
returns text
language sql
immutable
as $$
  select case
    when type_emploi ilike '%altern%' or type_emploi ilike '%apprenti%' then 'alternance'
    when type_emploi ilike '%stage%'                                    then 'stage'
    else 'emploi'
  end
$$;

comment on function public.famille_de_recherche(text) is
  'Emploi, alternance ou stage — d''après le libellé libre venu de Bubble.';

-- ---------------------------------------------------------------------------
-- 4. Les chiffres de l'accueil, en une seule ligne
-- ---------------------------------------------------------------------------
create or replace function public.accueil_chiffres()
returns table (
  mes_candidats       integer,
  en_attente          integer,
  offres_en_cours     integer,
  referents           integer,
  urgence_emploi      integer,
  urgence_alternance  integer,
  urgence_stage       integer
)
language sql
stable
security definer
set search_path = public
as $$
  with moi as (
    select public.referent_courant() as referent_id,
           public.est_admin()        as admin
  ),
  loges as (
    select loge_id from public.loges_visibles() as loge_id
  ),
  attente as (
    select c.*
      from public.candidat c, moi
     where c.referent_id is null
       and c.parrain_id  is null
       and not public.candidat_est_clos(c)
       and (moi.admin or c.loge_id in (select loge_id from loges))
  )
  select
    (select count(*) from public.candidat c, moi
      where (c.referent_id = moi.referent_id or c.parrain_id = moi.referent_id)
        and not public.candidat_est_clos(c))::integer,
    (select count(*) from attente)::integer,
    (select count(*) from public.offre_emploi o
      where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days')::integer,
    (select count(*) from public.referent r, moi
      where moi.admin or r.loge_id in (select loge_id from loges))::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'emploi')::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'alternance')::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'stage')::integer
$$;

comment on function public.accueil_chiffres() is
  'Les compteurs de l''accueil. `security definer` : ils portent sur des '
  'candidats que l''appelant n''a pas le droit de lire ligne à ligne.';

-- ---------------------------------------------------------------------------
-- 5. Les candidats qui attendent encore quelqu'un
--    Rien de plus que ce que la carte affiche. Ni téléphone, ni e-mail, ni CV :
--    on saura tout cela le jour où on les accompagnera, pas avant.
-- ---------------------------------------------------------------------------
create or replace function public.demandes_en_attente(limite integer default 4)
returns table (
  id       uuid,
  prenom   text,
  nom      text,
  ville    text,
  famille  text,
  cree_le  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.prenom, c.nom, c.ville,
         public.famille_de_recherche(c.type_emploi),
         c.cree_le
    from public.candidat c
   where c.referent_id is null
     and c.parrain_id  is null
     and not public.candidat_est_clos(c)
     and (public.est_admin() or c.loge_id in (select public.loges_visibles()))
   order by c.cree_le desc nulls last
   limit greatest(1, least(coalesce(limite, 4), 24))
$$;

comment on function public.demandes_en_attente(integer) is
  'Les candidats de ses loges que personne n''accompagne encore — seulement '
  'ce que la carte de l''accueil montre.';

-- ---------------------------------------------------------------------------
-- 6. Les droits d'exécution
--    Sans eux, `authenticated` ne peut pas appeler ces fonctions : une
--    fonction `security definer` s'exécute avec les droits de son
--    propriétaire, mais encore faut-il avoir le droit de l'appeler.
-- ---------------------------------------------------------------------------
revoke all on function public.accueil_chiffres()          from public, anon;
revoke all on function public.demandes_en_attente(integer) from public, anon;

grant execute on function public.accueil_chiffres()          to authenticated;
grant execute on function public.demandes_en_attente(integer) to authenticated;
grant execute on function public.candidat_est_clos(public.candidat) to authenticated;
grant execute on function public.famille_de_recherche(text)  to authenticated;
