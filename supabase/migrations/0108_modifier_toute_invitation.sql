-- 0108_modifier_toute_invitation.sql
-- Le rôle, la loge et l'adresse se corrigent sur toutes les lignes du tableau
-- des invitations, et plus seulement sur celles en attente.
--
-- 0106 limitait la correction aux invitations en attente : une fois acceptée,
-- une invitation avait posé son rôle sur un compte, et la modifier aurait fait
-- croire qu'on changeait le compte. Désormais on change le compte, pour de bon :
--
--   * `modifier_invitation` (remplacée) :
--       - invitation acceptée : le rôle du compte change aussitôt, et la loge de
--         sa fiche référent avec. Une fiche est créée si le compte devient
--         référent ou administrateur sans en avoir. Deux refus : on ne change
--         pas son propre rôle — on s'enfermerait dehors —, et on ne retire pas
--         le rôle de référent à qui accompagne encore des candidats ;
--       - en attente, périmée ou révoquée : seule l'invitation change, et
--         l'acceptation posera le rôle et la loge corrigés.
--   * `readresser_invitation` (nouvelle) : une invitation pas encore acceptée
--     part à une autre adresse. Un lien ne vaut que pour l'adresse à laquelle
--     il est parti : l'ancien cesse de valoir, un nouveau jeton est posé, valable
--     sept jours. La route envoie le courriel. La fonction rend aussi le compte
--     vide que l'ancien envoi avait créé, pour que la route le retire — un
--     compte jamais utilisé, relié à rien, sans quoi l'ancien lien ouvrirait
--     encore une session.
--   * `noter_adresse_du_compte` (nouvelle) : une invitation acceptée prend la
--     nouvelle adresse de connexion du compte, et sa fiche référent aussi. La
--     route change d'abord l'adresse de connexion, chez l'authentification.
--
-- Toujours aucune policy d'écriture sur la table : tout passe par ces
-- fonctions, appelées sous clé service_role après contrôle de la session, et
-- qui refont le contrôle d'administrateur.

-- ---------------------------------------------------------------------------
-- 1. Le rôle et la loge, quel que soit l'état
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
  compte public.profil%rowtype;
  fiche uuid;
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
    select * into compte from public.profil where id = invit.profil_id for update;
    if compte.id is null then
      raise exception 'Le compte de cette invitation n''existe plus' using errcode = 'no_data_found';
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

    -- Sous service_role, auth.uid() est nul : le déclencheur de 0001 laisse
    -- alors passer le changement de rôle.
    update public.profil set role = role_vise where id = compte.id;

    if fiche is not null then
      update public.referent set loge_id = loge_visee where id = fiche;
    elsif role_vise in ('referent', 'admin') then
      insert into public.referent (nom, prenom, email, loge_id, profil_id)
      values (compte.nom, compte.prenom, invit.email, loge_visee, compte.id);
    end if;
  end if;

  update public.invitation
     set role = role_vise,
         loge_id = loge_visee
   where id = invit.id;
end;
$$;

comment on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid) is
  'Change le rôle et la loge d''une invitation, quel que soit son état ; acceptée, le compte et sa fiche référent suivent. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)
  from public, anon, authenticated;
grant execute on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Une invitation pas encore acceptée part à une autre adresse
--    Rend l'identifiant du compte vide laissé par l'ancien envoi, s'il en est
--    un que rien ne relie : jamais accepté, ni fiche référent, ni fiche
--    candidat, rôle de base. La route vérifie en plus, chez
--    l'authentification, qu'il n'a jamais servi avant de le retirer.
-- ---------------------------------------------------------------------------
create or replace function public.readresser_invitation(
  emetteur uuid,
  cible uuid,
  adresse text,
  empreinte text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invit public.invitation%rowtype;
  nouvelle text := lower(trim(adresse));
  ancien_compte uuid;
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut modifier une invitation'
      using errcode = 'insufficient_privilege';
  end if;

  if nouvelle is null or nouvelle = '' or empreinte is null or empreinte = '' then
    raise exception 'Adresse email requise' using errcode = 'invalid_parameter_value';
  end if;

  select * into invit from public.invitation where id = cible for update;

  if invit.id is null then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;
  if invit.etat = 'acceptee' then
    raise exception 'Invitation déjà acceptée' using errcode = 'invalid_parameter_value';
  end if;

  -- Comme `emettre_invitation` : on n'invite pas quelqu'un qui est déjà entré.
  if exists (select 1 from auth.users where lower(email) = nouvelle) then
    raise exception 'Cette adresse a déjà un compte' using errcode = 'unique_violation';
  end if;

  -- Le compte vide de l'ancienne adresse, s'il n'est relié à rien.
  select u.id into ancien_compte
    from auth.users u
    join public.profil p on p.id = u.id
   where lower(u.email) = lower(invit.email)
     and p.role = 'chercheur'
     and not exists (select 1 from public.referent r where r.profil_id = u.id)
     and not exists (select 1 from public.candidat c where c.profil_id = u.id)
     and not exists (select 1 from public.invitation i
                      where i.profil_id = u.id or (i.etat = 'acceptee' and lower(i.email) = lower(u.email)));

  -- Une autre invitation en attente pour la nouvelle adresse laisse la place.
  update public.invitation
     set etat = 'refusee', repondu_le = now()
   where lower(email) = nouvelle and etat = 'envoyee' and id <> invit.id;

  update public.invitation
     set email = nouvelle,
         jeton_empreinte = empreinte,
         etat = 'envoyee',
         cree_le = now(),
         expire_le = now() + interval '7 days',
         repondu_le = null,
         invite_par = emetteur
   where id = invit.id;

  return ancien_compte;
end;
$$;

comment on function public.readresser_invitation(uuid, uuid, text, text) is
  'Envoie une invitation pas encore acceptée à une autre adresse : nouveau jeton, sept jours. Rend le compte vide laissé par l''ancien envoi, s''il n''est relié à rien. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.readresser_invitation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.readresser_invitation(uuid, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Une invitation acceptée prend la nouvelle adresse de connexion
--    La route a déjà changé l'adresse chez l'authentification ; on vérifie
--    qu'elle l'a bien fait, puis l'invitation et la fiche référent suivent.
-- ---------------------------------------------------------------------------
create or replace function public.noter_adresse_du_compte(
  emetteur uuid,
  cible uuid,
  adresse text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invit public.invitation%rowtype;
  nouvelle text := lower(trim(adresse));
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut modifier une invitation'
      using errcode = 'insufficient_privilege';
  end if;

  select * into invit from public.invitation where id = cible for update;

  if invit.id is null or invit.etat <> 'acceptee' or invit.profil_id is null then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from auth.users u where u.id = invit.profil_id and lower(u.email) = nouvelle) then
    raise exception 'L''adresse de connexion n''a pas changé' using errcode = 'invalid_parameter_value';
  end if;

  update public.invitation set email = nouvelle where id = invit.id;
  update public.referent set email = nouvelle where profil_id = invit.profil_id;
end;
$$;

comment on function public.noter_adresse_du_compte(uuid, uuid, text) is
  'Reporte sur une invitation acceptée et sur la fiche référent la nouvelle adresse de connexion du compte. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.noter_adresse_du_compte(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.noter_adresse_du_compte(uuid, uuid, text)
  to service_role;
