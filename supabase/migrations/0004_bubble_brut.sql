-- 0004_bubble_brut.sql
-- Un filet de sécurité pour la reprise.
--
-- L'application Bubble compte une quarantaine de types de données ; sept
-- seulement ont été modélisés en tables propres (migration 0002). Modéliser les
-- trente autres avant de savoir lesquels servent vraiment serait du travail
-- perdu — mais ne rien reprendre serait pire : le jour où l'application ferme,
-- ce qui n'a pas été copié disparaît.
--
-- Cette table reçoit donc TOUT, tel quel, sans interprétation : un
-- enregistrement Bubble = une ligne, avec son contenu en JSON. On modélise
-- ensuite, à tête reposée, en lisant depuis ici.

create table if not exists public.bubble_brut (
  type_bubble  text not null,
  bubble_id    text not null,
  donnees      jsonb not null,
  recupere_le  timestamptz not null default now(),
  primary key (type_bubble, bubble_id)
);

comment on table public.bubble_brut is
  'Copie fidèle des types Bubble non encore modélisés. Sert de réserve : on y puise pour construire les vraies tables, on n''y lit jamais depuis l''application.';

create index if not exists bubble_brut_type_idx on public.bubble_brut (type_bubble);

-- Fermée comme le reste : cette table contient des données personnelles brutes,
-- sans le tri qu'opèrent les tables modélisées. Seule la clé service_role y accède.
alter table public.bubble_brut enable row level security;
