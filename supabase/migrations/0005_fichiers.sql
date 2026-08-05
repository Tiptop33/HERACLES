-- 0005_fichiers.sql
-- Rapatrier les fichiers hébergés chez Bubble.
--
-- CV, CV anonymes, lettres de motivation, photos, logos et PDF vivent sur le
-- CDN de Bubble. Les tables n'en gardent que l'adresse — et ces adresses
-- cesseront de répondre le jour où l'application sera fermée. Il faut donc les
-- copier chez nous avant la bascule.
--
-- Chaque colonne `..._url` (l'adresse d'origine, conservée pour la traçabilité)
-- gagne une colonne `..._chemin` : l'emplacement du fichier dans notre stockage.
-- Tant que le chemin est vide, le fichier n'a pas encore été rapatrié — c'est ce
-- qui rend l'opération rejouable et reprenable là où elle s'est arrêtée.

-- 1. Le seau de stockage, privé --------------------------------------------
-- Chez Bubble, ces fichiers sont servis par un CDN public : qui a l'adresse a
-- le CV. Ici, ils seront servis sous contrôle d'accès.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('documents', 'documents', false)
    on conflict (id) do nothing;
  end if;
end
$$;

-- 2. Où atterrit chaque fichier ---------------------------------------------
alter table public.candidat
  add column if not exists cv_chemin                text,
  add column if not exists cv_anonyme_chemin        text,
  add column if not exists lettre_motivation_chemin text,
  add column if not exists photo_chemin             text;

alter table public.referent
  add column if not exists photo_chemin text;

alter table public.loge
  add column if not exists logo_chemin text;

alter table public.document
  add column if not exists chemin text;

comment on column public.candidat.cv_chemin is
  'Emplacement du CV dans le stockage Supabase. Vide = pas encore rapatrié depuis Bubble.';

-- 3. Suivre l'avancement d'un coup d'œil ------------------------------------
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
  select 'document', 'pdf',
         count(*) filter (where lien_url is not null),
         count(*) filter (where lien_url is not null and chemin is null)
    from public.document;

comment on view public.fichiers_a_rapatrier is
  'Combien de fichiers par genre, et combien restent à rapatrier depuis Bubble.';
