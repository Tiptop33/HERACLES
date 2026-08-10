-- ---------------------------------------------------------------------------
-- 0049 — retirer la photo d'un référent
--
-- Ce que ça change : l'écran « modifier un référent » permet de retirer la
-- photo, et non plus seulement de la remplacer. Jusqu'ici, un visage déposé
-- par erreur — ou dont la personne ne veut plus — ne pouvait que céder la
-- place à un autre.
--
-- POURQUOI `photo_url` PART AUSSI
--
-- C'est le point qui demande le plus d'attention, et il ne se voit pas.
--
-- `photo_url` est l'adresse d'origine chez Bubble, conservée pour la
-- traçabilité ; `photo_chemin` est notre copie. L'outil de reprise
-- (`outils/rapatrier-fichiers.mjs`) choisit ce qu'il rapatrie ainsi :
--
--   where photo_url is not null and photo_chemin is null
--
-- Or c'est exactement l'état que produirait un retrait qui n'effacerait que le
-- chemin. La prochaine reprise — MAJBUBBLE, à rejouer au plus tard le
-- 5 décembre 2026 — retéléchargerait le visage et le remettrait en place.
-- Quelqu'un aurait demandé le retrait de sa photo, et elle reviendrait toute
-- seule quelques semaines plus tard.
--
-- Retirer veut donc dire retirer : les deux colonnes partent. On perd la trace
-- de l'adresse d'origine, et c'est le prix — une trace qui ressuscite ce
-- qu'elle trace n'est pas une trace, c'est une sauvegarde.
--
-- CE QUE LA FONCTION REND
--
-- Le chemin de la photo retirée, pour que l'appelant efface le fichier du
-- seau. Le laisser reviendrait à garder un visage dans le stockage après qu'on
-- a demandé de l'enlever — sur des données de personnes vulnérables, ce n'est
-- pas un détail de ménage.
--
-- Nul quand la fiche n'avait pas de photo : retirer ce qui n'est pas là ne
-- provoque rien, et le geste peut se rejouer sans dommage.
--
-- QUI A LE DROIT
--
-- L'administrateur seul, comme le dépôt (0048) et comme le reste de la fiche
-- (policy `referent_modification_admin`, 0012).
-- ---------------------------------------------------------------------------

create or replace function public.retirer_la_photo_du_referent(referent_choisi uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ancien text;
begin
  -- La porte, avant toute chose : `security definer` a déjà mis la RLS de
  -- côté, il ne reste que ce test pour tenir le droit.
  if not public.est_admin() then
    raise exception 'Seul un administrateur retire la photo d''un référent.'
      using errcode = 'insufficient_privilege';
  end if;

  select r.photo_chemin into ancien
    from public.referent r
   where r.id = referent_choisi;

  if not found then
    raise exception 'Fiche de référent inconnue.'
      using errcode = 'no_data_found';
  end if;

  -- Les deux, et pas seulement le chemin : voir l'en-tête. Garder l'adresse
  -- Bubble ferait revenir la photo à la prochaine reprise.
  update public.referent
     set photo_chemin = null,
         photo_url = null
   where id = referent_choisi;

  return ancien;
end
$$;

comment on function public.retirer_la_photo_du_referent(uuid) is
  'Retirer la photo d''un référent, et rendre son chemin pour que le fichier '
  'quitte le stockage. Efface aussi l''adresse Bubble d''origine, sans quoi la '
  'prochaine reprise remettrait le visage en place. Administrateurs seuls.';

revoke all on function public.retirer_la_photo_du_referent(uuid) from public, anon;
grant execute on function public.retirer_la_photo_du_referent(uuid) to authenticated;
