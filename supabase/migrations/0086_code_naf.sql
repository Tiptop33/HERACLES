-- ---------------------------------------------------------------------------
-- 0086 — les codes NAF
--
-- Ce que ça change : la nomenclature d'activités française (NAF) a sa table.
-- Une ligne = un code (« 62.01Z ») et son intitulé (« Programmation
-- informatique »). La table naît vide : aucune donnée n'est écrite ici.
--
-- Pourquoi : Bubble porte un type `Code_NAF_Candidats` que l'API de
-- l'application en service n'expose pas (docs/specs/2026-08-04-modele-bubble.md,
-- « Ce qui manque encore »), et les offres France Travail arrivent avec un code
-- NAF. Il faut un référentiel où ces codes trouvent leur intitulé.
--
-- Le code est la clé primaire, sans identifiant technique à côté : il est
-- stable, national, et c'est lui que les autres tables citeront. Il est rangé
-- en majuscules et sans espace autour, pour que « 62.01z » et « 62.01Z » ne
-- fassent jamais deux lignes. Son format n'est pas imposé au-delà : la
-- nomenclature compte cinq niveaux (section « J », division « 62 », groupe
-- « 62.0 », classe « 62.01 », sous-classe « 62.01Z »), et la révision NAF 2025
-- arrive — une contrainte trop précise refuserait l'une ou l'autre.
--
-- Accès : un code NAF ne dit rien de personne, mais aucun écran ne lit encore
-- cette table. Elle est donc fermée (règle n° 1 du CLAUDE.md) : RLS active,
-- aucune policy, aucun GRANT à `anon` ni à `authenticated`. Seule la clé de
-- service la lit et l'écrit (privilèges par défaut posés par 0007). L'écran qui
-- en aura besoin apportera sa policy et son GRANT — pas avant.
-- ---------------------------------------------------------------------------

create table if not exists public.code_naf (
  code      text primary key,
  intitule  text not null,
  constraint code_naf_code_propre
    check (code <> '' and code = upper(btrim(code))),
  constraint code_naf_intitule_rempli
    check (btrim(intitule) <> '')
);

comment on table public.code_naf is
  'Nomenclature d''activités française (NAF) : un code, son intitulé. '
  'Référentiel sans donnée personnelle. Fermé tant qu''aucun écran ne le lit.';

comment on column public.code_naf.code is
  'Le code NAF, en majuscules, sans espace autour (« 62.01Z »). Tous niveaux '
  'de la nomenclature admis : section, division, groupe, classe, sous-classe.';

comment on column public.code_naf.intitule is
  'L''intitulé officiel du code (« Programmation informatique »).';

-- Fermée par défaut. Aucune policy : ni `anon` ni `authenticated` n'en obtient
-- une ligne, et sans GRANT ils ne peuvent même pas s'y adresser.
alter table public.code_naf enable row level security;
