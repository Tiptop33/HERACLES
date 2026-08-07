-- Tests de la migration 0016_supprimer_referent.sql.
--
-- Une suppression ne se rattrape pas. Ce fichier vérifie surtout ce que la
-- fonction REFUSE — c'est là que se joue la sécurité d'un bouton rouge.
--
--   · Ulysse   administrateur
--   · Vera     référente à Reims-0016, sans candidat — elle peut partir
--   · Wanda    référente à Reims-0016, avec un candidat — elle ne peut pas
--   · Xavier   référent à Reims-0016, sans candidat, mais c'est Ulysse qui
--              essaie de se supprimer lui-même dans son propre test

\set ON_ERROR_STOP on
\o /dev/null

\set ulysse 'dddddddd-0000-0000-0000-000000000016'
\set vera   'dddddddd-0000-0000-0000-000000000017'
\set wanda  'dddddddd-0000-0000-0000-000000000018'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ulysse', 'ulysse0016@example.org', '{"role":"referent","nom":"Ulysse","prenom":"U"}'),
  (:'vera',   'vera0016@example.org',   '{"role":"referent","nom":"Vera","prenom":"V"}'),
  (:'wanda',  'wanda0016@example.org',  '{"role":"referent","nom":"Wanda","prenom":"W"}');
update public.profil set role = 'admin' where id = :'ulysse';

insert into public.loge (bubble_id, nom) values ('loge-0016', 'Reims — 0016')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0016-ulysse', :'ulysse', 'Ulysse', 'U', 'ulysse0016@example.org',
   (select id from public.loge where bubble_id = 'loge-0016')),
  ('ref-0016-vera',   :'vera',   'Vera',   'V', 'vera0016@example.org',
   (select id from public.loge where bubble_id = 'loge-0016')),
  ('ref-0016-wanda',  :'wanda',  'Wanda',  'W', 'wanda0016@example.org',
   (select id from public.loge where bubble_id = 'loge-0016')),
  ('ref-0016-parrain', null,     'Parrain', 'P', 'parrain0016@example.org',
   (select id from public.loge where bubble_id = 'loge-0016'))
on conflict do nothing;

select id as ref_ulysse  from public.referent where bubble_id = 'ref-0016-ulysse'  \gset
select id as ref_vera    from public.referent where bubble_id = 'ref-0016-vera'    \gset
select id as ref_wanda   from public.referent where bubble_id = 'ref-0016-wanda'   \gset
select id as ref_parrain from public.referent where bubble_id = 'ref-0016-parrain' \gset

insert into public.candidat (bubble_id, nom, prenom, loge_id, referent_id, parrain_id) values
  ('cand-0016-un', 'Un', 'Alpha',
   (select id from public.loge where bubble_id = 'loge-0016'), :'ref_wanda'::uuid, null),
  -- Clôturé, et parrainé : un dossier clos garde son histoire, et cette
  -- histoire nomme quelqu'un.
  ('cand-0016-clos', 'Clos', 'Beta',
   (select id from public.loge where bubble_id = 'loge-0016'), null, :'ref_parrain'::uuid)
on conflict do nothing;
update public.candidat set cloture = 'Emploi trouvé' where bubble_id = 'cand-0016-clos';

-- ---------------------------------------------------------------------------
\echo '— la table n a toujours aucune policy de suppression'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'referent' and cmd = 'DELETE') = 0,
  'la fonction est la seule porte : un delete direct reste sans effet');

-- ---------------------------------------------------------------------------
\echo '— un referent ordinaire ne supprime personne'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000017"}', true);
  begin
    perform public.supprimer_referent(
      (select id from public.referent where bubble_id = 'ref-0016-wanda'));
    raise exception 'ÉCHEC — une référente a supprimé la fiche d''une autre';
  exception when insufficient_privilege then
    raise notice '  ok — refusé : elle n''est pas administratrice';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une fiche qui accompagne des candidats ne s efface pas'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000016"}', true);
  begin
    perform public.supprimer_referent(
      (select id from public.referent where bubble_id = 'ref-0016-wanda'));
    raise exception 'ÉCHEC — un candidat vient de perdre sa référente en silence';
  exception when restrict_violation then
    raise notice '  ok — refusé : il faut d''abord confier ses candidats';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— ni celle d un parrain, meme sur un dossier cloture'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000016"}', true);
  begin
    perform public.supprimer_referent(
      (select id from public.referent where bubble_id = 'ref-0016-parrain'));
    raise exception 'ÉCHEC — un dossier clos a perdu le nom de son parrain';
  exception when restrict_violation then
    raise notice '  ok — refusé : un dossier clos garde son histoire';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— on ne se retire pas soi-meme'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000016"}', true);
  begin
    perform public.supprimer_referent(
      (select id from public.referent where bubble_id = 'ref-0016-ulysse'));
    raise exception 'ÉCHEC — l''administrateur s''est retiré de l''annuaire';
  exception when check_violation then
    raise notice '  ok — refusé : personne pour le défaire ensuite';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— une fiche libre, oui'
-- ---------------------------------------------------------------------------
do $$
declare reste integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000016"}', true);

  perform public.supprimer_referent(
    (select id from public.referent where bubble_id = 'ref-0016-vera'));

  reset role;
  select count(*) into reste from public.referent where bubble_id = 'ref-0016-vera';
  if reste <> 0 then
    raise exception 'ÉCHEC — la fiche est toujours là';
  end if;
  raise notice '  ok — la fiche de Vera a été retirée';
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et une fiche qui n existe plus se dit, sans rien reveler d autre'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000016"}', true);
  begin
    perform public.supprimer_referent('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — supprimer le néant a réussi';
  exception when no_data_found then
    raise notice '  ok — « cette fiche n''existe plus »';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et rien de tout cela sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.supprimer_referent('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'ÉCHEC — anon a pu appeler la suppression';
  exception when insufficient_privilege then
    raise notice '  ok — anon n''a pas le droit d''appeler la fonction';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0016_supprimer_referent.sql sont passés.'
