-- Tests de la migration 0088_secteurs_du_candidat.sql.
--
-- Ce qu'on éprouve :
--   * un candidat désigne jusqu'à trois secteurs, classés, section ou
--     division ; pas un quatrième, pas deux fois le même, pas un niveau plus
--     fin ;
--   * l'origine et la confirmation se tiennent ;
--   * supprimer le candidat emporte ses secteurs ; le départ du référent qui
--     les avait confirmés laisse la date ;
--   * la table est fermée.
--
-- Données fabriquées : un candidat et un référent d'essai, aucune personne
-- réelle.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values ('loge-0088', 'Loge d''essai 0088')
on conflict (bubble_id) do nothing;

insert into public.referent (bubble_id, nom, prenom, loge_id)
values ('ref-0088', 'ESSAI', 'Rémi', (select id from public.loge where bubble_id = 'loge-0088'))
on conflict (bubble_id) do nothing;

insert into public.candidat (bubble_id, nom, prenom, loge_id) values
  ('cand-0088-a', 'Essai', 'Ada',  (select id from public.loge where bubble_id = 'loge-0088')),
  ('cand-0088-b', 'Essai', 'Bert', (select id from public.loge where bubble_id = 'loge-0088'))
on conflict (bubble_id) do nothing;

select id as cand_a from public.candidat where bubble_id = 'cand-0088-a' \gset
select id as cand_b from public.candidat where bubble_id = 'cand-0088-b' \gset
select id as ref    from public.referent where bubble_id = 'ref-0088' \gset

\echo '— trois secteurs, classés'
-- Ada : une division proposée par elle, une section, une division confirmée.
insert into public.candidat_secteur (candidat_id, rang, code, propose_par) values
  (:'cand_a', 1, '43', 'candidat'),
  (:'cand_a', 2, 'H',  'candidat');
insert into public.candidat_secteur (candidat_id, rang, code, propose_par, confirme_par, confirme_le)
values (:'cand_a', 3, '52', 'referent', :'ref', now());

select public.verifier(
  (select string_agg(code, ' ' order by rang) from public.candidat_secteur
    where candidat_id = :'cand_a') = '43 H 52',
  'trois secteurs, dans l''ordre : 43, H, 52');

select public.verifier(
  (select count(*) from public.candidat_secteur
    where candidat_id = :'cand_a' and confirme_le is null) = 2,
  'deux proposés, un confirmé');

\echo '— ce que la table refuse'
select set_config('essai.cand_a', :'cand_a', false);
select set_config('essai.ref', :'ref', false);

do $$
declare
  cand uuid := current_setting('essai.cand_a')::uuid;
  ref  uuid := current_setting('essai.ref')::uuid;
begin
  begin
    insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
      values (cand, 4, '56', 'candidat');
    raise exception 'ÉCHEC — un quatrième secteur est entré';
  exception when check_violation then
    raise notice '  ok — refusé : un quatrième secteur';
  end;

  begin
    insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
      values (cand, 0, '56', 'candidat');
    raise exception 'ÉCHEC — un rang 0 est entré';
  exception when check_violation then
    raise notice '  ok — refusé : un rang hors de 1 à 3';
  end;

  begin
    update public.candidat_secteur set code = '43' where candidat_id = cand and rang = 2;
    raise exception 'ÉCHEC — le même secteur est cité deux fois';
  exception when unique_violation then
    raise notice '  ok — refusé : le même secteur deux fois';
  end;

  begin
    update public.candidat_secteur set code = '43.21A' where candidat_id = cand and rang = 2;
    raise exception 'ÉCHEC — une sous-classe a été choisie';
  exception when check_violation then
    raise notice '  ok — refusé : une sous-classe, trop fine pour un choix';
  end;

  begin
    update public.candidat_secteur set code = '43.2' where candidat_id = cand and rang = 2;
    raise exception 'ÉCHEC — un groupe a été choisi';
  exception when check_violation then
    raise notice '  ok — refusé : un groupe';
  end;

  begin
    update public.candidat_secteur set code = '00' where candidat_id = cand and rang = 2;
    raise exception 'ÉCHEC — un code inconnu est entré';
  exception when foreign_key_violation then
    raise notice '  ok — refusé : un code qui n''est pas dans la nomenclature';
  end;

  begin
    update public.candidat_secteur set propose_par = 'voisin' where candidat_id = cand and rang = 2;
    raise exception 'ÉCHEC — une origine inconnue est entrée';
  exception when check_violation then
    raise notice '  ok — refusé : une origine inconnue';
  end;

  begin
    update public.candidat_secteur set confirme_par = ref where candidat_id = cand and rang = 2;
    raise exception 'ÉCHEC — un référent confirme sans date';
  exception when check_violation then
    raise notice '  ok — refusé : un nom de référent sans date de confirmation';
  end;
end
$$;

\echo '— la date de retouche se tient seule'
update public.candidat_secteur set maj_le = now() - interval '1 day'
 where candidat_id = :'cand_a' and rang = 1;
update public.candidat_secteur set confirme_par = :'ref', confirme_le = now()
 where candidat_id = :'cand_a' and rang = 1;
select public.verifier(
  (select maj_le > now() - interval '1 hour' from public.candidat_secteur
    where candidat_id = :'cand_a' and rang = 1),
  'confirmer un secteur met maj_le à jour');

\echo '— départs'
insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
values (:'cand_b', 1, 'F', 'reprise');

delete from public.candidat where id = :'cand_b';
select public.verifier(
  not exists (select 1 from public.candidat_secteur where candidat_id = :'cand_b'),
  'supprimer un candidat emporte ses secteurs');

delete from public.referent where id = :'ref';
select public.verifier(
  (select confirme_par is null and confirme_le is not null
     from public.candidat_secteur where candidat_id = :'cand_a' and rang = 3),
  'le départ du référent laisse la date de confirmation');

\echo '— fermée'
select public.verifier(
  (select relrowsecurity from pg_class where oid = 'public.candidat_secteur'::regclass)
    and (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'candidat_secteur') = 0,
  'RLS active, aucune policy');

do $$
begin
  set local role authenticated;
  begin
    perform 1 from public.candidat_secteur limit 1;
    raise exception 'ÉCHEC — une session connectée lit les secteurs des candidats';
  exception when insufficient_privilege then
    raise notice '  ok — une session connectée ne lit rien';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform 1 from public.candidat_secteur limit 1;
    raise exception 'ÉCHEC — une personne non connectée lit les secteurs des candidats';
  exception when insufficient_privilege then
    raise notice '  ok — une personne non connectée ne lit rien';
  end;
end
$$;

-- --- Ménage ----------------------------------------------------------------
delete from public.candidat where id = :'cand_a';
delete from public.loge where bubble_id = 'loge-0088';

\o
\echo '0088 — les secteurs du candidat : tout est vert.'
