-- Tests de la migration 0026_rendre_une_note.sql.
--
-- Une seule chose à éprouver, mais c'est celle qui décide de l'écran : la
-- liste des notes retirées dit-elle à qui proposer de les rendre ?
--
--   · Dora  référente à Gap-0026, elle suit Enzo
--   · Fritz administrateur, sans fiche de référent

\set ON_ERROR_STOP on
\o /dev/null

\set dora  'aaaaaaaa-3333-0000-0000-000000000061'
\set fritz 'aaaaaaaa-3333-0000-0000-000000000062'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'dora',  'dora0026@example.org',  '{"role":"referent","nom":"Dora","prenom":"D"}'),
  (:'fritz', 'fritz0026@example.org', '{"role":"referent","nom":"Fritz","prenom":"F"}');
update public.profil set role = 'admin' where id = :'fritz';

insert into public.loge (bubble_id, nom) values ('loge-0026-gap', 'Gap — 0026')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0026-dora', :'dora', 'Dora', 'D', 'dora0026@example.org',
   (select id from public.loge where bubble_id = 'loge-0026-gap'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id, referent_id) values
  ('cand-0026-enzo', 901, 'Enzo', 'E', 'Gap',
   (select id from public.loge where bubble_id = 'loge-0026-gap'),
   (select id from public.referent where bubble_id = 'ref-0026-dora'))
on conflict do nothing;

select id as enzo   from public.candidat where bubble_id = 'cand-0026-enzo' \gset
select id as r_dora from public.referent where bubble_id = 'ref-0026-dora' \gset

insert into public.suivi (bubble_id, candidat_id, auteur_id, fait_le, texte) values
  ('note-0026', :'enzo'::uuid, :'r_dora'::uuid, date '2026-05-05', 'Note écartée par erreur.')
on conflict (bubble_id) do nothing;

select id as note from public.suivi where bubble_id = 'note-0026' \gset
select set_config('essai.note', :'note', false);

-- ---------------------------------------------------------------------------
\echo '— la liste des retirees dit a qui proposer de les rendre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000061"}';

  select public.verifier(
    public.retirer_le_suivi(current_setting('essai.note')::uuid),
    'Dora retire une note');

  select public.verifier(
    (select je_peux_agir from public.suivi_retire_du_candidat(:'enzo'::uuid)) = true,
    'et la liste lui dit qu''elle peut la rendre');

  select public.verifier(
    (select retire_par_nom from public.suivi_retire_du_candidat(:'enzo'::uuid)) = 'D Dora',
    'en nommant qui l''a retirée');
commit;

-- ---------------------------------------------------------------------------
\echo '— l administration voit ce qui est ecarte, sans pouvoir le remettre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000062"}';

  select public.verifier(
    (select count(*) from public.suivi_retire_du_candidat(:'enzo'::uuid)) = 1,
    'Fritz voit la note retirée');

  select public.verifier(
    (select je_peux_agir from public.suivi_retire_du_candidat(:'enzo'::uuid)) = false,
    'mais sans fiche de référent, l''écran ne lui proposera pas de la rendre');
commit;

-- Et la base le refuserait de toute façon : le drapeau n'est pas la garde.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000062"}', true);
  begin
    perform public.rendre_le_suivi(current_setting('essai.note')::uuid);
    raise exception 'ÉCHEC — l''administration a rendu une note';
  exception when insufficient_privilege then
    raise notice '  ok — le bouton caché n''est pas ce qui protège';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et la note revient'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000061"}';

  select public.verifier(
    public.rendre_le_suivi(current_setting('essai.note')::uuid),
    'Dora la rend');

  select public.verifier(
    (select count(*) from public.suivi_retire_du_candidat(:'enzo'::uuid)) = 0
      and (select count(*) from public.suivi_du_candidat(:'enzo'::uuid)) = 1,
    'elle a quitté les écartées et repris sa place dans le journal');
commit;

\echo ''
\echo 'Tous les contrôles de 0026_rendre_une_note.sql sont passés.'
