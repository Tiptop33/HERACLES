-- Tests de la migration 0065_fiche_candidat_facultative.sql.
--
-- Une loge, Nantes-0065, et trois dossiers ouverts sans parrain, chacun avec
-- son lien de candidat :
--
--   · Ada   envoie le strict minimum — nom, prénom, adresse, téléphone —, sans CV ;
--   · Bob   oublie son téléphone, puis invente un type de recherche, puis
--           laisse le type vide : celui du dossier reste ;
--   · Cid   donne un CV qui n'est pas le sien.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values ('loge-0065-nantes', 'Nantes — 0065')
on conflict do nothing;

select id as nantes from public.loge where bubble_id = 'loge-0065-nantes' \gset

\set ada 'cccccccc-6565-0000-0000-000000000001'
\set bob 'cccccccc-6565-0000-0000-000000000002'
\set cid 'cccccccc-6565-0000-0000-000000000003'

insert into public.candidat (id, loge_id, numero, nom, prenom, email, type_emploi) values
  (:'ada', :'nantes', 651, 'ADA', 'Ada', 'ada0065@example.org', 'stage'),
  (:'bob', :'nantes', 652, 'BOB', 'Bob', 'bob0065@example.org', 'stage en alternance'),
  (:'cid', :'nantes', 653, 'CID', 'Cid', 'cid0065@example.org', 'emploi')
on conflict do nothing;

-- Des dossiers ouverts sans parrain (0060) : le lien du candidat seul.
insert into public.parrainage (loge_id, candidat_id, jeton_candidat_empreinte, candidat_expire_le) values
  (:'nantes', :'ada', repeat('a', 63) || '1', now() + interval '30 days'),
  (:'nantes', :'bob', repeat('a', 63) || '2', now() + interval '30 days'),
  (:'nantes', :'cid', repeat('a', 63) || '3', now() + interval '30 days');

-- ---------------------------------------------------------------------------
\echo '— le strict minimum suffit : nom, prenom, adresse, telephone, sans CV'
-- ---------------------------------------------------------------------------
begin;
  set local role service_role;
  select public.completer_sa_candidature(repeat('a', 63) || '1',
    '{"nom":"Lovelace","prenom":"Ada","email":"ada0065@example.org","telephone":"06 12 34 56 78"}'::jsonb,
    null);
commit;

select public.verifier(
  (select candidature_completee_le is not null and nom = 'LOVELACE' and prenom = 'Ada'
          and telephone = '06 12 34 56 78' and cv_chemin is null and age is null
          and formations is null and adresse is null
     from public.candidat where id = :'ada'::uuid),
  'la fiche est enregistrée sans CV et sans le reste');

select public.verifier(
  (select type_emploi from public.candidat where id = :'ada'::uuid) = 'stage',
  'sans type de recherche donné, celui du dossier reste');

-- ---------------------------------------------------------------------------
\echo '— le telephone reste obligatoire, et le type, s il est donne, doit etre connu'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role service_role;

  begin
    perform public.completer_sa_candidature(repeat('a', 63) || '2',
      '{"nom":"Martin","prenom":"Bob","telephone":"  "}'::jsonb, null);
    raise exception 'ÉCHEC — une fiche sans téléphone a été acceptée';
  exception when check_violation then
    raise notice '  ok — le téléphone est obligatoire';
  end;

  begin
    perform public.completer_sa_candidature(repeat('a', 63) || '2',
      '{"nom":"","prenom":"Bob","telephone":"0612345678"}'::jsonb, null);
    raise exception 'ÉCHEC — une fiche sans nom a été acceptée';
  exception when check_violation then
    raise notice '  ok — le nom est obligatoire';
  end;

  begin
    perform public.completer_sa_candidature(repeat('a', 63) || '2',
      '{"nom":"Martin","prenom":"Bob","telephone":"0612345678","type_emploi":"CDI"}'::jsonb, null);
    raise exception 'ÉCHEC — un type de recherche inventé a été accepté';
  exception when check_violation then
    raise notice '  ok — un type donné doit être l''un de la liste';
  end;
end
$$;

select public.verifier(
  (select candidature_completee_le is null from public.candidat where id = :'bob'::uuid),
  'les refus n''ont rien enregistré');

begin;
  set local role service_role;
  select public.completer_sa_candidature(repeat('a', 63) || '2',
    '{"nom":"Martin","prenom":"Bob","telephone":"0612345678","type_emploi":"","age":"31"}'::jsonb,
    'candidat/cv/' || :'bob' || '.pdf');
commit;

select public.verifier(
  (select type_emploi = 'stage en alternance' and age = 31
          and cv_chemin = 'candidat/cv/' || :'bob' || '.pdf'
     from public.candidat where id = :'bob'::uuid),
  'un type laissé vide garde celui du dossier ; un CV donné est rangé');

-- ---------------------------------------------------------------------------
\echo '— un CV donne ne peut etre que celui de ce dossier'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role service_role;
  begin
    perform public.completer_sa_candidature(repeat('a', 63) || '3',
      '{"nom":"Cid","prenom":"Cid","telephone":"0612345678"}'::jsonb,
      'candidat/cv/' || 'cccccccc-6565-0000-0000-000000000001' || '.pdf');
    raise exception 'ÉCHEC — le CV d''un autre dossier a été accepté';
  exception when check_violation then
    raise notice '  ok — le CV d''un autre dossier est refusé';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— la fonction reste reservee a la cle serveur'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  begin
    perform public.completer_sa_candidature(repeat('a', 63) || '3',
      '{"nom":"Cid","prenom":"Cid","telephone":"0612345678"}'::jsonb, null);
    raise exception 'ÉCHEC — une session complète une fiche';
  exception when insufficient_privilege then
    raise notice '  ok — completer_sa_candidature est réservée à la clé serveur';
  end;
end
$$;

\o
\echo '0065 — la fiche facultative : tout est vert.'
