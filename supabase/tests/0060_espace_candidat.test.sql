-- Tests de la migration 0060_espace_candidat.sql.
--
--   · Agathe, administratrice
--   · Basile, simple référent à Nantes-0060
--   · Victor, référent à Nantes-0060, et parrain de Lucie
--   · Lucie, candidate invitée par Agathe, dossier à Rennes-0060
--   · Hugo,  candidat invité lui aussi — l'autre fiche, celle que Lucie ne
--            doit jamais voir
--
-- Ce qui compte : seul un administrateur ouvre un dossier ; le candidat ne
-- lit que sa fiche et n'en écrit que ce qu'il remplit lui-même.

\set ON_ERROR_STOP on
\o /dev/null

\set agathe 'aaaaaaaa-6000-0000-0000-000000000001'
\set basile 'aaaaaaaa-6000-0000-0000-000000000002'
\set victor 'aaaaaaaa-6000-0000-0000-000000000003'
\set lucie  'aaaaaaaa-6000-0000-0000-000000000004'
\set hugo   'aaaaaaaa-6000-0000-0000-000000000005'

select encode(sha256('jeton-0060-lucie-1'::bytea), 'hex') as e_l1 \gset
select encode(sha256('jeton-0060-lucie-2'::bytea), 'hex') as e_l2 \gset
select encode(sha256('jeton-0060-hugo'::bytea),    'hex') as e_h  \gset
select encode(sha256('jeton-0060-refus'::bytea),   'hex') as e_x  \gset

insert into auth.users (id, email, raw_user_meta_data) values
  (:'agathe', 'agathe0060@example.org', '{"role":"referent"}'),
  (:'basile', 'basile0060@example.org', '{"role":"referent"}'),
  (:'victor', 'victor0060@example.org', '{"role":"referent"}');
update public.profil set role = 'admin' where id = :'agathe';

insert into public.loge (bubble_id, nom, prochain_numero_candidat) values
  ('loge-0060-nantes', 'Nantes — 0060', 10),
  ('loge-0060-rennes', 'Rennes — 0060', 41)
on conflict do nothing;

select id as nantes from public.loge where bubble_id = 'loge-0060-nantes' \gset
select id as rennes from public.loge where bubble_id = 'loge-0060-rennes' \gset

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0060-basile', :'basile', 'Basile', 'B', 'basile0060@example.org', :'nantes'),
  ('ref-0060-victor', :'victor', 'Victor', 'V', 'Victor0060@Example.org', :'nantes')
on conflict do nothing;

-- Un dossier déjà porteur d'une adresse, sans invitation : repris de Bubble.
insert into public.candidat (bubble_id, numero, nom, prenom, email, loge_id) values
  ('cand-0060-repris', 12, 'REPRIS', 'R', 'repris0060@example.org', :'rennes')
on conflict do nothing;

\set parrain_victor '{"nom":"dupont","prenom":"Victor","loge":"1234","email":"VICTOR0060@example.org"}'

-- ---------------------------------------------------------------------------
\echo '— seul un administrateur ouvre un dossier'
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.inviter_un_candidat(
      'aaaaaaaa-6000-0000-0000-000000000002'::uuid, 'intrus0060@example.org',
      (select id from public.loge where bubble_id = 'loge-0060-rennes'),
      '{"nom":"X","prenom":"Y","loge":"1","email":"x@example.org"}'::jsonb,
      encode(sha256('jeton-0060-refus'::bytea), 'hex'));
    raise exception 'ÉCHEC — un référent a pu inviter un candidat';
  exception when insufficient_privilege then
    raise notice '  ok — un simple référent ne peut pas inviter de candidat';
  end;
end
$$;

select public.verifier(
  not has_function_privilege('authenticated',
    'public.inviter_un_candidat(uuid, text, uuid, jsonb, text)', 'execute')
  and not has_function_privilege('anon',
    'public.inviter_un_candidat(uuid, text, uuid, jsonb, text)', 'execute'),
  'la fonction n''est pas appelable depuis une session, ni sans session');

\echo '— il faut le parrain entier'
do $$
begin
  begin
    perform public.inviter_un_candidat(
      'aaaaaaaa-6000-0000-0000-000000000001'::uuid, 'sansloge0060@example.org',
      (select id from public.loge where bubble_id = 'loge-0060-rennes'),
      '{"nom":"Dupont","prenom":"Victor","email":"v@example.org"}'::jsonb,
      encode(sha256('jeton-0060-refus'::bytea), 'hex'));
    raise exception 'ÉCHEC — un parrain sans numéro de loge a été accepté';
  exception when check_violation then
    raise notice '  ok — sans numéro de loge du parrain, rien ne s''ouvre';
  end;
end
$$;

select public.verifier(
  (select count(*) from public.candidat where email = 'sansloge0060@example.org') = 0,
  'et aucun dossier n''est resté à moitié ouvert');

\echo '— un dossier déjà là n est pas doublé'
do $$
begin
  begin
    perform public.inviter_un_candidat(
      'aaaaaaaa-6000-0000-0000-000000000001'::uuid, 'Repris0060@example.org',
      (select id from public.loge where bubble_id = 'loge-0060-rennes'),
      '{"nom":"Dupont","prenom":"Victor","loge":"1234","email":"v@example.org"}'::jsonb,
      encode(sha256('jeton-0060-refus'::bytea), 'hex'));
    raise exception 'ÉCHEC — un second dossier a été ouvert pour la même adresse';
  exception when unique_violation then
    raise notice '  ok — une adresse qui a déjà son dossier est refusée';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— l administratrice invite Lucie, dans la loge qu elle choisit'
-- ---------------------------------------------------------------------------
select public.inviter_un_candidat(:'agathe', ' Lucie0060@Example.org ', :'rennes',
  :'parrain_victor'::jsonb, :'e_l1') as invitation_lucie \gset
select (:'invitation_lucie'::jsonb ->> 'candidat_id') as dossier_lucie \gset

select public.verifier(
  (select loge_id = :'rennes'::uuid and numero = 42 and referent_id is null
          and email = 'lucie0060@example.org'
     from public.candidat where id = :'dossier_lucie'::uuid),
  'le dossier s''ouvre à Rennes, au numéro suivant, sans référent');

select public.verifier(
  (select parrain_nom = 'DUPONT' and parrain_prenom = 'Victor' and parrain_loge = '1234'
          and parrain_email = 'victor0060@example.org'
     from public.candidat where id = :'dossier_lucie'::uuid),
  'le parrain saisi est gardé sur le dossier');

select public.verifier(
  (select parrain_id from public.candidat where id = :'dossier_lucie'::uuid)
    = (select id from public.referent where bubble_id = 'ref-0060-victor'),
  'le parrain déjà présent dans HERACLES est retrouvé par son adresse');

select public.verifier(
  (select role = 'candidat' and etat = 'envoyee' and candidat_id = :'dossier_lucie'::uuid
          and loge_id = :'rennes'::uuid
     from public.invitation where jeton_empreinte = :'e_l1'),
  'l''invitation part au rôle candidat, et sait quel dossier elle ouvre');

\echo '— réinviter Lucie ne rouvre pas un second dossier'
select public.inviter_un_candidat(:'agathe', 'lucie0060@example.org', :'rennes',
  '{"nom":"Martin","prenom":"Paule","loge":"77","email":"paule0060@example.org"}'::jsonb,
  :'e_l2') as reinvitation \gset

select public.verifier(
  (:'reinvitation'::jsonb ->> 'candidat_id') = :'dossier_lucie'
  and (select count(*) from public.candidat where email = 'lucie0060@example.org') = 1,
  'même dossier, même numéro');
select public.verifier(
  (select etat from public.invitation where jeton_empreinte = :'e_l1') = 'refusee',
  'le premier lien cesse de valoir');
select public.verifier(
  (select parrain_nom from public.candidat where id = :'dossier_lucie'::uuid) = 'MARTIN',
  'le parrain corrigé remplace le précédent');

select public.inviter_un_candidat(:'agathe', 'hugo0060@example.org', :'nantes',
  :'parrain_victor'::jsonb, :'e_h') as invitation_hugo \gset
select (:'invitation_hugo'::jsonb ->> 'candidat_id') as dossier_hugo \gset

-- ---------------------------------------------------------------------------
\echo '— accepter relie le compte au dossier'
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:'lucie', 'lucie0060@example.org', '{}'),
  (:'hugo',  'hugo0060@example.org',  '{}');

do $$
begin
  begin
    perform public.accepter_invitation(
      encode(sha256('jeton-0060-hugo'::bytea), 'hex'),
      'aaaaaaaa-6000-0000-0000-000000000004'::uuid, null, null);
    raise exception 'ÉCHEC — Lucie a pu accepter l''invitation de Hugo';
  exception when insufficient_privilege then
    raise notice '  ok — l''invitation de Hugo ne vaut pas pour le compte de Lucie';
  end;
end
$$;

select public.accepter_invitation(:'e_l2', :'lucie', null, null);
select public.accepter_invitation(:'e_h', :'hugo', null, null);

select public.verifier(
  (select role from public.profil where id = :'lucie') = 'candidat',
  'Lucie est candidate');
select public.verifier(
  (select profil_id from public.candidat where id = :'dossier_lucie'::uuid) = :'lucie'::uuid,
  'son compte tient son dossier');
select public.verifier(
  not exists (select 1 from public.referent where profil_id = :'lucie'),
  'un candidat ne reçoit pas de fiche de référent');

-- ---------------------------------------------------------------------------
\echo '— Lucie lit sa fiche, et rien d autre'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000004"}';

  select public.verifier((select count(*) from public.ma_fiche()) = 1,
    'ma_fiche() rend une ligne');
  select public.verifier(
    (select id from public.ma_fiche()) = :'dossier_lucie'::uuid
    and (select numero from public.ma_fiche()) = 42,
    'et c''est la sienne, le numéro 42');
  select public.verifier(
    (select count(*) from public.candidat) = 0,
    'la table candidat lui reste fermée en lecture directe');
commit;

select public.verifier(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ma_fiche'
      and pg_get_function_result(p.oid) ~ '(referent|appreciation|urgence|parrain|chemin)') = 0,
  'ma_fiche() ne rend ni référent, ni appréciation, ni urgence, ni parrain, ni chemin de fichier');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000002"}';
  select public.verifier((select count(*) from public.ma_fiche()) = 0,
    'un référent n''a pas de « ma fiche »');
commit;

-- ---------------------------------------------------------------------------
\echo '— Lucie modifie ce qu elle remplit, et rien d autre'
-- ---------------------------------------------------------------------------
update public.candidat set appreciation = 'Avis de la commission', urgence = 2
 where id = :'dossier_lucie'::uuid;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000004"}';

  select public.modifier_ma_fiche(jsonb_build_object(
    'nom', 'martin', 'prenom', 'Lucie', 'telephone', '0600000000',
    'age', '27', 'ville', 'Rennes', 'type_emploi', 'stage',
    'emploi_recherche', 'Aide-soignante', 'debut_stage', '2027-01-04',
    -- Ce qu'elle n'a pas le droit d'écrire, glissé dans le même envoi.
    'referent_id', (select id from public.referent where bubble_id = 'ref-0060-basile'),
    'loge_id', (select id from public.loge where bubble_id = 'loge-0060-nantes'),
    'appreciation', 'Excellente', 'urgence', '5', 'email', 'autre@example.org',
    'numero', '1', 'parrain_nom', 'MOI'
  ));

  -- Une mise à jour directe ne touche aucune ligne : la table est fermée.
  update public.candidat set appreciation = 'Directe' where true;
commit;

select public.verifier(
  (select nom = 'MARTIN' and prenom = 'Lucie' and age = 27 and ville = 'Rennes'
          and type_emploi = 'stage' and emploi_recherche = 'Aide-soignante'
          and debut_stage::date = date '2027-01-04'
     from public.candidat where id = :'dossier_lucie'::uuid),
  'ce qu''elle remplit est enregistré');
select public.verifier(
  (select referent_id is null and loge_id = :'rennes'::uuid
          and appreciation = 'Avis de la commission' and urgence = 2
          and email = 'lucie0060@example.org' and numero = 42 and parrain_nom = 'MARTIN'
     from public.candidat where id = :'dossier_lucie'::uuid),
  'ni le référent, ni la loge, ni l''appréciation, ni l''urgence, ni l''e-mail, ni le numéro, ni le parrain ne bougent');
select public.verifier(
  (select candidature_completee_le is not null from public.candidat where id = :'dossier_lucie'::uuid),
  'le premier enregistrement marque la candidature complétée');
select public.verifier(
  (select nom is null from public.candidat where id = :'dossier_hugo'::uuid),
  'la fiche de Hugo n''a pas bougé');

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6000-0000-0000-000000000004"}', true);
  begin
    perform public.modifier_ma_fiche('{"nom":"","prenom":"Lucie"}'::jsonb);
    raise exception 'ÉCHEC — une fiche sans nom a été acceptée';
  exception when check_violation then
    raise notice '  ok — le nom reste obligatoire';
  end;
  begin
    perform public.modifier_ma_fiche('{"nom":"M","prenom":"L","type_emploi":"astronaute"}'::jsonb);
    raise exception 'ÉCHEC — un type de recherche inconnu a été accepté';
  exception when check_violation then
    raise notice '  ok — le type de recherche suit la liste de Bubble';
  end;
  begin
    perform public.modifier_ma_fiche('{"nom":"M","prenom":"L","age":"7"}'::jsonb);
    raise exception 'ÉCHEC — un âge de sept ans a été accepté';
  exception when check_violation then
    raise notice '  ok — l''âge reste dans ses bornes';
  end;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— Lucie range son CV sous son dossier, et sous aucun autre'
-- ---------------------------------------------------------------------------
select set_config('essai.dossier_lucie', :'dossier_lucie', false);
select set_config('essai.dossier_hugo',  :'dossier_hugo',  false);

do $$
declare
  lucie_cv text := 'candidat/cv/' || current_setting('essai.dossier_lucie') || '.pdf';
  hugo_cv  text := 'candidat/cv/' || current_setting('essai.dossier_hugo')  || '.pdf';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-6000-0000-0000-000000000004"}', true);

  perform public.ranger_mon_document('cv', lucie_cv);
  raise notice '  ok — son CV se range sous son dossier';

  begin
    perform public.ranger_mon_document('cv', hugo_cv);
    raise exception 'ÉCHEC — Lucie a rattaché le chemin du dossier de Hugo';
  exception when check_violation then
    raise notice '  ok — le chemin du dossier de Hugo est refusé';
  end;

  begin
    perform public.ranger_mon_document('cv',
      'candidat/cv/' || current_setting('essai.dossier_lucie') || '.docx');
    raise exception 'ÉCHEC — un CV qui n''est pas un PDF a été accepté';
  exception when check_violation then
    raise notice '  ok — le CV est un PDF';
  end;
end
$$;
reset role;

select public.verifier(
  (select cv_chemin from public.candidat where id = :'dossier_lucie'::uuid)
    = 'candidat/cv/' || :'dossier_lucie' || '.pdf'
  and (select cv_chemin is null from public.candidat where id = :'dossier_hugo'::uuid),
  'le CV est sur la fiche de Lucie, et pas sur celle de Hugo');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-6000-0000-0000-000000000004"}';
  select public.verifier((select a_un_cv from public.ma_fiche()),
    'ma_fiche() sait que le CV est là');
commit;

\echo '— sans session, rien'
select public.verifier(
  not has_function_privilege('anon', 'public.ma_fiche()', 'execute')
  and not has_function_privilege('anon', 'public.modifier_ma_fiche(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.ranger_mon_document(text, text)', 'execute'),
  'aucune des trois n''est ouverte à anon');

\echo ''
\echo 'Tous les contrôles de 0060_espace_candidat.sql sont passés.'
