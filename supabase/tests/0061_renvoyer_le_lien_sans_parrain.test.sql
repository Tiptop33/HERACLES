-- Tests de la migration 0061_renvoyer_le_lien_sans_parrain.sql.
--
--   · Vera  référente à Brest-0061 — elle ouvre un dossier sans parrain, en
--           invite un autre par un parrain, et renvoie les deux liens

\set ON_ERROR_STOP on
\o /dev/null

\set vera 'aaaaaaaa-6100-0000-0000-000000000001'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'vera', 'vera0061@example.org', '{"role":"referent","nom":"Vera","prenom":"V"}')
on conflict do nothing;

insert into public.loge (bubble_id, nom) values ('loge-0061-brest', 'Brest — 0061')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0061-vera', :'vera', 'Vera', 'V', 'vera0061@example.org',
   (select id from public.loge where bubble_id = 'loge-0061-brest'))
on conflict do nothing;

select encode(sha256('jeton-0061-c1'::bytea), 'hex') as e_c1 \gset
select encode(sha256('jeton-0061-c1-bis'::bytea), 'hex') as e_c1b \gset
select encode(sha256('jeton-0061-p2'::bytea), 'hex') as e_p2 \gset
select encode(sha256('jeton-0061-c2'::bytea), 'hex') as e_c2 \gset
select encode(sha256('jeton-0061-c2-bis'::bytea), 'hex') as e_c2b \gset

-- Un dossier sans parrain, ouvert par Vera.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6100-0000-0000-000000000001"}';
  select (public.inviter_un_candidat('seul0061@example.org', :'e_c1') ->> 'candidat_id') as seul \gset
  select public.inviter_un_parrain('parrain0061@example.org', :'e_p2') as p2 \gset
commit;

-- Un dossier présenté par un parrain.
begin;
  set local role service_role;
  select (public.presenter_un_candidat(:'e_p2', jsonb_build_object(
    'candidat_nom', 'Duo', 'candidat_prenom', 'D', 'candidat_email', 'duo0061@example.org',
    'type_emploi', (public.types_de_recherche())[1], 'parrain_nom', 'Parrain'
  ), :'e_c2') ->> 'candidat_id') as duo \gset
commit;

-- ---------------------------------------------------------------------------
\echo '— le renvoi dit si le dossier est sans parrain'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6100-0000-0000-000000000001"}';

  select public.verifier(
    (public.renvoyer_le_lien_du_candidat(:'seul'::uuid, :'e_c1b') ->> 'sans_parrain')::boolean,
    'sans parrain : le drapeau est vrai');

  select public.verifier(
    not (public.renvoyer_le_lien_du_candidat(:'duo'::uuid, :'e_c2b') ->> 'sans_parrain')::boolean,
    'présenté par un parrain : le drapeau est faux');
commit;

begin;
  set local role service_role;
  select public.verifier(
    (select valable from public.candidature_par_empreinte(:'e_c1b'))
      and not exists (select 1 from public.candidature_par_empreinte(:'e_c1')),
    'le nouveau lien vaut, l''ancien ne mène plus nulle part');
commit;

\o
\echo 'Tous les contrôles de 0061_renvoyer_le_lien_sans_parrain.sql sont passés.'
