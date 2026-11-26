-- 0113_effacer_un_compte.sql
-- L'administrateur efface un compte, depuis l'écran Admin › Comptes.
--
-- Jusqu'ici un compte ouvert ne se refermait jamais : la personne partie, ou
-- entrée par erreur, gardait de quoi se connecter, et son adresse restait dans
-- la base sans plus d'usage — ce que le RGPD demande d'éviter.
--
-- Effacer un compte, c'est retirer de quoi se connecter : la ligne de
-- `auth.users`, et avec elle le profil (clé `on delete cascade` de 0001). Ce
-- retrait-là est fait par l'application, par l'API d'authentification, seule à
-- savoir fermer les sessions ouvertes. Cette migration porte ce qui le
-- précède, dans une seule fonction :
--
--   * les contrôles — seul un administrateur efface ; jamais son propre
--     compte, on s'enfermerait dehors ; jamais le compte d'un candidat, qui se
--     règle sur sa fiche ; jamais celui d'un référent qui accompagne encore des
--     candidats, qu'il faut d'abord confier à quelqu'un d'autre (la règle de
--     0109 pour le retrait du rôle) ;
--   * le ménage des invitations acceptées de ce compte : sans lui, elles
--     resteraient au tableau avec l'adresse d'un compte qui n'existe plus.
--
-- Ce qui reste : la fiche référent. Elle signe des suivis, des tâches, des
-- réunions ; elle se détache seulement du compte (`profil_id` passe à nul, clé
-- de 0002) et garde sa place dans l'annuaire.
--
-- Appelée sous clé service_role, après contrôle de la session ; elle refait le
-- contrôle d'administrateur.

create or replace function public.preparer_effacement_compte(
  emetteur uuid,
  cible uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  compte public.profil%rowtype;
  adresse text;
begin
  if not exists (select 1 from public.profil where id = emetteur and role = 'admin') then
    raise exception 'Seul un administrateur peut effacer un compte'
      using errcode = 'insufficient_privilege';
  end if;

  select * into compte from public.profil where id = cible for update;
  if compte.id is null then
    raise exception 'Compte inconnu' using errcode = 'no_data_found';
  end if;

  if compte.id = emetteur then
    raise exception 'On n''efface pas son propre compte' using errcode = 'check_violation';
  end if;

  -- Le compte d'un candidat porte sa page, ses CV, ses messages : il se règle
  -- sur sa fiche, pas d'un clic dans cette liste.
  if exists (select 1 from public.candidat c where c.profil_id = compte.id) then
    raise exception 'Le compte d''un candidat ne s''efface pas ici'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
      from public.candidat c
      join public.referent r on r.id = c.referent_id
     where r.profil_id = compte.id
  ) then
    raise exception 'Ce compte accompagne encore des candidats'
      using errcode = 'restrict_violation';
  end if;

  select u.email into adresse from auth.users u where u.id = compte.id;

  delete from public.invitation i
   where i.profil_id = compte.id
      or (i.etat = 'acceptee' and adresse is not null and lower(i.email) = lower(adresse));
end;
$$;

comment on function public.preparer_effacement_compte(uuid, uuid) is
  'Contrôle qu''un compte peut être effacé et retire ses invitations acceptées ; le compte lui-même est retiré ensuite par l''API d''authentification. Réservé aux administrateurs ; appelée sous service_role.';

revoke all on function public.preparer_effacement_compte(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.preparer_effacement_compte(uuid, uuid)
  to service_role;
