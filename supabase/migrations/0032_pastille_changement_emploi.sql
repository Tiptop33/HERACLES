-- ---------------------------------------------------------------------------
-- 0032 — une quatrième pastille : « Changement d'emploi »
--
-- Ce que ça change : le cadre « Urgences — nouvelles demandes » compte quatre
-- familles au lieu de trois. Les trois fiches portant `changement d'Emploi`
-- quittent « Emploi » et prennent la leur.
--
-- Ce n'est pas un détail de rangement : chercher un premier emploi et vouloir
-- en changer ne demandent pas le même accompagnement. Les confondre revenait
-- à annoncer 55 emplois là où il y en a 52, et à taire les trois autres.
--
-- L'ordre des tests fait tout le travail, et il est fragile : « changement
-- d'Emploi » contient le mot « emploi ». Si la ligne du changement passait
-- après celle de l'emploi, la nouvelle pastille resterait vide à jamais sans
-- que rien ne le signale. Un test la fige.
--
-- Le type de retour de `accueil_chiffres()` gagne une colonne : `create or
-- replace` ne suffit pas, PostgreSQL refuse. On enlève, on repose — comme
-- 0013 l'a fait pour l'annuaire, et pour la même raison.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. À quelle famille de recherche appartient un candidat
--    Quatre familles, et `null` quand aucune ne se reconnaît.
-- ---------------------------------------------------------------------------
create or replace function public.famille_de_recherche(type_emploi text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(type_emploi, '')), '') is null            then null
    when type_emploi ilike '%altern%' or type_emploi ilike '%apprenti%' then 'alternance'
    when type_emploi ilike '%stage%'                                    then 'stage'
    -- Avant « emploi », et non après : le libellé contient les deux mots, et
    -- c'est le premier test qui gagne.
    when type_emploi ilike '%changement%'                               then 'changement'
    when type_emploi ilike '%emploi%'                                   then 'emploi'
    else null
  end
$$;

comment on function public.famille_de_recherche(text) is
  'Emploi, alternance, stage ou changement d''emploi — d''après le libellé '
  'libre venu de Bubble, et `null` quand aucun des quatre ne se reconnaît. '
  '« Stage en alternance » est une alternance ; « changement d''Emploi » se '
  'reconnaît avant « emploi », puisqu''il en contient le mot.';

-- ---------------------------------------------------------------------------
-- 2. Les chiffres de l'accueil, avec la quatrième pastille
-- ---------------------------------------------------------------------------
drop function if exists public.accueil_chiffres();

create function public.accueil_chiffres()
returns table (
  mes_candidats       integer,
  en_attente          integer,
  offres_en_cours     integer,
  referents           integer,
  urgence_emploi      integer,
  urgence_alternance  integer,
  urgence_stage       integer,
  urgence_changement  integer
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
  -- Sa loge à elle, et pas les autres.
  ma_loge as (
    select r.loge_id
      from public.referent r, moi
     where r.id = moi.referent_id
       and r.loge_id is not null
  ),
  -- Tout ce qui est ouvert dans la loge : c'est de cela que les pastilles font
  -- le portrait, et c'est aussi la somme des deux premiers compteurs.
  en_cours as (
    select c.*
      from public.candidat c
     where not public.candidat_est_clos(c)
       and c.loge_id in (select loge_id from ma_loge)
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
    (select count(*) from en_cours where referent_id is not null)::integer,
    (select count(*) from attente)::integer,
    (select count(*) from public.offre_emploi o
      where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days')::integer,
    (select count(*) from public.referent r
      where r.loge_id in (select loge_id from ma_loge))::integer,
    (select count(*) from en_cours where public.famille_de_recherche(type_emploi) = 'emploi')::integer,
    (select count(*) from en_cours where public.famille_de_recherche(type_emploi) = 'alternance')::integer,
    (select count(*) from en_cours where public.famille_de_recherche(type_emploi) = 'stage')::integer,
    (select count(*) from en_cours where public.famille_de_recherche(type_emploi) = 'changement')::integer
$$;

comment on function public.accueil_chiffres() is
  'Les compteurs de l''accueil. `security definer` : ils portent sur des '
  'candidats que l''appelant n''a pas le droit de lire ligne à ligne. '
  '« Suivis », « référents » et les quatre pastilles décrivent sa loge ; '
  '« suivis » et « en attente » se décident sur le seul référent, jamais sur '
  'le parrain.';

-- ---------------------------------------------------------------------------
-- 3. Les droits d'exécution
--    `drop` les a emportés avec la fonction : ils se reposent avec elle.
-- ---------------------------------------------------------------------------
revoke all on function public.accueil_chiffres() from public, anon;
grant execute on function public.accueil_chiffres() to authenticated;
grant execute on function public.famille_de_recherche(text) to authenticated;
