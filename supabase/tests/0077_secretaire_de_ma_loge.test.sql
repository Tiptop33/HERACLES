-- Tests de la migration 0077_secretaire_de_ma_loge.sql.
--
--   · à Pau-0077, Sophie est Secrétaire ; Rémi est référent
--   · à Tarbes-0077, Teo est référent, et personne n'est Secrétaire

\set ON_ERROR_STOP on
\o /dev/null

\set sophie 'cdcdcdcd-7700-0000-0000-000000000001'
\set remi   'cdcdcdcd-7700-0000-0000-000000000002'
\set teo    'cdcdcdcd-7700-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sophie', 'sophie0077@example.org', '{"role":"referent"}'),
  (:'remi',   'remi0077@example.org',   '{"role":"referent"}'),
  (:'teo',    'teo0077@example.org',    '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0077-pau',    'Pau — 0077'),
  ('loge-0077-tarbes', 'Tarbes — 0077')
on conflict do nothing;
select id as l_pau    from public.loge where bubble_id = 'loge-0077-pau' \gset
select id as l_tarbes from public.loge where bubble_id = 'loge-0077-tarbes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, college, email, loge_id) values
  ('ref-0077-sophie', :'sophie', 'SAVARY', 'Sophie', 'Secrétaire', ' secretariat-pau@exemple.org ', :'l_pau'::uuid),
  ('ref-0077-remi',   :'remi',   'RAMOND', 'Rémi',   null,         'remi@exemple.org',              :'l_pau'::uuid),
  ('ref-0077-teo',    :'teo',    'TAPIE',  'Teo',    null,         'teo@exemple.org',               :'l_tarbes'::uuid)
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— le Secretaire de ma loge, et pas celui d une autre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7700-0000-0000-000000000002"}';
  select public.verifier(public.email_du_secretaire_de_ma_loge() = 'secretariat-pau@exemple.org',
    'Remi lit l adresse du Secretaire de Pau, sans les blancs');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"cdcdcdcd-7700-0000-0000-000000000003"}';
  select public.verifier(public.email_du_secretaire_de_ma_loge() is null,
    'a Tarbes, sans Secretaire, rien — et pas celui de Pau');
commit;

do $$
begin
  perform set_config('role', 'anon', true);
  begin
    perform public.email_du_secretaire_de_ma_loge();
    raise exception 'ÉCHEC — anon lit l adresse d un Secretaire';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne lit rien';
  end;
end
$$;

\o
\echo '0077 — l adresse du Secretaire de ma loge : tout est vert.'
