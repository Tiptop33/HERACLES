-- ---------------------------------------------------------------------------
-- 0089 — les loges du réseau, et les secteurs présents chez chacune
--
-- Ce que ça change : HERACLES connaît les 73 « loges du réseau » — les loges
-- extérieures à l'application, à ne pas confondre avec ses 3 « loges »,
-- auxquelles se rattachent référents, candidats et documents (vocabulaire du
-- CLAUDE.md). Le Secrétaire de chacune coche les secteurs d'activité où
-- travaillent des membres de sa loge, sur une page qu'il ouvre par un lien
-- personnel, sans compte (décisions du 13 novembre 2026,
-- docs/secteurs-d-activite.md, n° 17 à 30).
--
-- LA LOGE DU RÉSEAU
--
-- Saisie par l'administration (décision 19) : nom, numéro, province, nom du
-- Secrétaire et son adresse (décision 20). Le nom et l'adresse du Secrétaire
-- sont des données personnelles : RLS active dès la création, aucune policy,
-- aucun GRANT. La liste ne se saisit que sur le serveur, jamais dans le dépôt.
--
-- Le numéro est du texte : un numéro de loge ne sert pas à compter, et peut
-- commencer par un zéro. Deux loges du réseau ne partagent pas un numéro.
--
-- LE LIEN PERSONNEL
--
-- Seule son empreinte est gardée, jamais le lien lui-même : la base ne peut
-- pas le redonner, même à qui la lit en entier. Il vaut 90 jours (décision 22)
-- ; un nouveau lien remplace l'ancien, qui cesse aussitôt de valoir. Les
-- fonctions qui le servent sont en 0091.
--
-- LES SECTEURS
--
-- Ni nom, ni nombre (décision 3) : la loge dit « il y a chez nous du 43 —
-- Travaux de construction spécialisés ». Au moins la division, puis aussi
-- précis que le Secrétaire le veut, jusqu'à la sous-classe (décision 11). Pas
-- la section seule : « F — Construction » ne dirait rien d'utile. Cocher 43 et
-- 43.21A ensemble est permis. Le rapprochement avec un candidat remontera du
-- code coché à sa division, puis à sa section.
--
-- `secteurs_maj_le` dit quand la liste a changé pour la dernière fois — un
-- secteur coché ou décoché. Elle est sur la loge et non sur chaque ligne, parce
-- qu'un secteur décoché ne laisse pas de ligne pour porter sa date. Une loge
-- « a répondu » dès son premier secteur coché (décision 26).
--
-- Une première version de cette migration, jamais déployée, rattachait les
-- secteurs aux 3 loges de HERACLES : c'était la confusion que le 13 novembre a
-- levée.
-- ---------------------------------------------------------------------------

-- 1. Les loges du réseau -------------------------------------------------------
create table if not exists public.loge_du_reseau (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  numero            text,
  province_id       uuid references public.province (id) on delete set null,
  secretaire_nom    text,
  secretaire_email  text,

  -- Le lien personnel du Secrétaire : son empreinte (SHA-256, en hexadécimal),
  -- quand il est parti et jusqu'à quand il vaut.
  lien_empreinte    text unique,
  lien_envoye_le    timestamptz,
  lien_expire_le    timestamptz,

  secteurs_maj_le   timestamptz,
  cree_le           timestamptz not null default now(),
  maj_le            timestamptz not null default now(),

  constraint loge_du_reseau_nom check (btrim(nom) <> ''),
  constraint loge_du_reseau_numero check (numero is null or btrim(numero) <> ''),
  constraint loge_du_reseau_email
    check (secretaire_email is null or secretaire_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint loge_du_reseau_empreinte
    check (lien_empreinte is null or lien_empreinte ~ '^[0-9a-f]{64}$'),
  -- Un lien sans date de fin n'existe pas.
  constraint loge_du_reseau_lien_date
    check ((lien_empreinte is null) = (lien_expire_le is null))
);

comment on table public.loge_du_reseau is
  'Les 73 loges du réseau, extérieures à l''application — pas les « loges » de '
  'HERACLES. Saisies par l''administration ; leur Secrétaire coche leurs '
  'secteurs d''activité par un lien personnel. Porte des données personnelles '
  '(nom et adresse du Secrétaire).';
comment on column public.loge_du_reseau.lien_empreinte is
  'Empreinte SHA-256 (hexadécimal) du lien personnel du Secrétaire. Le lien '
  'lui-même n''est jamais conservé.';
comment on column public.loge_du_reseau.secteurs_maj_le is
  'Dernière modification de la liste des secteurs. Vide = rien coché.';

create unique index if not exists loge_du_reseau_numero_unique
  on public.loge_du_reseau (lower(btrim(numero))) where numero is not null;

drop trigger if exists loge_du_reseau_maj_le on public.loge_du_reseau;
create trigger loge_du_reseau_maj_le
  before update on public.loge_du_reseau
  for each row execute function public.toucher_maj_le();

alter table public.loge_du_reseau enable row level security;
revoke all on public.loge_du_reseau from public, anon, authenticated;

-- 2. Les secteurs présents ------------------------------------------------------
create table if not exists public.loge_du_reseau_secteur (
  loge_du_reseau_id uuid not null references public.loge_du_reseau (id) on delete cascade,
  code              text not null references public.code_naf (code),
  coche_le          timestamptz not null default now(),

  primary key (loge_du_reseau_id, code)
);

comment on table public.loge_du_reseau_secteur is
  'Les secteurs d''activité présents dans une loge du réseau, cochés par son '
  'Secrétaire : de la division à la sous-classe NAF. Ni nom, ni nombre.';

-- Retrouver les loges du réseau d'un secteur : c'est la question du
-- rapprochement.
create index if not exists loge_du_reseau_secteur_code_idx on public.loge_du_reseau_secteur (code);

drop trigger if exists loge_du_reseau_secteur_niveau on public.loge_du_reseau_secteur;
create trigger loge_du_reseau_secteur_niveau
  before insert or update of code on public.loge_du_reseau_secteur
  for each row execute function public.exiger_niveau_naf('division', 'groupe', 'classe', 'sous-classe');

-- La date de la liste, sur la loge du réseau. `security definer` : qui coche
-- n'a pas, lui, le droit de modifier la fiche de la loge.
create or replace function public.dater_secteurs_de_la_loge_du_reseau()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.loge_du_reseau set secteurs_maj_le = now() where id = new.loge_du_reseau_id;
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.loge_du_reseau_id is distinct from new.loge_du_reseau_id) then
    update public.loge_du_reseau set secteurs_maj_le = now() where id = old.loge_du_reseau_id;
  end if;
  return null;
end
$$;

revoke all on function public.dater_secteurs_de_la_loge_du_reseau() from public, anon, authenticated;

drop trigger if exists loge_du_reseau_secteur_dater on public.loge_du_reseau_secteur;
create trigger loge_du_reseau_secteur_dater
  after insert or update or delete on public.loge_du_reseau_secteur
  for each row execute function public.dater_secteurs_de_la_loge_du_reseau();

alter table public.loge_du_reseau_secteur enable row level security;
revoke all on public.loge_du_reseau_secteur from public, anon, authenticated;
