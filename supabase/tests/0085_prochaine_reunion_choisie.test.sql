-- Tests de la migration 0085_prochaine_reunion_choisie.sql.
--
--   · Elsa   référente à Pau-0085
--   · Fabien référent  à Dax-0085 — une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set elsa   'dddddddd-8500-0000-0000-000000000001'
\set fabien 'dddddddd-8500-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'elsa',   'elsa0085@example.org',   '{"role":"referent"}'),
  (:'fabien', 'fabien0085@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0085-pau', 'Pau — 0085'),
  ('loge-0085-dax', 'Dax — 0085')
on conflict do nothing;

select id as l_pau from public.loge where bubble_id = 'loge-0085-pau' \gset
select id as l_dax from public.loge where bubble_id = 'loge-0085-dax' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0085-elsa',   :'elsa',   'ELLIOT', 'Elsa',   :'l_pau'::uuid),
  ('ref-0085-fabien', :'fabien', 'FABRE',  'Fabien', :'l_dax'::uuid)
on conflict do nothing;

select id as r_elsa from public.referent where bubble_id = 'ref-0085-elsa' \gset

insert into public.reunion (loge_id, tenue_le, ouverte_par) values
  (:'l_pau'::uuid, date '2026-10-28', :'r_elsa'::uuid);
insert into public.reunion (loge_id, tenue_le, ouverte_par, retire_le, retire_par)
values (:'l_pau'::uuid, date '2026-09-23', :'r_elsa'::uuid, now(), :'r_elsa'::uuid);
insert into public.reunion (loge_id, tenue_le)
values (:'l_dax'::uuid, date '2026-10-28');

select id as seance  from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = date '2026-10-28' \gset
select id as retiree from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = date '2026-09-23' \gset
select id as a_dax   from public.reunion where loge_id = :'l_dax'::uuid \gset

-- ---------------------------------------------------------------------------
\echo '— sans date dite ni reunion suivante, rien : l application calcule'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-8500-0000-0000-000000000001"}';
  select public.verifier(
    (select prochaine_reunion from public.commission_de_la_reunion(:'seance'::uuid)) is null,
    'aucune date tant que rien n est dit');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent dit la date, le compte rendu l imprime'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-8500-0000-0000-000000000001"}';
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'seance'::uuid, date '2026-11-12') = 'ok',
    'une date apres la reunion se retient');
  select public.verifier(
    (select prochaine_reunion from public.commission_de_la_reunion(:'seance'::uuid)) = date '2026-11-12',
    'et le compte rendu l imprime');
commit;

-- La date dite passe devant la réunion déjà inscrite au registre.
insert into public.reunion (loge_id, tenue_le, ouverte_par) values
  (:'l_pau'::uuid, date '2026-11-25', :'r_elsa'::uuid);

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-8500-0000-0000-000000000001"}';
  select public.verifier(
    (select prochaine_reunion from public.commission_de_la_reunion(:'seance'::uuid)) = date '2026-11-12',
    'la date dite passe devant le registre');
commit;

-- ---------------------------------------------------------------------------
\echo '— ce qui ne se dit pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-8500-0000-0000-000000000001"}';
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'seance'::uuid, date '2026-10-28') = 'date',
    'ni le jour meme');
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'seance'::uuid, date '2026-10-01') = 'date',
    'ni une date passee');
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'a_dax'::uuid, date '2026-11-12') = 'reunion',
    'ni pour la reunion d une autre loge');
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'retiree'::uuid, date '2026-11-12') = 'reunion',
    'ni pour une reunion retiree');
  select public.verifier(
    (select prochaine_reunion from public.commission_de_la_reunion(:'seance'::uuid)) = date '2026-11-12',
    'et un refus ne touche pas a la date deja dite');
commit;

select public.verifier(
  (select prochaine_le from public.reunion where id = :'a_dax'::uuid) is null,
  'la reunion de Dax n a pas ete touchee');

-- ---------------------------------------------------------------------------
\echo '— l autre loge ne voit rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-8500-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.commission_de_la_reunion(:'seance'::uuid)) = 0,
    'la reunion de Pau ne se lit pas depuis Dax');
commit;

-- ---------------------------------------------------------------------------
\echo '— effacer la date rend la main au registre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-8500-0000-0000-000000000001"}';
  select public.verifier(
    public.choisir_la_prochaine_reunion(:'seance'::uuid, null) = 'ok',
    'effacer est accepte');
  select public.verifier(
    (select prochaine_reunion from public.commission_de_la_reunion(:'seance'::uuid)) = date '2026-11-25',
    'et le registre reprend la main');
commit;

do $$
begin
  set local role authenticated;
  begin
    perform 1 from public.reunion limit 1;
    raise exception 'ÉCHEC — la table des reunions s ouvre en direct';
  exception when insufficient_privilege then
    raise notice '  ok — la table reste fermee : tout passe par les fonctions';
  end;
end
$$;

\o
\echo '0085 — la prochaine reunion dite sur la feuille : tout est vert.'
