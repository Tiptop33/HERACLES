-- Tests de la migration 0018_ranger_college.sql.
--
-- Ranger d'un geste veut dire envoyer l'ordre entier. Ce qui compte ici, ce
-- n'est pas que le rangement marche — c'est qu'il refuse un ordre qui ne
-- correspond plus à la liste. Deux personnes peuvent la ranger en même temps,
-- et un rangement faux ne se voit pas.
--
--   · Alban   administrateur

\set ON_ERROR_STOP on
\o /dev/null

\set alban 'eeeeeeee-2222-0000-0000-000000000018'
\set bea   'eeeeeeee-2222-0000-0000-000000000019'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alban', 'alban0018@example.org', '{"role":"referent","nom":"Alban","prenom":"A"}'),
  (:'bea',   'bea0018@example.org',   '{"role":"referent","nom":"Bea","prenom":"B"}');
update public.profil set role = 'admin' where id = :'alban';

-- Une liste à nous, pour ne pas dépendre de ce que 0017 a semé.
delete from public.college;
insert into public.college (nom, rang) values
  ('Premier', 10), ('Deuxième', 20), ('Troisième', 30), ('Quatrième', 40);

select id as un      from public.college where nom = 'Premier'   \gset
select id as deux    from public.college where nom = 'Deuxième'  \gset
select id as trois   from public.college where nom = 'Troisième' \gset
select id as quatre  from public.college where nom = 'Quatrième' \gset

-- ---------------------------------------------------------------------------
\echo '— un ordre complet range la liste'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-2222-0000-0000-000000000018"}';

  -- Le dernier passe en tête, les autres suivent : c'est ce que fait une
  -- poignée qu'on tire de bas en haut.
  select public.ranger_college(array[:'quatre', :'un', :'deux', :'trois']::uuid[]);

  select public.verifier(
    (select array_agg(nom order by rang) from public.college)
     = array['Quatrième', 'Premier', 'Deuxième', 'Troisième'],
    'la liste suit l''ordre envoyé');
commit;

-- ---------------------------------------------------------------------------
\echo '— un ordre incomplet est refuse'
-- ---------------------------------------------------------------------------
do $$
declare avant text[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-2222-0000-0000-000000000018"}', true);
  select array_agg(nom order by rang) into avant from public.college;
  begin
    perform public.ranger_college(
      array(select id from public.college order by rang limit 3));
    raise exception 'ÉCHEC — une liste rangée à trois quarts a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — refusé : il manque un titre';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— un titre deux fois est refuse'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-2222-0000-0000-000000000018"}', true);
  begin
    perform public.ranger_college(
      (select array[c.id, c.id, c.id, c.id] from public.college c order by c.rang limit 1));
    raise exception 'ÉCHEC — le même titre quatre fois a été accepté';
  exception when invalid_parameter_value then
    raise notice '  ok — refusé : un titre ne peut pas occuper quatre places';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— un identifiant etranger a la liste est refuse'
-- ---------------------------------------------------------------------------
do $$
declare trois_premiers uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-2222-0000-0000-000000000018"}', true);
  select array(select id from public.college order by rang limit 3) into trois_premiers;
  begin
    perform public.ranger_college(
      trois_premiers || '00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — un identifiant inventé a été rangé dans la liste';
  exception when invalid_parameter_value then
    raise notice '  ok — refusé : cet identifiant n''appartient pas à la liste';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et rien n a bouge apres ces trois refus'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select array_agg(nom order by rang) from public.college)
   = array['Quatrième', 'Premier', 'Deuxième', 'Troisième'],
  'la liste est restée telle qu''elle était — un refus ne range pas à moitié');

-- ---------------------------------------------------------------------------
\echo '— un referent ne range pas la liste'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-2222-0000-0000-000000000019"}', true);
  begin
    perform public.ranger_college(array(select id from public.college));
    raise exception 'ÉCHEC — une référente a rangé la liste';
  exception when insufficient_privilege then
    raise notice '  ok — c''est réservé à l''administration';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.ranger_college(array[]::uuid[]);
    raise exception 'ÉCHEC — anon a pu appeler le rangement';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

-- On remet la liste de 0017 pour les fichiers suivants.
delete from public.college;
insert into public.college (nom, rang) values
  ('Vénérable Maître', 10), ('Secrétaire', 20), ('Trésorier', 30)
on conflict do nothing;

\echo ''
\echo 'Tous les contrôles de 0018_ranger_college.sql sont passés.'
