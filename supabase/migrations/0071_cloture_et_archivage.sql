-- ---------------------------------------------------------------------------
-- 0071 — clôturer un dossier, et proposer son archivage deux mois après
--
-- Ce que ça change :
--
--   · un dossier se **clôture** dans HERACLES : le Vénérable Maître, le
--     Secrétaire et l'administrateur disent qui l'a refermé — « Lui-même »,
--     « Heraclés », « Autre », les mots de Bubble — et la date est notée ;
--   · deux mois après la clôture, l'accueil du Vénérable et du Secrétaire
--     propose de l'**archiver**. « Pas encore » repousse la question d'un
--     mois, et ainsi de suite jusqu'à ce que l'archivage soit confirmé ;
--   · Paramètres › Archives montre, pour chaque dossier refermé, sa date de
--     création et celle de sa clôture ou de son archivage.
--
-- LES DATES DE BUBBLE
--
-- Bubble ne datait ni les clôtures ni les archivages : il gardait seulement
-- qui avait refermé le dossier (CLOTURE) et un oui/non (ARCHIVER). Pour les
-- dossiers repris, la date retenue est celle de la **dernière modification
-- de la fiche dans Bubble** — une approximation, que l'écran marque « ≈ ».
--
-- Elle ne peut pas se lire dans `maj_le` : le déclencheur de 0002 y met
-- l'heure courante à chaque mise à jour, reprise comprise. D'où une colonne
-- à part, `bubble_modifie_le`, que la reprise remplit sans rien toucher
-- d'autre (`reprendre-bubble.sh --dates-candidats`). Tant qu'elle est vide,
-- la date est inconnue et le dossier n'entre pas dans la règle des deux mois.
-- Recopier cette date ne compte pas comme une retouche de la fiche : `maj_le`
-- ne bouge pas (1 bis).
--
-- UNE DÉCISION D'HERACLES NE SE DÉFAIT PAS À LA REPRISE
--
-- La reprise de Bubble recopie CLOTURE et ARCHIVER sur les dossiers venus de
-- Bubble. Sans précaution, MAJBUBBLE rouvrirait le 5 décembre un dossier
-- clôturé ou archivé entre-temps dans HERACLES (Bubble dirait « vide » ou
-- « Non »). Un déclencheur l'empêche : une clôture ou un archivage datés par
-- HERACLES (`clos_le`, `archive_le`) ne s'effacent pas par une mise à jour qui
-- les viderait. HERACLES n'a aucun geste pour rouvrir un dossier : une telle
-- mise à jour ne peut venir que de la reprise.
--
-- QUI
--
--   · clôturer : `puis_je_supprimer_des_candidats()` (0062) — administrateur,
--     Vénérable Maître, Secrétaire ; chacun dans sa loge, l'administrateur
--     partout ;
--   · trancher l'archivage : le Vénérable Maître et le Secrétaire **seuls**,
--     dans leur loge. L'administrateur sans titre n'est pas sollicité : la
--     question est posée à la loge.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Les colonnes
-- ---------------------------------------------------------------------------
alter table public.candidat
  add column if not exists clos_le              timestamptz,
  add column if not exists archive_le           timestamptz,
  add column if not exists bubble_modifie_le    timestamptz,
  add column if not exists archivage_reporte_au date;

comment on column public.candidat.clos_le is
  'Le jour où le dossier a été clôturé dans HERACLES. Vide pour une clôture '
  'venue de Bubble, qui ne la datait pas : voir bubble_modifie_le.';
comment on column public.candidat.archive_le is
  'Le jour où l''archivage a été confirmé dans HERACLES. Vide pour un '
  'archivage venu de Bubble : voir bubble_modifie_le.';
comment on column public.candidat.bubble_modifie_le is
  'La dernière modification de la fiche dans Bubble (« Modified Date »). '
  'Sert de date approchée de clôture ou d''archivage pour les dossiers repris.';
comment on column public.candidat.archivage_reporte_au is
  'Jusqu''à quand l''archivage d''un dossier clôturé ne se propose plus : '
  '« Pas encore » le repousse d''un mois.';

-- ---------------------------------------------------------------------------
-- 1 bis. Ce qui n'est pas une retouche de la fiche
--
-- `maj_le` s'affiche sur la fiche (« dernière mise à jour ») et dit si elle a
-- été retouchée depuis sa création. Recopier la date de Bubble, ou repousser
-- la question de l'archivage, ne touchent pas à ce que dit la fiche : la
-- date de mise à jour reste celle d'avant. Tout le reste la renouvelle, comme
-- depuis 0002.
-- ---------------------------------------------------------------------------
create or replace function public.toucher_maj_le()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'candidat'
     and (to_jsonb(new) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au')
       = (to_jsonb(old) - 'maj_le' - 'bubble_modifie_le' - 'archivage_reporte_au') then
    new.maj_le := old.maj_le;
    return new;
  end if;
  new.maj_le := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. La reprise ne défait pas une décision d'HERACLES
-- ---------------------------------------------------------------------------
create or replace function public.garder_les_decisions_d_heracles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.clos_le is not null and public.mot_de_fermeture(new.cloture) is null then
    new.cloture := old.cloture;
    new.clos_le := old.clos_le;
  end if;
  if old.archive_le is not null and public.mot_de_fermeture(new.archive) is null then
    new.archive := old.archive;
    new.archive_le := old.archive_le;
  end if;
  return new;
end;
$$;

comment on function public.garder_les_decisions_d_heracles() is
  'Empêche une mise à jour — la reprise de Bubble — de rouvrir un dossier '
  'clôturé ou archivé dans HERACLES.';

drop trigger if exists candidat_garder_les_decisions on public.candidat;
create trigger candidat_garder_les_decisions
  before update on public.candidat
  for each row execute function public.garder_les_decisions_d_heracles();

-- ---------------------------------------------------------------------------
-- 3. Clôturer
--
-- Rend `cloture`, ou la raison du refus : `introuvable` (hors de sa loge, ou
-- absent), `deja` (déjà clôturé ou archivé). Le manque de droit et un motif
-- inconnu lèvent.
-- ---------------------------------------------------------------------------
create or replace function public.cloturer_un_dossier(cible uuid, par text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  fiche public.candidat%rowtype;
begin
  if not public.puis_je_supprimer_des_candidats() then
    raise exception 'Ce compte ne peut pas clôturer de dossier'
      using errcode = 'insufficient_privilege';
  end if;

  if par is null or par not in ('Lui-même', 'Heraclés', 'Autre') then
    raise exception 'Qui a refermé le dossier : Lui-même, Heraclés ou Autre'
      using errcode = 'invalid_parameter_value';
  end if;

  select c.* into fiche
    from public.candidat c
   where c.id = cible
     and (public.est_admin() or c.loge_id = public.ma_loge())
     for update;
  if not found then
    return 'introuvable';
  end if;

  if public.mot_de_fermeture(fiche.cloture) is not null
     or public.mot_de_fermeture(fiche.archive) is not null then
    return 'deja';
  end if;

  update public.candidat
     set cloture = par,
         clos_le = now(),
         archivage_reporte_au = null
   where id = cible;
  return 'cloture';
end;
$$;

comment on function public.cloturer_un_dossier(uuid, text) is
  'Clôture un dossier en cours : qui l''a refermé (Lui-même, Heraclés, '
  'Autre) et quand. Administrateur, Vénérable Maître, Secrétaire.';

revoke all on function public.cloturer_un_dossier(uuid, text) from public, anon;
grant execute on function public.cloturer_un_dossier(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Qui tranche l'archivage : le Vénérable Maître et le Secrétaire seuls
--
-- La table des titres de 0041, sans l'administrateur.
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_trancher_l_archivage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.referent r
      join public.titre_qui_efface t
        on t.nom_reduit = lower(btrim(r.college))
     where r.id = public.referent_courant()
       and r.loge_id is not null
  )
$$;

comment on function public.puis_je_trancher_l_archivage() is
  'Vrai pour le Vénérable Maître et le Secrétaire d''une loge : ce sont eux '
  'que l''accueil sollicite pour archiver les dossiers clôturés.';

revoke all on function public.puis_je_trancher_l_archivage() from public, anon;
grant execute on function public.puis_je_trancher_l_archivage() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Les dossiers à proposer
--
-- Clôturés et pas archivés, de ma loge, depuis plus de deux mois — date
-- d'HERACLES, ou à défaut date approchée de Bubble —, et dont la question
-- n'a pas été repoussée au-delà d'aujourd'hui. Vide pour qui n'a pas le titre.
-- ---------------------------------------------------------------------------
drop function if exists public.dossiers_a_archiver();

create function public.dossiers_a_archiver()
returns table (
  candidat_id uuid,
  numero      integer,
  nom         text,
  prenom      text,
  cloture     text,
  clos_le     timestamptz,
  estime      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero, c.nom, c.prenom,
         public.mot_de_fermeture(c.cloture),
         coalesce(c.clos_le, c.bubble_modifie_le),
         c.clos_le is null
    from public.candidat c
   where public.puis_je_trancher_l_archivage()
     and c.loge_id = public.ma_loge()
     and public.mot_de_fermeture(c.cloture) is not null
     and public.mot_de_fermeture(c.archive) is null
     and coalesce(c.clos_le, c.bubble_modifie_le) <= now() - interval '2 months'
     and (c.archivage_reporte_au is null or c.archivage_reporte_au <= current_date)
   order by coalesce(c.clos_le, c.bubble_modifie_le), c.numero
$$;

comment on function public.dossiers_a_archiver() is
  'Les dossiers de ma loge clôturés depuis plus de deux mois et pas encore '
  'archivés, dont l''archivage n''a pas été repoussé. Pour le Vénérable '
  'Maître et le Secrétaire seuls.';

revoke all on function public.dossiers_a_archiver() from public, anon;
grant execute on function public.dossiers_a_archiver() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Trancher
--
-- `archiver` vrai : le dossier est archivé (« Oui », comme Bubble), daté.
-- `archiver` faux : la question revient dans un mois.
-- Rend `archive`, `reporte`, ou `introuvable` (pas un dossier clôturé et non
-- archivé de ma loge). Le manque de titre lève.
-- ---------------------------------------------------------------------------
create or replace function public.trancher_l_archivage(cible uuid, archiver boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.puis_je_trancher_l_archivage() then
    raise exception 'Seuls le Vénérable Maître et le Secrétaire tranchent l''archivage'
      using errcode = 'insufficient_privilege';
  end if;

  perform 1
     from public.candidat c
    where c.id = cible
      and c.loge_id = public.ma_loge()
      and public.mot_de_fermeture(c.cloture) is not null
      and public.mot_de_fermeture(c.archive) is null
      for update;
  if not found then
    return 'introuvable';
  end if;

  if archiver then
    update public.candidat
       set archive = 'Oui',
           archive_le = now(),
           archivage_reporte_au = null
     where id = cible;
    return 'archive';
  end if;

  update public.candidat
     set archivage_reporte_au = (current_date + interval '1 month')::date
   where id = cible;
  return 'reporte';
end;
$$;

comment on function public.trancher_l_archivage(uuid, boolean) is
  'Archive un dossier clôturé de ma loge, ou repousse la question d''un mois. '
  'Vénérable Maître et Secrétaire seuls.';

revoke all on function public.trancher_l_archivage(uuid, boolean) from public, anon;
grant execute on function public.trancher_l_archivage(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Les dates des dossiers refermés — Paramètres › Archives
--
-- La même visibilité que `candidats_de_la_loge()` (0062) : l'administrateur
-- partout, les autres dans leurs loges. Rien que des dates.
-- ---------------------------------------------------------------------------
drop function if exists public.dates_des_dossiers_refermes();

create function public.dates_des_dossiers_refermes()
returns table (
  candidat_id    uuid,
  cree_le        timestamptz,
  clos_le        timestamptz,
  clos_estime    boolean,
  archive_le     timestamptz,
  archive_estime boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with droit as (select public.est_admin() as admin)
  select c.id, c.cree_le,
         case when public.mot_de_fermeture(c.cloture) is not null
              then coalesce(c.clos_le, c.bubble_modifie_le) end,
         c.clos_le is null,
         case when public.mot_de_fermeture(c.archive) is not null
              then coalesce(c.archive_le, c.bubble_modifie_le) end,
         c.archive_le is null
    from public.candidat c, droit d
   where (d.admin or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
     and (public.mot_de_fermeture(c.cloture) is not null
          or public.mot_de_fermeture(c.archive) is not null)
$$;

comment on function public.dates_des_dossiers_refermes() is
  'Création, clôture et archivage des dossiers refermés visibles par la '
  'session ; `estime` quand la date vient de la dernière modification Bubble.';

revoke all on function public.dates_des_dossiers_refermes() from public, anon;
grant execute on function public.dates_des_dossiers_refermes() to authenticated;
