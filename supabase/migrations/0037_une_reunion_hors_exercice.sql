-- ---------------------------------------------------------------------------
-- 0037 — la feuille d'appel s'ouvre, même hors exercice
--
-- Ce que ça change : on cliquait « Ouvrir l'appel », la réunion était créée en
-- base, et rien n'apparaissait à l'écran.
--
-- CE QUI CLOCHAIT
--
-- L'écran cherchait la réunion ouverte **dans le registre**, et
-- `registre_des_reunions()` ne rend que l'exercice en cours. Une réunion tenue
-- hors de ces bornes existait donc sans être visible nulle part — et l'on
-- pouvait la rouvrir indéfiniment sans jamais rien voir.
--
-- Ce n'est pas un cas d'école. L'exercice enregistré au 9 août 2026 va du
-- 1er septembre 2025 au 31 juillet 2026 : **il est terminé**. Toute réunion
-- tenue aujourd'hui tombe hors bornes, et l'écran était inutilisable dès le
-- premier essai.
--
-- CE QU'ON CORRIGE, ET CE QU'ON NE CORRIGE PAS
--
-- Le registre garde son rôle : il compte l'exercice, et une réunion hors
-- bornes n'y entre pas. C'est juste — l'assiduité d'un exercice ne doit pas
-- absorber les réunions d'un autre.
--
-- Ce qui change, c'est qu'une réunion se lit désormais par son identifiant,
-- sans passer par le registre. Elle porte alors `hors_exercice`, et l'écran le
-- dit plutôt que de disparaître en silence — une réunion invisible est pire
-- qu'une réunion signalée comme hors période.
-- ---------------------------------------------------------------------------

drop function if exists public.la_reunion(uuid);

create function public.la_reunion(reunion_choisie uuid)
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
  /** Hors des bornes de l'exercice : elle ne compte dans aucun total. */
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
         u.retire_le is not null,
         nullif(btrim(coalesce(q.prenom, '') || ' ' || coalesce(q.nom, '')), ''),
         u.tenue_le not between b.debut::date and b.fin::date
    from public.reunion u
    join bornes b on true
    join effectif e on true
    left join public.appel a on a.reunion_id = u.id
    left join public.referent q on q.id = u.retire_par
   where u.id = reunion_choisie
     and u.loge_id = public.ma_loge()
   group by u.id, u.tenue_le, u.lieu, u.retire_le, e.n, q.prenom, q.nom, b.debut, b.fin
$$;

comment on function public.la_reunion(uuid) is
  'Une réunion de ma loge, par son identifiant, avec ses comptes — que ses '
  'dates tombent ou non dans l''exercice. Le registre, lui, ne montre que '
  'l''exercice : c''est ce qui rendait une réunion hors bornes invisible.';

revoke all on function public.la_reunion(uuid) from public, anon;
grant execute on function public.la_reunion(uuid) to authenticated;
