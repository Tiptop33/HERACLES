-- Tests de la migration 0118_duree_cumulee_des_referents.sql.
--
--   · Chef   administrateur, celui qui lit le tableau
--   · Ines   référente à Nérac-0118, trois connexions : 20 min, 40 min (close
--            par « Se déconnecter »), et une en cours
--   · Paul   référent  à Nérac-0118, une connexion de 90 min
--   · Yann   référent  à Nérac-0118, jamais connecté

\set ON_ERROR_STOP on
\o /dev/null

\set chef 'aaaaaaaa-0118-0000-0000-000000000001'
\set ines 'aaaaaaaa-0118-0000-0000-000000000002'
\set paul 'aaaaaaaa-0118-0000-0000-000000000003'
\set yann 'aaaaaaaa-0118-0000-0000-000000000004'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'chef', 'chef0118@example.org', '{"role":"referent"}'),
  (:'ines', 'ines0118@example.org', '{"role":"referent"}'),
  (:'paul', 'paul0118@example.org', '{"role":"referent"}'),
  (:'yann', 'yann0118@example.org', '{"role":"referent"}');

update public.profil set role = 'admin' where id = :'chef';

insert into public.loge (bubble_id, nom) values
  ('loge-0118-nerac', 'Nérac — 0118')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0118-ines', :'ines', 'Cumul-Ines', 'I', 'ines0118@example.org',
   (select id from public.loge where bubble_id = 'loge-0118-nerac')),
  ('ref-0118-paul', :'paul', 'Cumul-Paul', 'P', 'paul0118@example.org',
   (select id from public.loge where bubble_id = 'loge-0118-nerac')),
  ('ref-0118-yann', :'yann', 'Cumul-Yann', 'Y', 'yann0118@example.org',
   (select id from public.loge where bubble_id = 'loge-0118-nerac'))
on conflict do nothing;

select id as ines_ref from public.referent where bubble_id = 'ref-0118-ines' \gset
select id as paul_ref from public.referent where bubble_id = 'ref-0118-paul' \gset
select id as yann_ref from public.referent where bubble_id = 'ref-0118-yann' \gset

-- Des durées connues d'avance, posées directement au journal.
insert into public.connexion_referent (referent_id, debut, dernier_signe, deconnecte_le) values
  -- Ines : 20 min, close par le silence.
  (:'ines_ref', now() - interval '3 months',
                now() - interval '3 months' + interval '20 minutes', null),
  -- Ines : 40 min, close par « Se déconnecter ».
  (:'ines_ref', now() - interval '2 days',
                now() - interval '2 days' + interval '40 minutes',
                now() - interval '2 days' + interval '40 minutes'),
  -- Ines : en cours depuis 5 min, dernier signe il y a 30 s.
  (:'ines_ref', now() - interval '5 minutes', now() - interval '30 seconds', null),
  -- Paul : 90 min.
  (:'paul_ref', now() - interval '1 day',
                now() - interval '1 day' + interval '90 minutes', null);

-- ---------------------------------------------------------------------------
\echo '— une ligne par referent connecte, la plus longue duree en tete'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0118-0000-0000-000000000001"}';
  select public.verifier(
    (select count(*) from public.la_duree_cumulee_des_referents()
      where referent_id = :'ines_ref') = 1,
    'une seule ligne pour Ines, malgre ses trois connexions');
  select public.verifier(
    (select duree_secondes from public.la_duree_cumulee_des_referents()
      where referent_id = :'paul_ref') = 90 * 60,
    'Paul : 90 minutes');
  -- 20 + 40 min, plus la connexion en cours jusqu'à son dernier signe : 4 min 30.
  select public.verifier(
    (select duree_secondes from public.la_duree_cumulee_des_referents()
      where referent_id = :'ines_ref') = 60 * 60 + 4 * 60 + 30,
    'Ines : 1 h 04 min 30 s, la connexion en cours comprise');
  select public.verifier(
    (select count(*) from public.la_duree_cumulee_des_referents()
      where referent_id = :'yann_ref') = 0,
    'aucune ligne pour Yann, jamais connecte');
  select public.verifier(
    (select array_agg(nom order by rang)
       from (select nom, row_number() over () as rang
               from public.la_duree_cumulee_des_referents()
              where nom like 'Cumul-%') t) = array['Cumul-Paul', 'Cumul-Ines'],
    'Paul avant Ines : la plus longue duree en tete');
  select public.verifier(
    (select count(*) = count(distinct referent_id)
       from public.la_duree_cumulee_des_referents()),
    'jamais deux lignes pour le meme referent');
commit;

-- ---------------------------------------------------------------------------
\echo '— le total est la somme des durees que le journal affiche'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0118-0000-0000-000000000001"}';
  select public.verifier(
    (select duree_secondes from public.la_duree_cumulee_des_referents()
      where referent_id = :'ines_ref')
    = (select sum(duree_secondes)
         from public.les_connexions_des_referents(2000, :'ines_ref')),
    'le cumul d Ines egale la somme de ses lignes au journal');
  -- Aucun référent ne manque : tous ceux du menu ont leur ligne.
  select public.verifier(
    (select count(*) from public.la_duree_cumulee_des_referents())
    = (select count(*) from public.les_referents_du_journal()),
    'autant de lignes que de referents dans le menu');
commit;

-- ---------------------------------------------------------------------------
\echo '— un referent n obtient rien, un anonyme n appelle pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-0118-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.la_duree_cumulee_des_referents()) = 0,
    'Ines ne lit ni sa duree ni celle des autres');
commit;

begin;
  set local role anon;
  do $$
  begin
    perform count(*) from public.la_duree_cumulee_des_referents();
    raise exception 'ÉCHEC — un anonyme appelle la_duree_cumulee_des_referents()';
  exception when insufficient_privilege then
    null;
  end
  $$;
commit;
