-- ---------------------------------------------------------------------------
-- 0057 — un nouveau candidat, présenté par son parrain, comme chez Bubble
--
-- Ce que ça change : jusqu'ici, aucun candidat ne pouvait entrer dans HERACLES
-- autrement que par la reprise de Bubble. Passé la bascule, plus aucun dossier
-- n'aurait pu s'ouvrir. Le parcours de Bubble est repris, en trois temps :
--
--   1. un référent invite un parrain : HERACLES lui envoie un lien ;
--   2. le parrain présente le candidat par ce lien, sans compte — son lien
--      avec lui, ce que le candidat sait de son appartenance, si un membre de
--      la commission peut se dévoiler, l'urgence (0 à 5). Le dossier s'ouvre
--      alors dans la loge du référent, avec le numéro suivant, et SANS
--      référent : c'est une nouvelle demande, comme chez Bubble ;
--   3. le candidat complète sa fiche par un second lien — parcours, CV.
--
-- Puis, dans le poste de travail, un référent de la loge le prend en charge
-- ou le confie à un collègue.
--
-- LES JETONS
--
-- Même règle que les invitations (0009) : la base ne garde que l'empreinte
-- sha256 du jeton. Qui lirait `parrainage` n'y trouverait pas de quoi
-- fabriquer un lien. Un jeton expire au bout de trente jours et ne sert
-- qu'une fois.
--
-- QUI APPELLE QUOI
--
--   · les gestes du référent — inviter, lister, prendre en charge — passent
--     par sa session, donc par `referent_courant()` et `ma_loge()` ;
--   · les gestes du parrain et du candidat n'ont pas de session : la route
--     vérifie le jeton, puis appelle la fonction sous la clé service_role.
--     Ces fonctions-là sont fermées à `anon` comme à `authenticated` ;
--   · la relance, enfin, est appelée par une tâche planifiée, sous la même clé.
--
-- La table `parrainage` n'est ouverte à personne en lecture directe : une
-- fonction rend ce que l'écran affiche, empreintes exclues.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Ce que la page `parrain` de Bubble demandait, et que `candidat` n'avait pas
--    Chez Bubble, ces champs vivaient sur le type PARRAIN. Ils décrivent
--    pourtant la présentation d'UN candidat — on les range donc avec lui.
--    Les 102 fiches PARRAIN de Bubble restent dans `bubble_brut` : les
--    déverser ici est une étape à part.
-- ---------------------------------------------------------------------------
alter table public.candidat
  add column if not exists lien_parente              text,
  add column if not exists connait_appartenance      text,
  add column if not exists peut_se_devoiler          text,
  add column if not exists urgence                   smallint,
  add column if not exists urgence_motif             text,
  add column if not exists candidature_completee_le  timestamptz;

comment on column public.candidat.lien_parente is
  'Le lien entre le parrain et le candidat (« son fils », « un voisin »…). Page `parrain` de Bubble.';
comment on column public.candidat.connait_appartenance is
  'Oui / Non — le candidat sait-il que son parrain appartient à l''obédience ? Champ CM de Bubble.';
comment on column public.candidat.peut_se_devoiler is
  'Oui / Non — un membre de la commission peut-il se dévoiler auprès du candidat ? Champ DEVOILER de Bubble.';
comment on column public.candidat.urgence is
  'Degré d''urgence de la recherche, de 0 à 5 — le curseur de la page `parrain` de Bubble.';
comment on column public.candidat.urgence_motif is
  'Pourquoi c''est urgent, en quelques lignes. URGENCE MOTIVE chez Bubble.';
comment on column public.candidat.candidature_completee_le is
  'Le jour où le candidat a rempli sa fiche par son lien. Vide : on attend encore sa réponse.';

-- Des colonnes neuves, donc vides : ces contraintes ne refusent aucune ligne
-- reprise de Bubble.
alter table public.candidat drop constraint if exists candidat_urgence_bornee;
alter table public.candidat
  add constraint candidat_urgence_bornee check (urgence is null or urgence between 0 and 5);

alter table public.candidat drop constraint if exists candidat_connait_appartenance_oui_non;
alter table public.candidat
  add constraint candidat_connait_appartenance_oui_non
  check (connait_appartenance is null or connait_appartenance in ('Oui', 'Non'));

alter table public.candidat drop constraint if exists candidat_peut_se_devoiler_oui_non;
alter table public.candidat
  add constraint candidat_peut_se_devoiler_oui_non
  check (peut_se_devoiler is null or peut_se_devoiler in ('Oui', 'Non'));

-- ---------------------------------------------------------------------------
-- 2. Le parrainage — l'équivalent du type PARRAIN de Bubble
-- ---------------------------------------------------------------------------
create table if not exists public.parrainage (
  id                        uuid primary key default gen_random_uuid(),
  -- La loge du référent qui invite : c'est là que le dossier s'ouvrira.
  loge_id                   uuid not null references public.loge (id) on delete cascade,
  envoye_par                uuid references public.referent (id) on delete set null,
  parrain_email             text not null,

  -- Le lien du parrain, et celui de sa relance : les deux valent. Une relance
  -- ne doit pas rendre caduc le premier courriel, que le parrain a peut-être
  -- gardé de côté.
  jeton_parrain_empreinte   text not null unique,
  jeton_relance_empreinte   text unique,
  parrain_expire_le         timestamptz not null default now() + interval '30 days',
  relance_le                timestamptz,

  -- Ce que le parrain dit de lui-même.
  parrain_nom               text,
  parrain_prenom            text,
  parrain_telephone         text,
  parrain_loge              text,
  presente_le               timestamptz,

  -- Le dossier ouvert, et le lien envoyé au candidat.
  candidat_id               uuid references public.candidat (id) on delete set null,
  jeton_candidat_empreinte  text unique,
  candidat_expire_le        timestamptz,

  revoque_le                timestamptz,
  cree_le                   timestamptz not null default now()
);

comment on table public.parrainage is
  'Un parrain invité à présenter un candidat — le type PARRAIN de Bubble. Seules '
  'les empreintes des jetons sont conservées.';

create index if not exists parrainage_loge_idx     on public.parrainage (loge_id, cree_le desc);
create index if not exists parrainage_candidat_idx on public.parrainage (candidat_id);

-- Une seule invitation ouverte par adresse et par loge : la nouvelle remplace
-- l'ancienne, comme pour les invitations de 0009.
create unique index if not exists parrainage_ouvert_unique
  on public.parrainage (loge_id, lower(parrain_email))
  where presente_le is null and revoque_le is null;

alter table public.parrainage enable row level security;
revoke all on public.parrainage from anon, authenticated;
grant all on public.parrainage to service_role;

-- ---------------------------------------------------------------------------
-- 3. Le rattachement d'un référent, et seulement lui, peut se faire en base
--    Le déclencheur de 0006 remet l'ancienne valeur de `referent_id` à toute
--    modification venue d'une session. Prendre en charge un candidat est
--    justement de changer cette valeur : la fonction `designer_le_referent()`
--    lève un drapeau propre à sa transaction, et le déclencheur la laisse
--    passer — elle, et seulement pour cette colonne. Les autres colonnes du
--    rattachement restent figées.
--
--    Un client ne peut pas lever ce drapeau lui-même : PostgREST ne pose aucun
--    paramètre de session arbitraire.
-- ---------------------------------------------------------------------------
create or replace function public.candidat_avant_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if coalesce(current_setting('heracles.designation_referent', true), '') <> 'oui' then
      new.referent_id := old.referent_id;
    end if;
    new.parrain_id  := old.parrain_id;
    new.loge_id     := old.loge_id;
    new.numero      := old.numero;
    new.profil_id   := old.profil_id;
    new.bubble_id   := old.bubble_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Les valeurs des listes de choix de Bubble, à l'identique
--    Telles que l'API les rend et que les fiches reprises les portent : c'est
--    ce que `famille_de_recherche()` (0032) sait ranger.
-- ---------------------------------------------------------------------------
create or replace function public.types_de_recherche()
returns text[]
language sql
immutable
as $$
  select array['emploi', 'changement d''Emploi', 'stage en alternance', 'stage']
$$;

comment on function public.types_de_recherche() is
  'Les quatre valeurs de la liste de choix EMPLOI de Bubble, à l''identique.';

grant execute on function public.types_de_recherche() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Le référent invite un parrain
-- ---------------------------------------------------------------------------
create or replace function public.inviter_un_parrain(adresse text, empreinte text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  la_loge uuid := public.ma_loge();
  propre  text := lower(btrim(coalesce(adresse, '')));
  neuf    uuid;
begin
  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if propre !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(propre) > 320 then
    raise exception 'Adresse email invalide' using errcode = 'invalid_parameter_value';
  end if;

  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  -- Une invitation encore ouverte pour cette adresse laisse la place à la
  -- nouvelle : son lien cesse de valoir.
  update public.parrainage
     set revoque_le = now()
   where loge_id = la_loge
     and lower(parrain_email) = propre
     and presente_le is null
     and revoque_le is null;

  insert into public.parrainage (loge_id, envoye_par, parrain_email, jeton_parrain_empreinte)
  values (la_loge, moi, propre, empreinte)
  returning id into neuf;

  return neuf;
end;
$$;

comment on function public.inviter_un_parrain(text, text) is
  'Le référent connecté invite un parrain à présenter un candidat dans sa loge. '
  'Une invitation encore ouverte pour la même adresse est révoquée.';

revoke all on function public.inviter_un_parrain(text, text) from public, anon;
grant execute on function public.inviter_un_parrain(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Les parrainages de ma loge — ce que l'écran affiche, empreintes exclues
-- ---------------------------------------------------------------------------
drop function if exists public.parrainages_de_ma_loge();

create function public.parrainages_de_ma_loge()
returns table (
  id                        uuid,
  parrain_email             text,
  parrain_nom               text,
  envoye_par_nom            text,
  cree_le                   timestamptz,
  relance_le                timestamptz,
  presente_le               timestamptz,
  candidat_id               uuid,
  candidat_nom              text,
  candidature_completee_le  timestamptz,
  etat                      text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.parrain_email,
         nullif(btrim(coalesce(p.parrain_prenom, '') || ' ' || coalesce(p.parrain_nom, '')), ''),
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         p.cree_le, p.relance_le, p.presente_le,
         p.candidat_id,
         nullif(btrim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')), ''),
         c.candidature_completee_le,
         case
           when p.revoque_le is not null                         then 'revoque'
           when p.presente_le is null and p.parrain_expire_le <= now() then 'expire'
           when p.presente_le is null                            then 'attente_parrain'
           when c.candidature_completee_le is not null           then 'complete'
           when p.candidat_expire_le <= now()                    then 'expire'
           else 'attente_candidat'
         end
    from public.parrainage p
    left join public.referent r on r.id = p.envoye_par
    left join public.candidat c on c.id = p.candidat_id
   where p.loge_id = public.ma_loge()
   order by p.cree_le desc
   limit 100
$$;

comment on function public.parrainages_de_ma_loge() is
  'Les invitations de parrainage de ma loge, les plus récentes d''abord, avec '
  'leur état. Ni empreinte, ni coordonnées du parrain au-delà de son nom.';

revoke all on function public.parrainages_de_ma_loge() from public, anon;
grant execute on function public.parrainages_de_ma_loge() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Le lien du parrain : ce qu'il ouvre
--    Clé service_role seulement : le parrain n'a pas de compte, le jeton est
--    son droit, et c'est la route qui l'a vérifié en calculant l'empreinte.
-- ---------------------------------------------------------------------------
drop function if exists public.parrainage_par_empreinte(text);

create function public.parrainage_par_empreinte(empreinte text)
returns table (
  id              uuid,
  loge_nom        text,
  envoye_par_nom  text,
  parrain_email   text,
  valable         boolean,
  motif           text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         l.nom,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         p.parrain_email,
         p.presente_le is null and p.revoque_le is null and p.parrain_expire_le > now(),
         case
           when p.presente_le is not null      then 'deja_presente'
           when p.revoque_le is not null       then 'revoque'
           when p.parrain_expire_le <= now()   then 'expire'
           else null
         end
    from public.parrainage p
    join public.loge l on l.id = p.loge_id
    left join public.referent r on r.id = p.envoye_par
   where empreinte is not null
     and (p.jeton_parrain_empreinte = empreinte or p.jeton_relance_empreinte = empreinte)
$$;

revoke all on function public.parrainage_par_empreinte(text) from public, anon, authenticated;
grant execute on function public.parrainage_par_empreinte(text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Le parrain présente le candidat : le dossier s'ouvre
-- ---------------------------------------------------------------------------
drop function if exists public.presenter_un_candidat(text, jsonb, text);

create function public.presenter_un_candidat(empreinte text, fiche jsonb, empreinte_candidat text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  le_parrainage public.parrainage%rowtype;
  le_type       text;
  l_urgence     smallint;
  dernier       integer;
  le_numero     integer;
  le_parrain    uuid;
  neuf          uuid;
  la_loge_nom   text;
begin
  if fiche is null or jsonb_typeof(fiche) <> 'object' then
    raise exception 'Fiche illisible' using errcode = 'check_violation';
  end if;

  if empreinte_candidat is null or empreinte_candidat !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  -- `for update` : deux envois du même formulaire — un double clic, deux
  -- onglets — attendent l'un l'autre, et le second trouve le lien déjà servi.
  select * into le_parrainage
    from public.parrainage p
   where empreinte is not null
     and (p.jeton_parrain_empreinte = empreinte or p.jeton_relance_empreinte = empreinte)
     for update;

  if not found
     or le_parrainage.presente_le is not null
     or le_parrainage.revoque_le is not null
     or le_parrainage.parrain_expire_le <= now() then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  -- Ce sans quoi le dossier ne désigne personne, ou ne se range nulle part.
  if nullif(btrim(fiche ->> 'candidat_nom'), '') is null
     or nullif(btrim(fiche ->> 'candidat_prenom'), '') is null
     or nullif(btrim(fiche ->> 'candidat_email'), '') is null
     or nullif(btrim(fiche ->> 'parrain_nom'), '') is null then
    raise exception 'Champs obligatoires manquants' using errcode = 'check_violation';
  end if;

  le_type := nullif(btrim(fiche ->> 'type_emploi'), '');
  if le_type is null or not (le_type = any (public.types_de_recherche())) then
    raise exception 'Type de recherche inconnu' using errcode = 'check_violation';
  end if;

  begin
    l_urgence := nullif(btrim(fiche ->> 'urgence'), '')::smallint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Urgence illisible' using errcode = 'check_violation';
  end;

  -- Le numéro. Chez Bubble, `NextCandidatNumRef` porte le DERNIER numéro
  -- donné, et non le suivant : la page `parrain` affichait sa valeur plus un,
  -- puis l'y réenregistrait. On garde ce sens-là. Le plus grand des deux — le
  -- compteur ou le plus haut numéro réellement porté — protège d'un compteur
  -- resté en retard sur une reprise.
  --
  -- `for update` verrouille la ligne de la loge jusqu'à la fin de la
  -- transaction : deux présentations simultanées ne reçoivent pas le même
  -- numéro.
  select l.prochain_numero_candidat, l.nom into dernier, la_loge_nom
    from public.loge l
   where l.id = le_parrainage.loge_id
     for update;

  select greatest(coalesce(dernier, 0), coalesce(max(c.numero), 0)) + 1
    into le_numero
    from public.candidat c
   where c.loge_id = le_parrainage.loge_id;

  update public.loge set prochain_numero_candidat = le_numero where id = le_parrainage.loge_id;

  -- Le parrain est peut-être déjà dans HERACLES, sous l'adresse à laquelle il
  -- a reçu le lien — et non sous celle qu'il a tapée, qui ne prouve rien. Il
  -- devient alors parrain du dossier au sens de 0006 : il le lit et le corrige.
  select r.id into le_parrain
    from public.referent r
   where r.email is not null
     and lower(btrim(r.email)) = le_parrainage.parrain_email
   order by r.cree_le, r.id
   limit 1;

  insert into public.candidat (
    numero, loge_id, referent_id, parrain_id, parrain_email,
    nom, prenom, email, type_emploi,
    lien_parente, connait_appartenance, peut_se_devoiler, urgence, urgence_motif
  ) values (
    le_numero, le_parrainage.loge_id, null, le_parrain, le_parrainage.parrain_email,
    upper(btrim(fiche ->> 'candidat_nom')),
    btrim(fiche ->> 'candidat_prenom'),
    lower(btrim(fiche ->> 'candidat_email')),
    le_type,
    nullif(btrim(fiche ->> 'lien_parente'), ''),
    nullif(btrim(fiche ->> 'connait_appartenance'), ''),
    nullif(btrim(fiche ->> 'peut_se_devoiler'), ''),
    l_urgence,
    nullif(btrim(fiche ->> 'urgence_motif'), '')
  )
  returning id into neuf;

  update public.parrainage
     set parrain_nom              = upper(btrim(fiche ->> 'parrain_nom')),
         parrain_prenom           = nullif(btrim(fiche ->> 'parrain_prenom'), ''),
         parrain_telephone        = nullif(btrim(fiche ->> 'parrain_telephone'), ''),
         parrain_loge             = nullif(btrim(fiche ->> 'parrain_loge'), ''),
         presente_le              = now(),
         candidat_id              = neuf,
         jeton_candidat_empreinte = empreinte_candidat,
         candidat_expire_le       = now() + interval '30 days'
   where id = le_parrainage.id;

  return jsonb_build_object(
    'candidat_id', neuf,
    'numero',      le_numero,
    'loge_nom',    la_loge_nom
  );
end;
$$;

comment on function public.presenter_un_candidat(text, jsonb, text) is
  'Le parrain présente un candidat par son lien : le dossier s''ouvre dans la '
  'loge du référent qui l''a invité, avec le numéro suivant et sans référent. '
  'Le lien du parrain est alors servi, et celui du candidat enregistré.';

revoke all on function public.presenter_un_candidat(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.presenter_un_candidat(text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Le lien du candidat : ce qu'il ouvre
-- ---------------------------------------------------------------------------
drop function if exists public.candidature_par_empreinte(text);

create function public.candidature_par_empreinte(empreinte text)
returns table (
  candidat_id  uuid,
  prenom       text,
  nom          text,
  email        text,
  type_emploi  text,
  loge_nom     text,
  valable      boolean,
  motif        text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.prenom, c.nom, c.email, c.type_emploi, l.nom,
         c.candidature_completee_le is null
           and p.revoque_le is null
           and p.candidat_expire_le > now(),
         case
           when c.candidature_completee_le is not null then 'deja_completee'
           when p.revoque_le is not null               then 'revoque'
           when p.candidat_expire_le <= now()          then 'expire'
           else null
         end
    from public.parrainage p
    join public.candidat c on c.id = p.candidat_id
    left join public.loge l on l.id = c.loge_id
   where empreinte is not null
     and p.jeton_candidat_empreinte = empreinte
$$;

revoke all on function public.candidature_par_empreinte(text) from public, anon, authenticated;
grant execute on function public.candidature_par_empreinte(text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Le candidat complète sa fiche
--     Les chemins des fichiers sont vérifiés ici : ils ne peuvent désigner que
--     le CV et la lettre DE CE candidat, rangés là où la route les a déposés.
-- ---------------------------------------------------------------------------
drop function if exists public.completer_sa_candidature(text, jsonb, text, text);

create function public.completer_sa_candidature(
  empreinte text,
  fiche     jsonb,
  cv        text,
  lettre    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  le_parrainage public.parrainage%rowtype;
  le_candidat   public.candidat%rowtype;
  le_type       text;
  l_age         integer;
begin
  if fiche is null or jsonb_typeof(fiche) <> 'object' then
    raise exception 'Fiche illisible' using errcode = 'check_violation';
  end if;

  select * into le_parrainage
    from public.parrainage p
   where empreinte is not null and p.jeton_candidat_empreinte = empreinte
     for update;

  if not found or le_parrainage.revoque_le is not null
     or le_parrainage.candidat_expire_le <= now() then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  select * into le_candidat from public.candidat c where c.id = le_parrainage.candidat_id for update;
  if not found or le_candidat.candidature_completee_le is not null then
    raise exception 'Ce lien ne vaut plus' using errcode = 'invalid_authorization_specification';
  end if;

  -- Le CV est obligatoire, comme chez Bubble ; la lettre ne l'est pas. Les
  -- deux ne peuvent porter que le nom que la route leur a donné.
  if cv is null
     or cv !~ ('^candidat/cv/' || le_candidat.id || '\.(pdf|doc|docx|odt|rtf|jpg|png|webp)$') then
    raise exception 'CV manquant ou mal rangé' using errcode = 'check_violation';
  end if;

  if lettre is not null
     and lettre !~ ('^candidat/lettre/' || le_candidat.id || '\.(pdf|doc|docx|odt|rtf|jpg|png|webp)$') then
    raise exception 'Lettre mal rangée' using errcode = 'check_violation';
  end if;

  if nullif(btrim(fiche ->> 'nom'), '') is null
     or nullif(btrim(fiche ->> 'prenom'), '') is null then
    raise exception 'Le nom et le prénom sont obligatoires' using errcode = 'check_violation';
  end if;

  le_type := nullif(btrim(fiche ->> 'type_emploi'), '');
  if le_type is null or not (le_type = any (public.types_de_recherche())) then
    raise exception 'Type de recherche inconnu' using errcode = 'check_violation';
  end if;

  begin
    l_age := nullif(btrim(fiche ->> 'age'), '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Âge illisible' using errcode = 'check_violation';
  end;

  if l_age is not null and (l_age < 14 or l_age > 99) then
    raise exception 'Âge hors bornes' using errcode = 'check_violation';
  end if;

  update public.candidat
     set nom                      = upper(btrim(fiche ->> 'nom')),
         prenom                   = btrim(fiche ->> 'prenom'),
         email                    = coalesce(lower(nullif(btrim(fiche ->> 'email'), '')), email),
         telephone                = nullif(btrim(fiche ->> 'telephone'), ''),
         age                      = l_age,
         situation_familiale      = nullif(btrim(fiche ->> 'situation_familiale'), ''),
         adresse                  = nullif(btrim(fiche ->> 'adresse'), ''),
         ville                    = nullif(btrim(fiche ->> 'ville'), ''),
         code_postal              = nullif(btrim(fiche ->> 'code_postal'), ''),
         type_emploi              = le_type,
         emploi_recherche         = nullif(btrim(fiche ->> 'emploi_recherche'), ''),
         definition_emploi        = nullif(btrim(fiche ->> 'definition_emploi'), ''),
         mobilite_geographique    = nullif(btrim(fiche ->> 'mobilite_geographique'), ''),
         debut_stage              = nullif(btrim(fiche ->> 'debut_stage'), '')::date,
         fin_stage                = nullif(btrim(fiche ->> 'fin_stage'), '')::date,
         permis_vl                = nullif(btrim(fiche ->> 'permis_vl'), ''),
         permis_moto              = nullif(btrim(fiche ->> 'permis_moto'), ''),
         permis_pl                = nullif(btrim(fiche ->> 'permis_pl'), ''),
         vehicule                 = nullif(btrim(fiche ->> 'vehicule'), ''),
         formations               = nullif(btrim(fiche ->> 'formations'), ''),
         experiences              = nullif(btrim(fiche ->> 'experiences'), ''),
         competences              = nullif(btrim(fiche ->> 'competences'), ''),
         informatique             = nullif(btrim(fiche ->> 'informatique'), ''),
         savoir_etre              = nullif(btrim(fiche ->> 'savoir_etre'), ''),
         centres_interet          = nullif(btrim(fiche ->> 'centres_interet'), ''),
         cv_chemin                = cv,
         lettre_motivation_chemin = lettre,
         candidature_completee_le = now(),
         maj_le                   = now()
   where id = le_candidat.id;

  return le_candidat.id;
end;
$$;

comment on function public.completer_sa_candidature(text, jsonb, text, text) is
  'Le candidat complète sa fiche par son lien, CV compris. Le lien ne sert '
  'qu''une fois.';

revoke all on function public.completer_sa_candidature(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.completer_sa_candidature(text, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Prendre en charge un candidat, ou le confier à un collègue
--     Qui peut : un référent de la loge du candidat. Quand : tant que le
--     candidat n'a pas de référent — c'est une nouvelle demande —, ou quand on
--     est soi-même son référent et qu'on le passe à un collègue. On ne retire
--     pas un candidat à quelqu'un d'autre : cela se décide en commission.
-- ---------------------------------------------------------------------------
drop function if exists public.designer_le_referent(uuid, uuid);

create function public.designer_le_referent(le_candidat uuid, le_referent uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  moi     uuid := public.referent_courant();
  la_loge uuid := public.ma_loge();
  cible   uuid := coalesce(le_referent, public.referent_courant());
  actuel  uuid;
  sa_loge uuid;
begin
  if moi is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  select c.referent_id, c.loge_id into actuel, sa_loge
    from public.candidat c
   where c.id = le_candidat
     for update;

  -- Hors de ma loge, le candidat n'existe pas pour moi : même réponse que
  -- pour un identifiant inventé.
  if not found or sa_loge is distinct from la_loge then
    return false;
  end if;

  if actuel is not null and actuel <> moi then
    return false;
  end if;

  if not exists (select 1 from public.referent r where r.id = cible and r.loge_id = la_loge) then
    raise exception 'Ce référent n''est pas de votre loge'
      using errcode = 'foreign_key_violation';
  end if;

  perform set_config('heracles.designation_referent', 'oui', true);
  update public.candidat set referent_id = cible, maj_le = now() where id = le_candidat;
  perform set_config('heracles.designation_referent', '', true);

  return true;
end;
$$;

comment on function public.designer_le_referent(uuid, uuid) is
  'Un référent prend en charge une nouvelle demande de sa loge, ou la confie à '
  'un collègue de la loge. Son propre candidat peut aussi être passé à un '
  'collègue. Faux quand le candidat n''est pas désignable par cette personne.';

revoke all on function public.designer_le_referent(uuid, uuid) from public, anon;
grant execute on function public.designer_le_referent(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. La relance, vingt-quatre heures après, comme chez Bubble
--     Appelée par une tâche planifiée, sous la clé service_role. `noter_la_relance`
--     réserve le parrainage AVANT l'envoi : deux tâches qui se chevauchent ne
--     relancent pas deux fois.
-- ---------------------------------------------------------------------------
drop function if exists public.parrainages_a_relancer();

create function public.parrainages_a_relancer()
returns table (
  id              uuid,
  parrain_email   text,
  loge_nom        text,
  envoye_par_nom  text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.parrain_email, l.nom,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), '')
    from public.parrainage p
    join public.loge l on l.id = p.loge_id
    left join public.referent r on r.id = p.envoye_par
   where p.presente_le is null
     and p.revoque_le is null
     and p.relance_le is null
     and p.parrain_expire_le > now()
     and p.cree_le <= now() - interval '24 hours'
   order by p.cree_le
   limit 50
$$;

revoke all on function public.parrainages_a_relancer() from public, anon, authenticated;
grant execute on function public.parrainages_a_relancer() to service_role;

drop function if exists public.noter_la_relance(uuid, text);

create function public.noter_la_relance(le_parrainage uuid, empreinte text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  update public.parrainage
     set relance_le = now(), jeton_relance_empreinte = empreinte
   where id = le_parrainage
     and presente_le is null
     and revoque_le is null
     and relance_le is null;

  return found;
end;
$$;

revoke all on function public.noter_la_relance(uuid, text) from public, anon, authenticated;
grant execute on function public.noter_la_relance(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 13. Renvoyer son lien au candidat
--     Le lien du candidat ne vit que dans son courriel. S'il ne l'a pas reçu,
--     ou l'a égaré, un référent de la loge lui en envoie un nouveau : l'ancien
--     cesse de valoir, et le délai repart pour trente jours. Le bouton
--     « Renvoyer le formulaire Candidat » du tableau de bord de Bubble.
-- ---------------------------------------------------------------------------
drop function if exists public.renvoyer_le_lien_du_candidat(uuid, text);

create function public.renvoyer_le_lien_du_candidat(le_candidat uuid, empreinte text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  la_loge uuid := public.ma_loge();
  fiche   public.candidat%rowtype;
begin
  if public.referent_courant() is null or la_loge is null then
    raise exception 'Aucune loge rattachée à ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  if empreinte is null or empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = 'invalid_parameter_value';
  end if;

  select * into fiche from public.candidat c where c.id = le_candidat;
  if not found or fiche.loge_id is distinct from la_loge
     or fiche.candidature_completee_le is not null or fiche.email is null then
    return null;
  end if;

  update public.parrainage
     set jeton_candidat_empreinte = empreinte,
         candidat_expire_le       = now() + interval '30 days'
   where candidat_id = le_candidat
     and revoque_le is null;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'email',    fiche.email,
    'prenom',   fiche.prenom,
    'loge_nom', (select l.nom from public.loge l where l.id = la_loge)
  );
end;
$$;

comment on function public.renvoyer_le_lien_du_candidat(uuid, text) is
  'Un référent de la loge renvoie au candidat un nouveau lien vers sa fiche, '
  'tant qu''il ne l''a pas complétée. Null quand ce n''est pas possible.';

revoke all on function public.renvoyer_le_lien_du_candidat(uuid, text) from public, anon;
grant execute on function public.renvoyer_le_lien_du_candidat(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. La fiche montre la présentation et le reste de la fiche Bubble
--     Même fonction que 0020, mêmes règles de lecture, mêmes colonnes dans le
--     même ordre — les nouvelles à la fin. `drop` puis `create` : le type de
--     retour change, et `replace` le refuserait.
-- ---------------------------------------------------------------------------
drop function if exists public.fiche_candidat(uuid);

create function public.fiche_candidat(candidat uuid)
returns table (
  id                       uuid,
  numero                   integer,
  bubble_id                text,

  nom                      text,
  prenom                   text,
  email                    text,
  telephone                text,
  age                      integer,
  situation_familiale      text,
  ville                    text,
  code_postal              text,
  adresse                  text,

  type_emploi              text,
  emploi_recherche         text,
  mobilite_geographique    text,
  debut_stage              timestamptz,
  secteur_activite_libelle text,
  metier_libelle           text,

  formations               text,
  experiences              text,
  competences              text,
  savoir_etre              text,
  informatique             text,
  permis_vl                text,
  vehicule                 text,

  appreciation             text,
  cloture                  text,
  archive                  text,
  referent_nom             text,
  parrain_nom              text,
  loge_nom                 text,

  cv_chemin                text,
  cv_url                   text,
  cv_anonyme_chemin        text,
  cv_anonyme_url           text,
  lettre_motivation_chemin text,
  lettre_motivation_url    text,
  a_une_photo              boolean,

  cree_le                  timestamptz,
  maj_le                   timestamptz,

  modifiable               boolean,

  -- 0057 : le reste de la fiche Bubble, et la présentation par le parrain.
  a_un_referent            boolean,
  definition_emploi        text,
  fin_stage                timestamptz,
  permis_moto              text,
  permis_pl                text,
  centres_interet          text,
  parrain_email            text,
  parrain_presentateur     text,
  parrain_telephone        text,
  parrain_loge             text,
  lien_parente             text,
  connait_appartenance     text,
  peut_se_devoiler         text,
  urgence                  smallint,
  urgence_motif            text,
  presente_le              timestamptz,
  candidature_completee_le timestamptz,
  loge_id                  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero, c.bubble_id,
         c.nom, c.prenom, c.email, c.telephone, c.age, c.situation_familiale,
         c.ville, c.code_postal, c.adresse,
         c.type_emploi, c.emploi_recherche, c.mobilite_geographique,
         c.debut_stage, c.secteur_activite_libelle, c.metier_libelle,
         c.formations, c.experiences, c.competences, c.savoir_etre,
         c.informatique, c.permis_vl, c.vehicule,
         c.appreciation, c.cloture, c.archive,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         nullif(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), ''),
         l.nom,
         c.cv_chemin, c.cv_url,
         c.cv_anonyme_chemin, c.cv_anonyme_url,
         c.lettre_motivation_chemin, c.lettre_motivation_url,
         c.photo_chemin is not null,
         c.cree_le, c.maj_le,
         coalesce(
           c.referent_id = public.referent_courant()
             or c.parrain_id = public.referent_courant(),
           false),
         c.referent_id is not null,
         c.definition_emploi, c.fin_stage, c.permis_moto, c.permis_pl,
         c.centres_interet, c.parrain_email,
         nullif(btrim(coalesce(pa.parrain_prenom, '') || ' ' || coalesce(pa.parrain_nom, '')), ''),
         pa.parrain_telephone, pa.parrain_loge,
         c.lien_parente, c.connait_appartenance, c.peut_se_devoiler,
         c.urgence, c.urgence_motif,
         pa.presente_le, c.candidature_completee_le,
         c.loge_id
    from public.candidat c
    left join public.referent r on r.id = c.referent_id
    left join public.referent p on p.id = c.parrain_id
    left join public.loge     l on l.id = c.loge_id
    left join lateral (
      select x.parrain_nom, x.parrain_prenom, x.parrain_telephone, x.parrain_loge, x.presente_le
        from public.parrainage x
       where x.candidat_id = c.id
       order by x.presente_le desc nulls last
       limit 1
    ) pa on true
   where c.id = candidat
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.fiche_candidat(uuid) is
  'La fiche telle que le poste de travail (maquette 1c) l''affiche, pour les '
  'candidats de ses loges. Lecture seule : modifier passe par la table, donc '
  'par la RLS de 0006, qui n''ouvre qu''au référent et au parrain. Depuis 0057, '
  'elle rend aussi la présentation par le parrain et le reste de la fiche Bubble.';

revoke all on function public.fiche_candidat(uuid) from public, anon;
grant execute on function public.fiche_candidat(uuid) to authenticated;
