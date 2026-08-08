-- ---------------------------------------------------------------------------
-- 0031 — les trois pastilles comptent les dossiers en cours, par type
--
-- Ce que ça change, dans le cadre « Urgences — nouvelles demandes » :
--
--   * **Le périmètre.** Les pastilles ne comptaient que les candidats sans
--     référent. Elles comptent maintenant tous les dossiers **en cours** de la
--     loge — ni archivés ni clôturés —, qu'un référent les accompagne ou non.
--     Emploi, alternance et stage disent alors ce que la loge cherche, et non
--     ce qui reste à distribuer.
--
--   * **Ce qui est rangé.** Seuls les types relevés chez Bubble comptent :
--     `emploi`, `changement d'Emploi`, `stage en alternance` et `stage`. Une
--     colonne vide, ou un libellé qu'on ne reconnaît pas, n'entre plus dans
--     aucune pastille — au lieu de gonfler « Emploi » en silence, comme le
--     faisait le `else` de la migration 0011.
--
-- « Stage en alternance » reste rangé en alternance : le mot « stage » y
-- désigne la période, « alternance » le contrat. C'est l'ordre des deux tests
-- qui le décide, et il ne change pas.
--
-- La somme des trois pastilles peut donc être inférieure au nombre de dossiers
-- en cours. C'est voulu : mieux vaut un total qui manque un dossier au type
-- illisible qu'un total juste par accident, obtenu en le rangeant au hasard.
--
-- Rien n'est élargi : les mêmes lignes qu'hier, comptées autrement.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. À quelle famille de recherche appartient un candidat
--    `null` quand on ne sait pas — et on assume de ne pas savoir. Les valeurs
--    viennent d'une liste de choix que l'API de Bubble rend en texte libre :
--    prétendre les reconnaître toutes serait se raconter une histoire.
-- ---------------------------------------------------------------------------
create or replace function public.famille_de_recherche(type_emploi text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(type_emploi, '')), '') is null              then null
    when type_emploi ilike '%altern%' or type_emploi ilike '%apprenti%'   then 'alternance'
    when type_emploi ilike '%stage%'                                      then 'stage'
    when type_emploi ilike '%emploi%'                                     then 'emploi'
    else null
  end
$$;

comment on function public.famille_de_recherche(text) is
  'Emploi, alternance ou stage — d''après le libellé libre venu de Bubble, et '
  '`null` quand aucun des trois ne se reconnaît. « Stage en alternance » est '
  'une alternance : le stage y est la période, l''alternance le contrat.';

-- ---------------------------------------------------------------------------
-- 2. Les chiffres de l'accueil
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
  -- Sa loge à elle, et pas les autres.
  ma_loge as (
    select r.loge_id
      from public.referent r, moi
     where r.id = moi.referent_id
       and r.loge_id is not null
  ),
  -- Tout ce qui est ouvert dans la loge : c'est de cela que les trois
  -- pastilles font le portrait, et c'est aussi la somme des deux premiers
  -- compteurs — suivis d'un côté, en attente de l'autre.
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
    (select count(*) from en_cours where public.famille_de_recherche(type_emploi) = 'stage')::integer
$$;

comment on function public.accueil_chiffres() is
  'Les compteurs de l''accueil. `security definer` : ils portent sur des '
  'candidats que l''appelant n''a pas le droit de lire ligne à ligne. '
  '« Suivis », « référents » et les trois pastilles décrivent sa loge ; '
  '« suivis » et « en attente » se décident sur le seul référent, jamais sur '
  'le parrain.';

revoke all on function public.accueil_chiffres() from public, anon;
grant execute on function public.accueil_chiffres() to authenticated;
grant execute on function public.famille_de_recherche(text) to authenticated;
