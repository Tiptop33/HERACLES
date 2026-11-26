-- 0109_modifier_un_compte.sql
-- L'administrateur change le rôle et la loge de tout compte, depuis l'écran
-- Admin › Comptes, et plus seulement de ceux entrés par une invitation.
--
-- 0108 savait déjà changer un compte, mais seulement en passant par la ligne
-- de son invitation acceptée. Les comptes sans invitation — rattachés à une
-- fiche reprise de Bubble, inscrits avant le tableau des invitations — n'avaient
-- aucune porte. Trois changements :
--
--   * `modifier_compte` (nouvelle) : la règle de 0108, sortie de
--     `modifier_invitation` pour servir aux deux écrans. Le rôle du compte
--     change, la loge de sa fiche référent avec ; une fiche naît s'il devient
--     référent ou administrateur sans en avoir. Les invitations acceptées du
--     compte suivent, pour que les deux tableaux disent la même chose. Refus :
--     son propre rôle ; le rôle de référent retiré à qui accompagne des
--     candidats ; le compte d'un candidat, qui se règle sur sa fiche ; une loge
--     pour un compte qui n'a pas de fiche où la poser.
--   * `modifier_invitation` (remplacée) : appelle `modifier_compte` pour une
--     invitation acceptée. Même comportement qu'en 0108.
--   * `lister_comptes` (nouvelle) : ce qu'affiche l'écran. Réservée aux
--     administrateurs, vide pour tout autre. Sans les comptes des candidats, ni
--     ceux qui n'ont jamais été ouverts — une invitation en attente crée un
--     compte avant le clic, et il se gère dans le tableau des invitations.
--
-- `modifier_compte` est appelée sous clé service_role, après contrôle de la
-- session : c'est la seule façon pour le déclencheur de 0001 de laisser passer
-- un changement de rôle. Elle refait le contrôle d'administrateur.

-- ---------------------------------------------------------------------------
-- 1. Changer le rôle et la loge d'un compte
-- ---------------------------------------------------------------------------
create or replace function public.modifier_compte(
  emetteur uuid,
  cible uuid,
  role_vise public.role_utilisateur,
  loge_visee uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  compte public.profil%rowtype;
  fiche uuid;
  adresse text;
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut modifier un compte'
      using errcode = 'insufficient_privilege';
  end if;

  if role_vise is null then
    raise exception 'Rôle requis' using errcode = 'invalid_parameter_value';
  end if;

  select * into compte from public.profil where id = cible for update;
  if compte.id is null then
    raise exception 'Compte inconnu' using errcode = 'no_data_found';
  end if;

  if loge_visee is not null
     and not exists (select 1 from public.loge l where l.id = loge_visee) then
    raise exception 'Loge inconnue' using errcode = 'foreign_key_violation';
  end if;

  -- Le compte d'un candidat se règle sur sa fiche : en faire un référent d'un
  -- clic de menu lui ouvrirait les dossiers de toute sa loge.
  if exists (select 1 from public.candidat c where c.profil_id = compte.id) then
    raise exception 'Le compte d''un candidat ne se modifie pas ici'
      using errcode = 'invalid_parameter_value';
  end if;

  if compte.id = emetteur and compte.role is distinct from role_vise then
    raise exception 'On ne change pas son propre rôle' using errcode = 'check_violation';
  end if;

  select r.id into fiche from public.referent r where r.profil_id = compte.id
   order by r.cree_le, r.id limit 1;

  if role_vise = 'chercheur' and fiche is not null
     and exists (select 1 from public.candidat c where c.referent_id = fiche) then
    raise exception 'Ce compte accompagne encore des candidats'
      using errcode = 'restrict_violation';
  end if;

  -- Une loge n'a de sens que sur une fiche référent. Un compte de base qui
  -- n'en a pas, et n'en aura pas, n'a nulle part où la garder.
  if fiche is null and role_vise = 'chercheur' and loge_visee is not null then
    raise exception 'Ce compte n''a pas de fiche où poser une loge'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Sous service_role, auth.uid() est nul : le déclencheur de 0001 laisse
  -- alors passer le changement de rôle.
  update public.profil set role = role_vise where id = compte.id;

  if fiche is not null then
    update public.referent set loge_id = loge_visee where id = fiche;
  elsif role_vise in ('referent', 'admin') then
    select u.email into adresse from auth.users u where u.id = compte.id;
    insert into public.referent (nom, prenom, email, loge_id, profil_id)
    values (compte.nom, compte.prenom, adresse, loge_visee, compte.id);
  end if;

  -- Le tableau des invitations dit la même chose que le compte.
  update public.invitation
     set role = role_vise,
         loge_id = loge_visee
   where profil_id = compte.id and etat = 'acceptee';
end;
$$;

comment on function public.modifier_compte(uuid, uuid, public.role_utilisateur, uuid) is
  'Change le rôle d''un compte et la loge de sa fiche référent ; ses invitations acceptées suivent. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.modifier_compte(uuid, uuid, public.role_utilisateur, uuid)
  from public, anon, authenticated;
grant execute on function public.modifier_compte(uuid, uuid, public.role_utilisateur, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. L'invitation acceptée passe par la même règle
-- ---------------------------------------------------------------------------
create or replace function public.modifier_invitation(
  emetteur uuid,
  cible uuid,
  role_vise public.role_utilisateur,
  loge_visee uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invit public.invitation%rowtype;
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut modifier une invitation'
      using errcode = 'insufficient_privilege';
  end if;

  if role_vise is null then
    raise exception 'Rôle requis' using errcode = 'invalid_parameter_value';
  end if;

  select * into invit from public.invitation where id = cible for update;

  if invit.id is null then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;

  if loge_visee is not null
     and not exists (select 1 from public.loge l where l.id = loge_visee) then
    raise exception 'Loge inconnue' using errcode = 'foreign_key_violation';
  end if;

  if invit.etat = 'acceptee' then
    if invit.profil_id is null
       or not exists (select 1 from public.profil where id = invit.profil_id) then
      raise exception 'Le compte de cette invitation n''existe plus' using errcode = 'no_data_found';
    end if;
    -- Comme en 0108, un compte de base sans fiche garde la loge sur la seule
    -- invitation : on ne la passe au compte que s'il peut la recevoir.
    if role_vise = 'chercheur'
       and not exists (select 1 from public.referent r where r.profil_id = invit.profil_id) then
      perform public.modifier_compte(emetteur, invit.profil_id, role_vise, null);
    else
      perform public.modifier_compte(emetteur, invit.profil_id, role_vise, loge_visee);
    end if;
  end if;

  update public.invitation
     set role = role_vise,
         loge_id = loge_visee
   where id = invit.id;
end;
$$;

comment on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid) is
  'Change le rôle et la loge d''une invitation, quel que soit son état ; acceptée, le compte suit par modifier_compte. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)
  from public, anon, authenticated;
grant execute on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Ce qu'affiche l'écran Admin › Comptes
--    `security definer` pour lire l'adresse dans auth.users ; le contrôle
--    d'administrateur est la première ligne, et tout autre appelant reçoit une
--    liste vide.
-- ---------------------------------------------------------------------------
drop function if exists public.lister_comptes();

create function public.lister_comptes()
returns table (
  id uuid,
  nom text,
  prenom text,
  email text,
  role public.role_utilisateur,
  a_une_fiche boolean,
  loge_id uuid,
  loge_nom text,
  c_est_moi boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(f.nom, p.nom),
         coalesce(f.prenom, p.prenom),
         u.email,
         p.role,
         f.id is not null,
         f.loge_id,
         l.nom,
         p.id = auth.uid()
    from public.profil p
    join auth.users u on u.id = p.id
    left join lateral (
      select r.id, r.nom, r.prenom, r.loge_id
        from public.referent r
       where r.profil_id = p.id
       order by r.cree_le, r.id
       limit 1
    ) f on true
    left join public.loge l on l.id = f.loge_id
   where exists (select 1 from public.profil moi where moi.id = auth.uid() and moi.role = 'admin')
     and u.email_confirmed_at is not null
     and not exists (select 1 from public.candidat c where c.profil_id = p.id)
   order by lower(coalesce(f.nom, p.nom, u.email)), lower(coalesce(f.prenom, p.prenom, '')), u.email
$$;

comment on function public.lister_comptes() is
  'Les comptes ouverts, sans ceux des candidats, avec rôle et loge de la fiche référent. Réservé aux administrateurs : vide pour tout autre appelant.';

revoke all on function public.lister_comptes() from public, anon;
grant execute on function public.lister_comptes() to authenticated, service_role;
