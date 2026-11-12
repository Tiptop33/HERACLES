-- ---------------------------------------------------------------------------
-- 0088 — les secteurs que cherche un candidat
--
-- Ce que ça change : un candidat peut désigner jusqu'à trois secteurs
-- d'activité, classés. Le premier est son secteur principal, les deux autres
-- des pistes, par exemple pour une reconversion. Chacun est une section
-- (« F — Construction ») ou une division (« 43 — Travaux de construction
-- spécialisés ») de la nomenclature NAF (0086) : un candidat qui hésite
-- peut s'arrêter au grand secteur.
--
-- Qui les choisit (décision du 12 novembre 2026) : le candidat les propose
-- dans son formulaire de candidature, le référent les confirme ou les corrige
-- sur la fiche. `propose_par` dit d'où vient la ligne ; `confirme_le` dit si
-- un référent l'a validée. Une troisième origine, « reprise », servira à la
-- conversion des secteurs saisis dans Bubble (table de correspondance, à
-- venir).
--
-- Le texte libre `candidat.secteur_activite_libelle`, repris de Bubble, reste
-- en place : il garde ce que la personne avait écrit, et permet de vérifier
-- la conversion.
--
-- Le rang n'est pas tenu contigu par la base : retirer le secteur n° 1 laisse
-- le n° 2 en tête. L'ordre se lit `order by rang` ; l'écran renumérotera.
--
-- Supprimer un candidat (0062) emporte ses secteurs : `on delete cascade`.
--
-- Accès : fermé. RLS active, aucune policy, aucun GRANT à `anon` ni à
-- `authenticated`. Le formulaire de candidature et la fiche candidat
-- apporteront leurs droits avec leurs écrans, et pas plus large que la fiche
-- du candidat elle-même.
-- ---------------------------------------------------------------------------

-- 1. Un code NAF du bon niveau ---------------------------------------------
-- Réutilisée par 0089 : un candidat choisit une section ou une division, une
-- loge coche de la division à la sous-classe. Les niveaux admis sont passés
-- en arguments du déclencheur.
--
-- `security definer` : la ligne est écrite par la personne connectée, qui
-- n'aura pas forcément le droit de lire `code_naf` ; le contrôle, lui, doit
-- toujours pouvoir la lire.
create or replace function public.exiger_niveau_naf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trouve text;
begin
  select niveau into trouve from public.code_naf where code = new.code;
  if trouve is null then
    return new;  -- code inconnu : la clé étrangère le refusera
  end if;
  if not (trouve = any (tg_argv)) then
    raise exception 'Le code NAF % est une %, attendu : %',
      new.code, trouve, array_to_string(tg_argv, ' ou ')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

comment on function public.exiger_niveau_naf() is
  'Déclencheur : refuse un code NAF qui n''est pas du niveau demandé '
  '(section, division…), passé en argument.';

revoke all on function public.exiger_niveau_naf() from public, anon, authenticated;

-- 2. La table ----------------------------------------------------------------
create table if not exists public.candidat_secteur (
  candidat_id   uuid not null references public.candidat (id) on delete cascade,
  -- 1 = le secteur principal ; 2 et 3 = des pistes.
  rang          smallint not null,
  code          text not null references public.code_naf (code),
  propose_par   text not null,
  confirme_par  uuid references public.referent (id) on delete set null,
  confirme_le   timestamptz,
  cree_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now(),

  primary key (candidat_id, rang),
  -- Trois au plus : le rang va de 1 à 3, et il est unique par candidat.
  constraint candidat_secteur_rang check (rang between 1 and 3),
  -- Le même secteur ne se cite pas deux fois.
  constraint candidat_secteur_unique unique (candidat_id, code),
  constraint candidat_secteur_origine
    check (propose_par in ('candidat', 'referent', 'reprise')),
  -- Un nom de référent sans date de confirmation n'a pas de sens. L'inverse,
  -- si : le référent peut avoir quitté l'application depuis.
  constraint candidat_secteur_confirmation
    check (confirme_par is null or confirme_le is not null)
);

comment on table public.candidat_secteur is
  'Les secteurs d''activité que cherche un candidat : trois au plus, classés '
  '(1 = principal). Section ou division NAF. Proposés par le candidat, '
  'confirmés par le référent.';
comment on column public.candidat_secteur.propose_par is
  'D''où vient la ligne : candidat (formulaire), referent (fiche) ou reprise '
  '(conversion des secteurs Bubble).';
comment on column public.candidat_secteur.confirme_le is
  'Vide = proposé, pas encore confirmé par un référent.';

-- Retrouver les candidats d'un secteur : le rapprochement partira de là.
create index if not exists candidat_secteur_code_idx on public.candidat_secteur (code);

drop trigger if exists candidat_secteur_niveau on public.candidat_secteur;
create trigger candidat_secteur_niveau
  before insert or update of code on public.candidat_secteur
  for each row execute function public.exiger_niveau_naf('section', 'division');

drop trigger if exists candidat_secteur_maj_le on public.candidat_secteur;
create trigger candidat_secteur_maj_le
  before update on public.candidat_secteur
  for each row execute function public.toucher_maj_le();

-- 3. Fermée ------------------------------------------------------------------
alter table public.candidat_secteur enable row level security;
revoke all on public.candidat_secteur from public, anon, authenticated;
