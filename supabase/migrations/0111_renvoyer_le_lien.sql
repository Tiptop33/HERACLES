-- 0111_renvoyer_le_lien.sql
-- L'administrateur renvoie le lien d'une invitation, à la même adresse.
--
-- Une invitation périmée ne se relançait pas : le formulaire refuse une
-- adresse qui a déjà un compte, et l'envoi d'une invitation en crée un avant
-- même le clic. Changer l'adresse (0108) ne servait qu'à une adresse fausse.
--
-- `renouveler_invitation` pose un nouveau jeton sur une invitation pas encore
-- acceptée — en attente, périmée ou révoquée —, valable sept jours. L'ancien
-- lien cesse de valoir : seule l'empreinte du dernier jeton est gardée. La
-- route envoie le courriel.
--
-- Refus : une invitation acceptée (le compte existe, il se gère dans
-- Admin › Comptes) ; une adresse dont le compte a déjà été ouvert par une
-- autre voie — l'inviter encore n'aurait pas de sens.
--
-- Toujours aucune policy d'écriture sur la table : la fonction est appelée
-- sous clé service_role après contrôle de la session, et refait le contrôle
-- d'administrateur.

create or replace function public.renouveler_invitation(
  emetteur uuid,
  cible uuid,
  empreinte text
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
    raise exception 'Seul un administrateur peut renvoyer une invitation'
      using errcode = 'insufficient_privilege';
  end if;

  if empreinte is null or empreinte = '' then
    raise exception 'Empreinte requise' using errcode = 'invalid_parameter_value';
  end if;

  select * into invit from public.invitation where id = cible for update;

  if invit.id is null then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;
  if invit.etat = 'acceptee' then
    raise exception 'Invitation déjà acceptée' using errcode = 'invalid_parameter_value';
  end if;

  -- Le compte créé par l'envoi précédent n'a jamais été ouvert : c'est
  -- normal, on le relance. Un compte ouvert, lui, n'attend plus de lien.
  if exists (select 1 from auth.users u
              where lower(u.email) = lower(invit.email)
                and u.email_confirmed_at is not null) then
    raise exception 'Cette adresse a déjà un compte' using errcode = 'unique_violation';
  end if;

  -- Une autre invitation en attente pour la même adresse laisse la place.
  update public.invitation
     set etat = 'refusee', repondu_le = now()
   where lower(email) = lower(invit.email) and etat = 'envoyee' and id <> invit.id;

  update public.invitation
     set jeton_empreinte = empreinte,
         etat = 'envoyee',
         cree_le = now(),
         expire_le = now() + interval '7 days',
         repondu_le = null,
         invite_par = emetteur
   where id = invit.id;
end;
$$;

comment on function public.renouveler_invitation(uuid, uuid, text) is
  'Pose un nouveau jeton, valable sept jours, sur une invitation pas encore acceptée ; l''ancien lien cesse de valoir. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.renouveler_invitation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.renouveler_invitation(uuid, uuid, text)
  to service_role;
