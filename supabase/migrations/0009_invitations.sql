-- 0009_invitations.sql
-- « On n'entre qu'invité » — l'annotation de l'écran 5 de la maquette.
--
-- Jusqu'ici, n'importe qui pouvait ouvrir /inscription, se déclarer référent et
-- créer un compte. Pour une application qui porte les dossiers de personnes
-- vulnérables, c'est la mauvaise porte : l'appartenance à une loge et le droit
-- d'accompagner ne se déclarent pas soi-même, ils se donnent.
--
-- Désormais un administrateur invite, dans une loge précise, avec un rôle
-- précis. L'invitation voyage sous forme de jeton dans un lien.
--
-- **Le jeton n'est pas stocké.** Seule son empreinte l'est : qui lirait la
-- table n'y trouverait pas de quoi fabriquer un lien valable. C'est la même
-- raison qui fait qu'on ne stocke pas les mots de passe.

-- ---------------------------------------------------------------------------
-- 1. La table
-- ---------------------------------------------------------------------------
create table if not exists public.invitation (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  role            public.role_utilisateur not null default 'referent',
  loge_id         uuid references public.loge (id) on delete set null,

  -- sha256 du jeton, en hexadécimal. Déterministe, donc consultable ; à sens
  -- unique, donc inutilisable pour fabriquer un lien.
  jeton_empreinte text not null unique,

  invite_par      uuid references public.profil (id) on delete set null,
  profil_id       uuid references public.profil (id) on delete set null,

  etat            text not null default 'envoyee',
  cree_le         timestamptz not null default now(),
  expire_le       timestamptz not null default now() + interval '7 days',
  repondu_le      timestamptz,

  constraint invitation_etat_connu check (etat in ('envoyee', 'acceptee', 'refusee'))
);

comment on table public.invitation is
  'Une invitation à rejoindre une loge, émise par un administrateur. Seule l''empreinte du jeton est conservée.';
comment on column public.invitation.jeton_empreinte is
  'sha256 du jeton envoyé par email. Le jeton lui-même n''existe que dans le lien.';

create index if not exists invitation_email_idx on public.invitation (lower(email));
create index if not exists invitation_loge_idx on public.invitation (loge_id);

-- Une seule invitation en attente par adresse : sinon deux liens vivants
-- ouvriraient deux chemins vers le même compte.
create unique index if not exists invitation_en_attente_unique
  on public.invitation (lower(email))
  where etat = 'envoyee';

-- ---------------------------------------------------------------------------
-- 2. Fermée
--    Aucune policy : ni `anon` ni `authenticated` n'atteignent cette table.
--    Les routes serveur vérifient la session et le rôle, puis passent par la
--    clé service_role. L'écran d'administration viendra au lot 5 ; sa policy
--    viendra avec lui.
-- ---------------------------------------------------------------------------
alter table public.invitation enable row level security;

revoke all on public.invitation from anon, authenticated;
grant all on public.invitation to service_role;

-- ---------------------------------------------------------------------------
-- 3. Émettre une invitation
--    `emetteur` est le compte qui invite : la fonction refuse s'il n'est pas
--    administrateur. Le contrôle est ici, dans la base, et non seulement dans
--    la route — une route peut être contournée, une fonction non.
-- ---------------------------------------------------------------------------
create or replace function public.emettre_invitation(
  emetteur uuid,
  adresse text,
  role_vise public.role_utilisateur,
  loge uuid,
  empreinte text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nouvelle uuid;
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut inviter' using errcode = 'insufficient_privilege';
  end if;

  if adresse is null or trim(adresse) = '' then
    raise exception 'Adresse email requise' using errcode = 'invalid_parameter_value';
  end if;

  -- Déjà un compte ? On n'invite pas quelqu'un qui est déjà entré.
  if exists (select 1 from auth.users where lower(email) = lower(trim(adresse))) then
    raise exception 'Cette adresse a déjà un compte' using errcode = 'unique_violation';
  end if;

  -- Une invitation en attente pour cette adresse laisse la place à la nouvelle :
  -- l'ancienne est révoquée, son lien cesse de valoir.
  update public.invitation
     set etat = 'refusee', repondu_le = now()
   where lower(email) = lower(trim(adresse)) and etat = 'envoyee';

  insert into public.invitation (email, role, loge_id, jeton_empreinte, invite_par)
  values (lower(trim(adresse)), role_vise, loge, empreinte, emetteur)
  returning id into nouvelle;

  return nouvelle;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lire une invitation depuis son jeton
--    Ne renvoie que ce que l'écran affiche : qui invite, quelle loge, quel
--    rôle. Jamais l'empreinte, jamais la liste des autres invitations.
-- ---------------------------------------------------------------------------
create or replace function public.invitation_par_empreinte(empreinte text)
returns table (
  id            uuid,
  email         text,
  role          public.role_utilisateur,
  loge_nom      text,
  invite_par_nom text,
  valable       boolean,
  motif         text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         i.email,
         i.role,
         l.nom,
         nullif(trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), ''),
         i.etat = 'envoyee' and i.expire_le > now(),
         case
           when i.etat = 'acceptee' then 'deja_acceptee'
           when i.etat = 'refusee'  then 'revoquee'
           when i.expire_le <= now() then 'expiree'
           else null
         end
    from public.invitation i
    left join public.loge l on l.id = i.loge_id
    left join public.profil p on p.id = i.invite_par
   where i.jeton_empreinte = empreinte
$$;

-- ---------------------------------------------------------------------------
-- 4 bis. Le compte qui porte cette adresse
--    Supabase crée le compte en envoyant l'invitation ; il faut le retrouver
--    pour y poser le mot de passe choisi. Renvoie un identifiant, rien d'autre.
-- ---------------------------------------------------------------------------
create or replace function public.compte_par_email(adresse text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(adresse)) limit 1
$$;

-- ---------------------------------------------------------------------------
-- 5. Accepter
--    Pose le rôle porté par l'invitation, et rattache la personne à sa loge.
--    Le compte existe déjà (Supabase l'a créé en envoyant le lien) ; ce qui
--    manque, c'est son appartenance.
-- ---------------------------------------------------------------------------
create or replace function public.accepter_invitation(
  empreinte text,
  compte uuid,
  prenom_donne text,
  nom_donne text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invit public.invitation%rowtype;
  fiche uuid;
begin
  select * into invit from public.invitation where jeton_empreinte = empreinte;

  if invit.id is null then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;
  if invit.etat <> 'envoyee' or invit.expire_le <= now() then
    raise exception 'Invitation caduque' using errcode = 'invalid_parameter_value';
  end if;

  -- L'invitation vaut pour l'adresse à laquelle elle a été envoyée, et pour
  -- elle seule : sans ce contrôle, un lien intercepté servirait à n'importe qui.
  if not exists (
    select 1 from auth.users u where u.id = compte and lower(u.email) = lower(invit.email)
  ) then
    raise exception 'Cette invitation ne vaut pas pour ce compte'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profil
     set role = invit.role,
         prenom = coalesce(nullif(trim(prenom_donne), ''), prenom),
         nom = coalesce(nullif(trim(nom_donne), ''), nom)
   where id = compte;

  -- Un accompagnant a une fiche métier, rattachée à sa loge. Elle existe peut-être
  -- déjà — reprise de Bubble et retrouvée par l'adresse — auquel cas on la complète.
  if invit.role in ('referent', 'admin') then
    select r.id into fiche from public.referent r where r.profil_id = compte;

    if fiche is null then
      select r.id into fiche
        from public.referent r
       where r.profil_id is null and lower(r.email) = lower(invit.email)
       order by r.cree_le, r.id
       limit 1;
    end if;

    if fiche is null then
      insert into public.referent (nom, prenom, email, loge_id, profil_id)
      values (nullif(trim(nom_donne), ''), nullif(trim(prenom_donne), ''),
              invit.email, invit.loge_id, compte);
    else
      update public.referent
         set profil_id = compte,
             loge_id = coalesce(loge_id, invit.loge_id),
             nom = coalesce(nom, nullif(trim(nom_donne), '')),
             prenom = coalesce(prenom, nullif(trim(prenom_donne), ''))
       where id = fiche;
    end if;
  end if;

  update public.invitation
     set etat = 'acceptee', repondu_le = now(), profil_id = compte
   where id = invit.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Refuser
-- ---------------------------------------------------------------------------
create or replace function public.refuser_invitation(empreinte text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invitation
     set etat = 'refusee', repondu_le = now()
   where jeton_empreinte = empreinte and etat = 'envoyee';
end;
$$;

-- Ces fonctions ne s'appellent que depuis une route serveur, sous clé
-- service_role, après vérification de la session.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.emettre_invitation(uuid, text, public.role_utilisateur, uuid, text)',
    'public.invitation_par_empreinte(text)',
    'public.compte_par_email(text)',
    'public.accepter_invitation(text, uuid, text, text)',
    'public.refuser_invitation(text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
