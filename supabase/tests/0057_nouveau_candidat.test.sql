-- Tests de la migration 0057_nouveau_candidat.sql.
--
--   · Paul     référent à Pau-0057 — il invite
--   · Quentin  référent à Pau-0057 — son collègue
--   · Rose     référente à Rennes-0057 — une autre loge
--   · Victor   référent à Rennes-0057, et parrain par son adresse
--   · Tess     un compte sans fiche de référent
--
-- Les jetons sont fabriqués ici comme la route les fabrique : seule leur
-- empreinte sha256 passe à la base.

\set ON_ERROR_STOP on
\o /dev/null

\set paul    'aaaaaaaa-5700-0000-0000-000000000001'
\set quentin 'aaaaaaaa-5700-0000-0000-000000000002'
\set rose    'aaaaaaaa-5700-0000-0000-000000000003'
\set victor  'aaaaaaaa-5700-0000-0000-000000000004'
\set tess    'aaaaaaaa-5700-0000-0000-000000000005'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'paul',    'paul0057@example.org',    '{"role":"referent","nom":"Paul","prenom":"P"}'),
  (:'quentin', 'quentin0057@example.org', '{"role":"referent","nom":"Quentin","prenom":"Q"}'),
  (:'rose',    'rose0057@example.org',    '{"role":"referent","nom":"Rose","prenom":"R"}'),
  (:'victor',  'victor0057@example.org',  '{"role":"referent","nom":"Victor","prenom":"V"}'),
  (:'tess',    'tess0057@example.org',    '{"role":"referent","nom":"Tess","prenom":"T"}');

-- Le compteur de Pau dit 41 ; un dossier repris porte pourtant le 45. Le
-- numéro suivant doit être 46 : le plus haut numéro porté, plus un (0083).
insert into public.loge (bubble_id, nom, prochain_numero_candidat) values
  ('loge-0057-pau',    'Pau — 0057',    41),
  ('loge-0057-rennes', 'Rennes — 0057', null)
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0057-paul',    :'paul',    'Paul',    'P', 'paul0057@example.org',
   (select id from public.loge where bubble_id = 'loge-0057-pau')),
  ('ref-0057-quentin', :'quentin', 'Quentin', 'Q', 'quentin0057@example.org',
   (select id from public.loge where bubble_id = 'loge-0057-pau')),
  ('ref-0057-rose',    :'rose',    'Rose',    'R', 'rose0057@example.org',
   (select id from public.loge where bubble_id = 'loge-0057-rennes')),
  ('ref-0057-victor',  :'victor',  'Victor',  'V', 'victor0057@example.org',
   (select id from public.loge where bubble_id = 'loge-0057-rennes'))
on conflict do nothing;

insert into public.candidat (bubble_id, numero, nom, prenom, loge_id) values
  ('cand-0057-ancien', 45, 'ANCIEN', 'Dossier',
   (select id from public.loge where bubble_id = 'loge-0057-pau'))
on conflict do nothing;

select id as r_paul    from public.referent where bubble_id = 'ref-0057-paul'    \gset
select id as r_quentin from public.referent where bubble_id = 'ref-0057-quentin' \gset
select id as r_rose    from public.referent where bubble_id = 'ref-0057-rose'    \gset
select id as r_victor  from public.referent where bubble_id = 'ref-0057-victor'  \gset
select id as l_pau     from public.loge     where bubble_id = 'loge-0057-pau'    \gset

select encode(sha256('jeton-0057-parrain-1'::bytea),  'hex') as e_p1 \gset
select encode(sha256('jeton-0057-parrain-2'::bytea),  'hex') as e_p2 \gset
select encode(sha256('jeton-0057-parrain-3'::bytea),  'hex') as e_p3 \gset
select encode(sha256('jeton-0057-candidat-1'::bytea), 'hex') as e_c1 \gset
select encode(sha256('jeton-0057-candidat-3'::bytea), 'hex') as e_c3 \gset
select encode(sha256('jeton-0057-relance-3'::bytea),  'hex') as e_r3 \gset

select set_config('essai.e_p2', :'e_p2', false);
select set_config('essai.r_rose', :'r_rose', false);
select set_config('essai.e_c1', :'e_c1', false);

-- ---------------------------------------------------------------------------
\echo '— la table ne se lit ni ne s ecrit directement'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'parrainage') = 0,
  'aucune policy sur parrainage : tout passe par les fonctions');

select public.verifier(
  public.refuse('anon', 'parrainage') and public.refuse('authenticated', 'parrainage'),
  'ni anon ni authenticated n''adressent la table');

-- ---------------------------------------------------------------------------
\echo '— un referent invite un parrain, sa loge le voit, l autre non'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';

  select public.inviter_un_parrain('  Victor0057@Example.org ', :'e_p1') as p1 \gset

  select public.verifier(
    (select count(*) from public.parrainages_de_ma_loge()) = 1
      and (select etat from public.parrainages_de_ma_loge()) = 'attente_parrain'
      and (select parrain_email from public.parrainages_de_ma_loge()) = 'victor0057@example.org',
    'Paul voit son invitation, en attente, adresse remise en minuscules');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000002"}';
  select public.verifier(
    (select count(*) from public.parrainages_de_ma_loge()) = 1,
    'Quentin, de la même loge, la voit aussi');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000003"}';
  select public.verifier(
    (select count(*) from public.parrainages_de_ma_loge()) = 0,
    'Rose, à Rennes, ne la voit pas');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5700-0000-0000-000000000005"}', true);
  begin
    perform public.inviter_un_parrain('quelquun@example.org', repeat('a', 64));
    raise exception 'ÉCHEC — un compte sans loge a invité';
  exception when insufficient_privilege then
    raise notice '  ok — sans loge, on n''invite personne';
  end;
end
$$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}', true);
  begin
    perform public.inviter_un_parrain('pas-une-adresse', repeat('b', 64));
    raise exception 'ÉCHEC — une adresse invalide a été acceptée';
  exception when invalid_parameter_value then
    raise notice '  ok — une adresse invalide est refusée';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.inviter_un_parrain('quelquun@example.org', repeat('c', 64));
    raise exception 'ÉCHEC — anon a invité';
  exception when insufficient_privilege then
    raise notice '  ok — sans être connecté, on n''invite pas';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— reinviter la meme adresse revoque le premier lien'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';
  select public.inviter_un_parrain('victor0057@example.org', :'e_p2') as p2 \gset
commit;

begin;
  set local role service_role;
  select public.verifier(
    (select motif from public.parrainage_par_empreinte(:'e_p1')) = 'revoque'
      and (select valable from public.parrainage_par_empreinte(:'e_p2')),
    'le premier lien ne vaut plus, le second vaut');

  select public.verifier(
    (select loge_nom from public.parrainage_par_empreinte(:'e_p2')) = 'Pau — 0057'
      and (select envoye_par_nom from public.parrainage_par_empreinte(:'e_p2')) = 'P Paul',
    'le lien dit quelle loge et quel référent invitent');

  select public.verifier(
    (select count(*) from public.parrainage_par_empreinte(repeat('0', 64))) = 0,
    'un jeton inventé n''ouvre rien');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}', true);
  begin
    perform * from public.parrainage_par_empreinte(current_setting('essai.e_p2'));
    raise exception 'ÉCHEC — une session lit un parrainage par son jeton';
  exception when insufficient_privilege then
    raise notice '  ok — lire par jeton est réservé à la clé serveur';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— le parrain presente le candidat : le dossier s ouvre, sans referent'
-- ---------------------------------------------------------------------------
begin;
  set local role service_role;

  select public.presenter_un_candidat(:'e_p2', jsonb_build_object(
    'parrain_nom',          'dupont',
    'parrain_prenom',       'Jean',
    'parrain_telephone',    '06 12 34 56 78',
    'parrain_loge',         'La Parfaite Union',
    'lien_parente',         'son neveu',
    'connait_appartenance', 'Non',
    'peut_se_devoiler',     'Oui',
    'urgence',              '4',
    'urgence_motif',        'Fin de droits en mars',
    'candidat_nom',         'martin',
    'candidat_prenom',      'Lucie',
    'candidat_email',       'Lucie.Martin0057@Example.org',
    'type_emploi',          'stage en alternance',
    -- Ce qui suit n'est pas saisissable : la fonction doit l'ignorer.
    'loge_id',              (select id from public.loge where bubble_id = 'loge-0057-rennes'),
    'numero',               1,
    'referent_id',          :'r_rose'
  ), :'e_c1') as presentation \gset
commit;

select (:'presentation'::jsonb ->> 'candidat_id') as lucie \gset
select set_config('essai.lucie', :'lucie', false);

select public.verifier(
  (:'presentation'::jsonb ->> 'numero')::integer = 46,
  'numéro 46 : le plus haut numéro porté dans la loge (45), plus un');

select public.verifier(
  (select prochain_numero_candidat from public.loge where bubble_id = 'loge-0057-pau') = 46,
  'le compteur de la loge garde le dernier numéro donné, comme chez Bubble');

select public.verifier(
  (select loge_id = :'l_pau'::uuid and referent_id is null and numero = 46
     from public.candidat where id = :'lucie'::uuid),
  'le dossier est à Pau, sans référent — loge, numéro et référent envoyés sont ignorés');

select public.verifier(
  (select nom = 'MARTIN' and prenom = 'Lucie' and email = 'lucie.martin0057@example.org'
          and type_emploi = 'stage en alternance' and urgence = 4
          and connait_appartenance = 'Non' and peut_se_devoiler = 'Oui'
          and lien_parente = 'son neveu' and parrain_email = 'victor0057@example.org'
     from public.candidat where id = :'lucie'::uuid),
  'la présentation est rangée avec le candidat');

select public.verifier(
  (select parrain_id from public.candidat where id = :'lucie'::uuid) = :'r_victor'::uuid,
  'le parrain, déjà référent sous l''adresse invitée, devient parrain du dossier');

select public.verifier(
  (select presente_le is not null and parrain_nom = 'DUPONT' and candidat_id = :'lucie'::uuid
     from public.parrainage where id = :'p2'::uuid),
  'le parrainage est servi, et pointe vers le dossier');

do $$
begin
  set local role service_role;
  begin
    perform public.presenter_un_candidat(current_setting('essai.e_p2'),
      '{"parrain_nom":"X","candidat_nom":"Y","candidat_prenom":"Z","candidat_email":"z@example.org","type_emploi":"stage"}'::jsonb,
      repeat('d', 64));
    raise exception 'ÉCHEC — un lien a servi deux fois';
  exception when invalid_authorization_specification then
    raise notice '  ok — un lien de parrain ne sert qu''une fois';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— ce qui ne se range pas est refuse'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000002"}';
  select public.inviter_un_parrain('autre0057@example.org', :'e_p3') as p3 \gset
commit;

select set_config('essai.e_p3', :'e_p3', false);

do $$
begin
  set local role service_role;
  begin
    perform public.presenter_un_candidat(current_setting('essai.e_p3'),
      '{"parrain_nom":"X","candidat_nom":"Y","candidat_prenom":"Z","candidat_email":"z@example.org","type_emploi":"CDI"}'::jsonb,
      repeat('e', 64));
    raise exception 'ÉCHEC — un type de recherche inventé a été accepté';
  exception when check_violation then
    raise notice '  ok — quatre types de recherche, ceux de Bubble';
  end;

  begin
    perform public.presenter_un_candidat(current_setting('essai.e_p3'),
      '{"parrain_nom":"X","candidat_nom":"Y","candidat_prenom":"Z","candidat_email":"z@example.org","type_emploi":"stage","urgence":"9"}'::jsonb,
      repeat('e', 64));
    raise exception 'ÉCHEC — une urgence de 9 a été acceptée';
  exception when check_violation then
    raise notice '  ok — l''urgence va de 0 à 5';
  end;

  begin
    perform public.presenter_un_candidat(current_setting('essai.e_p3'),
      '{"parrain_nom":"X","candidat_nom":"Y","candidat_prenom":"","candidat_email":"z@example.org","type_emploi":"stage"}'::jsonb,
      repeat('e', 64));
    raise exception 'ÉCHEC — un candidat sans prénom a été accepté';
  exception when check_violation then
    raise notice '  ok — nom, prénom et adresse du candidat sont obligatoires';
  end;
end
$$;

select public.verifier(
  (select presente_le is null from public.parrainage where id = :'p3'::uuid)
    and (select prochain_numero_candidat from public.loge where bubble_id = 'loge-0057-pau') = 46,
  'un refus ne consomme ni le lien, ni un numéro');

-- ---------------------------------------------------------------------------
\echo '— le candidat complete sa fiche, une fois'
-- ---------------------------------------------------------------------------
begin;
  set local role service_role;
  select public.verifier(
    (select valable and prenom = 'Lucie' and loge_nom = 'Pau — 0057'
       from public.candidature_par_empreinte(:'e_c1')),
    'le lien du candidat ouvre sa fiche, pré-remplie');
commit;

do $$
begin
  set local role service_role;
  -- Le CV n'est plus obligatoire depuis 0065 : c'est son test qui le vérifie.

  begin
    perform public.completer_sa_candidature(current_setting('essai.e_c1'),
      '{"nom":"Martin","prenom":"Lucie","telephone":"0700000057","type_emploi":"stage en alternance"}'::jsonb,
      'candidat/cv/' || gen_random_uuid() || '.pdf');
    raise exception 'ÉCHEC — le CV d''un autre dossier a été accepté';
  exception when check_violation then
    raise notice '  ok — le CV ne peut désigner que celui de ce dossier';
  end;

  begin
    perform public.completer_sa_candidature(current_setting('essai.e_c1'),
      '{"nom":"Martin","prenom":"Lucie","telephone":"0700000057","type_emploi":"stage en alternance","age":"7"}'::jsonb,
      'candidat/cv/' || current_setting('essai.lucie') || '.pdf');
    raise exception 'ÉCHEC — un âge de 7 ans a été accepté';
  exception when check_violation then
    raise notice '  ok — l''âge est borné';
  end;
end
$$;

begin;
  set local role service_role;
  select public.completer_sa_candidature(:'e_c1', jsonb_build_object(
    'nom', 'Martin', 'prenom', 'Lucie', 'telephone', '0700000057', 'age', '22',
    'situation_familiale', 'la fille', 'ville', 'Pau', 'code_postal', '64000',
    'type_emploi', 'stage en alternance', 'emploi_recherche', 'Comptable',
    'definition_emploi', 'Alternance en cabinet comptable', 'mobilite_geographique', 'Départementale',
    'debut_stage', '2027-01-04', 'fin_stage', '2027-06-30',
    'permis_vl', 'Oui', 'permis_moto', 'Non', 'permis_pl', 'Non', 'vehicule', 'Oui',
    'formations', 'BTS CG', 'experiences', 'Stage de 2 mois', 'competences', 'Sage, Excel',
    'centres_interet', 'Rugby'
  ), 'candidat/cv/' || :'lucie' || '.pdf', 'candidat/lettre/' || :'lucie' || '.docx');
commit;

select public.verifier(
  (select candidature_completee_le is not null and age = 22 and ville = 'Pau'
          and cv_chemin = 'candidat/cv/' || :'lucie' || '.pdf'
          and lettre_motivation_chemin = 'candidat/lettre/' || :'lucie' || '.docx'
          and definition_emploi = 'Alternance en cabinet comptable'
          and fin_stage::date = date '2027-06-30'
          and nom = 'MARTIN'
          and referent_id is null and loge_id = :'l_pau'::uuid
     from public.candidat where id = :'lucie'::uuid),
  'la fiche est complète, CV et lettre rangés, rattachement intact');

begin;
  set local role service_role;
  select public.verifier(
    (select motif from public.candidature_par_empreinte(:'e_c1')) = 'deja_completee',
    'le lien du candidat ne sert qu''une fois');
commit;

-- ---------------------------------------------------------------------------
\echo '— la fiche montre la presentation a la loge'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000002"}';

  select public.verifier(
    (select not a_un_referent and urgence = 4 and peut_se_devoiler = 'Oui'
            and connait_appartenance = 'Non' and parrain_presentateur = 'Jean DUPONT'
            and parrain_loge = 'La Parfaite Union' and candidature_completee_le is not null
            and not modifiable
       from public.fiche_candidat(:'lucie'::uuid)),
    'Quentin lit la présentation ; personne ne l''accompagne encore');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000004"}';
  select public.verifier(
    (select modifiable from public.fiche_candidat(:'lucie'::uuid)),
    'Victor, parrain du dossier, peut le corriger depuis Rennes');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000003"}';
  select public.verifier(
    (select count(*) from public.fiche_candidat(:'lucie'::uuid)) = 0,
    'Rose, à Rennes, ne voit pas le dossier de Pau');
commit;

-- ---------------------------------------------------------------------------
\echo '— prendre en charge, confier, et ne pas prendre a autrui'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000003"}';
  select public.verifier(
    public.designer_le_referent(:'lucie'::uuid) = false,
    'Rose ne prend pas en charge un candidat de Pau');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';
  select public.verifier(
    public.designer_le_referent(:'lucie'::uuid, :'r_quentin'::uuid),
    'Paul confie la nouvelle demande à Quentin');
commit;

select public.verifier(
  (select referent_id from public.candidat where id = :'lucie'::uuid) = :'r_quentin'::uuid,
  'Quentin est le référent de Lucie');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';
  select public.verifier(
    public.designer_le_referent(:'lucie'::uuid) = false,
    'Paul ne la reprend pas à Quentin : cela se décide en commission');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5700-0000-0000-000000000002"}', true);
  begin
    -- L'identifiant de Rose vient d'ailleurs : sous la session de Quentin, la
    -- RLS de `referent` ne la lui montrerait pas, et l'on passerait null.
    perform public.designer_le_referent(current_setting('essai.lucie')::uuid,
      current_setting('essai.r_rose')::uuid);
    raise exception 'ÉCHEC — un candidat a été confié hors de sa loge';
  exception when foreign_key_violation then
    raise notice '  ok — on ne confie qu''à un collègue de la loge';
  end;
end
$$;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000002"}';
  select public.verifier(
    public.designer_le_referent(:'lucie'::uuid, :'r_paul'::uuid),
    'Quentin, son référent, la passe à Paul');
commit;

-- Paul est maintenant son référent : la RLS de 0006 le laisse écrire la ligne.
-- Mais le drapeau de la fonction ne survit pas à son appel, et écrire le
-- rattachement à la main reste sans effet, comme depuis 0006.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';

  update public.candidat set referent_id = :'r_quentin'::uuid, loge_id = null,
                             telephone = '0700000058'
   where id = :'lucie'::uuid;
commit;

select public.verifier(
  (select telephone from public.candidat where id = :'lucie'::uuid) = '0700000058',
  'Paul a bien pu écrire la fiche — la ligne n''a pas été refusée en bloc');

select public.verifier(
  (select referent_id = :'r_paul'::uuid and loge_id = :'l_pau'::uuid
     from public.candidat where id = :'lucie'::uuid),
  'écrire referent_id ou loge_id à la main ne change rien');

-- ---------------------------------------------------------------------------
\echo '— la relance, vingt-quatre heures apres, une seule fois'
-- ---------------------------------------------------------------------------
update public.parrainage set cree_le = now() - interval '25 hours' where id = :'p3'::uuid;

begin;
  set local role service_role;
  select public.verifier(
    exists (select 1 from public.parrainages_a_relancer() where id = :'p3'::uuid)
      and not exists (select 1 from public.parrainages_a_relancer() where id = :'p2'::uuid),
    'le parrainage de plus de 24 h est à relancer ; celui qui a répondu ne l''est pas');

  select public.verifier(
    public.noter_la_relance(:'p3'::uuid, :'e_r3'),
    'la relance est notée');

  select public.verifier(
    public.noter_la_relance(:'p3'::uuid, repeat('f', 64)) = false
      and not exists (select 1 from public.parrainages_a_relancer() where id = :'p3'::uuid),
    'et une seule fois');

  select public.verifier(
    (select valable from public.parrainage_par_empreinte(:'e_r3'))
      and (select valable from public.parrainage_par_empreinte(:'e_p3')),
    'le lien de la relance vaut, et le premier aussi');
commit;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}', true);
  begin
    perform * from public.parrainages_a_relancer();
    raise exception 'ÉCHEC — une session lit la file des relances';
  exception when insufficient_privilege then
    raise notice '  ok — la file des relances est réservée à la clé serveur';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— renvoyer son lien au candidat, dans sa loge, tant qu il n a pas repondu'
-- ---------------------------------------------------------------------------
select encode(sha256('jeton-0057-candidat-3-premier'::bytea), 'hex') as e_c3_premier \gset

begin;
  set local role service_role;
  -- Présenté par le lien de la relance : il vaut autant que le premier.
  select public.presenter_un_candidat(:'e_r3', jsonb_build_object(
    'parrain_nom', 'Durand', 'candidat_nom', 'Leroy', 'candidat_prenom', 'Marc',
    'candidat_email', 'marc0057@example.org', 'type_emploi', 'emploi'
  ), :'e_c3_premier') as presentation_marc \gset
commit;

select (:'presentation_marc'::jsonb ->> 'candidat_id') as marc \gset

select public.verifier(
  (:'presentation_marc'::jsonb ->> 'numero')::integer = 47,
  'le dossier suivant de Pau prend le 47');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000003"}';
  select public.verifier(
    public.renvoyer_le_lien_du_candidat(:'marc'::uuid, :'e_c3') is null,
    'Rose, à Rennes, ne renvoie rien pour un dossier de Pau');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';
  select public.verifier(
    public.renvoyer_le_lien_du_candidat(:'lucie'::uuid, :'e_c3') is null,
    'une fiche déjà complétée n''a pas de lien à renvoyer');

  select public.verifier(
    (public.renvoyer_le_lien_du_candidat(:'marc'::uuid, :'e_c3') ->> 'email') = 'marc0057@example.org',
    'Paul renvoie son lien à Marc');
commit;

begin;
  set local role service_role;
  select public.verifier(
    (select valable from public.candidature_par_empreinte(:'e_c3'))
      and (select count(*) from public.candidature_par_empreinte(:'e_c3_premier')) = 0,
    'le nouveau lien vaut, l''ancien ne mène plus nulle part');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000001"}';
  select public.verifier(
    (select etat from public.parrainages_de_ma_loge() where candidat_id = :'marc'::uuid) = 'attente_candidat'
      and (select etat from public.parrainages_de_ma_loge() where candidat_id = :'lucie'::uuid) = 'complete'
      and (select etat from public.parrainages_de_ma_loge() where id = :'p1'::uuid) = 'revoque',
    'la liste dit où en est chaque parrainage');
commit;

\o
\echo '0057 — un nouveau candidat : tout est vert.'
