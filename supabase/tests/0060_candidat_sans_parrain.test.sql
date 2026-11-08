-- Tests de la migration 0060_candidat_sans_parrain.sql.
--
--   · Sacha  référent à Lille-0060 — il ouvre un dossier sans parrain
--   · Théo   référent à Metz-0060 — une autre loge
--   · Ugo    un compte sans fiche de référent

\set ON_ERROR_STOP on
\o /dev/null

\set sacha 'aaaaaaaa-6000-0000-0000-000000000001'
\set theo  'aaaaaaaa-6000-0000-0000-000000000002'
\set ugo   'aaaaaaaa-6000-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sacha', 'sacha0060@example.org', '{"role":"referent","nom":"Sacha","prenom":"S"}'),
  (:'theo',  'theo0060@example.org',  '{"role":"referent","nom":"Theo","prenom":"T"}'),
  (:'ugo',   'ugo0060@example.org',   '{"role":"referent","nom":"Ugo","prenom":"U"}')
on conflict do nothing;

insert into public.loge (bubble_id, nom, prochain_numero_candidat) values
  ('loge-0060-lille', 'Lille — 0060', 7),
  ('loge-0060-metz',  'Metz — 0060',  null)
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0060-sacha', :'sacha', 'Sacha', 'S', 'sacha0060@example.org',
   (select id from public.loge where bubble_id = 'loge-0060-lille')),
  ('ref-0060-theo',  :'theo',  'Theo',  'T', 'theo0060@example.org',
   (select id from public.loge where bubble_id = 'loge-0060-metz'))
on conflict do nothing;

select encode(sha256('jeton-0060-candidat-1'::bytea), 'hex') as e_c1 \gset

-- ---------------------------------------------------------------------------
\echo '— le referent ouvre un dossier sans parrain'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000001"}';
  select (public.inviter_un_candidat('  Zoe0060@Example.org ', :'e_c1') ->> 'candidat_id') as zoe \gset
commit;

select public.verifier(
  (select numero from public.candidat where id = :'zoe'::uuid) = 8
    and (select email from public.candidat where id = :'zoe'::uuid) = 'zoe0060@example.org'
    and (select referent_id from public.candidat where id = :'zoe'::uuid) is null
    and (select loge_id from public.candidat where id = :'zoe'::uuid)
        = (select id from public.loge where bubble_id = 'loge-0060-lille'),
  'le dossier s''ouvre dans sa loge, numéro suivant, sans référent, adresse en minuscules');

begin;
  set local role service_role;
  select public.verifier(
    (select valable from public.candidature_par_empreinte(:'e_c1'))
      and (select email from public.candidature_par_empreinte(:'e_c1')) = 'zoe0060@example.org',
    'le lien du candidat ouvre sa fiche');

  select public.verifier(
    not exists (select 1 from public.parrainages_a_relancer() r
                 join public.parrainage p on p.id = r.id where p.candidat_id = :'zoe'::uuid),
    'aucune relance de parrain pour un dossier sans parrain');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000001"}';
  select public.verifier(
    (select etat from public.parrainages_de_ma_loge() where candidat_id = :'zoe'::uuid) = 'attente_candidat'
      and (select parrain_email from public.parrainages_de_ma_loge() where candidat_id = :'zoe'::uuid) is null,
    'le tableau de suivi le montre, en attente du candidat, sans parrain');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000002"}';
  select public.verifier(
    not exists (select 1 from public.parrainages_de_ma_loge() where candidat_id = :'zoe'::uuid),
    'Théo, à Metz, ne le voit pas');
commit;

-- ---------------------------------------------------------------------------
\echo '— les refus'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6000-0000-0000-000000000003"}', true);
  begin
    perform public.inviter_un_candidat('x0060@example.org', repeat('a', 64));
    raise exception 'ÉCHEC — un compte sans loge a ouvert un dossier';
  exception when insufficient_privilege then
    raise notice '  ok — sans loge, pas de dossier';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6000-0000-0000-000000000001"}', true);
  begin
    perform public.inviter_un_candidat('pas-une-adresse', repeat('b', 64));
    raise exception 'ÉCHEC — une adresse invalide a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — une adresse invalide est refusée';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.inviter_un_candidat('x0060@example.org', repeat('c', 64));
    raise exception 'ÉCHEC — anon a ouvert un dossier';
  exception when insufficient_privilege then
    raise notice '  ok — sans être connecté, pas de dossier';
  end;
end
$$;

do $$
begin
  begin
    insert into public.parrainage (loge_id, parrain_email, jeton_parrain_empreinte)
    values ((select id from public.loge where bubble_id = 'loge-0060-lille'), null, null);
    raise exception 'ÉCHEC — une ligne ne désignant personne a été acceptée';
  exception when check_violation then
    raise notice '  ok — une ligne de parrainage désigne toujours quelqu''un';
  end;
end
$$;

\o
\echo 'Tous les contrôles de 0060_candidat_sans_parrain.sql sont passés.'
