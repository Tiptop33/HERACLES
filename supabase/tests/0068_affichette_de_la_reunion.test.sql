-- Tests de la migration 0068_affichette_de_la_reunion.sql.
--
--   · Elsa   référente à Pau-0068
--   · Fabien référent  à Dax-0068 — une autre loge

\set ON_ERROR_STOP on
\o /dev/null

\set elsa   'dddddddd-6800-0000-0000-000000000001'
\set fabien 'dddddddd-6800-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'elsa',   'elsa0068@example.org',   '{"role":"referent"}'),
  (:'fabien', 'fabien0068@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0068-pau', 'Pau — 0068'),
  ('loge-0068-dax', 'Dax — 0068')
on conflict do nothing;

select id as l_pau from public.loge where bubble_id = 'loge-0068-pau' \gset
select id as l_dax from public.loge where bubble_id = 'loge-0068-dax' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0068-elsa',   :'elsa',   'ELLIOT', 'Elsa',   :'l_pau'::uuid),
  ('ref-0068-fabien', :'fabien', 'FABRE',  'Fabien', :'l_dax'::uuid)
on conflict do nothing;

select id as r_elsa from public.referent where bubble_id = 'ref-0068-elsa' \gset

insert into public.reunion (loge_id, tenue_le, ouverte_par) values
  (:'l_pau'::uuid, date '2026-10-14', :'r_elsa'::uuid),
  (:'l_pau'::uuid, date '2026-10-28', :'r_elsa'::uuid);
insert into public.reunion (loge_id, tenue_le, ouverte_par, retire_le, retire_par)
values (:'l_pau'::uuid, date '2026-09-23', :'r_elsa'::uuid, now(), :'r_elsa'::uuid);
insert into public.reunion (loge_id, tenue_le)
values (:'l_dax'::uuid, date '2026-10-28');

select id as seance  from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = date '2026-10-28' \gset
select id as retiree from public.reunion where loge_id = :'l_pau'::uuid and tenue_le = date '2026-09-23' \gset
select id as a_dax   from public.reunion where loge_id = :'l_dax'::uuid \gset

insert into public.candidat (numero, nom, prenom, loge_id, cloture) values
  (6801, 'GAUTIER', 'Inès', :'l_pau'::uuid, null),
  (6802, 'HAMEL',   'Joël', :'l_pau'::uuid, 'Trouvé'),
  (6803, 'IZARD',   'Karl', :'l_dax'::uuid, null);

select id as c_ouvert from public.candidat where numero = 6801 \gset
select id as c_clos   from public.candidat where numero = 6802 \gset
select id as c_dax    from public.candidat where numero = 6803 \gset

-- ---------------------------------------------------------------------------
\echo '— un referent choisit le dossier de l affichette, et le relit'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-6800-0000-0000-000000000001"}';

  select public.verifier(
    public.choisir_l_affichette(:'seance'::uuid, :'c_ouvert'::uuid) = 'ok',
    'un dossier en cours de sa loge se choisit');
  select public.verifier(
    (select numero from public.affichette_de_la_reunion(:'seance'::uuid)) = 6801,
    'et se relit avec son numero');
commit;

-- ---------------------------------------------------------------------------
\echo '— ce qui ne se choisit pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-6800-0000-0000-000000000001"}';

  select public.verifier(
    public.choisir_l_affichette(:'seance'::uuid, :'c_clos'::uuid) = 'candidat',
    'ni un dossier referme');
  select public.verifier(
    public.choisir_l_affichette(:'seance'::uuid, :'c_dax'::uuid) = 'candidat',
    'ni le dossier d une autre loge');
  select public.verifier(
    public.choisir_l_affichette(:'a_dax'::uuid, :'c_ouvert'::uuid) = 'reunion',
    'ni pour la reunion d une autre loge');
  select public.verifier(
    public.choisir_l_affichette(:'retiree'::uuid, :'c_ouvert'::uuid) = 'reunion',
    'ni pour une reunion retiree');
  select public.verifier(
    (select numero from public.affichette_de_la_reunion(:'seance'::uuid)) = 6801,
    'et un refus ne touche pas au choix deja fait');
commit;

-- ---------------------------------------------------------------------------
\echo '— l autre loge ne voit rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-6800-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.affichette_de_la_reunion(:'seance'::uuid)) = 0,
    'le choix d une reunion de Pau ne se lit pas depuis Dax');
commit;

-- ---------------------------------------------------------------------------
\echo '— le choix s efface, et s eteint avec le dossier'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-6800-0000-0000-000000000001"}';
  -- Deux requêtes : une seule verrait l'état d'avant l'effacement.
  select public.verifier(
    public.choisir_l_affichette(:'seance'::uuid, null) = 'ok',
    'choisir « aucun » est accepte');
  select public.verifier(
    (select count(*) from public.affichette_de_la_reunion(:'seance'::uuid)) = 0,
    'et efface le choix');
  select public.choisir_l_affichette(:'seance'::uuid, :'c_ouvert'::uuid);
commit;

update public.candidat set cloture = 'Trouvé' where id = :'c_ouvert'::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"dddddddd-6800-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.affichette_de_la_reunion(:'seance'::uuid)) = 0,
    'un dossier referme depuis le choix ne s imprime plus');
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
\echo '0068 — l affichette de la reunion : tout est vert.'
