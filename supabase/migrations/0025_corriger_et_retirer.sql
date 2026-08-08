-- ---------------------------------------------------------------------------
-- 0025 — corriger une note, et la retirer
--
-- Ce que ça change : on pouvait écrire dans le journal et refermer une tâche
-- (0024), pas revenir sur ce qui était écrit. Une faute de frappe restait, une
-- ligne postée sur le mauvais candidat restait. Désormais on corrige le texte,
-- la nature et la date, et l'on retire une ligne de l'écran.
--
-- RETIRER N'EST PAS EFFACER — et c'est la clé de cette migration
--
-- 0021 refusait toute policy de suppression : « un journal dont on efface les
-- lignes n'est plus un journal ; une faute se corrige ». La règle tient. Ce
-- qu'ajoute cette migration n'est pas une suppression : la ligne quitte les
-- écrans, elle ne quitte pas la base. `retire_le` et `retire_par` disent quand
-- et par qui, et `rendre_le_suivi()` défait le geste.
--
-- Décision du 8 août 2026, prise en connaissance de l'alternative. Ce que le
-- retrait doux coûte : une ligne gênante n'est pas détruite, seulement mise de
-- côté — quelqu'un qui voudrait la faire disparaître pour de bon ne le peut
-- pas depuis l'application. C'est le prix, et c'est aussi la protection : ces
-- journaux portent l'accompagnement de personnes vulnérables, et une ligne
-- effacée par erreur ne se retrouve pas.
--
-- QUI CORRIGE, QUI RETIRE
--
-- Toute la loge, comme pour l'état (0024) et pour la même raison : sur les 473
-- lignes reprises de Bubble, 73 n'ont aucun auteur et les autres sont signées
-- par des référents qui n'ont pas forcément de compte. Réservée à l'auteur, la
-- correction n'aurait pas pu servir là où elle sert le plus.
--
-- La policy `suivi_correction_auteur` de 0021 n'est pas touchée : l'`update`
-- **direct** sur la table reste réservé à l'auteur. Ce qui s'élargit passe par
-- des fonctions, qui écrivent exactement les colonnes qu'elles annoncent et
-- laissent leur trace. C'est la même mécanique qu'en 0024.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Qui a corrigé, qui a retiré
-- ---------------------------------------------------------------------------
alter table public.suivi
  add column if not exists modifie_par uuid references public.referent (id) on delete set null;
alter table public.suivi
  add column if not exists retire_le timestamptz;
alter table public.suivi
  add column if not exists retire_par uuid references public.referent (id) on delete set null;

comment on column public.suivi.retire_le is
  'Quand la ligne a été retirée des écrans. Elle reste en base : retirer '
  'n''est pas effacer, et le geste se défait.';

comment on column public.suivi.modifie_par is
  'Qui a corrigé le texte en dernier. Vide tant que personne n''y a touché.';

-- Les écrans ne lisent que ce qui n'est pas retiré : l'index suit cette
-- lecture-là, qui est la seule fréquente.
drop index if exists public.suivi_candidat_idx;
create index if not exists suivi_candidat_idx
  on public.suivi (candidat_id, fait_le desc, cree_le desc)
  where retire_le is null;

-- ---------------------------------------------------------------------------
-- 2. Le droit d'agir sur une ligne
--    Une seule définition, appelée par les trois fonctions qui suivent : la
--    règle de lecture de la fiche (0020), plus une fiche de référent au compte.
-- ---------------------------------------------------------------------------
create or replace function public.peut_agir_sur_le_suivi(ligne uuid, moi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select moi is not null and exists (
    select 1
      from public.suivi s
      join public.candidat c on c.id = s.candidat_id
     where s.id = ligne
       and (c.referent_id = moi
         or c.parrain_id  = moi
         or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
  )
$$;

comment on function public.peut_agir_sur_le_suivi(uuid, uuid) is
  'Cette personne peut-elle corriger ou retirer cette ligne ? La règle de la '
  'loge, écrite une fois pour les trois gestes qui la partagent.';

revoke all on function public.peut_agir_sur_le_suivi(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Corriger
--    Le texte, la nature et le jour. Ni le candidat — une ligne ne déménage
--    pas d'un dossier à l'autre, on la retire et on la réécrit —, ni l'auteur,
--    qui reste celui qui a écrit.
-- ---------------------------------------------------------------------------
drop function if exists public.modifier_le_suivi(uuid, text, text, date);

create function public.modifier_le_suivi(
  ligne          uuid,
  nouveau_texte  text,
  nouvelle_nature text default null,
  nouveau_fait_le date default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi   uuid := public.referent_courant();
  texte_propre text := nullif(btrim(nouveau_texte), '');
  touchee int;
begin
  if texte_propre is null then
    raise exception 'Une note vide ne dit rien' using errcode = 'check_violation';
  end if;
  if length(texte_propre) > 4000 then
    raise exception 'Cette note est trop longue' using errcode = 'check_violation';
  end if;

  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.peut_agir_sur_le_suivi(ligne, moi) then
    return false;
  end if;

  update public.suivi
     set texte       = texte_propre,
         nature      = nullif(btrim(nouvelle_nature), ''),
         fait_le     = coalesce(nouveau_fait_le, fait_le),
         modifie_par = moi
   where id = ligne
     and retire_le is null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

comment on function public.modifier_le_suivi(uuid, text, text, date) is
  'Corrige le texte, la nature et le jour d''une ligne de suivi. Ouverte à '
  'toute la loge (voir 0025) ; l''auteur d''origine ne change pas, et la '
  'correction laisse son nom dans `modifie_par`.';

revoke all on function public.modifier_le_suivi(uuid, text, text, date) from public, anon;
grant execute on function public.modifier_le_suivi(uuid, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retirer, et rendre
-- ---------------------------------------------------------------------------
drop function if exists public.retirer_le_suivi(uuid);

create function public.retirer_le_suivi(ligne uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  touchee int;
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.peut_agir_sur_le_suivi(ligne, moi) then
    return false;
  end if;

  -- Déjà retirée : on ne réécrit pas la trace du premier retrait.
  update public.suivi
     set retire_le = now(), retire_par = moi
   where id = ligne
     and retire_le is null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

comment on function public.retirer_le_suivi(uuid) is
  'Retire une ligne des écrans, sans l''effacer : elle reste en base avec qui '
  'l''a retirée et quand. `rendre_le_suivi()` défait le geste.';

revoke all on function public.retirer_le_suivi(uuid) from public, anon;
grant execute on function public.retirer_le_suivi(uuid) to authenticated;

drop function if exists public.rendre_le_suivi(uuid);

create function public.rendre_le_suivi(ligne uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  touchee int;
begin
  if moi is null then
    raise exception 'Aucune fiche de référent rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.peut_agir_sur_le_suivi(ligne, moi) then
    return false;
  end if;

  update public.suivi
     set retire_le = null, retire_par = null
   where id = ligne
     and retire_le is not null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end
$$;

comment on function public.rendre_le_suivi(uuid) is
  'Défait un retrait. C''est ce qui rend le retrait doux acceptable : une '
  'ligne écartée par erreur revient, là où une suppression ne reviendrait pas.';

revoke all on function public.rendre_le_suivi(uuid) from public, anon;
grant execute on function public.rendre_le_suivi(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Les lectures ignorent ce qui est retiré
--    Quatrième version de ces deux fonctions (0021, 0023, 0024, celle-ci) :
--    PostgreSQL ne sait pas ajouter une colonne à un type de retour, il faut
--    les réécrire en entier.
-- ---------------------------------------------------------------------------
drop function if exists public.suivi_du_candidat(uuid);

create function public.suivi_du_candidat(candidat uuid)
returns table (
  id            uuid,
  fait_le       date,
  nature        text,
  etat          text,
  texte         text,
  auteur_nom    text,
  etat_par_nom  text,
  /** Qui a corrigé le texte en dernier, quand quelqu'un l'a fait. */
  modifie_par_nom text,
  c_est_moi     boolean,
  je_peux_agir  boolean,
  cree_le       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.fait_le, s.nature, s.etat, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         nullif(btrim(coalesce(e.prenom, '') || ' ' || coalesce(e.nom, '')), ''),
         nullif(btrim(coalesce(m.prenom, '') || ' ' || coalesce(m.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         public.referent_courant() is not null,
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
    left join public.referent e on e.id = s.etat_par
    left join public.referent m on m.id = s.modifie_par
   where s.candidat_id = candidat
     and s.retire_le is null
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_du_candidat(uuid) is
  'Le journal d''un candidat, du plus récent au plus ancien, pour qui a le '
  'droit de voir sa fiche. Les lignes retirées n''y sont pas.';

revoke all on function public.suivi_du_candidat(uuid) from public, anon;
grant execute on function public.suivi_du_candidat(uuid) to authenticated;

drop function if exists public.suivi_de_la_loge();

create function public.suivi_de_la_loge()
returns table (
  candidat_id   uuid,
  id            uuid,
  fait_le       date,
  nature        text,
  etat          text,
  texte         text,
  auteur_nom    text,
  etat_par_nom  text,
  modifie_par_nom text,
  c_est_moi     boolean,
  je_peux_agir  boolean,
  cree_le       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.candidat_id, s.id, s.fait_le, s.nature, s.etat, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         nullif(btrim(coalesce(e.prenom, '') || ' ' || coalesce(e.nom, '')), ''),
         nullif(btrim(coalesce(m.prenom, '') || ' ' || coalesce(m.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         public.referent_courant() is not null,
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
    left join public.referent e on e.id = s.etat_par
    left join public.referent m on m.id = s.modifie_par
   where s.retire_le is null
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_de_la_loge() is
  'Toutes les notes de suivi que l''appelant a le droit de lire, du plus '
  'récent au plus ancien. Les lignes retirées n''y sont pas.';

revoke all on function public.suivi_de_la_loge() from public, anon;
grant execute on function public.suivi_de_la_loge() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ce qui a été retiré, pour qui administre
--    Le retrait doux ne vaut que si l'on peut voir ce qui a été retiré :
--    sinon c'est une suppression avec une case en plus.
-- ---------------------------------------------------------------------------
drop function if exists public.suivi_retire_du_candidat(uuid);

create function public.suivi_retire_du_candidat(candidat uuid)
returns table (
  id             uuid,
  fait_le        date,
  texte          text,
  auteur_nom     text,
  retire_par_nom text,
  retire_le      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.fait_le, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         s.retire_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
    left join public.referent r on r.id = s.retire_par
   where s.candidat_id = candidat
     and s.retire_le is not null
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.retire_le desc
$$;

comment on function public.suivi_retire_du_candidat(uuid) is
  'Ce qui a été retiré du journal d''un candidat, et par qui. Même règle de '
  'lecture que le journal lui-même : ce qu''on avait le droit de lire, on a '
  'le droit de savoir qu''on l''a écarté.';

revoke all on function public.suivi_retire_du_candidat(uuid) from public, anon;
grant execute on function public.suivi_retire_du_candidat(uuid) to authenticated;
