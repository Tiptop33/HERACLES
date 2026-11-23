-- ---------------------------------------------------------------------------
-- 0101 — purger les offres de plus de soixante jours
--
-- Ce que ça change : les offres d'emploi qui n'ont pas bougé depuis plus de
-- soixante jours sont supprimées. Depuis que HERACLES reçoit lui-même les
-- offres de France Travail (0099), la table grossit de plusieurs centaines
-- d'offres par jour et rien n'en sortait : au bout d'un an, des centaines de
-- milliers de lignes que personne ne peut plus voir.
--
-- Pourquoi soixante jours : une offre n'est « en cours » que trente jours
-- (0011, 0097). Entre trente et soixante, elle n'est plus à l'écran mais reste
-- en base — une marge, si France Travail la réactualise. Au-delà, elle part.
--
-- L'âge d'une offre : sa date d'actualisation chez France Travail ; à défaut
-- sa date de création ; à défaut le jour où HERACLES l'a reçue. Une offre sans
-- aucune date ne vit donc pas éternellement.
--
-- Ce que la première purge emporte : les quelque 4 500 offres reprises de
-- Bubble, dont la plus récente date du 25 mai 2026. Elles n'apparaissaient
-- déjà plus sur aucun écran.
--
-- Rien ne s'y rattache aujourd'hui : aucune table ne désigne une offre. Le
-- jour où les offres proposées à un candidat existeront (lot 4), cette purge
-- devra épargner celles qu'un référent a proposées — c'est à ce moment-là que
-- la question se posera, et cette migration le dit pour qu'on ne l'oublie pas.
--
-- Garde-fou : la fonction refuse moins de trente et un jours. Une faute de
-- frappe dans l'appel ne doit pas pouvoir vider les offres en cours.
--
-- Qui l'appelle : la route de réception des offres, une fois sa réception
-- terminée (clé de service, après vérification du secret). Pas de tâche
-- planifiée de plus.
--
-- Accès : `service_role` seulement. Rejouable : `create or replace`.
-- ---------------------------------------------------------------------------

create or replace function public.purger_les_offres_anciennes(jours integer default 60)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purgees integer;
begin
  if jours is null or jours < 31 then
    raise exception 'La purge ne descend pas sous 31 jours : en dessous, les offres sont encore en cours'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.offre_emploi o
   where coalesce(o.date_actualisation, o.date_creation, o.cree_le)
         < now() - make_interval(days => jours);
  get diagnostics purgees = row_count;

  return purgees;
end
$$;

comment on function public.purger_les_offres_anciennes(integer) is
  'Supprime les offres dont la dernière date connue (actualisation, création, '
  'réception) a plus de N jours — 60 par défaut, jamais moins de 31. Rend le '
  'nombre de lignes supprimées. Clé de service seulement.';

revoke all on function public.purger_les_offres_anciennes(integer) from public, anon, authenticated;
grant execute on function public.purger_les_offres_anciennes(integer) to service_role;
