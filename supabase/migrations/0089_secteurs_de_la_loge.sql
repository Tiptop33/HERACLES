-- ---------------------------------------------------------------------------
-- 0089 — les secteurs représentés dans une loge
--
-- Ce que ça change : chaque loge peut dire combien de ses membres travaillent
-- dans chaque secteur — « 43 — Travaux de construction spécialisés : 3 ». Un
-- décompte, sans aucun nom (décision du 12 novembre 2026) : la loge sait où
-- elle peut aider un candidat, et l'application n'enregistre rien sur une
-- personne qui ne l'a pas fourni.
--
-- Le niveau est la division NAF (88 choix) : le Secrétaire connaît l'activité
-- précise de ses membres. Le rapprochement avec un candidat qui s'est arrêté à
-- la section se fera en remontant de la division à sa section.
--
-- Qui le tient : le Secrétaire de la loge, et les administrateurs en secours.
-- Leurs droits arriveront avec l'écran de la fiche de la loge ; d'ici là, la
-- table est fermée (RLS active, aucune policy, aucun GRANT).
--
-- La date de mise à jour : `loge.secteurs_maj_le` dit quand le décompte de la
-- loge a changé pour la dernière fois — ajout, correction ou retrait d'une
-- ligne. Elle s'affichera à côté du décompte : un décompte vieux d'un an doit
-- se voir. Elle est sur la loge et non sur chaque ligne, parce qu'un retrait
-- ne laisse pas de ligne pour porter sa date.
-- ---------------------------------------------------------------------------

-- 1. La table ----------------------------------------------------------------
create table if not exists public.loge_secteur (
  loge_id   uuid not null references public.loge (id) on delete cascade,
  code      text not null references public.code_naf (code),
  -- Zéro membre, c'est l'absence de ligne. Mille et plus, une faute de frappe.
  nombre    integer not null,
  maj_le    timestamptz not null default now(),
  maj_par   uuid references public.referent (id) on delete set null,

  primary key (loge_id, code),
  constraint loge_secteur_nombre check (nombre between 1 and 999)
);

comment on table public.loge_secteur is
  'Combien de membres d''une loge travaillent dans chaque division NAF. Un '
  'décompte sans nom, tenu par le Secrétaire de la loge.';

-- Retrouver les loges d'un secteur : c'est la question du rapprochement.
create index if not exists loge_secteur_code_idx on public.loge_secteur (code);

drop trigger if exists loge_secteur_niveau on public.loge_secteur;
create trigger loge_secteur_niveau
  before insert or update of code on public.loge_secteur
  for each row execute function public.exiger_niveau_naf('division');

drop trigger if exists loge_secteur_maj_le on public.loge_secteur;
create trigger loge_secteur_maj_le
  before update on public.loge_secteur
  for each row execute function public.toucher_maj_le();

-- 2. La date du décompte, sur la loge --------------------------------------
alter table public.loge
  add column if not exists secteurs_maj_le timestamptz;

comment on column public.loge.secteurs_maj_le is
  'Dernière modification du décompte des secteurs de la loge (loge_secteur). '
  'Vide = décompte jamais rempli.';

-- `security definer` : la personne qui tient le décompte n'a pas, elle, le
-- droit de modifier la fiche de la loge.
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
  -- Une ligne retirée, ou passée d'une loge à une autre : l'ancienne loge a
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
