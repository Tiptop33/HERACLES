-- Tests de la migration 0096_provinces_tenues_par_l_administration.sql.
--
-- Qui est qui :
--   · Ada     administratrice — ajoute, renomme, dépose l'écusson, retire
--   · Rémi    référent        — voit les cartes, ne touche à rien
--   · Camille compte candidat — ni l'un ni l'autre
--
-- Ce qu'on éprouve :
--   * la reprise crée ce qui manque, ne remplit que le vide, rattache une
--     province saisie à la main sous le même nom, et ne recrée pas une
--     province retirée — HERACLES fait foi ;
--   * l'administration ajoute et renomme (nom nettoyé, obligatoire, unique,
--     120 caractères au plus), dépose un écusson au seul chemin permis, et
--     retire une province : ses loges n'ont plus de province ;
--   * les comptes annoncés avant le retrait sont les bons ;
--   * ni un référent, ni un candidat, ni une personne non connectée ne fait
--     aucun de ces gestes ; la mémoire de la reprise reste fermée.
--
-- Chaque contrôle d'accès se joue en devenant la personne (CLAUDE.md).
-- Données fabriquées : provinces, loges et adresses inventées.

\set ON_ERROR_STOP on
\o /dev/null

\set ada     'eeeeeeee-0096-0000-0000-000000000001'
\set remi    'eeeeeeee-0096-0000-0000-000000000002'
\set camille 'eeeeeeee-0096-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',     'ada0096@example.org',     '{"role":"referent"}'),
  (:'remi',    'remi0096@example.org',    '{"role":"referent"}'),
  (:'camille', 'camille0096@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;
update public.profil set role = 'admin' where id = :'ada';

-- --- Fixtures --------------------------------------------------------------
-- Trois provinces Bubble :
--   a : complète ;
--   b : son nom est déjà saisi à la main, en minuscules — elle doit s'y
--       rattacher, pas se doubler ;
--   c : réduite à son `_id`, comme une reprise faite sans jeton.
insert into public.bubble_brut (type_bubble, bubble_id, donnees) values
  ('provinces', 'prov-0096-a', $j${
     "_id": "prov-0096-a",
     "Nom": "Province Alpha 0096",
     "Ecusson": "//essai0096.cdn.bubble.io/a/alpha.png",
     "Created By": "admin_user_essai",
     "Created Date": "2023-05-01T10:00:00.000Z"
   }$j$::jsonb),
  ('provinces', 'prov-0096-b', $j${
     "_id": "prov-0096-b",
     "Nom": "Province Beta 0096",
     "Ecusson": "//essai0096.cdn.bubble.io/b/beta.png"
   }$j$::jsonb),
  ('provinces', 'prov-0096-c', '{"_id": "prov-0096-c"}'::jsonb)
on conflict (type_bubble, bubble_id) do update set donnees = excluded.donnees;

insert into public.provinces (nom_de_la_province) values ('province beta 0096');

insert into public.loge (bubble_id, nom, province_bubble_id) values
  ('loge-0096', 'Loge d''essai 0096', 'prov-0096-a')
on conflict (bubble_id) do nothing;

-- ===========================================================================
\echo '— la reprise crée ce qui manque, et rattache au lieu de doubler'
create temporary table passage_0096 as select * from public.deverser_provinces_bubble();

select id as alpha from public.provinces where bubble_id = 'prov-0096-a' \gset
select id as beta  from public.provinces where bubble_id = 'prov-0096-b' \gset

select public.verifier(
  (select nom_de_la_province = 'Province Alpha 0096'
      and ecusson_provincial_url = '//essai0096.cdn.bubble.io/a/alpha.png'
      and ecusson_provincial is null
      and cree_le = '2023-05-01T10:00:00Z'::timestamptz
     from public.provinces where id = :'alpha'),
  'a : créée, avec son nom, l''adresse de son écusson et sa date');

select public.verifier(
  (select count(*) from public.provinces where lower(nom_de_la_province) = 'province beta 0096') = 1,
  'b : une seule province à ce nom — celle saisie à la main a reçu son identifiant Bubble');
select public.verifier(
  (select nom_de_la_province = 'province beta 0096'
      and ecusson_provincial_url = '//essai0096.cdn.bubble.io/b/beta.png'
     from public.provinces where id = :'beta'),
  'b : le nom saisi reste tel quel, l''adresse de l''écusson, vide, est remplie');

select public.verifier(
  (select nom_de_la_province is null from public.provinces where bubble_id = 'prov-0096-c'),
  'c : créée sans nom — Bubble ne l''a pas donné');

select public.verifier(
  (select count(*) from public.provinces_bubble
    where bubble_id in ('prov-0096-a', 'prov-0096-b', 'prov-0096-c')) = 3,
  'les trois sont notées dans la mémoire de la reprise');

select public.verifier(
  (select province_id = :'alpha'::uuid from public.loge where bubble_id = 'loge-0096'),
  'la loge rejoint sa province');

-- ===========================================================================
\echo '— HERACLES fait foi : un nom ou un écusson changés chez Bubble ne remplacent rien'
update public.bubble_brut set donnees = $j${
     "_id": "prov-0096-a",
     "Nom": "Alpha renommée chez Bubble",
     "Ecusson": "//essai0096.cdn.bubble.io/a/alpha-2027.png"
   }$j$::jsonb
 where type_bubble = 'provinces' and bubble_id = 'prov-0096-a';
update public.bubble_brut set donnees = '{"_id": "prov-0096-c", "Nom": "Province Gamma 0096"}'::jsonb
 where type_bubble = 'provinces' and bubble_id = 'prov-0096-c';

select public.verifier(
  (select creees = 0 from public.deverser_provinces_bubble()),
  'second passage : rien de créé');

select public.verifier(
  (select nom_de_la_province = 'Province Alpha 0096'
      and ecusson_provincial_url = '//essai0096.cdn.bubble.io/a/alpha.png'
     from public.provinces where id = :'alpha'),
  'a : le nom et l''écusson connus restent');
select public.verifier(
  (select nom_de_la_province = 'Province Gamma 0096'
     from public.provinces where bubble_id = 'prov-0096-c'),
  'c : le nom, qui manquait, est rempli');

-- ===========================================================================
\echo '— Ada, administratrice : ajouter, renommer, compter'
insert into public.loge_du_reseau (nom, numero, province_id)
values ('Loge du réseau 0096', '90960', :'alpha'::uuid);

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);

  select public.enregistrer_province(null, '   Province    Delta   0096  ') as delta \gset
  select public.verifier(
    (select nom_de_la_province = 'Province Delta 0096' and bubble_id is null
       from public.provinces where id = :'delta'),
    'ajoutée : espaces autour retirés, espaces répétés réduits');

  select public.enregistrer_province(:'alpha'::uuid, 'Province Alpha corrigée 0096') \gset
  select public.verifier(
    (select nom_de_la_province = 'Province Alpha corrigée 0096' and maj_le >= now() - interval '1 minute'
       from public.provinces where id = :'alpha'),
    'renommée, et la date de mise à jour suit');

  select public.verifier(
    (select (e ->> 'loges')::int = 1 and (e ->> 'loges_du_reseau')::int = 1
            and e ->> 'nom_de_la_province' = 'Province Alpha corrigée 0096'
            and (e ->> 'a_un_ecusson')::boolean = false
       from jsonb_array_elements(public.provinces_a_gerer()) e where e ->> 'id' = :'alpha'),
    'la liste à gérer compte une loge et une loge du réseau');
commit;

\echo '— un nom vide, trop long, déjà pris, ou une province disparue : refusés'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0096-0000-0000-000000000001"}', true);
  begin
    perform public.enregistrer_province(null, 'PROVINCE GAMMA 0096');
    raise exception 'ÉCHEC — deux provinces au même nom';
  exception when unique_violation then
    raise notice '  ok — un nom déjà pris, casse comprise, est refusé';
  end;
  begin
    perform public.enregistrer_province(null, '   ');
    raise exception 'ÉCHEC — une province sans nom';
  exception when check_violation then
    raise notice '  ok — un nom vide est refusé';
  end;
  begin
    perform public.enregistrer_province(null, repeat('x', 121));
    raise exception 'ÉCHEC — un nom de 121 caractères';
  exception when check_violation then
    raise notice '  ok — un nom trop long est refusé';
  end;
  begin
    perform public.enregistrer_province('00000000-0000-0000-0000-000000000096', 'Fantôme');
    raise exception 'ÉCHEC — une province disparue a été renommée';
  exception when no_data_found then
    raise notice '  ok — une province disparue le dit';
  end;
end
$$;

select public.verifier(
  (select count(*) from public.provinces where lower(nom_de_la_province) = 'province gamma 0096') = 1,
  'et rien n''a été écrit');

-- ===========================================================================
\echo '— l''écusson : au seul chemin que la province permet'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.poser_l_ecusson_provincial(:'alpha'::uuid, 'provinces/ecusson/' || :'alpha' || '.png') is null as premier \gset
  select public.verifier(:'premier'::boolean, 'premier écusson : pas d''ancien chemin');
  select public.verifier(
    public.poser_l_ecusson_provincial(:'alpha'::uuid, 'provinces/ecusson/' || :'alpha' || '.webp')
      = 'provinces/ecusson/' || :'alpha' || '.png',
    'le remplacer rend l''ancien chemin, pour que la route efface l''ancien fichier');
commit;

do $$
declare
  alpha uuid := (select id from public.provinces where bubble_id = 'prov-0096-a');
  beta  uuid := (select id from public.provinces where bubble_id = 'prov-0096-b');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0096-0000-0000-000000000001"}', true);
  begin
    perform public.poser_l_ecusson_provincial(alpha, 'candidat/cv/quelqu-un.pdf');
    raise exception 'ÉCHEC — un écusson pointe vers le CV d''un candidat';
  exception when check_violation then
    raise notice '  ok — un chemin hors du rangement des écussons est refusé';
  end;
  begin
    perform public.poser_l_ecusson_provincial(alpha, 'provinces/ecusson/' || beta || '.png');
    raise exception 'ÉCHEC — un écusson pointe vers celui d''une autre province';
  exception when check_violation then
    raise notice '  ok — le chemin d''une autre province est refusé';
  end;
  begin
    perform public.poser_l_ecusson_provincial(alpha, 'provinces/ecusson/' || alpha || '.svg');
    raise exception 'ÉCHEC — un écusson SVG';
  exception when check_violation then
    raise notice '  ok — un format hors liste est refusé';
  end;
end
$$;

-- ===========================================================================
\echo '— Rémi, référent, et Camille, candidate : aucun geste'
do $$
declare
  qui text;
  alpha uuid := (select id from public.provinces where bubble_id = 'prov-0096-a');
begin
  foreach qui in array array['eeeeeeee-0096-0000-0000-000000000002', 'eeeeeeee-0096-0000-0000-000000000003'] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"' || qui || '"}', true);
    begin
      perform public.enregistrer_province(null, 'Province pirate 0096');
      raise exception 'ÉCHEC — % a ajouté une province', qui;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.enregistrer_province(alpha, 'Renommée en douce');
      raise exception 'ÉCHEC — % a renommé une province', qui;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.poser_l_ecusson_provincial(alpha, 'provinces/ecusson/' || alpha || '.png');
      raise exception 'ÉCHEC — % a déposé un écusson', qui;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.retirer_province(alpha);
      raise exception 'ÉCHEC — % a retiré une province', qui;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.provinces_a_gerer();
      raise exception 'ÉCHEC — % a lu la liste à gérer', qui;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  raise notice '  ok — ajouter, renommer, déposer, retirer, compter : tout est refusé';
end
$$;

\echo '— une personne non connectée n''atteint pas les fonctions ; la mémoire reste fermée'
select public.verifier(
  not has_function_privilege('anon', 'public.enregistrer_province(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.retirer_province(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.poser_l_ecusson_provincial(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.provinces_a_gerer()', 'execute'),
  'aucune des quatre fonctions n''est ouverte sans être connecté');
select public.verifier(
  public.refuse('authenticated', 'provinces_bubble') and public.refuse('anon', 'provinces_bubble'),
  'la mémoire de la reprise n''est pas adressable depuis l''application');

-- ===========================================================================
\echo '— retirer : les loges n''ont plus de province, et la reprise ne la recrée pas'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.verifier(
    public.retirer_province(:'alpha'::uuid) = 'provinces/ecusson/' || :'alpha' || '.webp',
    'retirer rend le chemin de l''écusson, que la route efface du seau');
commit;

select public.verifier(
  not exists (select 1 from public.provinces where id = :'alpha'),
  'la province est retirée');
select public.verifier(
  (select province_id is null from public.loge where bubble_id = 'loge-0096')
    and (select province_id is null from public.loge_du_reseau where numero = '90960'),
  'sa loge et sa loge du réseau n''ont plus de province');

select * from public.deverser_provinces_bubble();

select public.verifier(
  not exists (select 1 from public.provinces where bubble_id = 'prov-0096-a'),
  'la reprise suivante ne la recrée pas');
select public.verifier(
  (select province_id is null from public.loge where bubble_id = 'loge-0096'),
  'et la loge reste sans province');

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0096-0000-0000-000000000001"}', true);
  perform public.retirer_province('00000000-0000-0000-0000-000000000096');
  raise exception 'ÉCHEC — retirer une province disparue n''a rien dit';
exception when no_data_found then
  raise notice '  ok — retirer une province disparue le dit';
end
$$;

-- --- Ménage -----------------------------------------------------------------
delete from public.loge_du_reseau where numero = '90960';
delete from public.loge where bubble_id = 'loge-0096';
delete from public.provinces
 where bubble_id like 'prov-0096-%' or nom_de_la_province = 'Province Delta 0096';
delete from public.provinces_bubble where bubble_id like 'prov-0096-%';
delete from public.bubble_brut where bubble_id like 'prov-0096-%';

\echo ''
\echo 'Tous les contrôles de 0096_provinces_tenues_par_l_administration.sql sont passés.'
