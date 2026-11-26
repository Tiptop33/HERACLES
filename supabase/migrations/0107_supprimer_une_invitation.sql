-- 0107_supprimer_une_invitation.sql
-- L'administrateur supprime une ligne du tableau des invitations.
--
-- Le tableau d'Administration › Invitations ne faisait que grandir : adresses
-- mal tapées, liens périmés, invitations révoquées restaient là pour toujours,
-- avec l'adresse de quelqu'un qui n'a peut-être jamais rien demandé. Garder une
-- adresse dont on n'a plus l'usage, c'est aussi ce que le RGPD demande d'éviter.
--
-- Toutes les invitations se suppriment, quel que soit leur état :
--
--   * en attente : la ligne disparaît, et le lien déjà envoyé ne mène plus à
--     rien — `accepter_invitation` ne trouve plus l'empreinte du jeton ;
--   * acceptée : seule la trace de l'invitation part. Le compte créé, son rôle
--     et sa loge vivent dans `profil` et n'en dépendent pas ;
--   * révoquée ou périmée : c'est le nettoyage des liens morts.
--
-- Aucune policy de suppression n'est ouverte sur la table : la suppression
-- passe par `supprimer_invitation`, appelée sous clé service_role après
-- contrôle de la session, et qui refait le contrôle d'administrateur.

create or replace function public.supprimer_invitation(
  emetteur uuid,
  cible uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut supprimer une invitation'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.invitation where id = cible;

  if not found then
    raise exception 'Invitation inconnue' using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.supprimer_invitation(uuid, uuid) is
  'Supprime une invitation, quel que soit son état. Le compte éventuellement créé n''est pas touché. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.supprimer_invitation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.supprimer_invitation(uuid, uuid)
  to service_role;
