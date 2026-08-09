-- ---------------------------------------------------------------------------
-- 0038 — les réunions qui tombent hors de l'exercice
--
-- Ce que ça change : `registre_des_reunions()` ne montre que l'exercice en
-- cours. Tout ce qui tombe avant ou après n'apparaissait nulle part —
-- 0037 avait ouvert la feuille d'appel d'une telle réunion, mais on ne
-- pouvait toujours pas la retrouver sans en connaître l'adresse.
--
-- Le cas se rencontre dans les deux sens :
--
--   · **avant** — les exercices précédents, dont les réunions restent en base
--     et n'ont pas à disparaître parce qu'une page a été tournée ;
--   · **après** — les réunions tenues depuis la clôture. C'est le cas réel au
--     9 août 2026 : l'exercice enregistré s'est terminé le 31 juillet, et
--     toute réunion tenue depuis tombe de ce côté-là.
--
-- Le second est le plus gênant, parce qu'il est invisible et qu'il grandit
-- tous les jours tant que les dates d'exercice ne sont pas remises à jour.
--
-- CE QUI NE CHANGE PAS
--
-- Les comptes. Une réunion hors bornes n'entre dans aucun total de l'exercice,
-- ici comme ailleurs : ce registre la montre, il ne la compte pas avec les
-- autres. L'assiduité d'un exercice n'a pas à absorber les réunions d'un
-- autre.
-- ---------------------------------------------------------------------------

drop function if exists public.registre_hors_exercice();

create function public.registre_hors_exercice()
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
   * Avant le début de l'exercice — donc un exercice précédent. Faux pour une
   * réunion tenue après la clôture, qui est le cas le plus fréquent tant que
   * les dates n'ont pas été remises à jour.
   */
  avant          boolean
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
         u.retire_le is not null,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         u.tenue_le < b.debut::date
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.loge_id = public.ma_loge()
     and u.retire_le is null
     and u.tenue_le not between b.debut::date and b.fin::date
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom, b.debut
   order by u.tenue_le desc
$$;

comment on function public.registre_hors_exercice() is
  'Les réunions de ma loge qui tombent hors des bornes de l''exercice — avant '
  'comme après. Elles se montrent, elles ne se comptent pas avec les autres.';

revoke all on function public.registre_hors_exercice() from public, anon;
grant execute on function public.registre_hors_exercice() to authenticated;
