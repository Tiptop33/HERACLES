-- ---------------------------------------------------------------------------
-- 0018 — ranger la liste du collège d'un seul geste
--
-- Ce que ça change : on attrape un titre et on le pose où on veut, au lieu de
-- le faire monter d'un cran à la fois.
--
-- `deplacer_college` (0017) échangeait deux voisins. Elle reste : la poignée
-- qu'on tire ne fonctionne ni au clavier, ni au doigt sur une tablette, et les
-- flèches restent donc à côté. Celle-ci prend l'ordre entier.
--
-- Elle refuse un ordre qui ne correspond pas à la liste — un titre en trop, un
-- titre manquant, un titre deux fois. Ce n'est pas de la méfiance envers
-- l'écran : c'est que deux personnes peuvent ranger la même liste en même
-- temps, et que la seconde travaillerait alors sur une liste qui n'existe
-- plus. Mieux vaut un refus qu'un rangement silencieusement faux.
-- ---------------------------------------------------------------------------

create or replace function public.ranger_college(ordre uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  combien integer;
begin
  if not public.est_admin() then
    raise exception 'Seul un administrateur peut ranger cette liste'
      using errcode = 'insufficient_privilege';
  end if;

  combien := coalesce(array_length(ordre, 1), 0);

  if combien <> (select count(*) from public.college)
     or combien <> (select count(distinct o.id) from unnest(ordre) as o(id))
     or exists (
       select 1 from unnest(ordre) as o(id)
        where not exists (select 1 from public.college c where c.id = o.id)
     )
  then
    raise exception 'L''ordre envoyé ne correspond pas à la liste enregistrée'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.college c
     set rang = (place * 10)::integer
    from unnest(ordre) with ordinality as t(id, place)
   where t.id = c.id;
end;
$$;

comment on function public.ranger_college(uuid[]) is
  'Range la liste du collège dans l''ordre reçu. Refuse un ordre incomplet, '
  'dupliqué ou étranger à la liste — deux personnes peuvent la ranger en même '
  'temps, et un rangement faux ne se voit pas.';

revoke all on function public.ranger_college(uuid[]) from public, anon;
grant execute on function public.ranger_college(uuid[]) to authenticated;
