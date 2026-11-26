-- 0106_modifier_une_invitation.sql
-- L'administrateur corrige le rôle et la loge d'une invitation en attente.
--
-- Jusqu'ici, une invitation partie avec le mauvais rôle ou la mauvaise loge ne
-- se rattrapait qu'en en émettant une nouvelle — donc un second courriel, et
-- un premier lien qui cesse de valoir sans que la personne le sache. Le lien,
-- lui, n'est pas en cause : c'est ce qu'il donne qui doit changer. Or
-- `accepter_invitation` lit le rôle et la loge au moment de l'acceptation ;
-- les corriger avant suffit.
--
-- Deux changements, rien de plus :
--
--   * `modifier_invitation` : seul un administrateur, seule une invitation
--     encore en attente et non périmée. Une invitation acceptée a déjà posé son
--     rôle sur un compte ; la modifier ici ferait croire qu'on change le compte.
--   * la vue `invitation_visible` montre `loge_id`, pour que le menu de l'écran
--     sache quelle loge est choisie. Supprimée puis recréée, ici comme dans
--     0010 : le serveur rejoue toutes les migrations, et 0010 recrée la vue
--     sans cette colonne avant que 0106 ne la rajoute.
--
-- Aucune policy d'écriture n'est ouverte sur la table : la modification passe
-- par la fonction, appelée sous clé service_role après contrôle de la session.

-- ---------------------------------------------------------------------------
-- 1. La vue, avec la loge choisie
-- ---------------------------------------------------------------------------
drop view if exists public.invitation_visible;

create view public.invitation_visible
with (security_invoker = true)
as
  select i.id,
         i.email,
         i.role,
         i.etat,
         i.cree_le,
         i.expire_le,
         i.repondu_le,
         i.expire_le <= now() as perimee,
         l.nom as loge_nom,
         nullif(trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), '') as invite_par_nom,
         i.loge_id
    from public.invitation i
    left join public.loge l on l.id = i.loge_id
    left join public.profil p on p.id = i.invite_par;

comment on view public.invitation_visible is
  'Les invitations telles que l''écran d''administration les affiche. `security_invoker` : la vue obéit à la policy de qui la lit, elle ne la contourne pas.';

grant select on public.invitation_visible to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Modifier une invitation en attente
--    `emetteur` est le compte qui modifie : la fonction refuse s'il n'est pas
--    administrateur, comme `emettre_invitation`. Le contrôle est dans la base.
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
  if invit.etat <> 'envoyee' or invit.expire_le <= now() then
    raise exception 'Invitation caduque' using errcode = 'invalid_parameter_value';
  end if;

  if loge_visee is not null
     and not exists (select 1 from public.loge l where l.id = loge_visee) then
    raise exception 'Loge inconnue' using errcode = 'foreign_key_violation';
  end if;

  update public.invitation
     set role = role_vise,
         loge_id = loge_visee
   where id = invit.id;
end;
$$;

comment on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid) is
  'Change le rôle et la loge d''une invitation encore en attente. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)
  from public, anon, authenticated;
grant execute on function public.modifier_invitation(uuid, uuid, public.role_utilisateur, uuid)
  to service_role;
