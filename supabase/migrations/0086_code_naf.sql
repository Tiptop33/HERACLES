-- ---------------------------------------------------------------------------
-- 0086 — la nomenclature des secteurs d'activité (NAF)
--
-- Ce que ça change : HERACLES range les activités comme l'INSEE, dans la
-- nomenclature d'activités française (NAF rév. 2). Elle a cinq niveaux, chacun
-- rattaché au précédent :
--
--   section       F       Construction
--   division      43      Travaux de construction spécialisés
--   groupe        43.2    Travaux d'installation électrique, plomberie…
--   classe        43.21   Installation électrique
--   sous-classe   43.21A  Travaux d'installation électrique dans tous locaux
--
-- Pourquoi le secteur, et pourquoi la NAF : c'est l'axe retenu le 12 novembre
-- 2026 pour rapprocher les candidats, les 73 loges et les offres (voir
-- docs/secteurs-d-activite.md). Les offres France Travail portent déjà ce code
-- (`offre_emploi.code_naf`) : une sous-classe « 43.21A » donne sa division
-- « 43 » par ses deux premiers chiffres, sans table de passage.
--
-- On ne CHOISIT que les deux premiers niveaux — 21 sections, 88 divisions. Les
-- trois autres ne servent qu'à la recherche par mot (0090) : un candidat qui
-- tape « boulangerie » trouve « 10.71C — Boulangerie et boulangerie-
-- pâtisserie », qui le mène à « 10 — Industries alimentaires ».
--
-- La table naît vide ; 0087 la remplit.
--
-- Accès : fermé (règle n° 1 du CLAUDE.md). RLS active, aucune policy, aucun
-- GRANT à `anon` ni à `authenticated` : seule la clé de service la lit. Les
-- écrans qui en auront besoin — formulaire de candidature, fiche candidat,
-- fiche de la loge — apporteront chacun leur lecture.
--
-- Version : la clé est le code seul. La NAF 2025 réutilise des codes de la
-- rév. 2 avec un autre sens ; l'adopter demandera une colonne de version dans
-- la clé, ou une seconde table. Ce sera une migration à part.
-- ---------------------------------------------------------------------------

create table if not exists public.code_naf (
  code      text primary key,
  intitule  text not null,
  niveau    text not null,
  -- Le code du niveau au-dessus : la section d'une division, la division d'un
  -- groupe… Vide pour une section, qui est le sommet.
  parent    text references public.code_naf (code),

  constraint code_naf_niveau
    check (niveau in ('section', 'division', 'groupe', 'classe', 'sous-classe')),
  -- La forme du code dépend du niveau. Elle impose du même coup les
  -- majuscules et l'absence d'espace : « 43.21a » ou « 43.21A » ne
  -- feront jamais deux lignes.
  constraint code_naf_format check (
       (niveau = 'section'     and code ~ '^[A-Z]$')
    or (niveau = 'division'    and code ~ '^[0-9]{2}$')
    or (niveau = 'groupe'      and code ~ '^[0-9]{2}\.[0-9]$')
    or (niveau = 'classe'      and code ~ '^[0-9]{2}\.[0-9]{2}$')
    or (niveau = 'sous-classe' and code ~ '^[0-9]{2}\.[0-9]{2}[A-Z]$')),
  constraint code_naf_intitule_rempli
    check (btrim(intitule) <> ''),
  -- Seule une section n'a pas de parent.
  constraint code_naf_parent_present
    check ((niveau = 'section') = (parent is null)),
  -- Sous la division, un code prolonge celui de son parent : 43.21A est sous
  -- 43.21, lui-même sous 43.2. (Une division, elle, ne prolonge pas la lettre
  -- de sa section.)
  constraint code_naf_parent_prolonge
    check (niveau in ('section', 'division') or starts_with(code, parent))
);

comment on table public.code_naf is
  'Nomenclature d''activités française, NAF rév. 2 (INSEE), sur ses cinq '
  'niveaux. On choisit une section ou une division ; les niveaux plus fins '
  'servent à la recherche par mot. Référentiel sans donnée personnelle.';
comment on column public.code_naf.niveau is
  'section, division, groupe, classe ou sous-classe.';
comment on column public.code_naf.parent is
  'Le code du niveau au-dessus. Vide pour une section.';

create index if not exists code_naf_parent_idx on public.code_naf (parent);

-- Le parent est exactement un niveau au-dessus : une division sous une
-- section, un groupe sous une division… Une contrainte de ligne ne peut pas
-- regarder la ligne du parent : un déclencheur s'en charge.
create or replace function public.code_naf_verifier_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  attendu text := case new.niveau
    when 'division'    then 'section'
    when 'groupe'      then 'division'
    when 'classe'      then 'groupe'
    when 'sous-classe' then 'classe'
  end;
  trouve text;
begin
  if new.parent is null then
    return new;  -- la contrainte code_naf_parent_present a déjà tranché
  end if;
  select niveau into trouve from public.code_naf where code = new.parent;
  if trouve is distinct from attendu then
    raise exception 'Le parent de % (%) doit être une % — % est %',
      new.code, new.niveau, attendu, new.parent, coalesce(trouve, 'absent')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

revoke all on function public.code_naf_verifier_parent() from public, anon, authenticated;

drop trigger if exists code_naf_verifier_parent on public.code_naf;
create trigger code_naf_verifier_parent
  before insert or update of niveau, parent on public.code_naf
  for each row execute function public.code_naf_verifier_parent();

alter table public.code_naf enable row level security;
