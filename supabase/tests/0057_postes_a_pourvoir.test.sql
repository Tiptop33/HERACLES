-- Tests de la migration 0057_postes_a_pourvoir.sql.
--
--   · Théo référent à Albi-0057 — il remonte les postes
--   · Uma  référente à Albi-0057 — même loge
--   · Vic  référent à Rodez-0057 — une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set theo 'aaaaaaaa-5700-0000-0000-000000000191'
\set uma  'aaaaaaaa-5700-0000-0000-000000000192'
\set vic  'aaaaaaaa-5700-0000-0000-000000000193'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'theo', 'theo0057@example.org', '{"role":"referent"}'),
  (:'uma',  'uma0057@example.org',  '{"role":"referent"}'),
  (:'vic',  'vic0057@example.org',  '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0057-albi',  'Albi — 0057'),
  ('loge-0057-rodez', 'Rodez — 0057')
on conflict do nothing;

select id as l_albi  from public.loge where bubble_id = 'loge-0057-albi'  \gset
select id as l_rodez from public.loge where bubble_id = 'loge-0057-rodez' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0057-theo', :'theo', 'THOMAS', 'Théo', 'theo0057@example.org', :'l_albi'::uuid),
  ('ref-0057-uma',  :'uma',  'URBAIN', 'Uma',  'uma0057@example.org',  :'l_albi'::uuid),
  ('ref-0057-vic',  :'vic',  'VIDAL',  'Vic',  'vic0057@example.org',  :'l_rodez'::uuid)
on conflict do nothing;

select id as r_theo from public.referent where bubble_id = 'ref-0057-theo' \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 60, current_date + 60)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

insert into public.reunion (loge_id, tenue_le, ouverte_par) values
  (:'l_albi'::uuid,  current_date - 5, :'r_theo'::uuid),
  (:'l_rodez'::uuid, current_date - 5, (select id from public.referent where bubble_id = 'ref-0057-vic'));

select id as seance    from public.reunion where loge_id = :'l_albi'::uuid  \gset
select id as chez_vic  from public.reunion where loge_id = :'l_rodez'::uuid \gset

-- ---------------------------------------------------------------------------
\echo '— noter un poste, et le retrouver sur l affiche de sa loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.noter_un_poste('6 ARCHITECTES', 'SAS EXEMPLE', 'Albi',
                               'Camille EXEMPLE', 'recrutement@exemple.test') as un \gset
  select public.noter_un_poste('CHARGÉ D''AFFAIRES') as deux \gset
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';

  select public.verifier(
    (select count(*) from public.postes_a_pourvoir(:'seance'::uuid)) = 2,
    'les deux postes notes');

  select public.verifier(
    (select societe from public.postes_a_pourvoir(:'seance'::uuid) where id = :'un'::uuid)
      = 'SAS EXEMPLE'
    and (select contact from public.postes_a_pourvoir(:'seance'::uuid) where id = :'un'::uuid)
      = 'Camille EXEMPLE',
    'avec la societe et la personne a joindre');
commit;

-- ---------------------------------------------------------------------------
\echo '— l intitule seul suffit : un poste se remonte avant d etre complet'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select societe from public.postes_a_pourvoir(:'seance'::uuid) where id = :'deux'::uuid) is null,
    'le second n a ni societe ni contact, et existe quand meme');
commit;

-- ---------------------------------------------------------------------------
\echo '— mais un poste sans intitule n est pas un poste'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  begin
    perform public.noter_un_poste('   ');
    raise exception 'ÉCHEC — un poste vide a ete accepte';
  exception when check_violation then
    raise notice '  ok — l intitule est exige';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— toute la loge voit les postes, pas seulement celui qui les note'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000192"}';
  select public.verifier(
    (select count(*) from public.postes_a_pourvoir(:'seance'::uuid)) = 2,
    'Uma voit les deux postes de sa loge');
commit;

-- ---------------------------------------------------------------------------
\echo '— rien ne franchit la cloison entre loges'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000193"}';

  select public.verifier(
    (select count(*) from public.postes_a_pourvoir(:'chez_vic'::uuid)) = 0,
    'Rodez n a aucun poste : ceux d Albi ne lui appartiennent pas');

  select public.verifier(
    (select count(*) from public.postes_a_pourvoir(:'seance'::uuid)) = 0,
    'et la reunion d Albi ne lui rend rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— retirer un poste le sort de l affiche, sans effacer sa ligne'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000192"}';
  select public.verifier(
    public.retirer_un_poste(:'deux'::uuid),
    'Uma retire le second poste');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.postes_a_pourvoir(:'seance'::uuid)) = 1,
    'l affiche n en porte plus qu un');
commit;

select public.verifier(
  (select count(*) from public.poste_a_pourvoir where id = :'deux'::uuid) = 1,
  'mais la ligne est toujours la');

select public.verifier(
  (select retire_par from public.poste_a_pourvoir where id = :'deux'::uuid)
    = (select id from public.referent where bubble_id = 'ref-0057-uma'),
  'et l on sait qui l a retiree');

-- ---------------------------------------------------------------------------
\echo '— retirer deux fois ne fait rien de plus'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    public.retirer_un_poste(:'deux'::uuid) = false,
    'le second passage rend faux');
commit;

-- ---------------------------------------------------------------------------
\echo '— et une autre loge ne retire pas ce qui n est pas a elle'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000193"}';
  select public.verifier(
    public.retirer_un_poste(:'un'::uuid) = false,
    'Vic n obtient rien');
commit;

select public.verifier(
  (select retire_le from public.poste_a_pourvoir where id = :'un'::uuid) is null,
  'et le poste d Albi est intact');

-- ---------------------------------------------------------------------------
\echo '— l ecran lit la meme liste, sans reunion ouverte'
-- ---------------------------------------------------------------------------
-- Le cadre de l'écran s'affiche même quand aucune feuille n'est ouverte : il
-- lui faut donc une lecture qui ne demande pas de réunion. C'est la même liste.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.mes_postes_a_pourvoir()) = 1,
    'Theo voit son poste ouvert sans passer par une reunion');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000193"}';
  select public.verifier(
    (select count(*) from public.mes_postes_a_pourvoir()) = 0,
    'et Vic, d une autre loge, ne voit rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— la table est fermee : rien ne se lit ni ne s ecrit en direct'
-- ---------------------------------------------------------------------------
-- Comme `reunion` : RLS activée, aucune policy. Tout passe par les fonctions,
-- et une requête qui oublierait son `where` ne rendrait rien.
do $$
declare
  vues integer;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select count(*) into vues from public.poste_a_pourvoir;
  if vues > 0 then
    raise exception 'ÉCHEC — la table se lit en direct';
  end if;
  raise notice '  ok — la table ne rend rien en direct';
exception when insufficient_privilege then
  raise notice '  ok — la lecture directe est refusée';
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.postes_a_pourvoir('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu lire les postes';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne lit pas les postes';
  end;
  begin
    perform public.noter_un_poste('Intrus');
    raise exception 'ÉCHEC — anon a pu noter un poste';
  exception when insufficient_privilege then
    raise notice '  ok — ni n en note';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0057_postes_a_pourvoir.sql sont passés.'
