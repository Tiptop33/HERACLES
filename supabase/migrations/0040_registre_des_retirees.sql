-- ---------------------------------------------------------------------------
-- 0040 — retrouver ce qui a été retiré
--
-- Ce que ça change : une réunion retirée quittait tous les registres. Elle
-- restait en base, la rendre restait possible, mais **il fallait connaître son
-- adresse** — donc l'avoir notée avant de la retirer. Autant dire qu'elle
-- était perdue.
--
-- `registre_des_reunions(true)` rendait déjà les retirées, mais seulement
-- celles de l'exercice en cours. Or les bornes bougent : une réunion retirée
-- l'an dernier, ou retirée depuis la clôture, retombait dans le même trou.
-- Cette fonction-ci ne regarde pas les dates.
--
-- CE QUI NE CHANGE PAS
--
-- Les comptes. Une réunion retirée n'entre dans aucun total, et la voir ici ne
-- la remet pas au registre : `rendre_une_reunion()` reste le seul geste qui
-- l'y ramène. Retirer n'a jamais été effacer — encore faut-il pouvoir le
-- défaire.
-- ---------------------------------------------------------------------------

drop function if exists public.registre_des_retirees();

create function public.registre_des_retirees()
returns table (
  id             uuid,
  tenue_le       date,
  lieu           text,
  presents       integer,
  excuses        integer,
  absents        integer,
  effectif       integer,
  retiree        boolean,
  retire_par_nom text,
  /**
   * Le jour du retrait, **en heure de Paris**.
   *
   * Converti ici et non à l'affichage : `retire_le` est un horodatage UTC, et
   * un retrait fait après 22 h à Paris se lirait la veille si l'on se
   * contentait de couper la chaîne. L'ordre, lui, suit l'horodatage entier.
   */
  retire_le      date,
  /** Hors des bornes de l'exercice : rendue, elle ne compterait toujours pas. */
  hors_exercice  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  effectif as (
    select count(*)::int as n from public.referent
     where loge_id = public.ma_loge()
  )
  select u.id, u.tenue_le, u.lieu,
         count(*) filter (where a.etat = 'Présent')::int,
         count(*) filter (where a.etat = 'Excusé')::int,
         greatest(e.n - count(*) filter (where a.etat in ('Présent', 'Excusé')), 0)::int,
         e.n,
         true,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         (u.retire_le at time zone 'Europe/Paris')::date,
         u.tenue_le not between b.debut::date and b.fin::date
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.ma_loge()
     and u.retire_le is not null
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom, b.debut, b.fin
   -- La dernière retirée en tête : on cherche presque toujours celle qu'on
   -- vient de retirer par erreur.
   order by u.retire_le desc, u.tenue_le desc
$$;

comment on function public.registre_des_retirees() is
  'Les réunions retirées de ma loge, toutes dates confondues — pour pouvoir '
  'les rendre. Retirer n''est pas effacer : encore faut-il les retrouver.';

revoke all on function public.registre_des_retirees() from public, anon;
grant execute on function public.registre_des_retirees() to authenticated;
