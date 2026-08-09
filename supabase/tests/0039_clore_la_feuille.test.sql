-- Tests de la migration 0039_clore_la_feuille.sql.
--
-- Ce qu'on éprouve : fermer la feuille remplit les vides avec « Absent », et
-- ne touche à rien d'autre.
--
--   · Rose  référente à Pau-0039, pointée présente
--   · Lino  référent  à Pau-0039, excusé
--   · Théo  référent  à Pau-0039, jamais nommé — c'est lui que la fermeture
--                                  doit marquer absent
--   · Iris  référente à Dax-0039, une autre loge : rien ne doit l'atteindre

\set ON_ERROR_STOP on
\o /dev/null

\set rose 'aaaaaaaa-3333-0000-0000-000000000101'
\set iris 'aaaaaaaa-3333-0000-0000-000000000102'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'rose', 'rose0039@example.org', '{"role":"referent","nom":"Rose","prenom":"R"}'),
  (:'iris', 'iris0039@example.org', '{"role":"referent","nom":"Iris","prenom":"I"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0039-pau', 'Pau — 0039'),
  ('loge-0039-dax', 'Dax — 0039')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0039-rose', :'rose', 'Rose', 'R', 'rose0039@example.org',
   (select id from public.loge where bubble_id = 'loge-0039-pau')),
  ('ref-0039-lino', null,    'Lino', 'L', 'lino0039@example.org',
   (select id from public.loge where bubble_id = 'loge-0039-pau')),
  ('ref-0039-theo', null,    'Théo', 'T', 'theo0039@example.org',
   (select id from public.loge where bubble_id = 'loge-0039-pau')),
  ('ref-0039-iris', :'iris', 'Iris', 'I', 'iris0039@example.org',
   (select id from public.loge where bubble_id = 'loge-0039-dax'))
on conflict do nothing;

select id as r_rose from public.referent where bubble_id = 'ref-0039-rose' \gset
select id as r_lino from public.referent where bubble_id = 'ref-0039-lino' \gset
select id as r_theo from public.referent where bubble_id = 'ref-0039-theo' \gset
select id as r_iris from public.referent where bubble_id = 'ref-0039-iris' \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 30, current_date + 30)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— fermer la feuille marque absents ceux qu on n a pas nommes'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000101"}';

  select public.ouvrir_une_reunion(current_date, 'Temple') as seance \gset

  select public.pointer_a_l_appel(:'seance'::uuid, :'r_rose'::uuid, 'Présent');
  select public.pointer_a_l_appel(:'seance'::uuid, :'r_lino'::uuid, 'Excusé');

  -- Avant la fermeture : Théo n'a aucun état. Ce n'est pas « absent », c'est
  -- « on ne sait pas » — et c'est justement ce qui ne doit pas rester.
  select public.verifier(
    (select etat from public.feuille_d_appel(:'seance'::uuid)
      where referent_id = :'r_theo'::uuid) is null,
    'avant de fermer, celui qu''on n''a pas nommé n''a pas d''état');

  select public.verifier(
    public.clore_la_feuille(:'seance'::uuid) = 1,
    'fermer la feuille ne pose qu''un état — celui qui manquait');

  select public.verifier(
    (select etat from public.feuille_d_appel(:'seance'::uuid)
      where referent_id = :'r_theo'::uuid) = 'Absent',
    'et Théo est désormais absent');
commit;

-- ---------------------------------------------------------------------------
\echo '— et n ecrase ni un present ni un excuse'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000101"}';

  select public.verifier(
    (select etat from public.feuille_d_appel(:'seance'::uuid)
      where referent_id = :'r_rose'::uuid) = 'Présent',
    'Rose est restée présente');

  select public.verifier(
    (select etat from public.feuille_d_appel(:'seance'::uuid)
      where referent_id = :'r_lino'::uuid) = 'Excusé',
    'Lino est resté excusé');
commit;

-- ---------------------------------------------------------------------------
\echo '— la refermer ne change plus rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000101"}';

  select public.verifier(
    public.clore_la_feuille(:'seance'::uuid) = 0,
    'la seconde fermeture ne pose rien de plus');

  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid)
      where etat is null) = 0,
    'et la feuille n''a plus une seule case vide');
commit;

-- ---------------------------------------------------------------------------
\echo '— la fermeture s arrete a la loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000101"}';

  -- Iris est de Dax : la feuille de Pau ne la porte pas, et la fermeture n'a
  -- pas pu lui poser d'absence.
  select public.verifier(
    (select count(*) from public.feuille_d_appel(:'seance'::uuid)
      where referent_id = :'r_iris'::uuid) = 0,
    'la référente de l''autre loge ne figure pas sur cette feuille');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000102"}';

  -- Iris voit une réunion qui n'est pas de sa loge : la fonction se tait.
  select public.verifier(
    public.clore_la_feuille(:'seance'::uuid) is null,
    'une autre loge ne ferme pas cette feuille-là');
commit;

-- Et rien n'a bougé : Iris n'a toujours aucun pointage.
select public.verifier(
  (select count(*) from public.appel where referent_id = :'r_iris'::uuid) = 0,
  'aucun pointage n''a été posé sur elle');

-- ---------------------------------------------------------------------------
\echo '— sans fiche de referent, on ne ferme rien'
-- ---------------------------------------------------------------------------
select set_config('essai.seance0039', :'seance', false);

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  begin
    perform public.clore_la_feuille(current_setting('essai.seance0039')::uuid);
    raise exception 'ÉCHEC — une feuille se ferme sans fiche de référent';
  exception when insufficient_privilege then
    raise notice '  ok — sans fiche, la fermeture est refusée';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0039_clore_la_feuille.sql sont passés.'
