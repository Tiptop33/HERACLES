-- Tests de la migration 0074_valider_le_cv_anonyme_dans_la_loge.sql.
--
--   · Rose   référente du dossier 7401, à Pau-0074
--   · Simon  autre référent de Pau-0074           — valide aussi
--   · Ugo    référent de Tarbes-0074, parrain du dossier — ne valide pas
--   · Vera   référente de Tarbes-0074            — ne voit rien

\set ON_ERROR_STOP on
\o /dev/null

\set rose  'cececece-7400-0000-0000-000000000001'
\set simon 'cececece-7400-0000-0000-000000000002'
\set ugo   'cececece-7400-0000-0000-000000000003'
\set vera  'cececece-7400-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'rose',  'rose0074@example.org',  '{"role":"referent"}'),
  (:'simon', 'simon0074@example.org', '{"role":"referent"}'),
  (:'ugo',   'ugo0074@example.org',   '{"role":"referent"}'),
  (:'vera',  'vera0074@example.org',  '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0074-pau',    'Pau — 0074'),
  ('loge-0074-tarbes', 'Tarbes — 0074')
on conflict do nothing;
select id as l_pau    from public.loge where bubble_id = 'loge-0074-pau' \gset
select id as l_tarbes from public.loge where bubble_id = 'loge-0074-tarbes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, loge_id) values
  ('ref-0074-rose',  :'rose',  'ROUX',   'Rose',  :'l_pau'::uuid),
  ('ref-0074-simon', :'simon', 'SALLES', 'Simon', :'l_pau'::uuid),
  ('ref-0074-ugo',   :'ugo',   'URBAIN', 'Ugo',   :'l_tarbes'::uuid),
  ('ref-0074-vera',  :'vera',  'VIDAL',  'Vera',  :'l_tarbes'::uuid)
on conflict do nothing;
select id as r_rose  from public.referent where bubble_id = 'ref-0074-rose' \gset
select id as r_simon from public.referent where bubble_id = 'ref-0074-simon' \gset
select id as r_ugo   from public.referent where bubble_id = 'ref-0074-ugo' \gset

-- 7401 : suivi par Rose, présenté par Ugo, qui siège dans une autre loge.
-- 7402 : un dossier de la loge sans référent désigné.
insert into public.candidat (numero, nom, prenom, loge_id, referent_id, parrain_id,
                             type_emploi, emploi_recherche) values
  (7401, 'ANONYME', 'Anna', :'l_pau'::uuid, :'r_rose'::uuid, :'r_ugo'::uuid, 'emploi', 'Comptable'),
  (7402, 'SANSREF', 'Bob',  :'l_pau'::uuid, null,            null,           'stage',  'Stage de vente');

select id as c1 from public.candidat where numero = 7401 \gset
select id as c2 from public.candidat where numero = 7402 \gset

-- ---------------------------------------------------------------------------
\echo '— un autre referent de la loge valide, et sa signature est gardee'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cececece-7400-0000-0000-000000000002"}';
  select public.verifier(
    (select peut_valider from public.etat_du_cv_anonyme(:'c1'::uuid)),
    'le bandeau lui propose de valider');
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, true) = 'valide',
    'Simon valide le CV d un dossier qu il ne suit pas');
commit;

select public.verifier(
  (select cv_anonyme_valide_par = :'r_simon'::uuid and cv_anonyme_valide_le is not null
     from public.candidat where id = :'c1'::uuid),
  'la validation est signee de Simon');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cececece-7400-0000-0000-000000000001"}';
  select public.verifier(
    (select valide_par = 'Simon SALLES' and peut_valider from public.etat_du_cv_anonyme(:'c1'::uuid)),
    'la referente du dossier voit qui a valide, et peut toujours valider');
  select public.verifier(
    public.valider_cv_anonyme(:'c1'::uuid, false) = 'retire',
    'et peut retirer la validation d un autre');
commit;

-- ---------------------------------------------------------------------------
\echo '— un dossier sans referent designe se valide aussi'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cececece-7400-0000-0000-000000000002"}';
  select public.verifier(
    public.valider_cv_anonyme(:'c2'::uuid, true) = 'valide',
    'personne ne suit encore Bob : un referent de la loge valide quand meme');
commit;

-- ---------------------------------------------------------------------------
\echo '— hors de la loge, on ne valide pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cececece-7400-0000-0000-000000000003"}';
  select public.verifier(
    (select not peut_valider from public.etat_du_cv_anonyme(:'c1'::uuid)),
    'le parrain d une autre loge voit l etat, sans bouton');
commit;

do $$
declare
  dossier uuid := (select id from public.candidat where numero = 7401);
  qui text;
begin
  foreach qui in array array[
    'cececece-7400-0000-0000-000000000003',  -- le parrain, d'une autre loge
    'cececece-7400-0000-0000-000000000004'   -- une referente d'une autre loge
  ] loop
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', qui)::text, true);
    begin
      perform public.valider_cv_anonyme(dossier, true);
      raise exception 'ÉCHEC — % a valide hors de sa loge', qui;
    exception when insufficient_privilege then
      raise notice '  ok — % ne valide pas hors de sa loge', qui;
    end;
  end loop;
end
$$;

-- La table, elle, ne se laisse toujours pas écrire directement (0073).
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cececece-7400-0000-0000-000000000003"}';
  update public.candidat
     set cv_anonyme_valide_le = now(), cv_anonyme_valide_par = :'r_ugo'::uuid
   where id = :'c1'::uuid;
commit;
select public.verifier(
  (select cv_anonyme_valide_le is null from public.candidat where id = :'c1'::uuid),
  'le parrain ne se valide pas le CV par la table');

\o
\echo '0074 — tout referent de la loge valide le CV anonyme : tout est vert.'
