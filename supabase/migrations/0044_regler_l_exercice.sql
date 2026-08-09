-- ---------------------------------------------------------------------------
-- 0044 — les dates d'exercice se règlent depuis les paramètres
--
-- Ce que ça change : jusqu'ici elles ne se changeaient qu'en base. Il aura
-- fallu une migration pour corriger une date de fin périmée (0043), et il en
-- aurait fallu une chaque année. Un exercice, ça se referme tous les douze
-- mois : ce n'est pas une affaire de programme.
--
-- CE QUE CES DEUX DATES COMMANDENT
--
-- Tout ce qui compte sur l'écran « Réunion » :
--
--   · quelles réunions entrent au registre de l'exercice, et lesquelles
--     tombent dans « Le registre de l'exercice passé » ;
--   · l'assiduité affichée sous chaque nom à l'appel — présences et excuses
--     ne sont comptées qu'entre ces deux bornes.
--
-- Une fin dépassée ne casse rien : elle met simplement tous les compteurs à
-- zéro, silencieusement. C'est exactement ce qui s'est produit après le
-- 31 juillet 2026, et personne ne pouvait le corriger depuis l'application.
--
-- QUI Y TOUCHE
--
-- L'administrateur seulement, comme le reste des paramètres. Ces dates valent
-- pour toutes les loges à la fois : la table `parametre` n'a qu'une ligne.
-- ---------------------------------------------------------------------------

create or replace function public.l_exercice()
returns table (debut date, fin date)
language sql
stable
security definer
set search_path = public
as $$
  select p.date_depart::date, p.date_fin::date
    from public.parametre p where p.id
$$;

comment on function public.l_exercice() is
  'Les deux bornes de l''exercice. Lisible par toute session : ce sont les '
  'dates du calendrier de la loge, pas un secret.';

revoke all on function public.l_exercice() from public, anon;
grant execute on function public.l_exercice() to authenticated;

-- ---------------------------------------------------------------------------
-- Les régler
--
-- Rend un mot plutôt qu'un booléen : deux refus différents méritent deux
-- phrases différentes.
--
--   'regle'   — c'est fait
--   'ordre'   — la fin précède le début, ou l'égale
--
-- Le manque de droit lève : ce n'est pas un cas de figure, c'est une porte
-- fermée.
-- ---------------------------------------------------------------------------
drop function if exists public.regler_l_exercice(date, date);

create function public.regler_l_exercice(debut date, fin date)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Seul un administrateur règle les dates d''exercice'
      using errcode = 'insufficient_privilege';
  end if;

  -- Un exercice qui finit avant de commencer mettrait tous les compteurs à
  -- zéro sans que rien ne le signale : c'est la panne qu'on vient de vivre,
  -- en pire, parce qu'elle serait volontaire.
  if fin <= debut then
    return 'ordre';
  end if;

  insert into public.parametre (id, date_depart, date_fin)
  values (true, debut, fin)
  on conflict (id) do update
    set date_depart = excluded.date_depart,
        date_fin    = excluded.date_fin;

  return 'regle';
end
$$;

comment on function public.regler_l_exercice(date, date) is
  'Pose les deux bornes de l''exercice. Administrateur seulement : elles '
  'valent pour toutes les loges, et commandent toute l''assiduité.';

revoke all on function public.regler_l_exercice(date, date) from public, anon;
grant execute on function public.regler_l_exercice(date, date) to authenticated;
