-- Tests de la migration 0066_photo_du_candidat.sql.
--
-- Une loge, Brest-0066, et trois dossiers ouverts sans parrain :
--
--   · Eve   envoie sa fiche avec la photo tirée de son CV ;
--   · Fay   avait une photo reprise de Bubble, et n'en envoie pas : elle reste ;
--   · Gus   tente une photo qui n'est pas la sienne, puis un document en guise
--           de photo.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values ('loge-0066-brest', 'Brest — 0066')
on conflict do nothing;

select id as brest from public.loge where bubble_id = 'loge-0066-brest' \gset

\set eve 'cccccccc-6666-0000-0000-000000000001'
\set fay 'cccccccc-6666-0000-0000-000000000002'
\set gus 'cccccccc-6666-0000-0000-000000000003'

insert into public.candidat (id, loge_id, numero, nom, prenom, email, photo_chemin) values
  (:'eve', :'brest', 661, 'EVE', 'Eve', 'eve0066@example.org', null),
  (:'fay', :'brest', 662, 'FAY', 'Fay', 'fay0066@example.org', 'candidat/photo/bubble-fay/portrait.jpg'),
  (:'gus', :'brest', 663, 'GUS', 'Gus', 'gus0066@example.org', null)
on conflict do nothing;

insert into public.parrainage (loge_id, candidat_id, jeton_candidat_empreinte, candidat_expire_le) values
  (:'brest', :'eve', repeat('b', 63) || '1', now() + interval '30 days'),
  (:'brest', :'fay', repeat('b', 63) || '2', now() + interval '30 days'),
  (:'brest', :'gus', repeat('b', 63) || '3', now() + interval '30 days');

-- ---------------------------------------------------------------------------
\echo '— une seule version de la fonction : celle qui recoit la photo'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_proc
    where proname = 'completer_sa_candidature' and pronamespace = 'public'::regnamespace) = 1
  and (select pronargs from pg_proc
        where proname = 'completer_sa_candidature' and pronamespace = 'public'::regnamespace) = 5,
  'l''ancienne signature à quatre paramètres a disparu');

-- ---------------------------------------------------------------------------
\echo '— la photo tiree du CV devient celle du dossier'
-- ---------------------------------------------------------------------------
begin;
  set local role service_role;
  select public.completer_sa_candidature(repeat('b', 63) || '1',
    '{"nom":"Eve","prenom":"Eve","telephone":"0612345678"}'::jsonb,
    'candidat/cv/' || :'eve' || '.pdf', null, 'candidat/photo/' || :'eve' || '.jpg');
commit;

select public.verifier(
  (select photo_chemin from public.candidat where id = :'eve'::uuid)
    = 'candidat/photo/' || :'eve' || '.jpg',
  'la photo est rangée sous le nom que la route lui a fixé');

-- ---------------------------------------------------------------------------
\echo '— sans photo envoyee, celle du dossier reste'
-- ---------------------------------------------------------------------------
begin;
  set local role service_role;
  -- Appelée comme avant 0066, sans le cinquième paramètre.
  select public.completer_sa_candidature(repeat('b', 63) || '2',
    '{"nom":"Fay","prenom":"Fay","telephone":"0612345678"}'::jsonb, null);
commit;

select public.verifier(
  (select photo_chemin from public.candidat where id = :'fay'::uuid)
    = 'candidat/photo/bubble-fay/portrait.jpg',
  'la photo reprise de Bubble n''est pas effacée');

-- ---------------------------------------------------------------------------
\echo '— une photo ne peut etre que celle de ce dossier, et une image'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role service_role;

  begin
    perform public.completer_sa_candidature(repeat('b', 63) || '3',
      '{"nom":"Gus","prenom":"Gus","telephone":"0612345678"}'::jsonb, null, null,
      'candidat/photo/cccccccc-6666-0000-0000-000000000001.jpg');
    raise exception 'ÉCHEC — la photo d''un autre dossier a été acceptée';
  exception when check_violation then
    raise notice '  ok — la photo d''un autre dossier est refusée';
  end;

  begin
    perform public.completer_sa_candidature(repeat('b', 63) || '3',
      '{"nom":"Gus","prenom":"Gus","telephone":"0612345678"}'::jsonb, null, null,
      'candidat/photo/cccccccc-6666-0000-0000-000000000003.pdf');
    raise exception 'ÉCHEC — un PDF a été accepté comme photo';
  exception when check_violation then
    raise notice '  ok — une photo est une image : JPEG, PNG ou WebP';
  end;
end
$$;

select public.verifier(
  (select candidature_completee_le is null and photo_chemin is null
     from public.candidat where id = :'gus'::uuid),
  'les refus n''ont rien enregistré');

-- ---------------------------------------------------------------------------
\echo '— la fonction reste reservee a la cle serveur'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  begin
    perform public.completer_sa_candidature(repeat('b', 63) || '3',
      '{"nom":"Gus","prenom":"Gus","telephone":"0612345678"}'::jsonb, null);
    raise exception 'ÉCHEC — une session complète une fiche';
  exception when insufficient_privilege then
    raise notice '  ok — completer_sa_candidature est réservée à la clé serveur';
  end;
end
$$;

\o
\echo '0066 — la photo du candidat : tout est vert.'
