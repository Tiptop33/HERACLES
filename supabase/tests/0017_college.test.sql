-- Tests de la migration 0017_college.sql.
--
-- Un référentiel se lit par tout le monde et ne s'écrit que par
-- l'administration. Et retirer un titre de la liste ne doit toucher à aucune
-- fiche : c'est le contraire d'une suppression en cascade, et c'est voulu.
--
--   · Yann    référent — il lit la liste, il ne l'écrit pas
--   · Zoé     administratrice

\set ON_ERROR_STOP on
\o /dev/null

\set yann 'eeeeeeee-1111-0000-0000-000000000017'
\set zoe  'eeeeeeee-1111-0000-0000-000000000018'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'yann', 'yann0017@example.org', '{"role":"referent","nom":"Yann","prenom":"Y"}'),
  (:'zoe',  'zoe0017@example.org',  '{"role":"referent","nom":"Zoe","prenom":"Z"}');
update public.profil set role = 'admin' where id = :'zoe';

-- ---------------------------------------------------------------------------
\echo '— les trois titres nommes sont la, dans l ordre voulu'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select array_agg(nom order by rang)
     from public.college where rang in (10, 20, 30))
   = array['Vénérable Maître', 'Secrétaire', 'Trésorier'],
  'Vénérable Maître, Secrétaire, Trésorier — et pas dans l''ordre alphabétique');

-- ---------------------------------------------------------------------------
\echo '— deux fois le meme titre, a une majuscule pres, est refuse'
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.college (nom) values ('  secrétaire ');
    raise exception 'ÉCHEC — la liste accepte deux fois le même titre';
  exception when unique_violation then
    raise notice '  ok — refusé : la casse et les espaces ne font pas un titre de plus';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— un referent lit la liste, et ne l ecrit pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1111-0000-0000-000000000017"}';

  select public.verifier(
    (select count(*) from public.college) >= 3,
    'Yann voit la liste — son formulaire en a besoin');
commit;

do $$
declare touche integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-1111-0000-0000-000000000017"}', true);
  update public.college set nom = 'Usurpé' where rang = 10;
  get diagnostics touche = row_count;
  if touche <> 0 then
    raise exception 'ÉCHEC — un référent a renommé un titre';
  end if;
  raise notice '  ok — la policy ne lui donne aucune ligne à écrire';
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-1111-0000-0000-000000000017"}', true);
  begin
    perform public.deplacer_college(
      (select id from public.college where rang = 30), 'haut');
    raise exception 'ÉCHEC — un référent a rangé la liste';
  exception when insufficient_privilege then
    raise notice '  ok — ranger la liste est réservé à l''administration';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une administratrice ajoute, renomme, et range'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1111-0000-0000-000000000018"}';

  insert into public.college (nom) values ('Orateur');
  select public.verifier(
    (select count(*) from public.college where nom = 'Orateur') = 1,
    'Zoé ajoute « Orateur »');

  update public.college set nom = 'Orateur adjoint' where nom = 'Orateur';
  select public.verifier(
    (select count(*) from public.college where nom = 'Orateur adjoint') = 1,
    'et le renomme');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1111-0000-0000-000000000018"}';

  -- Trésorier est troisième. On le monte : il doit passer devant Secrétaire.
  select public.deplacer_college(
    (select id from public.college where nom = 'Trésorier'), 'haut');

  select public.verifier(
    (select array_agg(nom order by rang) from public.college
      where nom in ('Vénérable Maître', 'Secrétaire', 'Trésorier'))
     = array['Vénérable Maître', 'Trésorier', 'Secrétaire'],
    'Trésorier est monté d''un cran');

  select public.deplacer_college(
    (select id from public.college where nom = 'Trésorier'), 'bas');

  select public.verifier(
    (select array_agg(nom order by rang) from public.college
      where nom in ('Vénérable Maître', 'Secrétaire', 'Trésorier'))
     = array['Vénérable Maître', 'Secrétaire', 'Trésorier'],
    'et redescendu — l''ordre voulu revient');
commit;

-- ---------------------------------------------------------------------------
\echo '— monter le premier ne casse rien, et ne fait rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1111-0000-0000-000000000018"}';

  select public.deplacer_college(
    (select id from public.college order by rang, nom limit 1), 'haut');

  select public.verifier(
    (select nom from public.college order by rang, nom limit 1) = 'Vénérable Maître',
    'le premier reste le premier');
commit;

-- ---------------------------------------------------------------------------
\echo '— la liste dit combien de referents portent chaque titre'
-- ---------------------------------------------------------------------------
insert into public.loge (bubble_id, nom) values ('loge-0017', 'Nancy — 0017')
on conflict do nothing;

insert into public.referent (bubble_id, nom, prenom, email, college, loge_id) values
  ('ref-0017-un',   'Un',   'A', 'un0017@example.org',   'Trésorier',
   (select id from public.loge where bubble_id = 'loge-0017')),
  ('ref-0017-deux', 'Deux', 'B', 'deux0017@example.org', '  trésorier ',
   (select id from public.loge where bubble_id = 'loge-0017'))
on conflict do nothing;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"eeeeeeee-1111-0000-0000-000000000018"}';

  select public.verifier(
    (select utilisations from public.liste_college() where nom = 'Trésorier') = 2,
    'deux référents portent ce titre — espaces et majuscules confondus');
commit;

-- ---------------------------------------------------------------------------
\echo '— retirer un titre ne touche a aucune fiche'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-1111-0000-0000-000000000018"}', true);
  delete from public.college where nom = 'Trésorier';
end
$$;

select public.verifier(
  (select count(*) from public.referent
    where bubble_id in ('ref-0017-un', 'ref-0017-deux')
      and college is not null) = 2,
  'les deux fiches gardent le titre qu''elles portaient — pas de cascade');

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
select public.verifier(
  public.refuse('anon', 'college'),
  'sans session, la table n''est même pas adressable');

\echo ''
\echo 'Tous les contrôles de 0017_college.sql sont passés.'
