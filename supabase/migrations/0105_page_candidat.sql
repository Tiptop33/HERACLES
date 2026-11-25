-- ---------------------------------------------------------------------------
-- 0105 — la page candidat
--
-- Ce que ça change : jusqu'ici, un candidat ne touchait à HERACLES qu'une
-- fois, par le lien de sa candidature (0057). Désormais il a sa page : il y
-- tient sa fiche à jour, y dépose plusieurs CV et plusieurs lettres de
-- motivation, y voit les offres France Travail de ses secteurs et y dit à son
-- référent où il en est. Maquette validée le 25 novembre 2026 :
-- docs/maquettes/page-candidat.html.
--
-- LE CADRAGE AVAIT TRANCHÉ L'INVERSE
--
-- Le 4 août : « les candidats ne se connectent pas » (2 comptes sur 107). La
-- décision du 25 novembre la renverse, à la demande. Le compte reste léger :
-- pas de mot de passe, un lien reçu par courriel ouvre la session.
--
-- QUI RELIE UN COMPTE À UNE FICHE
--
-- Personne d'autre qu'une invitation. Le référent ou le parrain l'envoie
-- (`inviter_le_candidat_a_sa_page`), ou HERACLES l'envoie seul quand la
-- candidature est complétée. Le lien porte un jeton dont la base ne garde que
-- l'empreinte, comme partout (0009, 0057). L'inscription libre en rôle
-- « chercheur » existe depuis 0001 : une adresse identique ne suffit donc
-- JAMAIS à rattacher un compte à une fiche.
--
-- CE QUE LE CANDIDAT VOIT DE SA FICHE
--
-- La RLS choisit des lignes, pas des colonnes. Or la fiche porte ce que le
-- candidat ne doit jamais lire : ce qu'il sait de l'appartenance, si un membre
-- peut se dévoiler, l'urgence, l'appréciation. Le candidat n'a donc AUCUNE
-- policy sur `candidat` : il lit sa fiche par `ma_fiche_de_candidat()`, qui
-- nomme ses colonnes, et l'écrit par `modifier_ma_fiche_de_candidat()`, un
-- champ à la fois, dans une liste fermée.
--
-- LES DOCUMENTS
--
-- `candidat_document` : jusqu'à cinq CV et cinq lettres, un principal de
-- chaque. Le principal est recopié dans `candidat.cv_chemin` et
-- `lettre_motivation_chemin` : la fiche du référent, le CV anonyme et la
-- suppression d'un dossier continuent de lire là où ils lisaient. Dans l'autre
-- sens, un chemin posé sur la fiche par un autre chemin (la candidature, la
-- reprise) devient un document. Les CV et lettres déjà rangés sont repris.
--
-- LES MESSAGES
--
-- `candidat_message` : lus par le candidat, son référent et son parrain — pas
-- par la loge (décision du 25 novembre). Le candidat corrige un message
-- pendant 24 heures ; ensuite la base refuse, quel que soit l'appelant, clé de
-- service comprise. Aucune suppression : un journal qu'on efface n'en est plus
-- un (0021). La cascade de la suppression d'un dossier reste possible.
--
-- LA PAGE
--
-- `page_candidat` : l'invitation, la première et la dernière visite (le badge
-- « Nouvelle » des offres), les départements cochés. Une table à part plutôt
-- que des colonnes de plus sur `candidat` : chaque visite y écrit, et
-- `candidat.maj_le` dirait sinon que la fiche a changé.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le dossier de la personne connectée, et qui lit quoi
-- ---------------------------------------------------------------------------
create or replace function public.mon_dossier()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.candidat c
   where auth.uid() is not null
     and c.profil_id = auth.uid()
     and exists (select 1 from public.profil p where p.id = auth.uid() and p.role = 'chercheur')
   order by c.cree_le
   limit 1
$$;

comment on function public.mon_dossier() is
  'Le dossier de candidat relié au compte connecté (0105), ou rien. Seul un '
  'compte « chercheur » a un dossier ; l''invitation fait le lien.';

-- La règle de `fiche_candidat()` (0020, 0104) : qui lit la fiche lit ses documents.
create or replace function public.puis_je_lire_ce_candidat(le_candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.candidat c
     where c.id = le_candidat
       and (public.est_admin()
         or c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()
         or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))))
$$;

-- Les messages : le référent et le parrain, et eux seuls.
create or replace function public.puis_je_lire_ses_messages(le_candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.referent_courant() is not null and exists (
    select 1 from public.candidat c
     where c.id = le_candidat
       and (c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()))
$$;

-- Inviter : ceux qui corrigent la fiche (`modifiable` de `fiche_candidat`).
create or replace function public.puis_je_inviter_ce_candidat(le_candidat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.candidat c
     where c.id = le_candidat
       and (public.est_admin()
         or c.referent_id = public.referent_courant()
         or c.parrain_id  = public.referent_courant()))
$$;

revoke all on function public.mon_dossier() from public, anon;
revoke all on function public.puis_je_lire_ce_candidat(uuid) from public, anon;
revoke all on function public.puis_je_lire_ses_messages(uuid) from public, anon;
revoke all on function public.puis_je_inviter_ce_candidat(uuid) from public, anon;
grant execute on function public.mon_dossier() to authenticated, service_role;
grant execute on function public.puis_je_lire_ce_candidat(uuid) to authenticated, service_role;
grant execute on function public.puis_je_lire_ses_messages(uuid) to authenticated, service_role;
grant execute on function public.puis_je_inviter_ce_candidat(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. La page : invitation, visites, départements
-- ---------------------------------------------------------------------------
create table if not exists public.page_candidat (
  candidat_id           uuid primary key references public.candidat (id) on delete cascade,

  -- L'invitation en cours : l'empreinte sha256 du jeton, jamais le jeton.
  invitation_empreinte  text unique,
  invitation_expire_le  timestamptz,
  invitee_le            timestamptz,
  -- Qui a invité ; vide quand HERACLES l'a fait seul, après la candidature.
  invitee_par           uuid references public.referent (id) on delete set null,

  ouverte_le            timestamptz,   -- la toute première visite
  vue_le                timestamptz,   -- la dernière
  visite_precedente_le  timestamptz,   -- celle d'avant, pour « Nouvelle »

  -- Les départements cochés. Vide (`{}`) : tous. Absent : celui de l'adresse.
  departements          text[],

  cree_le               timestamptz not null default now(),
  maj_le                timestamptz not null default now()
);

comment on table public.page_candidat is
  'La page du candidat (0105) : l''invitation qui relie son compte à sa fiche, '
  'ses visites, ses départements. Fermée à tous : on la lit par fonctions.';

alter table public.page_candidat enable row level security;
revoke all on public.page_candidat from public, anon, authenticated;
grant all on public.page_candidat to service_role;

drop trigger if exists page_candidat_maj_le on public.page_candidat;
create trigger page_candidat_maj_le
  before update on public.page_candidat
  for each row execute function public.toucher_maj_le();

-- ---------------------------------------------------------------------------
-- 3. Les documents
-- ---------------------------------------------------------------------------
create table if not exists public.candidat_document (
  id           uuid primary key default gen_random_uuid(),
  candidat_id  uuid not null references public.candidat (id) on delete cascade,
  genre        text not null check (genre in ('cv', 'lettre')),
  nom          text not null check (char_length(btrim(nom)) between 1 and 80),
  -- Dans le seau privé `documents`. Unique : un fichier n'a qu'une ligne.
  chemin       text not null unique,
  format       text not null,
  taille       bigint check (taille is null or taille >= 0),
  principal    boolean not null default false,
  depose_le    timestamptz not null default now(),
  -- « candidat » depuis sa page ; « reprise » quand le chemin vient de la fiche.
  depose_par   text not null default 'candidat' check (depose_par in ('candidat', 'reprise')),
  maj_le       timestamptz not null default now()
);

comment on table public.candidat_document is
  'Les CV et lettres de motivation d''un candidat (0105) : cinq de chaque au '
  'plus, un principal de chaque, recopié dans candidat.cv_chemin et '
  'lettre_motivation_chemin.';

create unique index if not exists candidat_document_un_principal
  on public.candidat_document (candidat_id, genre) where principal;
create index if not exists candidat_document_candidat_idx
  on public.candidat_document (candidat_id, genre, depose_le desc);

alter table public.candidat_document enable row level security;
revoke all on public.candidat_document from public, anon, authenticated;
grant select on public.candidat_document to authenticated;
grant all on public.candidat_document to service_role;

drop policy if exists candidat_document_lecture on public.candidat_document;
create policy candidat_document_lecture on public.candidat_document
  for select
  to authenticated
  using (candidat_id = (select public.mon_dossier())
         or public.puis_je_lire_ce_candidat(candidat_id));

drop trigger if exists candidat_document_maj_le on public.candidat_document;
create trigger candidat_document_maj_le
  before update on public.candidat_document
  for each row execute function public.toucher_maj_le();

-- 3a. Le principal, recopié sur la fiche.
create or replace function public.recopier_les_documents_principaux(le_candidat uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  le_cv     text;
  la_lettre text;
begin
  select d.chemin into le_cv from public.candidat_document d
   where d.candidat_id = le_candidat and d.genre = 'cv' and d.principal;
  select d.chemin into la_lettre from public.candidat_document d
   where d.candidat_id = le_candidat and d.genre = 'lettre' and d.principal;

  perform set_config('heracles.documents_du_candidat', 'oui', true);
  update public.candidat c
     set cv_chemin = le_cv,
         lettre_motivation_chemin = la_lettre
   where c.id = le_candidat
     and (c.cv_chemin, c.lettre_motivation_chemin) is distinct from (le_cv, la_lettre);
  perform set_config('heracles.documents_du_candidat', '', true);
end
$$;

revoke all on function public.recopier_les_documents_principaux(uuid) from public, anon, authenticated;

create or replace function public.candidat_document_apres_ecriture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pendant la suppression d'un dossier, la fiche est déjà partie : la mise
  -- à jour ne trouve rien, et c'est très bien ainsi.
  perform public.recopier_les_documents_principaux(coalesce(new.candidat_id, old.candidat_id));
  return null;
end
$$;

drop trigger if exists candidat_document_recopie on public.candidat_document;
create trigger candidat_document_recopie
  after insert or update or delete on public.candidat_document
  for each row execute function public.candidat_document_apres_ecriture();

-- 3b. Dans l'autre sens : un chemin posé sur la fiche devient un document.
create or replace function public.candidat_documents_depuis_la_fiche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g      text;
  ch     text;
  ancien text;
begin
  if coalesce(current_setting('heracles.documents_du_candidat', true), '') = 'oui' then
    return null;
  end if;

  foreach g in array array['cv', 'lettre'] loop
    ch := case g when 'cv' then new.cv_chemin else new.lettre_motivation_chemin end;
    ancien := case when tg_op = 'UPDATE'
                   then case g when 'cv' then old.cv_chemin else old.lettre_motivation_chemin end
              end;

    if ch is not null and ch is distinct from ancien then
      update public.candidat_document d
         set principal = false
       where d.candidat_id = new.id and d.genre = g and d.principal and d.chemin <> ch;

      insert into public.candidat_document as d
             (candidat_id, genre, nom, chemin, format, principal, depose_par)
      values (new.id, g,
              case g when 'cv' then 'CV' else 'Lettre de motivation' end,
              ch,
              coalesce(upper(substring(ch from '\.([A-Za-z0-9]+)$')), '?'),
              true, 'reprise')
      on conflict (chemin) do update
         set principal = true
       where d.candidat_id = excluded.candidat_id;
    end if;
  end loop;

  return null;
end
$$;

drop trigger if exists candidat_documents_depuis_la_fiche on public.candidat;
create trigger candidat_documents_depuis_la_fiche
  after insert or update of cv_chemin, lettre_motivation_chemin on public.candidat
  for each row execute function public.candidat_documents_depuis_la_fiche();

-- 3c. La reprise : ce que les fiches portent déjà.
insert into public.candidat_document (candidat_id, genre, nom, chemin, format, principal, depose_le, depose_par)
select c.id, 'cv', 'CV', c.cv_chemin,
       coalesce(upper(substring(c.cv_chemin from '\.([A-Za-z0-9]+)$')), '?'),
       not exists (select 1 from public.candidat_document d
                    where d.candidat_id = c.id and d.genre = 'cv' and d.principal),
       coalesce(c.candidature_completee_le, c.cree_le), 'reprise'
  from public.candidat c
 where c.cv_chemin is not null
on conflict (chemin) do nothing;

insert into public.candidat_document (candidat_id, genre, nom, chemin, format, principal, depose_le, depose_par)
select c.id, 'lettre', 'Lettre de motivation', c.lettre_motivation_chemin,
       coalesce(upper(substring(c.lettre_motivation_chemin from '\.([A-Za-z0-9]+)$')), '?'),
       not exists (select 1 from public.candidat_document d
                    where d.candidat_id = c.id and d.genre = 'lettre' and d.principal),
       coalesce(c.candidature_completee_le, c.cree_le), 'reprise'
  from public.candidat c
 where c.lettre_motivation_chemin is not null
on conflict (chemin) do nothing;

-- 3d. Les gestes du candidat sur ses documents.
create or replace function public.deposer_mon_document(
  le_genre  text,
  le_nom    text,
  le_chemin text,
  le_format text,
  la_taille bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  nombre  integer;
  nouveau uuid;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  if le_genre is null or le_genre not in ('cv', 'lettre') then
    raise exception 'Genre de document inconnu' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(le_nom, ''))) not between 1 and 80 then
    raise exception 'Nom de document invalide' using errcode = 'check_violation';
  end if;
  -- Le chemin que la route fixe, et dans le dossier de CE candidat.
  if le_chemin is null
     or le_chemin !~ ('^candidat/documents/' || dossier::text
                      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx|odt|rtf|jpg|png|webp)$') then
    raise exception 'Chemin de document refusé' using errcode = 'check_violation';
  end if;

  -- Deux dépôts en même temps ne passent pas à six.
  perform 1 from public.candidat where id = dossier for update;
  select count(*) into nombre from public.candidat_document
   where candidat_id = dossier and genre = le_genre;
  if nombre >= 5 then
    raise exception 'Cinq documents de ce genre au plus' using errcode = 'program_limit_exceeded';
  end if;

  -- `clock_timestamp()` et non `now()` : deux dépôts d'une même transaction
  -- restent ordonnés, et « le plus récent » ne tire pas au sort.
  insert into public.candidat_document (candidat_id, genre, nom, chemin, format, taille, depose_le, principal)
  values (dossier, le_genre, btrim(le_nom), le_chemin, upper(coalesce(le_format, '?')), la_taille,
          clock_timestamp(),
          not exists (select 1 from public.candidat_document d
                       where d.candidat_id = dossier and d.genre = le_genre and d.principal))
  returning id into nouveau;

  return nouveau;
end
$$;

create or replace function public.renommer_mon_document(le_document uuid, le_nom text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(le_nom, ''))) not between 1 and 80 then
    raise exception 'Nom de document invalide' using errcode = 'check_violation';
  end if;
  update public.candidat_document set nom = btrim(le_nom)
   where id = le_document and candidat_id = dossier;
  if not found then
    raise exception 'Document introuvable' using errcode = 'no_data_found';
  end if;
end
$$;

create or replace function public.choisir_mon_document_principal(le_document uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  g       text;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  select d.genre into g from public.candidat_document d
   where d.id = le_document and d.candidat_id = dossier;
  if g is null then
    raise exception 'Document introuvable' using errcode = 'no_data_found';
  end if;
  update public.candidat_document set principal = false
   where candidat_id = dossier and genre = g and principal and id <> le_document;
  update public.candidat_document set principal = true
   where id = le_document and not principal;
end
$$;

-- Rend le chemin du fichier : c'est la route qui le retire du seau.
create or replace function public.supprimer_mon_document(le_document uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  ch      text;
  g       text;
  etait   boolean;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  delete from public.candidat_document
   where id = le_document and candidat_id = dossier
  returning chemin, genre, principal into ch, g, etait;
  if ch is null then
    raise exception 'Document introuvable' using errcode = 'no_data_found';
  end if;

  -- Le principal parti, le plus récent prend sa place.
  if etait then
    update public.candidat_document set principal = true
     where id = (select d.id from public.candidat_document d
                  where d.candidat_id = dossier and d.genre = g
                  order by d.depose_le desc, d.id
                  limit 1);
  end if;

  return ch;
end
$$;

revoke all on function public.deposer_mon_document(text, text, text, text, bigint) from public, anon;
revoke all on function public.renommer_mon_document(uuid, text) from public, anon;
revoke all on function public.choisir_mon_document_principal(uuid) from public, anon;
revoke all on function public.supprimer_mon_document(uuid) from public, anon;
grant execute on function public.deposer_mon_document(text, text, text, text, bigint) to authenticated;
grant execute on function public.renommer_mon_document(uuid, text) to authenticated;
grant execute on function public.choisir_mon_document_principal(uuid) to authenticated;
grant execute on function public.supprimer_mon_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les messages
-- ---------------------------------------------------------------------------
create table if not exists public.candidat_message (
  id           uuid primary key default gen_random_uuid(),
  candidat_id  uuid not null references public.candidat (id) on delete cascade,
  texte        text not null check (char_length(btrim(texte)) between 1 and 2000),
  ecrit_le     timestamptz not null default now(),
  corrige_le   timestamptz,
  -- Le compte qui l'a écrit : il survit à la fiche de la personne, pas l'inverse.
  ecrit_par    uuid references public.profil (id) on delete set null
);

comment on table public.candidat_message is
  'Ce que le candidat dit de sa recherche (0105). Lu par lui, son référent et '
  'son parrain. Corrigeable 24 heures, jamais supprimé.';

create index if not exists candidat_message_candidat_idx
  on public.candidat_message (candidat_id, ecrit_le desc);

alter table public.candidat_message enable row level security;
revoke all on public.candidat_message from public, anon, authenticated;
grant select on public.candidat_message to authenticated;
grant all on public.candidat_message to service_role;

drop policy if exists candidat_message_lecture on public.candidat_message;
create policy candidat_message_lecture on public.candidat_message
  for select
  to authenticated
  using (candidat_id = (select public.mon_dossier())
         or public.puis_je_lire_ses_messages(candidat_id));

-- 24 heures, puis plus rien ne bouge — quel que soit l'appelant.
create or replace function public.candidat_message_avant_correction()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.ecrit_le <= now() - interval '24 hours' then
    raise exception 'Ce message est gardé tel quel : il a plus de 24 heures'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  new.id          := old.id;
  new.candidat_id := old.candidat_id;
  new.ecrit_le    := old.ecrit_le;
  new.ecrit_par   := old.ecrit_par;
  new.corrige_le  := case when new.texte is distinct from old.texte then now() else old.corrige_le end;
  return new;
end
$$;

drop trigger if exists candidat_message_correction on public.candidat_message;
create trigger candidat_message_correction
  before update on public.candidat_message
  for each row execute function public.candidat_message_avant_correction();

create or replace function public.ecrire_mon_message(le_texte text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  nouveau uuid;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(le_texte, ''))) not between 1 and 2000 then
    raise exception 'Message vide ou trop long' using errcode = 'check_violation';
  end if;
  -- Chaque message prévient le référent par courriel : un plafond, pour que
  -- personne ne reçoive cent courriels dans la journée.
  if (select count(*) from public.candidat_message m
       where m.candidat_id = dossier and m.ecrit_le > now() - interval '24 hours') >= 20 then
    raise exception 'Vingt messages par jour au plus' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.candidat_message (candidat_id, texte, ecrit_par)
  values (dossier, btrim(le_texte), auth.uid())
  returning id into nouveau;
  return nouveau;
end
$$;

create or replace function public.corriger_mon_message(le_message uuid, le_texte text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(le_texte, ''))) not between 1 and 2000 then
    raise exception 'Message vide ou trop long' using errcode = 'check_violation';
  end if;
  update public.candidat_message set texte = btrim(le_texte)
   where id = le_message and candidat_id = dossier;
  if not found then
    raise exception 'Message introuvable' using errcode = 'no_data_found';
  end if;
end
$$;

-- Qui prévenir d'un nouveau message : clé de service seulement. L'adresse du
-- référent ne passe jamais par la session du candidat.
create or replace function public.qui_prevenir_du_message(le_message uuid)
returns table (email text, prenom text, candidat_id uuid, candidat_prenom text,
               candidat_nom text, numero integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(r.email), ''), u.email::text),
         r.prenom, c.id, c.prenom, c.nom, c.numero
    from public.candidat_message m
    join public.candidat c on c.id = m.candidat_id
    join public.referent r on r.id = c.referent_id
    left join auth.users u on u.id = r.profil_id
   where m.id = le_message
     and coalesce(nullif(btrim(r.email), ''), u.email::text) is not null
$$;

revoke all on function public.ecrire_mon_message(text) from public, anon;
revoke all on function public.corriger_mon_message(uuid, text) from public, anon;
revoke all on function public.qui_prevenir_du_message(uuid) from public, anon, authenticated;
grant execute on function public.ecrire_mon_message(text) to authenticated;
grant execute on function public.corriger_mon_message(uuid, text) to authenticated;
grant execute on function public.qui_prevenir_du_message(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. La fiche, vue et écrite par le candidat
-- ---------------------------------------------------------------------------
create or replace function public.ma_fiche_de_candidat()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', c.id,
           'numero', c.numero,
           'prenom', c.prenom,
           'nom', c.nom,
           'email', c.email,
           'telephone', c.telephone,
           'age', c.age,
           'situation_familiale', c.situation_familiale,
           'adresse', c.adresse,
           'code_postal', c.code_postal,
           'ville', c.ville,
           'type_emploi', c.type_emploi,
           'emploi_recherche', c.emploi_recherche,
           'definition_emploi', c.definition_emploi,
           'mobilite_geographique', c.mobilite_geographique,
           'debut_stage', to_char(c.debut_stage, 'YYYY-MM-DD'),
           'fin_stage', to_char(c.fin_stage, 'YYYY-MM-DD'),
           'permis_vl', c.permis_vl,
           'permis_moto', c.permis_moto,
           'permis_pl', c.permis_pl,
           'vehicule', c.vehicule,
           'formations', c.formations,
           'experiences', c.experiences,
           'competences', c.competences,
           'informatique', c.informatique,
           'savoir_etre', c.savoir_etre,
           'centres_interet', c.centres_interet,
           'a_une_photo', c.photo_chemin is not null,
           'referent', nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
           'secteurs', public.liste_des_secteurs_du_candidat(c.id))
    from public.candidat c
    left join public.referent r on r.id = c.referent_id
   where c.id = public.mon_dossier()
$$;

comment on function public.ma_fiche_de_candidat() is
  'La fiche du candidat connecté, réduite à ce qu''il saisit lui-même (0105). '
  'Rien de l''accompagnement : ni appartenance, ni urgence, ni appréciation.';

create or replace function public.modifier_ma_fiche_de_candidat(champ text, valeur text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  v       text := nullif(btrim(coalesce(valeur, '')), '');
  ok      boolean;
  debut   date;
  fin     date;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;

  ok := case champ
    when 'prenom'                then v is not null and char_length(v) <= 120
    when 'nom'                   then v is not null and char_length(v) <= 120
    when 'telephone'             then v is not null and char_length(v) <= 40
    when 'age'                   then v is null or case when v ~ '^[0-9]{1,2}$' then v::integer between 14 and 99 else false end
    when 'situation_familiale'   then v is null or v in ('Célibataire', 'Pacsé', 'Marié', 'Veuf', 'Divorcé')
    when 'adresse'               then v is null or char_length(v) <= 300
    when 'code_postal'           then v is null or v ~ '^[0-9A-Za-z -]{3,10}$'
    when 'ville'                 then v is null or char_length(v) <= 120
    when 'type_emploi'           then v is null or v in ('emploi', 'changement d''Emploi', 'stage en alternance', 'stage')
    when 'emploi_recherche'      then v is null or char_length(v) <= 200
    when 'definition_emploi'     then v is null or char_length(v) <= 2000
    when 'mobilite_geographique' then v is null or v in ('Agglomération', 'Départementale', 'Régionale', 'France', 'International')
    when 'debut_stage'           then v is null or v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    when 'fin_stage'             then v is null or v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    when 'permis_vl'             then v is null or v in ('Oui', 'Non')
    when 'permis_moto'           then v is null or v in ('Oui', 'Non')
    when 'permis_pl'             then v is null or v in ('Oui', 'Non')
    when 'vehicule'              then v is null or v in ('Oui', 'Non')
    when 'formations'            then v is null or char_length(v) <= 5000
    when 'experiences'           then v is null or char_length(v) <= 5000
    when 'competences'           then v is null or char_length(v) <= 3000
    when 'informatique'          then v is null or char_length(v) <= 2000
    when 'savoir_etre'           then v is null or char_length(v) <= 2000
    when 'centres_interet'       then v is null or char_length(v) <= 2000
  end;

  -- Un champ hors de la liste n'est pas « invalide » : il n'existe pas ici.
  if ok is null then
    raise exception 'Champ inconnu : %', champ using errcode = 'invalid_parameter_value';
  end if;
  -- Un jour qui a la forme d'une date sans en être une : le 30 février.
  if ok and v is not null and champ in ('debut_stage', 'fin_stage') then
    begin
      ok := to_char(v::date, 'YYYY-MM-DD') = v;
    exception when others then
      ok := false;
    end;
  end if;
  if not ok then
    raise exception 'Valeur refusée pour %', champ using errcode = 'check_violation';
  end if;

  if champ = 'age' then
    update public.candidat set age = v::integer where id = dossier;
  elsif champ in ('debut_stage', 'fin_stage') then
    execute format('update public.candidat set %I = $1::date where id = $2', champ) using v, dossier;
    select c.debut_stage::date, c.fin_stage::date into debut, fin from public.candidat c where c.id = dossier;
    if debut is not null and fin is not null and fin < debut then
      raise exception 'La fin du stage précède son début' using errcode = 'check_violation';
    end if;
  else
    execute format('update public.candidat set %I = $1 where id = $2', champ) using v, dossier;
  end if;
end
$$;

revoke all on function public.ma_fiche_de_candidat() from public, anon;
revoke all on function public.modifier_ma_fiche_de_candidat(text, text) from public, anon;
grant execute on function public.ma_fiche_de_candidat() to authenticated;
grant execute on function public.modifier_ma_fiche_de_candidat(text, text) to authenticated;

-- 5a. Les secteurs : ce que le candidat ajoute attend la confirmation du
--     référent ; ce qui était confirmé le reste (même règle que 0092).
create or replace function public.proposer_mes_secteurs(codes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  avant   jsonb;
  ancien  jsonb;
  i       integer;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  codes := coalesce(codes, '{}');
  if cardinality(codes) > 3 then
    raise exception 'Trois secteurs au plus' using errcode = 'check_violation';
  end if;
  if cardinality(codes) <> (select count(distinct x) from unnest(codes) x) then
    raise exception 'Le même secteur deux fois' using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_object_agg(cs.code, jsonb_build_object(
           'propose_par', cs.propose_par, 'confirme_par', cs.confirme_par,
           'confirme_le', cs.confirme_le, 'cree_le', cs.cree_le)), '{}'::jsonb)
    into avant
    from public.candidat_secteur cs where cs.candidat_id = dossier;

  delete from public.candidat_secteur where candidat_id = dossier;
  for i in 1 .. cardinality(codes) loop
    ancien := avant -> codes[i];
    if ancien is not null then
      insert into public.candidat_secteur
        (candidat_id, rang, code, propose_par, confirme_par, confirme_le, cree_le)
      values (dossier, i, codes[i], ancien ->> 'propose_par',
              (ancien ->> 'confirme_par')::uuid, (ancien ->> 'confirme_le')::timestamptz,
              (ancien ->> 'cree_le')::timestamptz);
    else
      insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
      values (dossier, i, codes[i], 'candidat');
    end if;
  end loop;

  return public.liste_des_secteurs_du_candidat(dossier);
end
$$;

create or replace function public.rechercher_un_secteur_pour_ma_fiche(recherche text)
returns table (code text, intitule text, niveau text, section text, section_intitule text, rang integer,
               trouve_par text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_dossier() is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  return query select * from public.rechercher_secteur(left(recherche, 120), false);
end
$$;

create or replace function public.sections_et_divisions_pour_ma_fiche()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mon_dossier() is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  return public.sections_et_divisions();
end
$$;

revoke all on function public.proposer_mes_secteurs(text[]) from public, anon;
revoke all on function public.rechercher_un_secteur_pour_ma_fiche(text) from public, anon;
revoke all on function public.sections_et_divisions_pour_ma_fiche() from public, anon;
grant execute on function public.proposer_mes_secteurs(text[]) to authenticated;
grant execute on function public.rechercher_un_secteur_pour_ma_fiche(text) to authenticated;
grant execute on function public.sections_et_divisions_pour_ma_fiche() to authenticated;

-- 5b. La photo : `candidat/photo/<id>.<format>`, le chemin de 0066.
create or replace function public.chemin_de_ma_photo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.photo_chemin from public.candidat c where c.id = public.mon_dossier()
$$;

-- Rend l'ancien chemin quand il diffère : la route retire l'ancien fichier.
create or replace function public.poser_la_photo_de_ma_fiche(le_chemin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  ancien  text;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  if le_chemin is null or le_chemin !~ ('^candidat/photo/' || dossier::text || '\.(jpg|png|webp)$') then
    raise exception 'Chemin de photo refusé' using errcode = 'check_violation';
  end if;
  select c.photo_chemin into ancien from public.candidat c where c.id = dossier;
  update public.candidat set photo_chemin = le_chemin where id = dossier;
  return case when ancien is distinct from le_chemin then ancien end;
end
$$;

create or replace function public.retirer_la_photo_de_ma_fiche()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
  ancien  text;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  select c.photo_chemin into ancien from public.candidat c where c.id = dossier;
  update public.candidat set photo_chemin = null where id = dossier and photo_chemin is not null;
  return ancien;
end
$$;

revoke all on function public.chemin_de_ma_photo() from public, anon;
revoke all on function public.poser_la_photo_de_ma_fiche(text) from public, anon;
revoke all on function public.retirer_la_photo_de_ma_fiche() from public, anon;
grant execute on function public.chemin_de_ma_photo() to authenticated;
grant execute on function public.poser_la_photo_de_ma_fiche(text) to authenticated;
grant execute on function public.retirer_la_photo_de_ma_fiche() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Les visites et les offres
-- ---------------------------------------------------------------------------
-- Une visite commence après trente minutes sans rien : changer de filtre ne
-- doit pas éteindre les badges « Nouvelle » d'un clic à l'autre.
create or replace function public.je_regarde_ma_page()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
begin
  if dossier is null then
    return;
  end if;
  insert into public.page_candidat as p (candidat_id, ouverte_le, vue_le)
  values (dossier, now(), now())
  on conflict (candidat_id) do update
     set ouverte_le = coalesce(p.ouverte_le, now()),
         visite_precedente_le = case
           when p.vue_le is null or p.vue_le < now() - interval '30 minutes' then p.vue_le
           else p.visite_precedente_le end,
         vue_le = now();
end
$$;

create or replace function public.retenir_mes_departements(les_departements text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier uuid := public.mon_dossier();
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;
  les_departements := coalesce(les_departements, '{}');
  if cardinality(les_departements) > 20
     or exists (select 1 from unnest(les_departements) d
                 where d is null or d !~ '^([0-9]{2}|2[AB]|9[78][0-9])$') then
    raise exception 'Départements illisibles' using errcode = 'check_violation';
  end if;
  insert into public.page_candidat as p (candidat_id, departements)
  values (dossier, (select coalesce(array_agg(distinct d order by d), '{}') from unnest(les_departements) d))
  on conflict (candidat_id) do update set departements = excluded.departements;
end
$$;

-- Les offres en cours dans les secteurs du candidat — section ou division,
-- confirmés ou proposés : un secteur ajouté sert tout de suite.
create or replace function public.offres_pour_moi(
  la_recherche text    default null,
  limite       integer default 20,
  decalage     integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dossier  uuid := public.mon_dossier();
  mots     text[] := public.mots_d_une_recherche(la_recherche);
  choisis  text[];
  depuis   timestamptz;
  resultat jsonb;
begin
  if dossier is null then
    raise exception 'Aucun dossier pour ce compte' using errcode = 'insufficient_privilege';
  end if;

  select case when p.candidat_id is not null and p.departements is not null then p.departements
              else (select array_remove(array[public.departement_d_une_offre(null, c.code_postal, null, null)], null))
         end,
         coalesce(p.visite_precedente_le, now() - interval '3 days')
    into choisis, depuis
    from public.candidat c
    left join public.page_candidat p on p.candidat_id = c.id
   where c.id = dossier;

  with mes_codes as (
    select cs.code from public.candidat_secteur cs where cs.candidat_id = dossier
  ),
  dans_mes_secteurs as (
    select o.id, o.intitule, o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle,
           o.date_creation,
           coalesce(o.date_actualisation, o.date_creation) as quand,
           public.departement_d_une_offre(o.departement, o.lieu_code_postal,
                                          o.lieu_code_insee, o.lieu_libelle) as dep
      from public.offre_emploi o
     where coalesce(o.date_actualisation, o.date_creation) > now() - interval '30 days'
       and exists (
         select 1 from mes_codes m
          where m.code = left(regexp_replace(coalesce(o.code_naf, ''), '[^0-9A-Za-z]', '', 'g'), 2)
             or m.code = public.section_naf_d_une_offre(o.code_naf))
       and (cardinality(mots) = 0 or o.texte_cherche like all (mots))
  ),
  retenues as (
    select d.* from dans_mes_secteurs d
     where coalesce(cardinality(choisis), 0) = 0 or d.dep = any (choisis)
  ),
  la_page as (
    select r.* from retenues r
     order by r.quand desc, r.id
     limit least(greatest(coalesce(limite, 20), 1), 100)
    offset greatest(coalesce(decalage, 0), 0)
  )
  select jsonb_build_object(
           'total', (select count(*) from retenues),
           'nouvelles', (select count(*) from retenues r where r.date_creation > depuis),
           'choisis', to_jsonb(coalesce(choisis, '{}'::text[])),
           'departements', coalesce(
             (select jsonb_agg(jsonb_build_object('code', x.dep, 'nombre', x.n) order by x.dep)
                from (select d.dep, count(*) as n from dans_mes_secteurs d
                       where d.dep is not null group by d.dep) x),
             '[]'::jsonb),
           'offres', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', p.id, 'intitule', p.intitule, 'entreprise_nom', p.entreprise_nom,
                       'lieu_libelle', p.lieu_libelle,
                       'type_contrat_libelle', p.type_contrat_libelle,
                       'date_creation', p.date_creation,
                       'nouvelle', coalesce(p.date_creation > depuis, false))
                     order by p.quand desc, p.id)
                from la_page p),
             '[]'::jsonb))
    into resultat;

  return resultat;
end
$$;

revoke all on function public.je_regarde_ma_page() from public, anon;
revoke all on function public.retenir_mes_departements(text[]) from public, anon;
revoke all on function public.offres_pour_moi(text, integer, integer) from public, anon;
grant execute on function public.je_regarde_ma_page() to authenticated;
grant execute on function public.retenir_mes_departements(text[]) to authenticated;
grant execute on function public.offres_pour_moi(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. L'invitation, et le lien entre le compte et la fiche
-- ---------------------------------------------------------------------------
create or replace function public.inviter_le_candidat_a_sa_page(le_candidat uuid, empreinte text)
returns table (email text, prenom text, nom text, loge_nom text, a_deja_un_compte boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  la_fiche public.candidat%rowtype;
begin
  perform public.exiger_une_empreinte(empreinte);
  if not public.puis_je_inviter_ce_candidat(le_candidat) then
    raise exception 'Seuls le référent et le parrain invitent le candidat'
      using errcode = 'insufficient_privilege';
  end if;
  select * into la_fiche from public.candidat c where c.id = le_candidat;
  if nullif(btrim(la_fiche.email), '') is null then
    raise exception 'Le candidat n''a pas d''adresse e-mail' using errcode = 'no_data_found';
  end if;

  insert into public.page_candidat as p
         (candidat_id, invitation_empreinte, invitation_expire_le, invitee_le, invitee_par)
  values (le_candidat, empreinte, now() + interval '30 days', now(), public.referent_courant())
  on conflict (candidat_id) do update
     set invitation_empreinte = excluded.invitation_empreinte,
         invitation_expire_le = excluded.invitation_expire_le,
         invitee_le           = excluded.invitee_le,
         invitee_par          = excluded.invitee_par;

  return query
    select btrim(la_fiche.email), la_fiche.prenom, la_fiche.nom,
           (select l.nom from public.loge l where l.id = la_fiche.loge_id),
           la_fiche.profil_id is not null;
end
$$;

-- Après la candidature, HERACLES invite seul — une fois, et seulement qui
-- n'a ni compte ni invitation. Clé de service : le candidat n'a pas de session.
create or replace function public.inviter_a_sa_page_apres_candidature(le_candidat uuid, empreinte text)
returns table (email text, prenom text, loge_nom text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  la_fiche public.candidat%rowtype;
begin
  perform public.exiger_une_empreinte(empreinte);
  select * into la_fiche from public.candidat c where c.id = le_candidat;
  if la_fiche.id is null
     or la_fiche.profil_id is not null
     or nullif(btrim(la_fiche.email), '') is null
     or exists (select 1 from public.page_candidat p
                 where p.candidat_id = le_candidat and p.invitee_le is not null) then
    return;
  end if;

  insert into public.page_candidat as p
         (candidat_id, invitation_empreinte, invitation_expire_le, invitee_le, invitee_par)
  values (le_candidat, empreinte, now() + interval '30 days', now(), null)
  on conflict (candidat_id) do update
     set invitation_empreinte = excluded.invitation_empreinte,
         invitation_expire_le = excluded.invitation_expire_le,
         invitee_le           = excluded.invitee_le,
         invitee_par          = null;

  return query
    select btrim(la_fiche.email), la_fiche.prenom,
           (select l.nom from public.loge l where l.id = la_fiche.loge_id);
end
$$;

create or replace function public.invitation_a_la_page(empreinte text)
returns table (candidat_id uuid, email text, prenom text, valable boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, nullif(btrim(c.email), ''), c.prenom,
         p.invitation_expire_le > now() and nullif(btrim(c.email), '') is not null
    from public.page_candidat p
    join public.candidat c on c.id = p.candidat_id
   where empreinte ~ '^[0-9a-f]{64}$'
     and p.invitation_empreinte = empreinte
$$;

-- Le compte qui porte une adresse, son rôle, et la fiche qu'il a déjà.
create or replace function public.compte_pour_la_page(adresse text)
returns table (id uuid, role text, candidat_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, p.role::text,
         (select c.id from public.candidat c where c.profil_id = u.id order by c.cree_le limit 1)
    from auth.users u
    left join public.profil p on p.id = u.id
   where lower(u.email) = lower(btrim(adresse))
   limit 1
$$;

create or replace function public.accepter_l_invitation_a_la_page(empreinte text, le_profil uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  la_page  public.page_candidat%rowtype;
  le_role  text;
begin
  perform public.exiger_une_empreinte(empreinte);
  select * into la_page from public.page_candidat p
   where p.invitation_empreinte = empreinte
     for update;
  if la_page.candidat_id is null or la_page.invitation_expire_le <= now() then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  select p.role::text into le_role from public.profil p where p.id = le_profil;
  if le_role is distinct from 'chercheur' then
    raise exception 'Cette adresse est celle d''un compte de référent'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.candidat c
              where c.profil_id = le_profil and c.id <> la_page.candidat_id) then
    raise exception 'Ce compte est déjà relié à un autre dossier' using errcode = 'unique_violation';
  end if;

  update public.candidat set profil_id = le_profil where id = la_page.candidat_id;
  -- Le lien ne sert qu'une fois.
  update public.page_candidat
     set invitation_empreinte = null, invitation_expire_le = null
   where candidat_id = la_page.candidat_id;

  return la_page.candidat_id;
end
$$;

-- Pour la fiche du référent : où en est la page de ce candidat.
create or replace function public.etat_de_la_page_candidat(le_candidat uuid)
returns table (a_un_compte boolean, a_un_email boolean, invitee_le timestamptz,
               invitation_expire_le timestamptz, ouverte_le timestamptz, vue_le timestamptz,
               peut_inviter boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.profil_id is not null,
         nullif(btrim(c.email), '') is not null,
         p.invitee_le, p.invitation_expire_le, p.ouverte_le, p.vue_le,
         public.puis_je_inviter_ce_candidat(c.id)
    from public.candidat c
    left join public.page_candidat p on p.candidat_id = c.id
   where c.id = le_candidat
     and public.puis_je_lire_ce_candidat(c.id)
$$;

revoke all on function public.inviter_le_candidat_a_sa_page(uuid, text) from public, anon;
revoke all on function public.inviter_a_sa_page_apres_candidature(uuid, text) from public, anon, authenticated;
revoke all on function public.invitation_a_la_page(text) from public, anon, authenticated;
revoke all on function public.compte_pour_la_page(text) from public, anon, authenticated;
revoke all on function public.accepter_l_invitation_a_la_page(text, uuid) from public, anon, authenticated;
revoke all on function public.etat_de_la_page_candidat(uuid) from public, anon;
grant execute on function public.inviter_le_candidat_a_sa_page(uuid, text) to authenticated;
grant execute on function public.inviter_a_sa_page_apres_candidature(uuid, text) to service_role;
grant execute on function public.invitation_a_la_page(text) to service_role;
grant execute on function public.compte_pour_la_page(text) to service_role;
grant execute on function public.accepter_l_invitation_a_la_page(text, uuid) to service_role;
grant execute on function public.etat_de_la_page_candidat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Supprimer un dossier : ses documents quittent aussi le seau
--    Même fonction qu'en 0075, qui rend en plus les chemins des documents.
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
  documents   text[];
begin
  if not public.puis_je_supprimer_des_candidats() then
    raise exception 'Ce compte ne peut pas supprimer de candidat'
      using errcode = 'insufficient_privilege';
  end if;

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

  select coalesce(array_agg(d.chemin) filter (where d.chemin is not null), array[]::text[])
    into affichettes
    from public.document d
   where d.candidat_id = cible;

  -- 0105 : les CV et lettres de la page candidat, que la cascade emporte.
  select coalesce(array_agg(d.chemin), array[]::text[])
    into documents
    from public.candidat_document d
   where d.candidat_id = cible;

  delete from public.parrainage p where p.candidat_id = cible;
  delete from public.candidat c where c.id = cible;

  -- Chaque chemin une fois — le CV principal est aussi un document —, dans
  -- l'ordre d'avant 0105.
  return query select 'supprime'::text,
    array(select t.x from unnest(
      array_remove(array[fiche.cv_chemin, fiche.cv_anonyme_chemin,
                         fiche.lettre_motivation_chemin, fiche.photo_chemin,
                         fiche.cv_anonyme_fige_chemin], null)
      || affichettes || documents) with ordinality as t(x, n)
          group by t.x order by min(t.n));
end
$$;

comment on function public.supprimer_un_candidat(uuid) is
  'Supprime un dossier ouvert dans HERACLES, sans compte, et rend les chemins '
  'des fichiers à retirer du seau — affichettes et documents de la page '
  'candidat compris (0069, 0075, 0105).';

revoke all on function public.supprimer_un_candidat(uuid) from public, anon;
grant execute on function public.supprimer_un_candidat(uuid) to authenticated;
