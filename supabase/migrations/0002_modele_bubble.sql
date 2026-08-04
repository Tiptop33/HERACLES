-- 0002_modele_bubble.sql
-- Reprise du modèle de données de l'application Bubble « heracles-42268 » :
-- sept types de données, 177 champs, relevés le 2026-08-04 par l'API Data.
--
-- Principes de la conversion (le détail figure dans
-- docs/specs/2026-08-04-modele-bubble.md) :
--   * chaque table garde `bubble_id` — l'identifiant d'origine — ce qui permet
--     de reprendre les données et de résoudre les liens en deux passes ;
--   * les champs sont renommés en snake_case sans accent, le nom Bubble
--     d'origine reste en commentaire quand il n'est pas évident ;
--   * un lien vers un type connu devient une vraie clé étrangère ; un lien vers
--     un type que l'API n'expose pas reste un `..._bubble_id text`, à convertir
--     quand on connaîtra la cible ;
--   * **la RLS est activée partout et AUCUNE policy n'est posée** : tout est
--     donc fermé, sauf pour la clé service_role. Les autorisations s'ouvriront
--     écran par écran. C'est volontaire — le modèle d'origine, lui, était
--     lisible par tout Internet.

-- ---------------------------------------------------------------------------
-- 1. loges_referents → loge
-- ---------------------------------------------------------------------------
create table if not exists public.loge (
  id                    uuid primary key default gen_random_uuid(),
  bubble_id             text unique,
  nom                   text,                     -- NOM_LOGES_REFERENTS
  logo_url              text,                     -- LOGO_LOGES_REFERENTS
  adresse               text,
  province_bubble_id    text,                     -- PROVINCE → type non exposé
  lieu_reunions         text,                     -- LIEU REUNIONS
  prochaine_reunion     timestamptz,              -- PROCHAINES REUNIONS
  prochain_numero_candidat integer,               -- NextCandidatNumRef
  cree_par_bubble_id    text,
  cree_le               timestamptz not null default now(),
  maj_le                timestamptz not null default now()
);

comment on table public.loge is
  'Type Bubble « loges_referents » : le groupe local auquel se rattachent les référents.';

-- ---------------------------------------------------------------------------
-- 2. user → referent
--    Le type « user » de Bubble, ce sont les personnes qui se connectent :
--    référents et parrains. Chez nous, l'authentification vit dans auth.users
--    et l'identité dans public.profil (migration 0001) ; cette table ne porte
--    donc que ce qui est propre au métier. `profil_id` fait le lien quand le
--    compte existe — il reste vide pour les fiches reprises de Bubble tant que
--    la personne ne s'est pas inscrite ici.
-- ---------------------------------------------------------------------------
create table if not exists public.referent (
  id                    uuid primary key default gen_random_uuid(),
  bubble_id             text unique,
  profil_id             uuid references public.profil (id) on delete set null,
  nom                   text,                     -- NOM ref
  prenom                text,
  telephone             text,                     -- TELEPHONE (nombre chez Bubble)
  telephone_secondaire  text,                     -- TEL
  photo_url             text,
  loge_id               uuid references public.loge (id) on delete set null,
  loge_bubble_id        text,                     -- LOGES_REFERENTS
  loge_origine_bubble_id text,                    -- LOGES → type non exposé
  grade                 text,                     -- GRADES (liste de choix Bubble)
  college               text,                     -- COLLEGE (liste de choix Bubble)
  officier              text,                     -- OFFICIERS (liste de choix Bubble)
  appel                 text,                     -- APPEL (liste de choix Bubble)
  immatriculation       text,                     -- IMMATRICULATION (nombre chez Bubble)
  visites               integer,                  -- VISITE
  derniere_visite       timestamptz,              -- LAST_SEEN
  inscrit               boolean,                  -- user_signed_up
  slug                  text,
  canaux_bubble_ids     text[],                   -- Channels → liste, type non exposé
  cree_le               timestamptz not null default now(),
  maj_le                timestamptz not null default now()
);

comment on table public.referent is
  'Type Bubble « user » : référents et parrains. L''authentification, elle, vient de auth.users.';
comment on column public.referent.profil_id is
  'Compte HERACLES correspondant, quand la personne s''est inscrite ici. Vide pour une fiche reprise de Bubble.';

-- Un référent siège dans une loge, mais une loge liste aussi ses référents
-- (REFERENTS_LOGES_REFERENTS, une liste). Une liste de références ne se stocke
-- pas dans une colonne : c'est une table de liaison.
create table if not exists public.loge_membre (
  loge_id     uuid not null references public.loge (id) on delete cascade,
  referent_id uuid not null references public.referent (id) on delete cascade,
  cree_le     timestamptz not null default now(),
  primary key (loge_id, referent_id)
);

comment on table public.loge_membre is
  'Champ Bubble « REFERENTS_LOGES_REFERENTS » : la liste des référents d''une loge.';

-- ---------------------------------------------------------------------------
-- 3. candidats → candidat
--    Le cœur du modèle : 50 champs.
-- ---------------------------------------------------------------------------
create table if not exists public.candidat (
  id                      uuid primary key default gen_random_uuid(),
  bubble_id               text unique,
  numero                  integer,                -- NUMERO CANDIDAT
  profil_id               uuid references public.profil (id) on delete set null,

  -- Identité et contact
  nom                     text,                   -- NOM candidat
  prenom                  text,                   -- PRENOM candidat
  email                   text,
  telephone               text,                   -- nombre chez Bubble : un numéro n'est pas un nombre
  age                     integer,
  situation_familiale     text,                   -- liste de choix Bubble
  adresse                 text,                   -- ADR-CANDIDAT
  adresse_detail          jsonb,                  -- ADRESSES (adresse géographique Bubble)
  photo_url               text,                   -- PHOTO

  -- Recherche
  type_emploi             text,                   -- TYPE EMPLOI (liste de choix)
  emploi_recherche        text,                   -- EMPLOI RECHERCHE
  definition_emploi       text,                   -- DEF PRECIS EMPLOI
  type_recherche_manuel   text,                   -- TYPEDERECHERCHE manuel
  presentation            text,                   -- PRESENTATION CAND ET EMPLOI
  mobilite_geographique   text,                   -- MOB GEO
  debut_stage             timestamptz,            -- DEBUT-STAGE
  fin_stage               timestamptz,            -- FIN-STAGE

  -- Parcours
  formations              text,
  experiences             text,
  competences             text,
  savoir_etre             text,                   -- SAVOIR-ETRE
  informatique            text,
  centres_interet         text,                   -- CENTRE-INTERET
  permis_vl               text,                   -- Permis de conduire VL
  permis_moto             text,                   -- Permis de conduire Moto
  permis_pl               text,                   -- Permis de conduire PL
  vehicule                text,                   -- VEHICULE

  -- Documents
  cv_url                  text,                   -- CV
  cv_anonyme_url          text,                   -- CV ANONYME
  lettre_motivation_url   text,                   -- LETTRE DE MOTIVATION

  -- Accompagnement
  loge_id                 uuid references public.loge (id) on delete set null,
  loge_bubble_id          text,                   -- LOGE-REFEND-CAND
  parrain_id              uuid references public.referent (id) on delete set null,
  parrain_bubble_id       text,                   -- PARRAIN-candidat
  parrain_email           text,                   -- ParrainCandemail
  referent_id             uuid references public.referent (id) on delete set null,
  referent_bubble_id      text,                   -- REFERENTS

  -- Suivi
  appreciation            text,
  cloture                 text,                   -- CLOTURE (liste de choix)
  archive                 text,                   -- ARCHIVER (liste de choix)

  -- Nomenclatures : types non exposés par l'API, à raccorder plus tard
  secteur_activite_bubble_id      text,           -- SECTEUR-ACTIVITE-CAND
  secteur_activite_rome_bubble_id text,           -- SECTEUR ACTIVITE ROME
  metier_bubble_id                text,           -- metier-cand
  titre_metier_bubble_id          text,           -- titre metier
  code_naf_bubble_id              text,           -- Code_NAF_Candidats
  taches_bubble_ids               text[],         -- TACHES (liste)
  secteur_activite_libelle        text,           -- Candidat_SA
  metier_libelle                  text,           -- Candidat_METIER

  cree_par_bubble_id      text,
  cree_le                 timestamptz not null default now(),
  maj_le                  timestamptz not null default now()
);

comment on table public.candidat is
  'Type Bubble « candidats » : la personne accompagnée dans sa recherche.';
comment on column public.candidat.telephone is
  'Texte, et non nombre : un numéro de téléphone garde ses zéros et son indicatif.';

create index if not exists candidat_loge_idx on public.candidat (loge_id);
create index if not exists candidat_referent_idx on public.candidat (referent_id);
create index if not exists candidat_parrain_idx on public.candidat (parrain_id);

-- ---------------------------------------------------------------------------
-- 4. info_entreprise → entreprise
-- ---------------------------------------------------------------------------
create table if not exists public.entreprise (
  id                  uuid primary key default gen_random_uuid(),
  bubble_id           text unique,
  nom                 text,                       -- Nom_entreprise
  siret               text,                       -- SIRET
  adresse_detail      jsonb,                      -- Adresse_entreprise
  propose_offre       boolean,                    -- offre_emp
  publier             boolean,                    -- PUBLIER
  cree_par_bubble_id  text,
  cree_le             timestamptz not null default now(),
  maj_le              timestamptz not null default now()
);

comment on column public.entreprise.siret is
  'Texte : un SIRET commence parfois par zéro et ne sert jamais à calculer. Bubble en gardait deux copies, dont une numérique — une seule suffit.';

-- ---------------------------------------------------------------------------
-- 5. offreemploi → offre_emploi
--    4 539 enregistrements, manifestement alimentés depuis France Travail
--    (ft_id, code ROME, code NAF).
-- ---------------------------------------------------------------------------
create table if not exists public.offre_emploi (
  id                      uuid primary key default gen_random_uuid(),
  bubble_id               text unique,
  source_id               text,                   -- ft_id (identifiant France Travail)

  intitule                text,
  description             text,
  appellation_libelle     text,
  nature_contrat          text,
  type_contrat            text,
  type_contrat_libelle    text,
  alternance              boolean,
  nombre_postes           integer,
  duree_travail_libelle   text,
  duree_travail_type      text,
  qualification_libelle   text,
  salaire_libelle         text,
  experience_exige        text,
  experience_libelle      text,
  accessible_th           boolean,                -- accessible aux travailleurs handicapés
  entreprise_adaptee      boolean,

  -- Lieu
  lieu_libelle            text,
  lieu_code_postal        text,
  lieu_code_insee         text,
  departement             text,
  lieu_latitude           double precision,
  lieu_longitude          double precision,

  -- Nomenclatures
  rome_code               text,
  rome_libelle            text,
  code_naf                text,
  secteur_code            text,
  secteur_libelle         text,
  secteur_section_bubble_id text,                 -- type non exposé

  -- Entreprise qui recrute (texte libre venant de la source, distinct de la
  -- table entreprise qui, elle, décrit les entreprises partenaires)
  entreprise_nom          text,
  entreprise_description  text,
  entreprise_url          text,
  entreprise_logo_url     text,
  entreprise_taille       text,

  url_origine             text,
  date_creation           timestamptz,
  date_actualisation      timestamptz,
  cree_par_bubble_id      text,
  cree_le                 timestamptz not null default now(),
  maj_le                  timestamptz not null default now()
);

create index if not exists offre_emploi_rome_idx on public.offre_emploi (rome_code);
create index if not exists offre_emploi_departement_idx on public.offre_emploi (departement);
create index if not exists offre_emploi_source_idx on public.offre_emploi (source_id);

-- ---------------------------------------------------------------------------
-- 6. pdfs → document
-- ---------------------------------------------------------------------------
create table if not exists public.document (
  id                  uuid primary key default gen_random_uuid(),
  bubble_id           text unique,
  nom                 text,                       -- nom_pdf
  type_document       text,                       -- Type_doc (liste de choix)
  lien_url            text,                       -- Link
  slug                text,
  archive             boolean,                    -- archive_pdf
  loge_id             uuid references public.loge (id) on delete set null,
  loge_bubble_id      text,                       -- LOGE_REFERENT_PDF
  cree_par_bubble_id  text,
  cree_le             timestamptz not null default now(),
  maj_le              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. global → parametre
--    Un unique enregistrement chez Bubble : les réglages de l'association et
--    les modèles d'emails. Une table d'une seule ligne, verrouillée à une ligne.
-- ---------------------------------------------------------------------------
create table if not exists public.parametre (
  id                        boolean primary key default true,
  bubble_id                 text unique,

  prochain_numero_candidat  integer,              -- NextCandidatNum
  date_depart               timestamptz,          -- DEPART
  date_fin                  timestamptz,          -- FIN
  duree                     integer,              -- DUREE
  prochaine_reunion         timestamptz,          -- PROCHAINE REUNION
  lieu_reunion              text,                 -- LIEU REUNION

  -- Modèles d'emails : à chaque envoi son objet et son texte.
  objet_candidat            text,
  mot_candidat              text,
  objet_parrain             text,
  mot_parrain               text,
  objet_secteur_activite    text,
  mot_secteur_activite      text,
  objet_manquant            text,                 -- MOT MANQUANT
  info_manquant             text,                 -- INFO MANQUANT
  objet_nouveau_membre      text,
  mot_nouveau_membre        text,
  objet_nouvelle_loge       text,                 -- OBJET NEW LOGE
  mot_accompagnement_nouvelle_loge text,          -- MOT ACCOMPAGNEMENT NEW LOGE
  objet_compte_rendu        text,                 -- OBJET EMAILCR
  mot_compte_rendu          text,                 -- MOT EMAILCR
  objet_correspondant       text,
  mot_correspondant         text,
  objet_proposition         text,                 -- OBJET-PROPOSITION
  demande_proposition_offre text,                 -- DEMANDE-PROPOSITION-OFFRE
  objet_relance_parrain     text,
  mot_relance_parrain       text,
  objet_offre               text,                 -- OBJET E-MAIL OFFRE
  mot_offre                 text,                 -- MOT EMAIL OFFRE

  whatsapp_bubble_ids       text[],               -- WHATSAPP (liste, type non exposé)
  cree_par_bubble_id        text,
  cree_le                   timestamptz not null default now(),
  maj_le                    timestamptz not null default now(),

  constraint parametre_ligne_unique check (id)
);

comment on table public.parametre is
  'Type Bubble « global » : réglages de l''association et modèles d''emails. Une seule ligne, garantie par la contrainte.';

-- ---------------------------------------------------------------------------
-- 8. Fermeture
--    RLS activée partout, aucune policy : seule la clé service_role passe.
--    Chaque écran ouvrira ce dont il a besoin, et rien de plus.
--    Deux exceptions : les offres d'emploi et les réglages ne contiennent
--    aucune donnée personnelle et sont lisibles par toute personne connectée.
-- ---------------------------------------------------------------------------
alter table public.loge          enable row level security;
alter table public.loge_membre   enable row level security;
alter table public.referent      enable row level security;
alter table public.candidat      enable row level security;
alter table public.entreprise    enable row level security;
alter table public.offre_emploi  enable row level security;
alter table public.document      enable row level security;
alter table public.parametre     enable row level security;

drop policy if exists offre_emploi_lecture on public.offre_emploi;
create policy offre_emploi_lecture on public.offre_emploi
  for select
  to authenticated
  using (true);

drop policy if exists parametre_lecture on public.parametre;
create policy parametre_lecture on public.parametre
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 9. maj_le se met à jour toute seule
-- ---------------------------------------------------------------------------
create or replace function public.toucher_maj_le()
returns trigger
language plpgsql
as $$
begin
  new.maj_le := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['loge', 'referent', 'candidat', 'entreprise',
                           'offre_emploi', 'document', 'parametre']
  loop
    execute format('drop trigger if exists %I_maj_le on public.%I', t, t);
    execute format(
      'create trigger %I_maj_le before update on public.%I
         for each row execute function public.toucher_maj_le()', t, t);
  end loop;
end
$$;
