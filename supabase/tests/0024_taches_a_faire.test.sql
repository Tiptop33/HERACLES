-- Tests de la migration 0024_taches_a_faire.sql.
--
-- Deux choses se jouent ici, et elles tirent en sens contraire : refermer est
-- ouvert à toute la loge, réécrire reste réservé à l'auteur. Ce fichier éprouve
-- surtout la frontière — qu'ouvrir l'un n'ait pas ouvert l'autre.
--
--   · Théo   référent à Tours-0024, il suit Wanda
--   · Ulla   référente à Tours-0024 — elle n'accompagne personne
--   · Vera   référente à Angers-0024 — Tours ne la regarde pas
--   · Yann   administrateur, sans fiche de référent

\set ON_ERROR_STOP on
\o /dev/null

\set theo 'aaaaaaaa-3333-0000-0000-000000000041'
\set ulla 'aaaaaaaa-3333-0000-0000-000000000042'
\set vera 'aaaaaaaa-3333-0000-0000-000000000043'
\set yann 'aaaaaaaa-3333-0000-0000-000000000044'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'theo', 'theo0024@example.org', '{"role":"referent","nom":"Theo","prenom":"T"}'),
  (:'ulla', 'ulla0024@example.org', '{"role":"referent","nom":"Ulla","prenom":"U"}'),
  (:'vera', 'vera0024@example.org', '{"role":"referent","nom":"Vera","prenom":"V"}'),
  (:'yann', 'yann0024@example.org', '{"role":"referent","nom":"Yann","prenom":"Y"}');
update public.profil set role = 'admin' where id = :'yann';

insert into public.loge (bubble_id, nom) values
  ('loge-0024-tours',  'Tours — 0024'),
  ('loge-0024-angers', 'Angers — 0024')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0024-theo', :'theo', 'Theo', 'T', 'theo0024@example.org',
   (select id from public.loge where bubble_id = 'loge-0024-tours')),
  ('ref-0024-ulla', :'ulla', 'Ulla', 'U', 'ulla0024@example.org',
   (select id from public.loge where bubble_id = 'loge-0024-tours')),
  ('ref-0024-vera', :'vera', 'Vera', 'V', 'vera0024@example.org',
   (select id from public.loge where bubble_id = 'loge-0024-angers'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, ville, loge_id, referent_id) values
  ('cand-0024-wanda', 701, 'Wanda', 'W', 'Tours',
   (select id from public.loge where bubble_id = 'loge-0024-tours'),
   (select id from public.referent where bubble_id = 'ref-0024-theo'))
on conflict do nothing;

select id as wanda   from public.candidat where bubble_id = 'cand-0024-wanda' \gset
select id as r_theo  from public.referent where bubble_id = 'ref-0024-theo'  \gset

-- Une tâche venue de Bubble : personne ne l'a signée, et c'est le cas qui a
-- fait déplacer la règle — 73 des 467 reprises sont ainsi.
insert into public.suivi (bubble_id, candidat_id, auteur_id, fait_le, etat, texte) values
  ('tache-0024-orpheline', :'wanda'::uuid, null, date '2026-02-10', 'En cours',
   'Reprise de Bubble, sans auteur.')
on conflict (bubble_id) do nothing;

select id as orpheline from public.suivi where bubble_id = 'tache-0024-orpheline' \gset
select set_config('essai.orpheline', :'orpheline', false),
       set_config('essai.wanda',     :'wanda',     false);

-- ---------------------------------------------------------------------------
\echo '— celui qui accompagne ecrit une tache, avec son etat'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000041"}';

  insert into public.suivi (candidat_id, auteur_id, fait_le, nature, etat, texte) values
    (:'wanda'::uuid, :'r_theo'::uuid, date '2026-08-08', 'Relance', 'En cours',
     'Rappeler l''entreprise avant vendredi.');

  select public.verifier(
    (select etat from public.suivi_du_candidat(:'wanda'::uuid)
      where texte = 'Rappeler l''entreprise avant vendredi.') = 'En cours',
    'Théo écrit une tâche, et elle naît « En cours »');
commit;

-- ---------------------------------------------------------------------------
\echo '— une collegue de loge referme, et laisse son nom'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000042"}';

  -- Ulla n'accompagne pas Wanda. C'est tout l'objet de l'écart pris avec 0021.
  select public.verifier(
    public.changer_etat_du_suivi(current_setting('essai.orpheline')::uuid, 'Terminer'),
    'Ulla referme une tâche d''une candidate de sa loge, qu''elle n''accompagne pas');

  select public.verifier(
    (select etat from public.suivi_du_candidat(:'wanda'::uuid)
      where texte = 'Reprise de Bubble, sans auteur.') = 'Terminer',
    'et l''état a bien changé');

  select public.verifier(
    (select etat_par_nom from public.suivi_du_candidat(:'wanda'::uuid)
      where texte = 'Reprise de Bubble, sans auteur.') = 'U Ulla',
    'le journal dit qui l''a refermée — sans quoi on ouvrirait sans savoir qui agit');
commit;

select public.verifier(
  (select etat_le is not null from public.suivi
    where bubble_id = 'tache-0024-orpheline'),
  'et quand');

-- ---------------------------------------------------------------------------
\echo '— l ecran sait a qui proposer le bouton'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000042"}';

  select public.verifier(
    (select bool_and(je_peux_agir) from public.suivi_du_candidat(:'wanda'::uuid)),
    'Ulla a une fiche de référent : la lecture lui dit qu''elle peut agir');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000044"}';

  -- Yann administre sans accompagner : il lit tout, et la colonne lui dit de
  -- ne pas afficher de bouton. La fonction le refuserait de toute façon.
  select public.verifier(
    (select bool_or(je_peux_agir) from public.suivi_du_candidat(:'wanda'::uuid)) = false,
    'Yann, administrateur sans fiche, lit le journal mais n''y agit pas');
commit;

-- ---------------------------------------------------------------------------
-- Depuis 0025, la loge corrige aussi le texte — mais par une fonction, qui
-- laisse son nom. L'`update` direct sur la table, lui, n'a jamais bougé : il
-- reste réservé à l'auteur, et c'est ce que ce bloc éprouve.
\echo '— refermer n a pas ouvert l update direct de la table'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000042"}';

  -- La policy de 0021 tient toujours : l'`update` ne trouve pas la ligne.
  update public.suivi set texte = 'réécrit par Ulla'
   where id = current_setting('essai.orpheline')::uuid;
commit;

select public.verifier(
  (select count(*) from public.suivi where texte = 'réécrit par Ulla') = 0,
  'Ulla ne réécrit pas la table en direct — la policy de 0021 tient toujours');

-- ---------------------------------------------------------------------------
\echo '— une autre loge ne referme rien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000043"}';

  select public.verifier(
    public.changer_etat_du_suivi(current_setting('essai.orpheline')::uuid, 'En cours') = false,
    'Vera n''obtient rien de Tours : la fonction rend faux, et ne touche pas la ligne');
commit;

select public.verifier(
  (select etat from public.suivi where bubble_id = 'tache-0024-orpheline') = 'Terminer',
  'la tâche est restée telle qu''Ulla l''avait laissée');

-- ---------------------------------------------------------------------------
\echo '— l administration lit tout, et ne referme rien'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000044"}', true);
  begin
    perform public.changer_etat_du_suivi(current_setting('essai.orpheline')::uuid, 'En cours');
    raise exception 'ÉCHEC — l''administration a refermé une tâche';
  exception when insufficient_privilege then
    raise notice '  ok — administrer n''est pas accompagner, ici non plus';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— un etat vide ou demesure est refuse'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-3333-0000-0000-000000000041"}', true);

  begin
    perform public.changer_etat_du_suivi(current_setting('essai.orpheline')::uuid, '   ');
    raise exception 'ÉCHEC — un état vide a été accepté';
  exception when check_violation then
    raise notice '  ok — un état vide n''est pas un état';
  end;

  begin
    perform public.changer_etat_du_suivi(
      current_setting('essai.orpheline')::uuid, repeat('x', 121));
    raise exception 'ÉCHEC — un état de 121 caractères a été accepté';
  exception when check_violation then
    raise notice '  ok — un état est un mot, pas un paragraphe';
  end;
end
$$;

-- La contrainte tient aussi à l'insertion, et pas seulement dans la fonction.
do $$
begin
  begin
    insert into public.suivi (candidat_id, fait_le, etat, texte)
    values (current_setting('essai.wanda')::uuid, current_date, repeat('y', 200), 'trop long');
    raise exception 'ÉCHEC — la table a accepté un état démesuré';
  exception when check_violation then
    raise notice '  ok — la contrainte de table tient aussi';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une ligne inconnue ne fait pas d histoire'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000041"}';

  select public.verifier(
    public.changer_etat_du_suivi('00000000-0000-0000-0000-000000000000'::uuid, 'Terminer') = false,
    'une ligne qui n''existe pas rend faux, et ne lève rien');
commit;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.changer_etat_du_suivi(
      '00000000-0000-0000-0000-000000000000'::uuid, 'Terminer');
    raise exception 'ÉCHEC — la fonction répond sans session';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit de l''appeler';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0024_taches_a_faire.sql sont passés.'
