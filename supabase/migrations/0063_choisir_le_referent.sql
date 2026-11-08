-- ---------------------------------------------------------------------------
-- 0063 — choisir le référent de chaque candidat
--
-- Ce que ça change : la fiche porte un menu « Référent » sur tous les
-- dossiers, et plus seulement sur ceux que personne n'accompagne.
--
-- QUI PEUT QUOI
--
-- 0057 avait posé : « On ne retire pas un candidat à quelqu'un d'autre : cela
-- se décide en commission. » La règle tient, et cette migration lui donne
-- enfin quelqu'un pour reporter la décision de la commission :
--
--   * tout référent de la loge prend un candidat sans référent, pour lui ou
--     pour un collègue — comme avant ;
--   * le référent d'un candidat le passe à un collègue — comme avant ;
--   * **l'administrateur, le Vénérable Maître et le Secrétaire** changent le
--     référent de n'importe quel candidat — de leur loge, et l'administrateur
--     de toutes. Ce sont les titres de `titre_qui_efface` (0041), le même
--     registre que pour effacer une réunion ou supprimer un dossier (0062).
--
-- LE CHOIX SURVIT À LA REPRISE BUBBLE
--
-- `outils/import-bubble.mjs` recalcule `referent_id` à partir de
-- `referent_bubble_id` pour chaque dossier repris de Bubble. Un référent
-- choisi ici aurait donc été remplacé par celui de Bubble à la reprise finale
-- — au plus tard le 5 décembre 2026, quand plus personne ne saurait pourquoi.
--
-- `referent_choisi_le` note le moment où le référent a été choisi dans
-- HERACLES, et la reprise ne touche plus le référent d'un tel dossier. Le
-- déclencheur de 0006 fige cette colonne comme `referent_id` : seule
-- `designer_le_referent()` la pose.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La trace du choix
-- ---------------------------------------------------------------------------
alter table public.candidat
  add column if not exists referent_choisi_le timestamptz;

comment on column public.candidat.referent_choisi_le is
  'Quand le référent a été choisi dans HERACLES (designer_le_referent). Posé, '
  'il interdit à la reprise Bubble de remplacer ce référent.';

-- Le déclencheur de 0057, avec une colonne de plus sous le même drapeau.
create or replace function public.candidat_avant_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if coalesce(current_setting('heracles.designation_referent', true), '') <> 'oui' then
      new.referent_id        := old.referent_id;
      new.referent_choisi_le := old.referent_choisi_le;
    end if;
    new.parrain_id  := old.parrain_id;
    new.loge_id     := old.loge_id;
    new.numero      := old.numero;
    new.profil_id   := old.profil_id;
    new.bubble_id   := old.bubble_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Qui reporte la décision de la commission
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_confier_tout_candidat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Le même registre de titres que pour effacer (0041), comparé sur la forme
  -- réduite : `referent.college` est du texte libre.
  select public.est_admin() or exists (
    select 1
      from public.referent r
      join public.titre_qui_efface t
        on t.nom_reduit = lower(btrim(r.college))
     where r.id = public.referent_courant()
  )
$$;

comment on function public.puis_je_confier_tout_candidat() is
  'Vrai pour l''administrateur et les titres de titre_qui_efface : ils changent '
  'le référent de n''importe quel candidat de leur loge (l''administrateur, de '
  'toutes), pour reporter la décision de la commission.';

revoke all on function public.puis_je_confier_tout_candidat() from public, anon;
grant execute on function public.puis_je_confier_tout_candidat() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ce que l'écran doit montrer pour une fiche
--
-- Le référent actuel — pour que le menu s'ouvre dessus — et le droit d'en
-- changer, calculé exactement comme `designer_le_referent()` le vérifiera.
-- Un menu qui échoue toujours vaut moins qu'un menu absent.
-- ---------------------------------------------------------------------------
drop function if exists public.designation_du_candidat(uuid);

create function public.designation_du_candidat(le_candidat uuid)
returns table (referent_id uuid, je_peux_choisir boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.referent_id,
         -- Un référent de la loge prend un dossier sans référent ; le
         -- référent passe le sien ; le bureau change tous ceux de sa loge.
         c.referent_id is null and public.referent_courant() is not null
           or c.referent_id = public.referent_courant()
           or public.puis_je_confier_tout_candidat()
    from public.candidat c
   where c.id = le_candidat
     and (public.est_admin() or c.loge_id = public.ma_loge())
$$;

comment on function public.designation_du_candidat(uuid) is
  'Le référent actuel d''un candidat, et si la session peut en choisir un '
  'autre. Rien hors de sa loge — sauf pour l''administrateur.';

revoke all on function public.designation_du_candidat(uuid) from public, anon;
grant execute on function public.designation_du_candidat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le geste
--
-- Même signature que 0057 : la route n'a pas à changer. Ce qui change :
--   * le bureau passe la barrière « déjà accompagné par un autre » ;
--   * l'administrateur, qui n'a pas forcément de fiche ni de loge, agit sur
--     toutes les loges — et doit alors nommer le référent ;
--   * le référent choisi l'est **dans la loge du candidat**, et non dans
--     celle de qui choisit (les deux ne diffèrent que pour l'administrateur) ;
--   * le choix est daté, ce qui le protège de la reprise Bubble.
-- ---------------------------------------------------------------------------
create or replace function public.designer_le_referent(le_candidat uuid, le_referent uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid    := public.referent_courant();
  admin   boolean := public.est_admin();
  bureau  boolean := public.puis_je_confier_tout_candidat();
  cible   uuid    := coalesce(le_referent, public.referent_courant());
  actuel  uuid;
  sa_loge uuid;
begin
  if not admin and (moi is null or public.ma_loge() is null) then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  select c.referent_id, c.loge_id into actuel, sa_loge
    from public.candidat c
   where c.id = le_candidat
     for update;

  -- Hors de ma loge, le candidat n'existe pas pour moi : même réponse que
  -- pour un identifiant inventé. L'administrateur voit toutes les loges.
  if not found or (not admin and sa_loge is distinct from public.ma_loge()) then
    return false;
  end if;

  -- On ne retire pas un candidat à quelqu'un d'autre — sauf à reporter la
  -- décision de la commission.
  if actuel is not null and actuel is distinct from moi and not bureau then
    return false;
  end if;

  if cible is null
     or not exists (select 1 from public.referent r where r.id = cible and r.loge_id = sa_loge) then
    raise exception 'Ce référent n''est pas de la loge du candidat'
      using errcode = 'foreign_key_violation';
  end if;

  -- Le même référent : rien à faire, et surtout rien à dater.
  if cible = actuel then
    return true;
  end if;

  perform set_config('heracles.designation_referent', 'oui', true);
  update public.candidat
     set referent_id = cible, referent_choisi_le = now(), maj_le = now()
   where id = le_candidat;
  perform set_config('heracles.designation_referent', '', true);

  return true;
end;
$$;

comment on function public.designer_le_referent(uuid, uuid) is
  'Un référent prend en charge un candidat sans référent de sa loge, ou passe '
  'le sien à un collègue. L''administrateur, le Vénérable Maître et le '
  'Secrétaire changent le référent de tout candidat de leur loge (l''admin, de '
  'toutes). Le choix est daté : la reprise Bubble ne le remplace plus.';

revoke all on function public.designer_le_referent(uuid, uuid) from public, anon;
grant execute on function public.designer_le_referent(uuid, uuid) to authenticated;
