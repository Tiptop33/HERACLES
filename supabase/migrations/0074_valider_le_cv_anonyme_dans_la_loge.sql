-- ---------------------------------------------------------------------------
-- 0074 — tout référent de la loge valide le CV anonyme
--
-- Ce que ça change : le CV anonyme produit par HERACLES (0073) se valide par
-- **n'importe quel référent de la loge du candidat**, et plus seulement par le
-- référent du dossier. Décision du 10 novembre 2026 : « cela peut être
-- n'importe quel référent, cela n'a pas d'importance ».
--
-- Le CV, lui, n'a jamais besoin d'être « fait » par quelqu'un : HERACLES le
-- produit à la demande depuis la fiche, dès que le candidat a envoyé son
-- formulaire et son CV. Restait un seul goulot — attendre que le référent du
-- dossier passe le valider. Il disparaît.
--
-- QUI VALIDE
--
--   · le référent du dossier, comme avant ;
--   · tout référent rattaché à la loge du candidat (`ma_loge()`, la loge de sa
--     fiche de référent — et non `loges_visibles()`, qui y ajouterait les
--     loges des candidats qu'on parraine ailleurs).
--
-- Un parrain d'une autre loge ne valide donc pas le CV de celui qu'il a
-- présenté. Un administrateur valide s'il a une fiche de référent : la
-- validation est signée d'un référent (`cv_anonyme_valide_par`).
--
-- CE QUI NE CHANGE PAS
--
-- La validation passe toujours par `valider_cv_anonyme()` seule (le déclencheur
-- de 0073 l'impose) ; toute modification d'un champ imprimé l'efface ; un
-- dossier refermé ou sans emploi recherché ne se valide pas.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Le droit, écrit une fois : la fonction et le bandeau le lisent tous deux
-- ---------------------------------------------------------------------------
create or replace function public.peut_valider_le_cv_anonyme(fiche public.candidat)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.referent_courant() is not null
     and (fiche.referent_id = public.referent_courant()
       or (fiche.loge_id is not null and fiche.loge_id = public.ma_loge()))
$$;

comment on function public.peut_valider_le_cv_anonyme(public.candidat) is
  'Vrai si la session peut valider le CV anonyme de cette fiche : le référent '
  'du dossier, ou tout référent rattaché à la loge du candidat.';

revoke all on function public.peut_valider_le_cv_anonyme(public.candidat) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Valider — la fonction de 0073, au droit près
-- ---------------------------------------------------------------------------
create or replace function public.valider_cv_anonyme(cible uuid, valider boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  moi   uuid := public.referent_courant();
  fiche public.candidat%rowtype;
begin
  select c.* into fiche
    from public.candidat c
   where c.id = cible
     for update;

  -- Un dossier inexistant et un dossier d'ailleurs refusent pareil : rien ne
  -- s'apprend en essayant.
  if moi is null or not found or not public.peut_valider_le_cv_anonyme(fiche) then
    raise exception 'Seuls les référents de la loge du candidat valident son CV anonyme'
      using errcode = 'insufficient_privilege';
  end if;

  if valider is null then
    raise exception 'Valider ou retirer : il faut choisir'
      using errcode = 'invalid_parameter_value';
  end if;

  if valider then
    if public.mot_de_fermeture(fiche.cloture) is not null
       or public.mot_de_fermeture(fiche.archive) is not null then
      return 'ferme';
    end if;
    if nullif(btrim(coalesce(fiche.emploi_recherche, '')), '') is null
       and nullif(btrim(coalesce(fiche.metier_libelle, '')), '') is null then
      return 'incomplet';
    end if;
  end if;

  perform set_config('heracles.validation_cv_anonyme', 'oui', true);
  -- `maj_le` ne bouge pas : relire le CV ne modifie pas la fiche.
  update public.candidat
     set cv_anonyme_valide_le  = case when valider then now() end,
         cv_anonyme_valide_par = case when valider then moi end
   where id = cible;
  perform set_config('heracles.validation_cv_anonyme', '', true);

  return case when valider then 'valide' else 'retire' end;
end;
$$;

comment on function public.valider_cv_anonyme(uuid, boolean) is
  'Un référent de la loge du candidat (ou le référent du dossier) valide le CV '
  'anonyme produit par HERACLES, ou retire la validation. Validé, il est servi '
  'par le lien public.';

revoke all on function public.valider_cv_anonyme(uuid, boolean) from public, anon;
grant execute on function public.valider_cv_anonyme(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- L'état, pour le bandeau de la fiche — même porte que 0073, même droit que
-- la fonction ci-dessus : le bouton « Valider » s'affiche à qui peut valider.
-- ---------------------------------------------------------------------------
create or replace function public.etat_du_cv_anonyme(candidat_choisi uuid)
returns table (
  valide_le    timestamptz,
  valide_par   text,
  peut_valider boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.cv_anonyme_valide_le,
         nullif(btrim(coalesce(v.prenom, '') || ' ' || coalesce(v.nom, '')), ''),
         public.peut_valider_le_cv_anonyme(c)
    from public.candidat c
    left join public.referent v on v.id = c.cv_anonyme_valide_par
   where c.id = candidat_choisi
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.etat_du_cv_anonyme(uuid) is
  'Le CV anonyme d''un candidat que je peux voir : validé ou non, par qui, et '
  'si je peux le valider (référent du dossier ou de sa loge).';

revoke all on function public.etat_du_cv_anonyme(uuid) from public, anon;
grant execute on function public.etat_du_cv_anonyme(uuid) to authenticated;
