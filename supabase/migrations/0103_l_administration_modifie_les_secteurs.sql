-- ---------------------------------------------------------------------------
-- 0103 — l'administration modifie les secteurs de tout candidat
--
-- Ce que ça change : jusqu'ici, seuls le référent et le parrain d'un candidat
-- modifiaient et confirmaient ses secteurs (0092) ; l'administration les
-- voyait sans pouvoir y toucher. Décision du 24 novembre 2026 : elle les
-- modifie et les confirme aussi, sur toutes les fiches — pour compléter une
-- fiche dont le référent tarde, comme la sienne.
--
-- Comment : `puis_je_modifier_les_secteurs_du_candidat` admet désormais
-- `est_admin()`. Les deux fonctions d'écriture (`ecrire_…`, `confirmer_…`)
-- et la lecture (`secteurs_du_candidat`, son champ `modifiable`) passent
-- toutes par elle : rien d'autre à changer, et l'écran montre de lui-même les
-- gestes à l'administration.
--
-- Un secteur ajouté ou confirmé par une administratrice sans fiche de
-- référent garde `confirme_par` vide : la contrainte de 0088 l'admet, seule
-- `confirme_le` compte pour dire qu'il est confirmé.
--
-- Les autres référents de la loge restent en lecture seule.
-- ---------------------------------------------------------------------------

create or replace function public.puis_je_modifier_les_secteurs_du_candidat(le_candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.candidat c
     where c.id = le_candidat
       and (public.est_admin()
         or c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()))
$$;

comment on function public.puis_je_modifier_les_secteurs_du_candidat(uuid) is
  'Vrai si la session peut modifier et confirmer les secteurs de ce candidat : '
  'son référent, son parrain, ou l''administration (0103).';

revoke all on function public.puis_je_modifier_les_secteurs_du_candidat(uuid) from public, anon;
grant execute on function public.puis_je_modifier_les_secteurs_du_candidat(uuid) to authenticated, service_role;
