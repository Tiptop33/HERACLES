-- Tests de la migration 0014_rattacher_les_comptes.sql.
--
-- Le rattrapage doit rapprocher ce qui va ensemble — même adresse, fiche
-- libre — et ne rien déplacer d'autre. Une erreur ici ne se verrait pas : elle
-- donnerait les candidats de quelqu'un à quelqu'un d'autre.
--
--   · Lucie   compte créé avant que sa fiche n'arrive de Bubble
--   · Marc    compte sans fiche à son adresse — il doit le rester
--   · Nadia   déjà rattachée : son lien ne bouge pas

\set ON_ERROR_STOP on
\o /dev/null

\set lucie 'aaaaaaaa-0000-0000-0000-000000000014'
\set marc  'aaaaaaaa-0000-0000-0000-000000000015'
\set nadia 'aaaaaaaa-0000-0000-0000-000000000016'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'lucie', 'lucie0014@example.org', '{"role":"referent","nom":"Aubrac","prenom":"Lucie"}'),
  (:'marc',  'marc0014@example.org',  '{"role":"referent","nom":"Bloch","prenom":"Marc"}'),
  (:'nadia', 'nadia0014@example.org', '{"role":"referent","nom":"Comaneci","prenom":"Nadia"}');

insert into public.loge (bubble_id, nom) values ('loge-0014', 'Marseille — 0014')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  -- Reprise de Bubble : la fiche existe, le compte aussi, rien ne les lie.
  ('ref-0014-lucie', null, 'Aubrac', 'Lucie', 'lucie0014@example.org',
   (select id from public.loge where bubble_id = 'loge-0014')),
  -- Déjà rattachée : le rattrapage ne doit pas y toucher.
  ('ref-0014-nadia', :'nadia', 'Comaneci', 'Nadia', 'nadia0014@example.org',
   (select id from public.loge where bubble_id = 'loge-0014'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— le rattrapage rapproche ce qui porte la meme adresse'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select profil_id from public.referent where bubble_id = 'ref-0014-lucie') is null,
  'avant : la fiche de Lucie n''est liée à aucun compte');

select public.verifier(
  public.rattacher_les_comptes_orphelins() >= 1,
  'le rattrapage trouve au moins un compte à rattacher');

select public.verifier(
  (select profil_id from public.referent where bubble_id = 'ref-0014-lucie') = :'lucie'::uuid,
  'après : Lucie a retrouvé sa fiche, sa loge et ses candidats');

-- ---------------------------------------------------------------------------
\echo '— il ne deplace pas un rattachement deja fait'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select profil_id from public.referent where bubble_id = 'ref-0014-nadia') = :'nadia'::uuid,
  'Nadia garde la sienne');

-- ---------------------------------------------------------------------------
\echo '— et n invente rien pour un compte sans fiche'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from public.referent r where r.profil_id = :'marc'::uuid) = 0,
  'Marc n''a pas de fiche à son adresse : il n''en reçoit aucune');

-- ---------------------------------------------------------------------------
\echo '— rejouable : un second passage ne rattache plus rien'
-- ---------------------------------------------------------------------------
select public.verifier(
  public.rattacher_les_comptes_orphelins() = 0,
  'tout ce qui pouvait être rapproché l''est — le reste ne bouge plus');

-- ---------------------------------------------------------------------------
\echo '— personne ne la lance depuis l application'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-0000-0000-000000000015"}', true);
  begin
    perform public.rattacher_les_comptes_orphelins();
    raise exception 'ÉCHEC — une session ordinaire a pu rattacher des comptes';
  exception when insufficient_privilege then
    raise notice '  ok — c''est un geste d''exploitation, pas un bouton';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0014_rattacher_les_comptes.sql sont passés.'
