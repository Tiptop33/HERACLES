-- ---------------------------------------------------------------------------
-- 0052 — marquer présents ceux qui sont en ligne
--
-- Ce que ça change : sur la feuille d'appel, un bouton pose « Présent » d'un
-- coup sur tous les référents dont la session est ouverte. Jusqu'ici il fallait
-- les cocher un par un, alors que l'écran affichait déjà leur bouton
-- « Présent » en pointillé — il savait, mais il ne faisait rien.
--
-- ELLE N'ÉCRASE RIEN
--
-- `on conflict do nothing`, comme `clore_la_feuille()` (0039). Quelqu'un peut
-- être en ligne **et** avoir déjà été appelé — noté excusé parce qu'il suit la
-- réunion de loin, ou absent parce qu'il a laissé un onglet ouvert. Un état
-- posé à la main est une information ; ce bouton n'a pas à la défaire.
--
-- Il ne remplit donc que les cases vides. Rejouable : appelé deux fois de
-- suite, le second passage ne pose rien et rend zéro.
--
-- CEUX QU'ELLE MARQUE SONT EXACTEMENT CEUX QUE L'ÉCRAN MONTRE
--
-- La liste vient de `les_connectes()` (0042), celle-là même qui alimente la
-- colonne de gauche et le pointillé de la feuille. Réécrire ici le critère —
-- ma loge, session ouverte, moins de douze heures — aurait fait deux
-- définitions de « en ligne », qui auraient divergé un jour. Le bouton marque
-- ce que l'écran propose, par construction et non par coïncidence.
--
-- Conséquence à connaître : `les_connectes()` **exclut l'appelant**. Celui qui
-- tient l'appel ne se marque donc pas lui-même — la feuille ne lui propose pas
-- davantage son propre bouton. Il coche sa ligne comme les autres.
--
-- QUI PEUT
--
-- Toute la loge, comme le pointage lui-même (0036) : c'est le même geste, en
-- plus rapide. `puis_je_tenir_cette_reunion()` tient la porte.
-- ---------------------------------------------------------------------------

create or replace function public.pointer_les_connectes(reunion_choisie uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moi   uuid := public.referent_courant();
  poses integer;
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Même porte que le pointage un à un : la loge de la réunion, et rien
  -- d'autre. `null` dit « pas cette réunion-là », comme pour la clôture.
  if not public.puis_je_tenir_cette_reunion(reunion_choisie) then
    return null;
  end if;

  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  select reunion_choisie, c.referent_id, 'Présent', moi, now()
    from public.les_connectes() c
  on conflict (reunion_id, referent_id) do nothing;

  get diagnostics poses = row_count;
  return poses;
end
$$;

comment on function public.pointer_les_connectes(uuid) is
  'Pose « Présent » sur les référents de ma loge dont la session est ouverte, '
  'moi excepté, et rend leur nombre. N''écrase aucun état déjà posé ; '
  'rejouable. Même liste que la colonne de gauche (0042).';

revoke all on function public.pointer_les_connectes(uuid) from public, anon;
grant execute on function public.pointer_les_connectes(uuid) to authenticated;
