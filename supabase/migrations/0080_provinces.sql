-- ---------------------------------------------------------------------------
-- 0080 — les provinces
--
-- Ce que ça change : les provinces, jusqu'ici réduites à un identifiant Bubble
-- posé sur chaque loge (`loge.province_bubble_id`, migration 0002), deviennent
-- une vraie liste — un nom, une image — que l'application peut afficher. Le
-- tableau de bord gagne un écran « Province » : une carte par province, son
-- image puis son nom.
--
-- Pourquoi une table : une province regroupe des loges ; c'est une donnée de
-- référence, pas un détail de programme. Elle vient de Bubble, donc elle garde
-- `bubble_id` comme les sept autres tables reprises, ce qui permet à la reprise
-- de la remplir et de résoudre `loge.province_bubble_id → loge.province_id`.
--
-- D'où viennent les données : le type Bubble `PROVINCE` n'est PAS exposé par
-- l'API de l'application en service — seule la base de l'éditeur le donne (voir
-- docs/guide-reprise-bubble.md). C'est exactement le cas des tâches (0023) et
-- des réunions (0036), et le même chemin s'applique : la reprise en brut le
-- recopie en JSON dans `bubble_brut` (passe éditeur, `SEULEMENT_BRUT=1`), puis
-- `deverser_provinces_bubble()` le déplie ici. Aucune donnée réelle n'est
-- écrite par cette migration : la table naît vide.
--
-- L'image suit le même chemin que les logos de loge et les photos (migration
-- 0005) : `image_url` garde l'adresse d'origine chez Bubble, `image_chemin`
-- l'emplacement du fichier une fois rapatrié dans le stockage Supabase. Tant
-- que `image_chemin` est vide, le fichier n'a pas encore été copié — ce qui
-- rend le rapatriement rejouable.
-- ---------------------------------------------------------------------------

-- 1. La table ---------------------------------------------------------------
create table if not exists public.province (
  id                 uuid primary key default gen_random_uuid(),
  bubble_id          text unique,
  nom                text,
  -- L'adresse de l'image chez Bubble, conservée pour la traçabilité. Elle
  -- cessera de répondre à la fermeture de l'application : d'où `image_chemin`.
  image_url          text,
  -- L'emplacement de l'image dans le stockage Supabase (seau « documents »).
  -- Vide = pas encore rapatriée depuis Bubble.
  image_chemin       text,
  cree_par_bubble_id text,
  cree_le            timestamptz not null default now(),
  maj_le             timestamptz not null default now()
);

comment on table public.province is
  'Type Bubble « PROVINCE » : le regroupement de loges. Donnée de référence — '
  'un nom, une image — affichée dans le tableau de bord. Remplie par la reprise '
  'quand la base éditeur l''expose.';

comment on column public.province.image_chemin is
  'Emplacement de l''image dans le stockage Supabase. Vide = pas encore '
  'rapatriée depuis Bubble.';

-- Pas d'unicité sur le nom, à dessein : la table est remplie par la reprise,
-- pas par un formulaire. Deux provinces homonymes dans Bubble feraient échouer
-- tout le dépliage — mieux vaut deux cartes à corriger qu'aucune.

-- 2. Fermée par défaut, puis ouverte en lecture -----------------------------
-- Une province ne dit rien de personne : c'est un référentiel. L'écran est
-- pour les référents et l'administration (décision produit du 10 novembre
-- 2026) — et la lecture s'arrête là, pas à « toute session » : un compte
-- chercheur n'a pas cet écran, il n'a donc pas cette lecture (règle n° 1 du
-- CLAUDE.md : jamais plus large que l'écran).
--
-- Aucune écriture depuis l'application : le seul écran est une liste de
-- cartes, en lecture. Les provinces arrivent par la reprise, qui écrit avec le
-- rôle propriétaire. Le jour où un écran d'administration les corrigera, il
-- apportera sa policy — pas avant (gardé par le test 0007).
alter table public.province enable row level security;

-- Le pendant de `est_admin()` (0010), pour la même raison : `security
-- definer`, afin qu'une policy qui demande le rôle ne déclenche pas à son tour
-- celle de `profil`, à chaque ligne examinée.
create or replace function public.est_referent_ou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profil
     where id = auth.uid() and role in ('referent', 'admin'))
$$;

comment on function public.est_referent_ou_admin() is
  'Vrai si la personne connectée est référent ou administrateur. Sert aux '
  'policies des écrans de l''espace de travail, fermés aux comptes chercheur.';

revoke all on function public.est_referent_ou_admin() from public, anon;
grant execute on function public.est_referent_ou_admin() to authenticated, service_role;

drop policy if exists province_lecture on public.province;
create policy province_lecture on public.province
  for select to authenticated
  using ((select public.est_referent_ou_admin()));

grant select on public.province to authenticated;

-- 3. Rattacher les loges à leur province ------------------------------------
-- `province_bubble_id` était resté du texte faute de cible (0002). La cible
-- existe désormais : on ajoute la clé étrangère, que le dépliage (section 5)
-- résout depuis l'identifiant Bubble conservé. `on delete set null` : retirer
-- une province ne doit pas emporter les loges qui s'y rattachaient.
alter table public.loge
  add column if not exists province_id uuid references public.province (id) on delete set null;

comment on column public.loge.province_id is
  'La province de la loge, résolue depuis province_bubble_id par la reprise.';

-- 4. Suivre le rapatriement de l'image --------------------------------------
-- La vue récapitule, par genre, combien de fichiers restent à copier depuis
-- Bubble. On y ajoute l'image des provinces, au même titre que les logos de
-- loge.
--
-- Attention en la reprenant : sa dernière définition est celle de 0069, et non
-- celle de 0005 — les PDF effacés n'y comptent plus (`efface_le is null`).
-- Cette version-ci est celle de 0069 à l'identique, plus une branche.
create or replace view public.fichiers_a_rapatrier as
  select 'candidat' as source, 'cv' as genre,
         count(*) filter (where cv_url is not null) as total,
         count(*) filter (where cv_url is not null and cv_chemin is null) as restants
    from public.candidat
  union all
  select 'candidat', 'cv anonyme',
         count(*) filter (where cv_anonyme_url is not null),
         count(*) filter (where cv_anonyme_url is not null and cv_anonyme_chemin is null)
    from public.candidat
  union all
  select 'candidat', 'lettre',
         count(*) filter (where lettre_motivation_url is not null),
         count(*) filter (where lettre_motivation_url is not null and lettre_motivation_chemin is null)
    from public.candidat
  union all
  select 'candidat', 'photo',
         count(*) filter (where photo_url is not null),
         count(*) filter (where photo_url is not null and photo_chemin is null)
    from public.candidat
  union all
  select 'referent', 'photo',
         count(*) filter (where photo_url is not null),
         count(*) filter (where photo_url is not null and photo_chemin is null)
    from public.referent
  union all
  select 'loge', 'logo',
         count(*) filter (where logo_url is not null),
         count(*) filter (where logo_url is not null and logo_chemin is null)
    from public.loge
  union all
  select 'province', 'image',
         count(*) filter (where image_url is not null),
         count(*) filter (where image_url is not null and image_chemin is null)
    from public.province
  union all
  select 'document', 'pdf',
         count(*) filter (where lien_url is not null and efface_le is null),
         count(*) filter (where lien_url is not null and chemin is null and efface_le is null)
    from public.document;

comment on view public.fichiers_a_rapatrier is
  'Combien de fichiers par genre, et combien restent à rapatrier depuis Bubble.';

-- ---------------------------------------------------------------------------
-- 5. Déplier `bubble_brut` dans la table des provinces
--
--    Même discipline que les tâches (0023) et les réunions (0036) : la
--    fonction ne lit pas Bubble, elle lit `bubble_brut`, que la reprise
--    remplit. Elle se rejoue sans réseau ; une province déjà dépliée est mise
--    à jour, jamais dupliquée — c'est `bubble_id` qui la reconnaît.
--
--    LES NOMS DE CHAMPS NE SONT PAS CONNUS D'AVANCE
--
--    Le relevé du 4 août n'a pas détaillé le type `PROVINCE` : on sait qu'il
--    porte un nom et une image, pas sous quelles clés. Plutôt que de parier sur
--    une clé exacte — et de ne rien remplir, en silence, si le pari est
--    perdu —, la fonction reconnaît les champs à leur forme :
--
--      * le nom : le champ texte dont la clé commence par « nom » ou « name »,
--        quelle que soit la casse (« NOM », « NOM_PROVINCE », « Nom province »…).
--        S'il y en a plusieurs, la clé la plus courte l'emporte ;
--      * l'image : la valeur qui est une adresse de fichier Bubble — le CDN
--        (`//xxx.cdn.bubble.io/…`) ou l'ancien dépôt (`…/appforest_uf/…`).
--        Une clé qui dit « image », « logo », « blason »… passe devant.
--
--    La fonction rend combien de provinces sont restées sans nom ou sans
--    image : si l'un de ces nombres n'est pas nul, la détection a manqué un
--    champ, et la clé exacte se lit dans `bubble_brut`.
--
--    Une image dont l'adresse a changé chez Bubble perd son chemin : le
--    rapatriement la reprendra, au lieu de garder l'ancienne.
-- ---------------------------------------------------------------------------
create or replace function public.deverser_provinces_bubble()
returns table (
  /** Provinces écrites — créées ou mises à jour. */
  deversees        bigint,
  /** Parmi elles, celles qui n'y étaient pas. */
  creees           bigint,
  /** Provinces reprises dont aucun champ n'a été reconnu comme le nom. */
  sans_nom         bigint,
  /** Provinces reprises dont aucun champ n'a été reconnu comme l'image. */
  sans_image       bigint,
  /** Loges rattachées à une province, en tout. */
  loges_rattachees bigint,
  /** Loges qui désignent une province que la reprise n'a pas apportée. */
  loges_orphelines bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  ecrites bigint;
  neuves  bigint;
begin
  with brut as (
    select b.donnees as d
      from public.bubble_brut b
     where lower(b.type_bubble) = 'province'
       and nullif(btrim(b.donnees->>'_id'), '') is not null
  ),
  lue as (
    select
      btrim(brut.d->>'_id') as bubble_id,
      (select nullif(btrim(e.value), '')
         from jsonb_each_text(brut.d) e
        where e.key ~* '^[[:space:]]*(nom|name)'
          and jsonb_typeof(brut.d -> e.key) = 'string'
        order by length(e.key), e.key
        limit 1) as nom,
      (select btrim(e.value)
         from jsonb_each_text(brut.d) e
        where jsonb_typeof(brut.d -> e.key) = 'string'
          and btrim(e.value) ~* '^(https?:)?//[^[:space:]]+(\.bubble\.io/|/appforest_uf/)'
        order by (e.key ~* '(image|img|logo|blason|photo|visuel|icone)') desc, e.key
        limit 1) as image_url,
      nullif(btrim(brut.d->>'Created By'), '') as cree_par,
      (brut.d->>'Created Date')::timestamptz  as cree,
      (brut.d->>'Modified Date')::timestamptz as maj
      from brut
  ),
  posee as (
    insert into public.province as p
      (bubble_id, nom, image_url, cree_par_bubble_id, cree_le, maj_le)
    select bubble_id, nom, image_url, cree_par, coalesce(cree, now()), coalesce(maj, now())
      from lue
    on conflict (bubble_id) do update set
      nom                = excluded.nom,
      image_url          = excluded.image_url,
      image_chemin       = case when p.image_url is distinct from excluded.image_url
                                then null else p.image_chemin end,
      cree_par_bubble_id = excluded.cree_par_bubble_id,
      cree_le            = excluded.cree_le,
      maj_le             = excluded.maj_le
    returning (xmax = 0) as creee
  )
  select count(*), count(*) filter (where posee.creee)
    into ecrites, neuves
    from posee;

  -- Les loges rejoignent leur province. Seules celles dont le lien change sont
  -- écrites : rejouer ne touche rien.
  update public.loge l
     set province_id = p.id
    from public.province p
   where p.bubble_id = l.province_bubble_id
     and l.province_id is distinct from p.id;

  return query
    select
      ecrites,
      neuves,
      (select count(*) from public.province where bubble_id is not null and nom is null),
      (select count(*) from public.province where bubble_id is not null and image_url is null),
      (select count(*) from public.loge where province_id is not null),
      (select count(*) from public.loge
        where province_bubble_id is not null and province_id is null);
end
$$;

comment on function public.deverser_provinces_bubble() is
  'Déplie les provinces Bubble de `bubble_brut` dans `province`, puis rattache '
  'les loges. Rejouable. Réservée à l''exploitation — la reprise l''appelle, '
  'l''application jamais.';

-- Une opération de reprise : elle passe par la clé de service, comme
-- `deverser_taches_bubble()` (0023).
revoke all on function public.deverser_provinces_bubble() from public, anon, authenticated;
grant execute on function public.deverser_provinces_bubble() to service_role;
