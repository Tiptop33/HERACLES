-- ---------------------------------------------------------------------------
-- 0068 — l'affichette se choisit en réunion
--
-- Ce que ça change : chaque réunion retient le dossier que la commission a
-- choisi pour l'affichette — le dossier du mois, décidé le 2e ou le 4e
-- mercredi. L'écran « Réunion » le choisit et produit l'affichette ; la fiche
-- du candidat garde son propre bouton.
--
-- QUI CHOISIT
--
-- Toute la loge, comme pour l'appel : c'est une décision prise en séance, et
-- celui qui tient l'écran ce jour-là n'est pas forcément le Vénérable. Le choix
-- se corrige d'un geste, et ne touche à aucun dossier.
--
-- CE QUI SE CHOISIT
--
-- Un dossier **en cours** de la loge de la réunion : ni un dossier refermé
-- (`mot_de_fermeture`, 0029), ni celui d'une autre loge. Une réunion retirée ne
-- se règle plus. Choisir « aucun » efface le choix.
--
-- Le candidat supprimé (0062) emporte le choix avec lui : `on delete set null`.
--
-- Comme pour le reste des réunions (0036), la table reste fermée : tout passe
-- par les deux fonctions ci-dessous, qui tiennent la porte de `ma_loge()`.
-- ---------------------------------------------------------------------------

alter table public.reunion
  add column if not exists affichette_candidat_id uuid
    references public.candidat (id) on delete set null;

comment on column public.reunion.affichette_candidat_id is
  'Le dossier choisi en réunion pour l''affichette du mois. Vide tant qu''aucun '
  'n''est choisi.';

-- ---------------------------------------------------------------------------
-- Choisir
--
-- Rend `ok`, ou la raison du refus — `reunion` (pas de ma loge, ou retirée),
-- `candidat` (pas un dossier en cours de cette loge). Pas d'exception pour un
-- refus ordinaire : la route traduit le mot en message.
-- ---------------------------------------------------------------------------
create or replace function public.choisir_l_affichette(reunion_choisie uuid, candidat_choisi uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  la_loge uuid;
begin
  if public.referent_courant() is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  select r.loge_id into la_loge
    from public.reunion r
   where r.id = reunion_choisie
     and r.loge_id = public.ma_loge()
     and r.retire_le is null;
  if la_loge is null then
    return 'reunion';
  end if;

  if candidat_choisi is not null and not exists (
    select 1 from public.candidat c
     where c.id = candidat_choisi
       and c.loge_id = la_loge
       and public.mot_de_fermeture(c.cloture) is null
       and public.mot_de_fermeture(c.archive) is null
  ) then
    return 'candidat';
  end if;

  update public.reunion
     set affichette_candidat_id = candidat_choisi
   where id = reunion_choisie;
  return 'ok';
end;
$$;

comment on function public.choisir_l_affichette(uuid, uuid) is
  'Retient pour l''affichette un dossier en cours de la loge de cette réunion, '
  'ou efface le choix (null). Rend ok, reunion ou candidat.';

revoke all on function public.choisir_l_affichette(uuid, uuid) from public, anon;
grant execute on function public.choisir_l_affichette(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Lire le choix
--
-- Le numéro avec l'identifiant : l'écran le montre, la route en tire la fiche.
-- Un dossier refermé depuis le choix n'est plus rendu — on n'imprime pas
-- l'affichette d'une personne qui a trouvé.
-- ---------------------------------------------------------------------------
create or replace function public.affichette_de_la_reunion(reunion_choisie uuid)
returns table (candidat_id uuid, numero integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero
    from public.reunion r
    join public.candidat c on c.id = r.affichette_candidat_id
   where r.id = reunion_choisie
     and r.loge_id = public.ma_loge()
     and public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
$$;

comment on function public.affichette_de_la_reunion(uuid) is
  'Le dossier choisi pour l''affichette de cette réunion de ma loge, s''il est '
  'toujours en cours.';

revoke all on function public.affichette_de_la_reunion(uuid) from public, anon;
grant execute on function public.affichette_de_la_reunion(uuid) to authenticated;
