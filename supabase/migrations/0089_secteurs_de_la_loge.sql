-- ---------------------------------------------------------------------------
-- 0089 — les secteurs présents dans une loge
--
-- Ce que ça change : chaque loge coche les secteurs d'activité où travaillent
-- ses membres. Ni nombre, ni nom (décisions du 12 novembre 2026) : la loge
-- dit « il y a chez nous du 43 — Travaux de construction spécialisés », et
-- c'est tout. L'application sait où la loge peut aider un candidat, sans rien
-- enregistrer sur une personne.
--
-- Le niveau : au moins la division (88 choix), puis aussi précis que la loge
-- le veut — groupe, classe, jusqu'à la sous-classe (« 43.21A — Travaux
-- d'installation électrique dans tous locaux »). Pas la section seule : « F —
-- Construction » ne dirait rien d'utile d'une loge. Le rapprochement avec un
-- candidat remontera du code coché à sa division puis à sa section : une loge
-- qui a coché 43.21A répond à un candidat qui cherche dans le 43 comme à
-- celui qui cherche dans tout le bâtiment.
--
-- Cocher 43 et 43.21A ensemble est permis : la loge peut savoir qu'elle a de
-- l'électricité, et aussi d'autres travaux du 43 sans les détailler.
--
-- Qui coche : le Secrétaire de la loge, et les administrateurs en secours.
-- Leurs droits arriveront avec l'écran ; d'ici là, la table est fermée (RLS
-- active, aucune policy, aucun GRANT).
--
-- La date : `loge.secteurs_maj_le` dit quand la liste de la loge a changé pour
-- la dernière fois — un secteur coché ou décoché. Elle s'affichera à côté de
-- la liste : une liste vieille d'un an doit se voir. Elle est sur la loge et
-- non sur chaque ligne, parce qu'un secteur décoché ne laisse pas de ligne
-- pour porter sa date.
-- ---------------------------------------------------------------------------

-- 1. La table ----------------------------------------------------------------
create table if not exists public.loge_secteur (
  loge_id   uuid not null references public.loge (id) on delete cascade,
  code      text not null references public.code_naf (code),
  coche_le  timestamptz not null default now(),
  coche_par uuid references public.referent (id) on delete set null,

  primary key (loge_id, code)
);

comment on table public.loge_secteur is
  'Les secteurs d''activité présents dans une loge, cochés par son Secrétaire : '
  'de la division à la sous-classe NAF. Ni nombre, ni nom.';
comment on column public.loge_secteur.coche_par is
  'Le référent qui a coché ce secteur. Vide s''il a quitté l''application.';

-- Retrouver les loges d'un secteur : c'est la question du rapprochement.
create index if not exists loge_secteur_code_idx on public.loge_secteur (code);

drop trigger if exists loge_secteur_niveau on public.loge_secteur;
create trigger loge_secteur_niveau
  before insert or update of code on public.loge_secteur
  for each row execute function public.exiger_niveau_naf('division', 'groupe', 'classe', 'sous-classe');

-- 2. La date de la liste, sur la loge ----------------------------------------
alter table public.loge
  add column if not exists secteurs_maj_le timestamptz;

comment on column public.loge.secteurs_maj_le is
  'Dernière modification de la liste des secteurs de la loge (loge_secteur). '
  'Vide = liste jamais remplie.';

-- `security definer` : la personne qui coche n'a pas, elle, le droit de
-- modifier la fiche de la loge.
create or replace function public.dater_secteurs_de_la_loge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.loge set secteurs_maj_le = now() where id = new.loge_id;
  end if;
  -- Un secteur décoché, ou passé d'une loge à une autre : l'ancienne loge a
  -- changé elle aussi.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.loge_id is distinct from new.loge_id) then
    update public.loge set secteurs_maj_le = now() where id = old.loge_id;
  end if;
  return null;
end
$$;

revoke all on function public.dater_secteurs_de_la_loge() from public, anon, authenticated;

drop trigger if exists loge_secteur_dater on public.loge_secteur;
create trigger loge_secteur_dater
  after insert or update or delete on public.loge_secteur
  for each row execute function public.dater_secteurs_de_la_loge();

-- 3. Fermée ------------------------------------------------------------------
alter table public.loge_secteur enable row level security;
revoke all on public.loge_secteur from public, anon, authenticated;
