-- ---------------------------------------------------------------------------
-- 0020 — la fiche s'ouvre à côté de la liste
--
-- Ce que ça change : sur le poste de travail (maquette 1c), la liste de la loge
-- est déjà ouverte par 0019. Mais cliquer sur une ligne ne donnait rien dès que
-- le candidat était accompagné par quelqu'un d'autre — et la maquette montre
-- justement une fiche dont l'étiquette dit « Référent : DURAND ». Une liste où
-- neuf lignes sur dix ne s'ouvrent pas n'est pas un poste de travail.
--
-- CE QUI S'OUVRE, ET CE QUI NE S'OUVRE PAS
--
--   · La LECTURE d'une fiche s'élargit à la loge — et à l'administration, qui
--     n'a pas de fiche de référent et ne voyait donc rien des 118 dossiers.
--   · L'ÉCRITURE ne bouge pas d'un pouce : seuls le référent et le parrain
--     modifient. La fonction le dit à l'écran par sa colonne `modifiable`,
--     mais c'est la RLS de 0006 qui refuse — un bouton caché ne protège rien.
--
-- POURQUOI UNE FONCTION ET NON UNE POLICY PLUS LARGE
--
-- Élargir `candidat_lecture_accompagnes` ouvrirait la TABLE : toutes ses
-- colonnes, à toutes les requêtes, pour toujours. Ici, la table reste fermée
-- telle que 0006 l'a laissée — « fermé par défaut » n'est pas entamé — et c'est
-- une fonction qui rend exactement ce que la fiche affiche. Même dessin que
-- l'annuaire (0012) et que la liste (0019) : le jour où on retire l'écran, on
-- retire la fonction, et rien d'autre n'a bougé.
-- ---------------------------------------------------------------------------

drop function if exists public.fiche_candidat(uuid);

create function public.fiche_candidat(candidat uuid)
returns table (
  id                       uuid,
  numero                   integer,
  bubble_id                text,

  -- Identité et contact
  nom                      text,
  prenom                   text,
  email                    text,
  telephone                text,
  age                      integer,
  situation_familiale      text,
  ville                    text,
  code_postal              text,
  adresse                  text,

  -- Sa recherche
  type_emploi              text,
  emploi_recherche         text,
  mobilite_geographique    text,
  debut_stage              timestamptz,
  secteur_activite_libelle text,
  metier_libelle           text,

  -- Parcours
  formations               text,
  experiences              text,
  competences              text,
  savoir_etre              text,
  informatique             text,
  permis_vl                text,
  vehicule                 text,

  -- Accompagnement
  appreciation             text,
  -- Les deux façons de refermer un dossier : la fiche montre les deux, comme
  -- Bubble les tenait.
  cloture                  text,
  archive                  text,
  referent_nom             text,
  parrain_nom              text,
  loge_nom                 text,

  -- Documents : le chemin sert la route de téléchargement, l'adresse Bubble
  -- dit « pas encore rapatrié » sans prétendre pouvoir l'ouvrir.
  cv_chemin                text,
  cv_url                   text,
  cv_anonyme_chemin        text,
  cv_anonyme_url           text,
  lettre_motivation_chemin text,
  lettre_motivation_url    text,
  a_une_photo              boolean,

  -- Historique
  cree_le                  timestamptz,
  maj_le                   timestamptz,

  -- Ce que l'écran a le droit de proposer. La base refuserait de toute façon :
  -- cette colonne évite d'afficher un stylo qui mène à un mur.
  modifiable               boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero, c.bubble_id,
         c.nom, c.prenom, c.email, c.telephone, c.age, c.situation_familiale,
         c.ville, c.code_postal, c.adresse,
         c.type_emploi, c.emploi_recherche, c.mobilite_geographique,
         c.debut_stage, c.secteur_activite_libelle, c.metier_libelle,
         c.formations, c.experiences, c.competences, c.savoir_etre,
         c.informatique, c.permis_vl, c.vehicule,
         c.appreciation, c.cloture, c.archive,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         nullif(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), ''),
         l.nom,
         c.cv_chemin, c.cv_url,
         c.cv_anonyme_chemin, c.cv_anonyme_url,
         c.lettre_motivation_chemin, c.lettre_motivation_url,
         c.photo_chemin is not null,
         c.cree_le, c.maj_le,
         coalesce(
           c.referent_id = public.referent_courant()
             or c.parrain_id = public.referent_courant(),
           false)
    from public.candidat c
    left join public.referent r on r.id = c.referent_id
    left join public.referent p on p.id = c.parrain_id
    left join public.loge     l on l.id = c.loge_id
   where c.id = candidat
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.fiche_candidat(uuid) is
  'La fiche telle que le poste de travail (maquette 1c) l''affiche, pour les '
  'candidats de ses loges. Lecture seule : modifier passe par la table, donc '
  'par la RLS de 0006, qui n''ouvre qu''au référent et au parrain.';

revoke all on function public.fiche_candidat(uuid) from public, anon;
grant execute on function public.fiche_candidat(uuid) to authenticated;
