-- Tests de la migration 0059_email_du_candidat_a_l_invitation.sql.
--
--   · Nina   référente à Nantes-0059 — elle invite
--   · Omar   un compte sans fiche de référent
--
-- Les jetons sont fabriqués ici comme la route les fabrique : seule leur
-- empreinte sha256 passe à la base.

\set ON_ERROR_STOP on
\o /dev/null

\set nina 'aaaaaaaa-5900-0000-0000-000000000001'
\set omar 'aaaaaaaa-5900-0000-0000-000000000002'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'nina', 'nina0059@example.org', '{"role":"referent","nom":"Nina","prenom":"N"}'),
  (:'omar', 'omar0059@example.org', '{"role":"referent","nom":"Omar","prenom":"O"}')
on conflict do nothing;

insert into public.loge (bubble_id, nom) values ('loge-0059-nantes', 'Nantes — 0059')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0059-nina', :'nina', 'Nina', 'N', 'nina0059@example.org',
   (select id from public.loge where bubble_id = 'loge-0059-nantes'))
on conflict do nothing;

select encode(sha256('jeton-0059-parrain-1'::bytea), 'hex') as e_p1 \gset
select encode(sha256('jeton-0059-parrain-2'::bytea), 'hex') as e_p2 \gset

-- ---------------------------------------------------------------------------
\echo '— une seule signature : l appel a deux arguments reste sans ambiguite'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'inviter_un_parrain') = 1,
  'inviter_un_parrain n''existe qu''une fois');

-- ---------------------------------------------------------------------------
\echo '— l adresse du candidat est gardee, remise en minuscules'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5900-0000-0000-000000000001"}';
  select public.inviter_un_parrain(
    'parrain0059@example.org', :'e_p1', '  Lea.Candidate0059@Example.org ') as p1 \gset
commit;

begin;
  set local role service_role;
  select public.verifier(
    (select candidat_email from public.parrainage_par_empreinte(:'e_p1'))
      = 'lea.candidate0059@example.org',
    'le lien du parrain rend l''adresse proposée du candidat');
commit;

-- ---------------------------------------------------------------------------
\echo '— sans adresse de candidat, l invitation part quand meme'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5900-0000-0000-000000000001"}';
  select public.inviter_un_parrain('autre0059@example.org', :'e_p2', '   ') as p2 \gset
commit;

begin;
  set local role service_role;
  select public.verifier(
    (select candidat_email from public.parrainage_par_empreinte(:'e_p2')) is null
      and (select valable from public.parrainage_par_empreinte(:'e_p2')),
    'une adresse vide devient null, et le lien vaut');
commit;

-- ---------------------------------------------------------------------------
\echo '— le tableau de suivi ne montre pas l adresse du candidat'
-- ---------------------------------------------------------------------------
select public.verifier(
  not exists (
    select 1 from information_schema.parameters
     where specific_schema = 'public'
       and specific_name like 'parrainages_de_ma_loge%'
       and parameter_name = 'candidat_email'),
  'parrainages_de_ma_loge ne rend pas candidat_email');

-- ---------------------------------------------------------------------------
\echo '— une adresse de candidat invalide est refusee'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5900-0000-0000-000000000001"}', true);
  begin
    perform public.inviter_un_parrain('troisieme0059@example.org', repeat('d', 64), 'pas-une-adresse');
    raise exception 'ÉCHEC — une adresse de candidat invalide a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — adresse de candidat invalide refusée';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— toujours pas d invitation sans loge, ni sans session'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5900-0000-0000-000000000002"}', true);
  begin
    perform public.inviter_un_parrain('x0059@example.org', repeat('e', 64), 'y0059@example.org');
    raise exception 'ÉCHEC — un compte sans loge a invité';
  exception when insufficient_privilege then
    raise notice '  ok — sans loge, on n''invite personne';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.inviter_un_parrain('x0059@example.org', repeat('f', 64), 'y0059@example.org');
    raise exception 'ÉCHEC — anon a invité';
  exception when insufficient_privilege then
    raise notice '  ok — sans être connecté, on n''invite pas';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  begin
    perform public.parrainage_par_empreinte(repeat('0', 64));
    raise exception 'ÉCHEC — authenticated lit un parrainage par empreinte';
  exception when insufficient_privilege then
    raise notice '  ok — le lien du parrain reste réservé à service_role';
  end;
end
$$;

\o
\echo 'Tous les contrôles de 0059_email_du_candidat_a_l_invitation.sql sont passés.'
