-- ---------------------------------------------------------------------------
-- 0072 — rouvrir un dossier clôturé
--
-- Ce que ça change : le Vénérable Maître, le Secrétaire et l'administrateur
-- peuvent rouvrir un dossier clôturé — et pas archivé. Il revient parmi les
-- dossiers en cours ; qui l'avait refermé et la date de clôture sont effacés,
-- la date de la réouverture est notée (`rouvert_le`). Le refermer plus tard se
-- fait de nouveau par « Clôturer le dossier ».
--
-- Mêmes droits que pour clôturer (0071) : `puis_je_supprimer_des_candidats()`,
-- chacun dans sa loge, l'administrateur partout.
--
-- LA REPRISE NE REFERME PAS UN DOSSIER ROUVERT
--
-- Un dossier de Bubble rouvert dans HERACLES est encore clôturé chez Bubble :
-- sans précaution, MAJBUBBLE le refermerait le 5 décembre. Le déclencheur de
-- 0071 apprend donc deux choses :
--
--   · une réouverture faite dans HERACLES (`rouvert_le` qui change) passe — il
--     protégeait jusqu'ici toute clôture d'HERACLES contre un effacement ;
--   · un dossier rouvert ne se referme que par HERACLES : une clôture ou un
--     archivage qui arrive sans date d'HERACLES (`clos_le`, `archive_le`
--     inchangés), c'est la reprise, et elle est ignorée.
-- ---------------------------------------------------------------------------

alter table public.candidat
  add column if not exists rouvert_le timestamptz;

comment on column public.candidat.rouvert_le is
  'La dernière réouverture du dossier dans HERACLES. Tant qu''elle est posée, '
  'la reprise de Bubble ne referme pas le dossier.';

-- ---------------------------------------------------------------------------
-- 1. Le déclencheur de 0071, complété
-- ---------------------------------------------------------------------------
create or replace function public.garder_les_decisions_d_heracles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Une réouverture faite dans HERACLES : c'est une décision, elle passe.
  if new.rouvert_le is distinct from old.rouvert_le then
    return new;
  end if;

  if old.clos_le is not null and public.mot_de_fermeture(new.cloture) is null then
    new.cloture := old.cloture;
    new.clos_le := old.clos_le;
  end if;
  if old.archive_le is not null and public.mot_de_fermeture(new.archive) is null then
    new.archive := old.archive;
    new.archive_le := old.archive_le;
  end if;

  -- Un dossier rouvert ne se referme que par HERACLES, qui date sa clôture et
  -- son archivage : ni CLOTURE ni ARCHIVER de Bubble ne le referment.
  if old.rouvert_le is not null
     and public.mot_de_fermeture(old.cloture) is null
     and public.mot_de_fermeture(new.cloture) is not null
     and new.clos_le is not distinct from old.clos_le then
    new.cloture := old.cloture;
  end if;
  if old.rouvert_le is not null
     and public.mot_de_fermeture(old.archive) is null
     and public.mot_de_fermeture(new.archive) is not null
     and new.archive_le is not distinct from old.archive_le then
    new.archive := old.archive;
  end if;

  return new;
end;
$$;

comment on function public.garder_les_decisions_d_heracles() is
  'Empêche une mise à jour — la reprise de Bubble — de rouvrir un dossier '
  'clôturé ou archivé dans HERACLES, ou de refermer un dossier qu''HERACLES a '
  'rouvert.';

-- ---------------------------------------------------------------------------
-- 2. Rouvrir
--
-- Rend `rouvert`, ou la raison du refus : `introuvable` (hors de sa loge, ou
-- absent), `pas-cloture` (en cours, ou archivé : seul un dossier clôturé et
-- pas archivé se rouvre). Le manque de droit lève.
-- ---------------------------------------------------------------------------
create or replace function public.rouvrir_un_dossier(cible uuid)
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
    raise exception 'Ce compte ne peut pas rouvrir de dossier'
      using errcode = 'insufficient_privilege';
  end if;

  select c.* into fiche
    from public.candidat c
   where c.id = cible
     and (public.est_admin() or c.loge_id = public.ma_loge())
     for update;
  if not found then
    return 'introuvable';
  end if;

  if public.mot_de_fermeture(fiche.cloture) is null
     or public.mot_de_fermeture(fiche.archive) is not null then
    return 'pas-cloture';
  end if;

  update public.candidat
     set cloture = null,
         clos_le = null,
         archivage_reporte_au = null,
         rouvert_le = now()
   where id = cible;
  return 'rouvert';
end;
$$;

comment on function public.rouvrir_un_dossier(uuid) is
  'Rouvre un dossier clôturé et pas archivé : il revient parmi les dossiers en '
  'cours. Administrateur, Vénérable Maître, Secrétaire.';

revoke all on function public.rouvrir_un_dossier(uuid) from public, anon;
grant execute on function public.rouvrir_un_dossier(uuid) to authenticated;
