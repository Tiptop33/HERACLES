-- ---------------------------------------------------------------------------
-- 0079 — pourquoi HERACLES n'a pas validé le CV anonyme
--
-- Ce que ça change : sous la pastille « À valider » du bandeau de la fiche,
-- une phrase dit pourquoi HERACLES n'a pas validé le CV de lui-même (0078) —
-- « Non validé automatiquement : il contient le nom ou le prénom du candidat,
-- dans « Expériences ». » Le référent sait quoi corriger, ou quoi relire avant
-- de valider à la main. Demande du 10 novembre 2026.
--
-- Une fonction à part plutôt qu'une colonne de plus à `etat_du_cv_anonyme()` :
-- changer son type de retour casserait le rejeu de 0073, 0074 et 0078, qui la
-- recréent par `create or replace`.
--
-- Même porte que la fiche : qui voit la fiche voit la raison. Elle ne dit rien
-- qu'on ne lise déjà sur la fiche.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- La raison, d'une fiche — dans l'ordre où HERACLES renonce
-- ---------------------------------------------------------------------------
create or replace function public.cv_anonyme_raison_sans_auto(fiche public.candidat)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  suspect text;
begin
  if fiche.cv_anonyme_valide_le is not null then
    return null;
  end if;

  if public.mot_de_fermeture(fiche.cloture) is not null
     or public.mot_de_fermeture(fiche.archive) is not null then
    return 'Non validé automatiquement : le dossier est refermé.';
  end if;

  if fiche.cv_anonyme_retire_le is not null then
    return 'Validation retirée par un référent : HERACLES ne la redonnera '
        || 'qu''après une modification du CV.';
  end if;

  if fiche.cv_anonyme_chemin is not null
     or nullif(btrim(coalesce(fiche.cv_anonyme_url, '')), '') is not null then
    return 'Non validé automatiquement : un CV anonyme a été déposé, c''est lui '
        || 'qui circule.';
  end if;

  if fiche.cv_chemin is null and nullif(btrim(coalesce(fiche.cv_url, '')), '') is null then
    return 'Non validé automatiquement : pas de CV original.';
  end if;

  if nullif(btrim(coalesce(fiche.emploi_recherche, '')), '') is null
     and nullif(btrim(coalesce(fiche.metier_libelle, '')), '') is null then
    return 'Non validé automatiquement : la fiche ne dit pas l''emploi recherché.';
  end if;

  suspect := public.cv_anonyme_suspect(fiche);
  if suspect is not null then
    return 'Non validé automatiquement : il contient ' || suspect || '.';
  end if;

  return null;
end;
$$;

comment on function public.cv_anonyme_raison_sans_auto(public.candidat) is
  'La phrase qui dit pourquoi HERACLES n''a pas validé seul le CV anonyme de '
  'cette fiche (0078). Null s''il est validé.';

revoke all on function public.cv_anonyme_raison_sans_auto(public.candidat) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pour le bandeau — porte de `etat_du_cv_anonyme()`
-- ---------------------------------------------------------------------------
create or replace function public.raison_du_cv_anonyme(candidat_choisi uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.cv_anonyme_raison_sans_auto(c)
    from public.candidat c
   where c.id = candidat_choisi
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.raison_du_cv_anonyme(uuid) is
  'Pourquoi HERACLES n''a pas validé seul le CV anonyme d''un candidat que je '
  'peux voir. Null s''il est validé, ou si je ne vois pas la fiche.';

revoke all on function public.raison_du_cv_anonyme(uuid) from public, anon;
grant execute on function public.raison_du_cv_anonyme(uuid) to authenticated;
