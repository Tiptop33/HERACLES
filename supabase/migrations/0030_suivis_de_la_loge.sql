-- ---------------------------------------------------------------------------
-- 0030 — « candidats suivis » compte la loge, pas soi
--
-- Ce que ça change : le cadre « candidats suivis » de l'accueil annonce les
-- candidats **de la loge qui ont un référent**, et non plus les seuls dossiers
-- de la personne connectée.
--
-- C'est le pendant de « en attente de référent », qui compte ceux qui n'en ont
-- pas. Les deux se lisent maintenant ensemble et sur le même périmètre : sur
-- treize dossiers en cours, neuf sont accompagnés et quatre attendent
-- quelqu'un. Un compteur personnel à côté d'un compteur de loge ne
-- s'additionnait pas, et invitait à une soustraction fausse.
--
-- La loge, c'est la sienne — celle que porte sa fiche de référent, comme pour
-- « référents de la loge » depuis 0028. `loges_visibles()` en rendrait
-- davantage : elle y ajoute les loges des candidats qu'on accompagne, ce qui
-- est juste pour ouvrir un dossier et faux pour décrire une loge.
--
-- Rien n'est élargi. Compter n'est pas lire : la fonction est `security
-- definer` depuis 0011 précisément pour rendre un nombre sans ouvrir les
-- fiches, et aucune policy n'est touchée ici.
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
    -- Les dossiers de la loge qui ont trouvé un référent. Le pendant exact du
    -- compteur suivant : ensemble, ils font les dossiers en cours de la loge.
    (select count(*) from public.candidat c
      where c.referent_id is not null
        and not public.candidat_est_clos(c)
        and c.loge_id in (select loge_id from ma_loge))::integer,
    (select count(*) from attente)::integer,
    (select count(*) from public.offre_emploi o
      where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days')::integer,
    -- Une personne sans fiche de référent n'a pas de loge : les compteurs de
    -- loge disent zéro, faute de loge à décrire.
    (select count(*) from public.referent r
      where r.loge_id in (select loge_id from ma_loge))::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'emploi')::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'alternance')::integer,
    (select count(*) from attente where public.famille_de_recherche(type_emploi) = 'stage')::integer
$$;

comment on function public.accueil_chiffres() is
  'Les compteurs de l''accueil. `security definer` : ils portent sur des '
  'candidats que l''appelant n''a pas le droit de lire ligne à ligne. '
  '« Suivis » et « référents » décrivent sa loge ; « suivis » et « en '
  'attente » se décident sur le seul référent, jamais sur le parrain.';

revoke all on function public.accueil_chiffres() from public, anon;
grant execute on function public.accueil_chiffres() to authenticated;
