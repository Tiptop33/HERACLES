-- ---------------------------------------------------------------------------
-- 0028 — l'accueil compte ce qu'il annonce
--
-- Trois compteurs disaient autre chose que leur étiquette.
--
--   * « référents de la loge » comptait davantage que la loge. Un
--     administrateur y lisait le total de toutes les loges réunies ; un
--     référent qui accompagne un candidat rattaché ailleurs y ajoutait, sans
--     le savoir, les référents de cette autre loge — `loges_visibles()` les
--     lui ouvre, à juste titre, pour lire un dossier. Pour compter « la
--     loge », c'est la sienne qu'il faut, et elle seule : celle que porte sa
--     fiche de référent.
--
--   * « en attente de référent » écartait les candidats présentés par un
--     parrain. Or le parrain présente, le référent accompagne dans la durée —
--     ce ne sont pas deux façons de faire la même chose. Un candidat qui a un
--     parrain et pas de référent n'est accompagné par personne : c'est
--     précisément quelqu'un qui attend un référent, et il ne se voyait nulle
--     part.
--
--   * « candidats suivis » ajoutait, à ceux qu'on accompagne, ceux qu'on a
--     seulement présentés. Même raison, dans l'autre sens : on suit celui dont
--     on est le référent. Les candidats qu'on parraine restent lisibles et
--     restent dans la fiche — ils ne gonflent plus le compteur de
--     l'accompagnement.
--
-- Les trois pastilles d'urgence et la liste des demandes suivent la deuxième
-- définition — elles sont côte à côte à l'écran, un chiffre et sa liste ne
-- peuvent pas se contredire.
--
-- Rien n'est élargi ici : personne ne voit une ligne de plus qu'hier. Ce sont
-- les comptes qui changent, pas les droits.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Les chiffres de l'accueil
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
  -- Sa loge à elle, et pas les autres. `loges_visibles()` en rend davantage :
  -- elle y ajoute les loges des candidats qu'on accompagne. C'est ce qu'il
  -- faut pour ouvrir un dossier, et c'est faux pour compter une loge.
  ma_loge as (
    select r.loge_id
      from public.referent r, moi
     where r.id = moi.referent_id
       and r.loge_id is not null
  ),
  -- Sans référent : voilà tout ce que « en attente » veut dire. Un parrain
  -- peut l'avoir présenté — cela ne lui donne personne pour la suite.
  attente as (
    select c.*
      from public.candidat c, moi
     where c.referent_id is null
       and not public.candidat_est_clos(c)
       and (moi.admin or c.loge_id in (select loge_id from loges))
  )
  select
    -- Ceux dont on est le référent. Parrainer, c'est présenter : cela ne fait
    -- pas de vous celui qui suit.
    (select count(*) from public.candidat c, moi
      where c.referent_id = moi.referent_id
        and not public.candidat_est_clos(c))::integer,
    (select count(*) from attente)::integer,
    (select count(*) from public.offre_emploi o
      where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days')::integer,
    -- Une personne sans fiche de référent n'a pas de loge : le compteur dit
    -- zéro, comme « candidats suivis » le dit déjà pour elle.
    (select count(*) from public.referent r
      where r.loge_id in (select loge_id from ma_loge))::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'emploi')::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'alternance')::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'stage')::integer
$$;

comment on function public.accueil_chiffres() is
  'Les compteurs de l''accueil. `security definer` : ils portent sur des '
  'candidats que l''appelant n''a pas le droit de lire ligne à ligne. '
  '« Référents » compte sa seule loge ; « suivis » et « en attente » se '
  'décident sur le seul référent, jamais sur le parrain.';

-- ---------------------------------------------------------------------------
-- 2. Les candidats qui attendent encore un référent
--    Même définition que le compteur : la liste est affichée juste en dessous.
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
     and not public.candidat_est_clos(c)
     and (public.est_admin() or c.loge_id in (select public.loges_visibles()))
   order by c.cree_le desc nulls last
   limit greatest(1, least(coalesce(limite, 4), 24))
$$;

comment on function public.demandes_en_attente(integer) is
  'Les candidats de ses loges qui n''ont pas de référent — seulement ce que la '
  'carte de l''accueil montre.';

-- ---------------------------------------------------------------------------
-- 3. Les droits d'exécution
--    `create or replace` conserve les grants ; on les repose quand même, pour
--    qu'une base reconstruite depuis zéro ne dépende pas de 0011.
-- ---------------------------------------------------------------------------
revoke all on function public.accueil_chiffres()           from public, anon;
revoke all on function public.demandes_en_attente(integer) from public, anon;

grant execute on function public.accueil_chiffres()           to authenticated;
grant execute on function public.demandes_en_attente(integer) to authenticated;
