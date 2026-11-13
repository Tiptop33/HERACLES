-- Tests de la migration 0089_loges_du_reseau.sql.
--
-- Ce qu'on éprouve :
--   * une loge du réseau porte son nom, son numéro, sa province, son
--     Secrétaire et son adresse ; un nom vide, une adresse mal formée, un
--     numéro déjà pris sont refusés ;
--   * le lien ne se garde que par son empreinte, et toujours avec sa date de
--     fin ;
--   * les secteurs se cochent de la division à la sous-classe — ni la section
--     seule, ni deux fois le même, ni un code inconnu ;
--   * la date de la liste suit chaque case cochée ou décochée ;
--   * retirer la loge du réseau emporte ses secteurs ;
--   * les deux tables sont fermées.
--
-- Données fabriquées : deux loges du réseau inventées, des adresses en
-- example.org.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge_du_reseau (nom, numero, secretaire_nom, secretaire_email) values
  ('Loge d''essai 0089 A', '0089-A', 'Dominique Modèle', 'secretaire-a-0089@example.org'),
  ('Loge d''essai 0089 B', '0089-B', null, null);

select id as a from public.loge_du_reseau where numero = '0089-A' \gset
select id as b from public.loge_du_reseau where numero = '0089-B' \gset

\echo '— la loge du réseau et son Secrétaire'
select public.verifier(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'loge_du_reseau')
  = array['id', 'nom', 'numero', 'province_id', 'secretaire_nom', 'secretaire_email', 'ecusson_chemin',
          'lien_empreinte', 'lien_envoye_le', 'lien_expire_le', 'secteurs_maj_le', 'cree_le', 'maj_le'],
  'nom, numéro, province, Secrétaire et adresse, écusson, le lien, la date de la liste');

do $$
begin
  begin
    insert into public.loge_du_reseau (nom) values ('   ');
    raise exception 'ÉCHEC — une loge sans nom est entrée';
  exception when check_violation then
    raise notice '  ok — refusé : une loge sans nom';
  end;

  begin
    insert into public.loge_du_reseau (nom, secretaire_email) values ('Loge 0089 C', 'pas-une-adresse');
    raise exception 'ÉCHEC — une adresse mal formée est entrée';
  exception when check_violation then
    raise notice '  ok — refusé : une adresse mal formée';
  end;

  begin
    insert into public.loge_du_reseau (nom, numero) values ('Loge 0089 D', ' 0089-a ');
    raise exception 'ÉCHEC — un numéro déjà pris est entré';
  exception when unique_violation then
    raise notice '  ok — refusé : un numéro déjà pris, à la casse et aux espaces près';
  end;

  begin
    insert into public.loge_du_reseau (nom, ecusson_chemin) values ('Loge 0089 G', 'ailleurs/ecusson.png');
    raise exception 'ÉCHEC — un écusson rangé ailleurs est entré';
  exception when check_violation then
    raise notice '  ok — refusé : un écusson dont le chemin ne se déduit pas de la loge';
  end;

  begin
    insert into public.loge_du_reseau (nom, lien_empreinte, lien_expire_le)
    values ('Loge 0089 E', 'pas-une-empreinte', now());
    raise exception 'ÉCHEC — une empreinte mal formée est entrée';
  exception when check_violation then
    raise notice '  ok — refusé : une empreinte qui n''est pas un SHA-256';
  end;

  begin
    insert into public.loge_du_reseau (nom, lien_empreinte)
    values ('Loge 0089 F', repeat('a', 64));
    raise exception 'ÉCHEC — un lien sans date de fin est entré';
  exception when check_violation then
    raise notice '  ok — refusé : un lien sans date de fin';
  end;
end
$$;

update public.loge_du_reseau
   set ecusson_chemin = 'loge-du-reseau/ecusson/' || id::text || '.png'
 where id = :'a';
select public.verifier(
  (select ecusson_chemin like 'loge-du-reseau/ecusson/%.png' from public.loge_du_reseau where id = :'a'),
  'un écusson rangé au chemin de sa loge est accepté');

\echo '— les secteurs, de la division à la sous-classe'
select public.verifier(
  (select secteurs_maj_le is null from public.loge_du_reseau where id = :'a'),
  'une loge qui n''a rien coché n''a pas de date');

insert into public.loge_du_reseau_secteur (loge_du_reseau_id, code) values
  (:'a', '43'), (:'a', '43.21A'), (:'a', '86.9'), (:'a', '56.10');

select public.verifier(
  (select string_agg(code, ' ' order by code) from public.loge_du_reseau_secteur
    where loge_du_reseau_id = :'a') = '43 43.21A 56.10 86.9',
  'une division, une sous-classe, une classe, un groupe');

select public.verifier(
  (select secteurs_maj_le is not null from public.loge_du_reseau where id = :'a'),
  'cocher date la liste');

select set_config('essai.a', :'a', false);
do $$
declare
  a uuid := current_setting('essai.a')::uuid;
begin
  begin
    insert into public.loge_du_reseau_secteur (loge_du_reseau_id, code) values (a, 'F');
    raise exception 'ÉCHEC — une section seule a été cochée';
  exception when check_violation then
    raise notice '  ok — refusé : une section seule';
  end;

  begin
    insert into public.loge_du_reseau_secteur (loge_du_reseau_id, code) values (a, '43');
    raise exception 'ÉCHEC — le même secteur est coché deux fois';
  exception when unique_violation then
    raise notice '  ok — refusé : le même secteur deux fois';
  end;

  begin
    insert into public.loge_du_reseau_secteur (loge_du_reseau_id, code) values (a, '00.00Z');
    raise exception 'ÉCHEC — un code inconnu est entré';
  exception when foreign_key_violation then
    raise notice '  ok — refusé : un code hors nomenclature';
  end;
end
$$;

\echo '— la date suit la liste'
update public.loge_du_reseau set secteurs_maj_le = now() - interval '1 year' where id = :'a';
delete from public.loge_du_reseau_secteur where loge_du_reseau_id = :'a' and code = '56.10';
select public.verifier(
  (select secteurs_maj_le > now() - interval '1 hour' from public.loge_du_reseau where id = :'a'),
  'décocher rajeunit la date');

update public.loge_du_reseau set secteurs_maj_le = now() - interval '1 year' where id in (:'a', :'b');
update public.loge_du_reseau_secteur set loge_du_reseau_id = :'b'
 where loge_du_reseau_id = :'a' and code = '86.9';
select public.verifier(
  (select bool_and(secteurs_maj_le > now() - interval '1 hour')
     from public.loge_du_reseau where id in (:'a', :'b')),
  'une ligne qui change de loge date les deux');

\echo '— retirer la loge du réseau emporte ses secteurs'
delete from public.loge_du_reseau where id = :'b';
select public.verifier(
  not exists (select 1 from public.loge_du_reseau_secteur where loge_du_reseau_id = :'b'),
  'plus aucun secteur pour la loge retirée');

\echo '— fermées'
select public.verifier(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.loge_du_reseau'::regclass, 'public.loge_du_reseau_secteur'::regclass))
    and (select count(*) from pg_policies
          where schemaname = 'public' and tablename in ('loge_du_reseau', 'loge_du_reseau_secteur')) = 0,
  'RLS active, aucune policy');

select public.verifier(
  not has_table_privilege('authenticated', 'public.loge_du_reseau', 'select')
    and not has_table_privilege('anon', 'public.loge_du_reseau', 'select')
    and not has_table_privilege('authenticated', 'public.loge_du_reseau_secteur', 'select')
    and not has_table_privilege('anon', 'public.loge_du_reseau_secteur', 'insert'),
  'ni anon ni authenticated ne s''adressent aux tables');

-- --- Ménage ----------------------------------------------------------------
delete from public.loge_du_reseau where id = :'a';

\o
\echo '0089 — les loges du réseau : tout est vert.'
