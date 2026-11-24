-- ---------------------------------------------------------------------------
-- 0104 — l'administration corrige la fiche de tout candidat
--
-- Ce que ça change : jusqu'ici, seuls le référent et le parrain d'un candidat
-- corrigeaient sa fiche (coordonnées, code postal, recherche, parcours,
-- appréciation) ; l'administration la lisait sans le crayon « Corriger la
-- fiche ». Décision du 24 novembre 2026, dans le prolongement de 0103 pour
-- les secteurs : elle corrige aussi, sur toutes les fiches — par exemple pour
-- compléter un code postal dont dépendent « Entreprises qui recrutent » et
-- « Offres en alternance ».
--
-- Trois verrous, ouverts ensemble :
--   1. la RLS de `candidat` (0006) : deux policies pour l'administration, une
--      en lecture (la page de correction lit la table) et une en
--      modification ;
--   2. `fiche_candidat` : son champ `modifiable`, qui fait paraître le crayon,
--      admet `est_admin()`. Même fonction que 0057, même type de retour —
--      seule cette expression change ;
--   3. la page de correction, côté application, admet le rôle `admin`.
--
-- Ce qui ne change pas : le rattachement (référent, parrain, loge, numéro)
-- reste figé par le déclencheur de 0006 ; aucune insertion ni suppression
-- n'est ouverte par cette migration.
-- ---------------------------------------------------------------------------

-- 1. La RLS --------------------------------------------------------------------
drop policy if exists candidat_lecture_administration on public.candidat;
create policy candidat_lecture_administration on public.candidat
  for select
  to authenticated
  using ((select public.est_admin()));

drop policy if exists candidat_modification_administration on public.candidat;
create policy candidat_modification_administration on public.candidat
  for update
  to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

comment on policy candidat_lecture_administration on public.candidat is
  'L''administration lit toute fiche, pour la corriger (0104). Elle les lisait '
  'déjà toutes par fiche_candidat.';
comment on policy candidat_modification_administration on public.candidat is
  'L''administration corrige toute fiche (0104). Le rattachement reste figé '
  'par le déclencheur de 0006.';

-- 2. Le crayon -----------------------------------------------------------------
create or replace function public.fiche_candidat(candidat uuid)
returns table (
  id                       uuid,
  numero                   integer,
  bubble_id                text,

  nom                      text,
  prenom                   text,
  email                    text,
  telephone                text,
  age                      integer,
  situation_familiale      text,
  ville                    text,
  code_postal              text,
  adresse                  text,

  type_emploi              text,
  emploi_recherche         text,
  mobilite_geographique    text,
  debut_stage              timestamptz,
  secteur_activite_libelle text,
  metier_libelle           text,

  formations               text,
  experiences              text,
  competences              text,
  savoir_etre              text,
  informatique             text,
  permis_vl                text,
  vehicule                 text,

  appreciation             text,
  cloture                  text,
  archive                  text,
  referent_nom             text,
  parrain_nom              text,
  loge_nom                 text,

  cv_chemin                text,
  cv_url                   text,
  cv_anonyme_chemin        text,
  cv_anonyme_url           text,
  lettre_motivation_chemin text,
  lettre_motivation_url    text,
  a_une_photo              boolean,

  cree_le                  timestamptz,
  maj_le                   timestamptz,

  modifiable               boolean,

  -- 0057 : le reste de la fiche Bubble, et la présentation par le parrain.
  a_un_referent            boolean,
  definition_emploi        text,
  fin_stage                timestamptz,
  permis_moto              text,
  permis_pl                text,
  centres_interet          text,
  parrain_email            text,
  parrain_presentateur     text,
  parrain_telephone        text,
  parrain_loge             text,
  lien_parente             text,
  connait_appartenance     text,
  peut_se_devoiler         text,
  urgence                  smallint,
  urgence_motif            text,
  presente_le              timestamptz,
  candidature_completee_le timestamptz,
  loge_id                  uuid
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
         -- 0104 : l'administration corrige aussi la fiche.
         coalesce(
           public.est_admin()
             or c.referent_id = public.referent_courant()
             or c.parrain_id = public.referent_courant(),
           false),
         c.referent_id is not null,
         c.definition_emploi, c.fin_stage, c.permis_moto, c.permis_pl,
         c.centres_interet, c.parrain_email,
         nullif(btrim(coalesce(pa.parrain_prenom, '') || ' ' || coalesce(pa.parrain_nom, '')), ''),
         pa.parrain_telephone, pa.parrain_loge,
         c.lien_parente, c.connait_appartenance, c.peut_se_devoiler,
         c.urgence, c.urgence_motif,
         pa.presente_le, c.candidature_completee_le,
         c.loge_id
    from public.candidat c
    left join public.referent r on r.id = c.referent_id
    left join public.referent p on p.id = c.parrain_id
    left join public.loge     l on l.id = c.loge_id
    left join lateral (
      select x.parrain_nom, x.parrain_prenom, x.parrain_telephone, x.parrain_loge, x.presente_le
        from public.parrainage x
       where x.candidat_id = c.id
       order by x.presente_le desc nulls last
       limit 1
    ) pa on true
   where c.id = candidat
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.fiche_candidat(uuid) is
  'La fiche telle que le poste de travail (maquette 1c) l''affiche, pour les '
  'candidats de ses loges. Lecture seule : modifier passe par la table, donc '
  'par la RLS de 0006 et 0104, ouverte au référent, au parrain et à '
  'l''administration ; `modifiable` le dit. Depuis 0057, elle rend aussi la '
  'présentation par le parrain et le reste de la fiche Bubble.';

revoke all on function public.fiche_candidat(uuid) from public, anon;
grant execute on function public.fiche_candidat(uuid) to authenticated;
