-- ---------------------------------------------------------------------------
-- 0069 — le compte rendu, l'affiche et l'affichette s'archivent
--
-- Ce que ça change : chaque fois que la feuille d'appel produit un compte
-- rendu, une affiche ou une affichette, un exemplaire du PDF est rangé, lié à
-- la réunion. L'accueil les présente en trois colonnes, et l'administrateur,
-- le Vénérable Maître et le Secrétaire peuvent en effacer un.
--
-- Jusqu'ici le PDF se fabriquait à chaque clic, puis disparaissait : rien ne
-- disait ce qui avait été diffusé. Le redemander un mois plus tard donnait un
-- autre document — les dossiers en cours ne sont plus les mêmes.
--
-- LA TABLE `document`, ET PAS UNE NOUVELLE
--
-- Bubble rangeait déjà ces PDF dans sa table `PDFs` (reprise en `document`,
-- migration 0002), avec `Type_doc` = `compte-rendu`, `affiche` ou
-- `affichette`. On garde la même table et les mêmes mots : les 139 PDF repris
-- et ceux d'HERACLES se lisent au même endroit, dans les mêmes colonnes.
--
-- UN EXEMPLAIRE PAR NOM
--
--   · « Compte-Rendu du 28-10-2026 », « Affiche du 28-10-2026 » — la date de
--     la réunion ;
--   · « 856 du 09-11-2026 » — le numéro du dossier et le jour où l'affichette
--     a été tirée.
--
-- Redemander le même document remplace l'exemplaire du même nom : on corrige
-- la feuille, on retire le compte rendu, et c'est la dernière version qui
-- reste. La fonction rend le chemin de l'ancien fichier ; la route le retire
-- du seau.
--
-- LES FICHIERS
--
-- Dans le seau privé `documents` (0005), sous `archives/<loge>/<uuid>.pdf`.
-- La route les dépose avec la clé de service, après avoir vérifié la session
-- et la réunion. La base n'accepte qu'un chemin de cette forme, et de la loge
-- de la réunion : un appel direct à la fonction ne peut pas faire passer le CV
-- d'un candidat pour un compte rendu, puis le lire par l'accueil.
--
-- EFFACER
--
-- Réservé à ceux qui effacent une réunion (0041) : administrateur, Vénérable
-- Maître, Secrétaire, chacun dans sa loge, l'administrateur partout.
--
--   · un PDF d'HERACLES quitte la base, et son fichier le seau ;
--   · un PDF repris de Bubble **reste en base, marqué effacé** (`efface_le`) :
--     la reprise finale fait un `on conflict (bubble_id) do update`, et une
--     ligne supprimée reviendrait le 5 décembre. L'upsert ne touche pas à
--     `efface_le`, et le rapatriement des fichiers saute ces lignes.
--
-- L'AFFICHETTE PART AVEC SON DOSSIER
--
-- `candidat_id` porte `on delete cascade`, et `supprimer_un_candidat()` (0062)
-- rend désormais aussi le chemin de ses affichettes : un dossier supprimé ne
-- laisse pas de PDF à son numéro dans le seau. Le compte rendu, lui, reste :
-- c'est le registre de la commission, et seuls ceux qui ont le titre
-- l'effacent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Ce que la table apprend
-- ---------------------------------------------------------------------------
alter table public.document
  add column if not exists reunion_id    uuid references public.reunion (id) on delete set null,
  add column if not exists candidat_id   uuid references public.candidat (id) on delete cascade,
  add column if not exists date_document date,
  add column if not exists efface_le     timestamptz;

comment on column public.document.reunion_id is
  'La réunion qui a produit ce PDF. Vide pour les PDF repris de Bubble, et '
  'quand la réunion a été effacée depuis : le PDF, lui, a été diffusé.';
comment on column public.document.candidat_id is
  'Le dossier d''une affichette. Le supprimer emporte ses affichettes.';
comment on column public.document.date_document is
  'Le jour dont parle le PDF : la réunion pour le compte rendu et l''affiche, '
  'le jour du tirage pour l''affichette. C''est sur lui que l''accueil range '
  'et retient la période.';
comment on column public.document.efface_le is
  'Rempli quand un PDF repris de Bubble est effacé : la ligne reste pour que '
  'la reprise finale ne le fasse pas revenir. Les PDF d''HERACLES, eux, '
  'quittent la base.';

-- Les PDF de Bubble n'ont que leur date de création.
update public.document
   set date_document = (cree_le at time zone 'Europe/Paris')::date
 where date_document is null
   and bubble_id is not null;

-- Un exemplaire par nom et par loge. Les lignes de Bubble n'y entrent pas :
-- elles ont leur propre clé, et leurs noms sont d'une autre forme.
create unique index if not exists document_un_exemplaire_par_nom
  on public.document (loge_id, type_document, nom)
  where bubble_id is null;

create index if not exists document_par_candidat
  on public.document (candidat_id)
  where candidat_id is not null;

-- ---------------------------------------------------------------------------
-- 2. La lecture : un PDF effacé ne se lit plus
--
-- La policy de 0011, resserrée d'une condition. Le PDF de Bubble effacé garde
-- son adresse d'origine en base ; elle ne doit plus se lire d'ici.
-- ---------------------------------------------------------------------------
drop policy if exists document_lecture_loge on public.document;
create policy document_lecture_loge on public.document
  for select
  to authenticated
  using (
    efface_le is null
    and (loge_id in (select public.loges_visibles()) or public.est_admin())
  );

comment on policy document_lecture_loge on public.document is
  'Les documents de ses propres loges, hors PDF effacés. Un administrateur les '
  'voit toutes.';

-- ---------------------------------------------------------------------------
-- 3. Le droit d'effacer
--
-- Les mêmes personnes que pour une réunion. Une fonction à part plutôt que de
-- réemployer l'autre sous son nom : le jour où les deux droits divergent, on
-- ne change qu'elle, et l'écran n'a pas à le savoir.
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_effacer_des_documents()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.puis_je_effacer_des_reunions()
$$;

comment on function public.puis_je_effacer_des_documents() is
  'Vrai si la session peut effacer un compte rendu, une affiche ou une '
  'affichette archivés : administrateur, Vénérable Maître, Secrétaire.';

revoke all on function public.puis_je_effacer_des_documents() from public, anon;
grant execute on function public.puis_je_effacer_des_documents() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Archiver
--
-- Appelée par la route qui vient de produire le PDF et de le déposer. Rend le
-- chemin du fichier que l'exemplaire remplace — à retirer du seau —, ou null.
--
-- Les refus lèvent : ce ne sont pas des cas de l'écran, la route a déjà
-- vérifié la réunion. Ils arrêtent un appel fabriqué.
-- ---------------------------------------------------------------------------
create or replace function public.archiver_un_document(
  reunion_choisie uuid,
  sorte           text,
  nom_choisi      text,
  chemin_choisi   text,
  candidat_choisi uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  la_reunion public.reunion%rowtype;
  le_jour    date;
  le_dossier uuid;
  ancien     text;
begin
  select r.* into la_reunion
    from public.reunion r
   where r.id = reunion_choisie
     and r.loge_id = public.ma_loge();
  if not found then
    raise exception 'Cette réunion n''est pas de votre loge'
      using errcode = 'insufficient_privilege';
  end if;

  if sorte is null or sorte not in ('compte-rendu', 'affiche', 'affichette') then
    raise exception 'Document inconnu : %', sorte
      using errcode = 'invalid_parameter_value';
  end if;

  if nom_choisi is null or btrim(nom_choisi) = '' or length(nom_choisi) > 120 then
    raise exception 'Nom de document invalide'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Un fichier que la route vient de ranger pour cette loge, et rien d'autre.
  if chemin_choisi is null
     or chemin_choisi !~ ('^archives/' || la_reunion.loge_id::text || '/[0-9a-f-]{36}\.pdf$') then
    raise exception 'Chemin de fichier refusé'
      using errcode = 'invalid_parameter_value';
  end if;

  if sorte = 'affichette' then
    select c.id into le_dossier
      from public.candidat c
     where c.id = candidat_choisi
       and c.loge_id = la_reunion.loge_id;
    if le_dossier is null then
      raise exception 'Ce dossier n''est pas de la loge de la réunion'
        using errcode = 'insufficient_privilege';
    end if;
    le_jour := (now() at time zone 'Europe/Paris')::date;
  else
    le_jour := la_reunion.tenue_le;
  end if;

  -- L'exemplaire du même nom, s'il existe : son fichier est à jeter.
  select d.chemin into ancien
    from public.document d
   where d.loge_id = la_reunion.loge_id
     and d.type_document = sorte
     and d.nom = nom_choisi
     and d.bubble_id is null
     for update;

  insert into public.document
    (nom, type_document, chemin, loge_id, reunion_id, candidat_id, date_document)
  values
    (nom_choisi, sorte, chemin_choisi, la_reunion.loge_id, la_reunion.id, le_dossier, le_jour)
  on conflict (loge_id, type_document, nom) where bubble_id is null
  do update set chemin        = excluded.chemin,
                reunion_id    = excluded.reunion_id,
                candidat_id   = excluded.candidat_id,
                date_document = excluded.date_document,
                cree_le       = now(),
                maj_le        = now();

  return nullif(ancien, chemin_choisi);
end;
$$;

comment on function public.archiver_un_document(uuid, text, text, text, uuid) is
  'Range l''exemplaire d''un compte rendu, d''une affiche ou d''une affichette '
  'produit pour une réunion de ma loge. Remplace celui du même nom ; rend le '
  'chemin du fichier remplacé, à retirer du seau.';

revoke all on function public.archiver_un_document(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.archiver_un_document(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Effacer
--
-- Rend `efface` avec le chemin à retirer du seau, ou `introuvable` — d'une
-- autre loge, déjà effacé, ou absent : de l'extérieur, c'est la même chose.
-- Le manque de droit lève.
-- ---------------------------------------------------------------------------
drop function if exists public.effacer_un_document(uuid);

create function public.effacer_un_document(document_choisi uuid)
returns table (issue text, chemin text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  le_document public.document%rowtype;
begin
  if not public.puis_je_effacer_des_documents() then
    raise exception 'Ce compte ne peut pas effacer de document'
      using errcode = 'insufficient_privilege';
  end if;

  select d.* into le_document
    from public.document d
   where d.id = document_choisi
     and d.efface_le is null
     and (public.est_admin() or d.loge_id = public.ma_loge())
     for update;

  if not found then
    return query select 'introuvable'::text, null::text;
    return;
  end if;

  if le_document.bubble_id is null then
    delete from public.document d where d.id = le_document.id;
  else
    update public.document d
       set efface_le = now(),
           chemin    = null,
           maj_le    = now()
     where d.id = le_document.id;
  end if;

  return query select 'efface'::text, le_document.chemin;
end;
$$;

comment on function public.effacer_un_document(uuid) is
  'Efface un PDF archivé de ma loge (toutes pour l''administrateur). Un PDF '
  'repris de Bubble reste en base, marqué effacé, pour ne pas revenir à la '
  'reprise. Rend le chemin du fichier à retirer du seau.';

revoke all on function public.effacer_un_document(uuid) from public, anon;
grant execute on function public.effacer_un_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ce que l'accueil montre
--
-- `security invoker` : la policy de lecture fait le tri des loges, comme pour
-- toute lecture de la table. La fonction n'ajoute que la période, le type, et
-- si la corbeille a lieu d'être sur chaque ligne — une corbeille qui échoue
-- toujours vaut moins qu'une corbeille absente.
--
-- Le drapeau `archive` de Bubble ne compte pas : il faisait seulement passer
-- un PDF de « prêt pour envoi » à « archivé », les deux restaient visibles.
-- ---------------------------------------------------------------------------
create or replace function public.documents_de_l_accueil(du date, au date)
returns table (
  id            uuid,
  nom           text,
  type_document text,
  date_document date,
  effacable     boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with droit as (
    select public.puis_je_effacer_des_documents() as peut,
           public.est_admin()                     as admin,
           public.ma_loge()                       as loge
  ),
  lu as (
    select d.id, d.nom, d.loge_id, d.cree_le,
           lower(btrim(d.type_document)) as sorte,
           coalesce(d.date_document, (d.cree_le at time zone 'Europe/Paris')::date) as le
      from public.document d
     where d.efface_le is null
       and (d.chemin is not null or d.lien_url is not null)
  )
  select lu.id, lu.nom, lu.sorte, lu.le,
         droit.peut and (droit.admin or lu.loge_id = droit.loge)
    from lu, droit
   where lu.sorte in ('compte-rendu', 'affiche', 'affichette')
     and lu.le between du and au
   order by lu.le desc, lu.cree_le desc, lu.id
$$;

comment on function public.documents_de_l_accueil(date, date) is
  'Les comptes rendus, affiches et affichettes lisibles par la session, datés '
  'de la période, du plus récent au plus ancien, avec le droit de les effacer.';

revoke all on function public.documents_de_l_accueil(date, date) from public, anon;
grant execute on function public.documents_de_l_accueil(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Le rapatriement ne compte plus les PDF effacés
--
-- La vue de 0005, à une condition près sur la dernière ligne : un PDF de
-- Bubble effacé n'est pas « à rapatrier ».
-- ---------------------------------------------------------------------------
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
         count(*) filter (where lien_url is not null and efface_le is null),
         count(*) filter (where lien_url is not null and chemin is null and efface_le is null)
    from public.document;

-- ---------------------------------------------------------------------------
-- 8. Supprimer un candidat emporte ses affichettes
--
-- 0062 à l'identique, sauf la dernière instruction : les chemins rendus à la
-- route comprennent ceux de ses affichettes archivées, que la cascade efface
-- de la table avec lui. Même signature : `create or replace` suffit.
-- ---------------------------------------------------------------------------
create or replace function public.supprimer_un_candidat(cible uuid)
returns table (issue text, fichiers text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche       public.candidat%rowtype;
  affichettes text[];
begin
  if not public.puis_je_supprimer_des_candidats() then
    raise exception 'Ce compte ne peut pas supprimer de candidat'
      using errcode = 'insufficient_privilege';
  end if;

  -- De l'extérieur, un candidat d'une autre loge et un candidat absent se
  -- ressemblent : c'est voulu.
  select c.* into fiche
    from public.candidat c
   where c.id = cible
     and (public.est_admin() or c.loge_id = public.ma_loge());

  if not found then
    return query select 'introuvable'::text, array[]::text[];
    return;
  end if;

  if fiche.bubble_id is not null then
    return query select 'bubble'::text, array[]::text[];
    return;
  end if;

  if fiche.profil_id is not null then
    return query select 'compte'::text, array[]::text[];
    return;
  end if;

  -- Lus avant la suppression : la cascade les emporte avec le dossier.
  select coalesce(array_agg(d.chemin) filter (where d.chemin is not null), array[]::text[])
    into affichettes
    from public.document d
   where d.candidat_id = cible;

  -- L'invitation qui a ouvert le dossier porte l'adresse du candidat et un
  -- lien vers lui : elle part avec lui.
  delete from public.parrainage p where p.candidat_id = cible;

  -- Le journal suit, par la cascade posée en 0021 ; les affichettes, par
  -- celle de 0069.
  delete from public.candidat c where c.id = cible;

  return query select 'supprime'::text,
    array_remove(array[fiche.cv_chemin, fiche.cv_anonyme_chemin,
                       fiche.lettre_motivation_chemin, fiche.photo_chemin], null)
    || affichettes;
end
$$;

comment on function public.supprimer_un_candidat(uuid) is
  'Supprime un candidat, son journal, ses affichettes archivées et '
  'l''invitation qui l''a ouvert, sans retour. Rend les chemins de ses '
  'fichiers, à retirer du seau par la route. Refuse les dossiers repris de '
  'Bubble et ceux qui ont un compte.';

revoke all on function public.supprimer_un_candidat(uuid) from public, anon;
grant execute on function public.supprimer_un_candidat(uuid) to authenticated;
