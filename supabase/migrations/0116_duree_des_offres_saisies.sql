-- ---------------------------------------------------------------------------
-- 0116 — une offre saisie oubliée ne reste pas en base au-delà de six mois
--
-- Ce que ça change : une offre saisie à la main (0114) sort de la liste au
-- bout de trente jours sans prolongation, mais n'était jamais effacée — elle
-- attendait qu'on la prolonge ou qu'on la retire, sans limite. Décision du
-- 27 novembre 2026 : **six mois au plus** après sa sortie de la liste.
--
-- Concrètement, la purge supprime une offre saisie dont la dernière mise en
-- ligne — publication ou prolongation (`date_actualisation`) — a plus de
-- trente jours et six mois. Jusque-là, elle reste dans « Offres saisies
-- sorties de la liste », prolongeable. La retirer reste possible à tout moment.
--
-- C'est la purge des offres de France Travail (0101, 0114) qui s'en charge :
-- elle passe à la fin de chaque réception, toutes les trois heures. Les offres
-- de France Travail gardent leur règle — soixante jours, jamais moins de
-- trente et un — et le nombre rendu compte les deux.
--
-- Pourquoi : le contact d'une offre saisie est une donnée personnelle d'un
-- tiers (registre des traitements, § 4 ter) ; on ne la garde pas sans fin.
--
-- Rejouable : `create or replace`, même signature, mêmes droits.
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
   where (o.origine <> 'saisie'
          and coalesce(o.date_actualisation, o.date_creation, o.cree_le)
              < now() - make_interval(days => jours))
      -- Une offre saisie : trente jours en ligne, puis six mois au plus hors
      -- de la liste. `jours` ne la concerne pas.
      or (o.origine = 'saisie'
          and coalesce(o.date_actualisation, o.date_creation, o.cree_le)
              < now() - interval '30 days' - interval '6 months');
  get diagnostics purgees = row_count;

  return purgees;
end
$$;

comment on function public.purger_les_offres_anciennes(integer) is
  'Supprime les offres de France Travail dont la dernière date connue '
  '(actualisation, création, réception) a plus de N jours — 60 par défaut, '
  'jamais moins de 31 —, et les offres saisies à la main sorties de la liste '
  'depuis plus de six mois (0116). Rend le nombre d''offres supprimées.';

revoke all on function public.purger_les_offres_anciennes(integer) from public, anon, authenticated;
grant execute on function public.purger_les_offres_anciennes(integer) to service_role;
