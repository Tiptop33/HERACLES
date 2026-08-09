-- ---------------------------------------------------------------------------
-- 0039 — fermer la feuille, c'est arrêter l'appel
--
-- Ce que ça change : à la fin de l'appel, les référents que personne n'a
-- nommés étaient laissés vides. Ni présents, ni excusés, ni absents : rien.
-- Or dans une feuille d'appel, celui qu'on n'a pas nommé n'est pas un cas
-- indéterminé — il n'était pas là.
--
-- Fermer la feuille pose donc « Absent » sur tout ce qui reste vide, et cela
-- seulement :
--
--   · un état déjà posé n'est jamais touché, même par mégarde. Excusé reste
--     excusé, présent reste présent — `on conflict do nothing`, et non
--     `do update` ;
--   · la fonction est rejouable. La refermer une seconde fois ne change plus
--     rien et rend zéro.
--
-- Ce qui reste corrigeable : rouvrir la feuille et recocher. Un absent posé
-- par la fermeture ne se distingue pas d'un absent nommé à voix haute, et
-- c'est voulu — dans les deux cas la personne manquait.
-- ---------------------------------------------------------------------------

drop function if exists public.clore_la_feuille(uuid);

create function public.clore_la_feuille(reunion_choisie uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  poses   integer;
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  -- Même porte que le pointage : la loge de la réunion, et rien d'autre.
  if not public.puis_je_tenir_cette_reunion(reunion_choisie) then
    return null;
  end if;

  insert into public.appel (reunion_id, referent_id, etat, appele_par, appele_le)
  select u.id, r.id, 'Absent', moi, now()
    from public.reunion u
    join public.referent r on r.loge_id = u.loge_id
   where u.id = reunion_choisie
  on conflict (reunion_id, referent_id) do nothing;

  get diagnostics poses = row_count;
  return poses;
end
$$;

comment on function public.clore_la_feuille(uuid) is
  'Pose « Absent » sur les référents que l''appel n''a pas nommés, et rend '
  'leur nombre. N''écrase aucun état déjà posé ; rejouable.';

revoke all on function public.clore_la_feuille(uuid) from public, anon;
grant execute on function public.clore_la_feuille(uuid) to authenticated;
