-- ---------------------------------------------------------------------------
-- 0027 — écrire dans le journal, comme on le corrige : dans toute la loge
--
-- Ce que ça change : le formulaire d'écriture n'apparaissait que pour le
-- référent et le parrain du candidat. Les autres lisaient le journal, et
-- voyaient à la place « Seuls son référent et son parrain y écrivent ».
--
-- CE QUI ÉTAIT BANCAL
--
-- Depuis 0024 et 0025, toute la loge peut refermer une tâche, corriger le
-- texte d'une note et la retirer du journal. Mais pas en ajouter une. On
-- pouvait donc réécrire le mot d'un collègue sans pouvoir en écrire un soi-
-- même — la porte la plus étroite était aussi celle qui donnait le moins.
--
-- Cette migration met l'écriture au niveau du reste : **qui voit le dossier y
-- écrit**. C'est une règle de moins à retenir, et c'est celle que l'usage
-- réclamait — un collègue qui prend un appel pour un dossier qu'il
-- n'accompagne pas doit pouvoir le noter, sinon l'appel n'est noté nulle part.
--
-- CE QUI NE CHANGE PAS
--
--   · **On signe de son nom.** `auteur_id = referent_courant()` reste dans la
--     policy : on écrit chez un collègue, jamais à sa place.
--   · **La loge, et pas au-delà.** Un référent d'une autre loge ne voit pas le
--     candidat ; il ne peut donc pas davantage lui écrire.
--   · **L'administration n'écrit pas.** Sans fiche de référent, il n'y a
--     personne à mettre en auteur, et la policy refuse.
--   · **La correction directe du texte** reste réservée à l'auteur
--     (`suivi_correction_auteur`, 0021). Ce qui s'élargit passe par les
--     fonctions de 0025, qui laissent leur trace.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le droit d'écrire sur un candidat
--
--    En `security definer`, et c'est indispensable : la policy de 0021
--    interrogeait `public.candidat` en direct, donc **à travers la RLS de
--    cette table**, qui ne montre à un référent que ses propres candidats.
--    Cela suffisait tant que seul le référent écrivait ; élargir à la loge par
--    le même chemin ne marche pas — la sous-requête revient vide et
--    l'insertion est rejetée sans un mot.
--
--    La lecture élargie à la loge passe partout ailleurs par des fonctions
--    (0019, 0020) ; l'écriture suit la même voie.
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_noter_ce_candidat(candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.referent_courant() is not null and exists (
    select 1 from public.candidat c
     where c.id = candidat
       and (c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()
         or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
  )
$$;

comment on function public.puis_je_noter_ce_candidat(uuid) is
  'Puis-je écrire dans le journal de ce candidat ? La règle de la loge, la '
  'même que pour le lire. En security definer : la RLS de `candidat` ne montre '
  'que les siens, et l''écriture s''étend plus loin que cela.';

revoke all on function public.puis_je_noter_ce_candidat(uuid) from public, anon;
grant execute on function public.puis_je_noter_ce_candidat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Écrire : toute la loge
--    La policy de 0021 est remplacée, et non complétée : deux policies
--    d'insertion se seraient additionnées en un `or` difficile à relire.
-- ---------------------------------------------------------------------------
drop policy if exists suivi_ecriture_accompagnes on public.suivi;
drop policy if exists suivi_ecriture_loge on public.suivi;

create policy suivi_ecriture_loge on public.suivi
  for insert
  to authenticated
  with check (
    -- On signe de son nom, toujours : sans cette condition, on écrirait sous
    -- celui d'un collègue.
    auteur_id = (select public.referent_courant())
    and public.puis_je_noter_ce_candidat(candidat_id)
  );

-- ---------------------------------------------------------------------------
-- 3. L'écran a-t-il quelqu'un à mettre en auteur ?
--    Une fiche de référent rattachée au compte, et c'est tout : la lecture
--    porte déjà le droit d'écrire. Sert à décider d'afficher le formulaire —
--    la policy, elle, refuse de toute façon.
-- ---------------------------------------------------------------------------
create or replace function public.je_suis_referent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.referent_courant() is not null
$$;

comment on function public.je_suis_referent() is
  'Le compte est-il rattaché à une fiche de référent ? Ce qui revient à '
  'demander : y a-t-il quelqu''un à mettre en auteur ? Une administratrice '
  'sans fiche lit les journaux et n''y écrit pas.';

revoke all on function public.je_suis_referent() from public, anon;
grant execute on function public.je_suis_referent() to authenticated;
