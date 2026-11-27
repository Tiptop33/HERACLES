-- Tests de la migration 0114_offres_saisies.sql.
--
-- Qui est qui :
--   · Rémi   référent — saisit une offre, la modifie, la prolonge, la retire
--   · Odile  autre référente — voit l'offre de Rémi, n'y touche pas
--   · Zoé    administratrice — touche à toutes les offres saisies
--   · Inès   candidate, compte « chercheur » — cherche dans la division 43 ;
--            ne saisit rien, voit l'offre sur sa page
--
-- Ce qu'on éprouve :
--   * un référent saisit ; un compte candidat, non ; les champs sont contrôlés
--     par la base, quoi que l'écran envoie ;
--   * l'offre saisie est une offre en cours, avec son type, son département et
--     son secteur — filtres et recherche compris ;
--   * son auteur et l'administratrice la modifient, la prolongent, la
--     retirent ; une autre référente et un candidat, non ; une offre de France
--     Travail ne se modifie jamais ;
--   * qui l'a saisie reste fermé : la table `offre_saisie` n'est pas lisible ;
--   * passé trente jours, elle sort de la liste, revient dans
--     `offres_saisies_echues` (pour son auteur et l'administratrice
--     seulement), et la purge l'épargne ; « Prolonger » la remet en ligne ;
--   * rangée dans la section F, elle parvient à une candidate de la division 43.
--
-- Données fabriquées, dans une transaction annulée à la fin.

\set ON_ERROR_STOP on
\o /dev/null

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0114-0000-0000-000000000001', 'remi0114@example.org',  '{"role":"referent"}'),
  ('dddddddd-0114-0000-0000-000000000002', 'odile0114@example.org', '{"role":"referent"}'),
  ('dddddddd-0114-0000-0000-000000000003', 'zoe0114@example.org',   '{"role":"admin"}'),
  ('dddddddd-0114-0000-0000-000000000004', 'ines0114@example.org',  '{"role":"chercheur"}')
on conflict do nothing;
update public.profil set role = 'admin' where id = 'dddddddd-0114-0000-0000-000000000003';

insert into public.candidat (id, nom, prenom, email, code_postal, profil_id)
values ('cccccccc-0114-0000-0000-000000000001', 'Candidate', '0114', 'ines0114@example.org', '33000',
        'dddddddd-0114-0000-0000-000000000004');
insert into public.candidat_secteur (candidat_id, rang, code, propose_par)
values ('cccccccc-0114-0000-0000-000000000001', 1, '43', 'candidat');

-- Une offre de France Travail, pour vérifier qu'elle reste hors d'atteinte.
insert into public.offre_emploi (source_id, intitule, code_naf, date_creation, date_actualisation)
values ('ft-0114', 'Plaquiste 0114', '43.31Z', now(), now());

-- ===========================================================================
\echo '— saisir : un référent, oui ; un compte candidat, non'
create temporary table t0114 (cle text primary key, valeur uuid) on commit drop;
grant all on t0114 to authenticated;

do $$
declare
  nouvelle uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000004"}', true);
  begin
    perform public.saisir_une_offre('{"type_offre":"stage","intitule":"x","entreprise":"y",
      "code_postal":"33000","ville":"Bordeaux","secteur":"F"}'::jsonb);
    raise exception 'ÉCHEC — un compte candidat a saisi une offre';
  exception when insufficient_privilege then
    raise notice '  ok — un compte candidat ne saisit pas';
  end;

  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000001"}', true);
  nouvelle := public.saisir_une_offre(jsonb_build_object(
    'type_offre', 'stage', 'intitule', '  Assistant   de gestion 0114 ', 'entreprise', 'Cabinet Ardouin 0114',
    'code_postal', '33 000', 'ville', 'Bordeaux', 'duree', '6 mois', 'secteur', 'f',
    'description', 'Saisie comptable', 'lien', 'https://www.example.com/annonce',
    'contact', 'Mme Ardouin — recrutement@example.com'));
  reset role;
  insert into t0114 values ('offre', nouvelle);
end
$$;

select valeur as offre from t0114 where cle = 'offre' \gset

select public.verifier(
  (select o.origine = 'saisie' and o.type_offre = 'stage'
      and o.intitule = 'Assistant de gestion 0114'
      and o.lieu_code_postal = '33000' and o.lieu_libelle = 'Bordeaux' and o.departement = '33'
      and o.code_naf = 'F' and o.secteur_libelle = 'Construction'
      and o.type_contrat_libelle is null and o.duree_contrat = '6 mois'
      and o.url_origine = 'https://www.example.com/annonce'
      and o.date_creation > now() - interval '1 minute'
      and o.date_actualisation > now() - interval '1 minute'
     from public.offre_emploi o where o.id = :'offre'),
  'l''offre saisie est rangée : espaces resserrés, code postal, département, secteur, dates');

select public.verifier(
  (select s.saisie_par = 'dddddddd-0114-0000-0000-000000000001' from public.offre_saisie s
    where s.offre_id = :'offre'),
  'son auteur est noté, dans la table à part');

-- ===========================================================================
\echo '— les champs sont contrôlés par la base'
do $$
declare
  base jsonb := '{"type_offre":"emploi","intitule":"Maçon","entreprise":"Adour",
                  "code_postal":"40100","ville":"Dax","secteur":"43"}';
  essai record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000001"}', true);
  for essai in
    select * from (values
      ('sans type',                 base - 'type_offre'),
      ('type inconnu',              base || '{"type_offre":"cdi"}'),
      ('intitulé vide',             base || '{"intitule":"   "}'),
      ('sans entreprise',           base - 'entreprise'),
      ('code postal à 4 chiffres',  base || '{"code_postal":"4010"}'),
      ('sans ville',                base - 'ville'),
      ('contrat inconnu',           base || '{"contrat":"Freelance"}'),
      ('contrat pour un stage',     base || '{"type_offre":"stage","contrat":"CDD"}'),
      ('sans secteur',              base - 'secteur'),
      ('secteur plus fin qu''une division', base || '{"secteur":"43.31Z"}'),
      ('secteur inconnu',           base || '{"secteur":"Z"}'),
      ('lien javascript:',          base || '{"lien":"javascript:alert(1)"}'),
      ('intitulé trop long',        base || jsonb_build_object('intitule', repeat('a', 201)))
    ) as t(nom, champs)
  loop
    begin
      perform public.saisir_une_offre(essai.champs);
      raise exception 'ÉCHEC — accepté : %', essai.nom;
    exception when check_violation then
      raise notice '  ok — refusé : %', essai.nom;
    end;
  end loop;
  reset role;
end
$$;

select public.verifier(
  (select count(*) = 1 from public.offre_emploi where origine = 'saisie' and intitule like '%0114%'),
  'les refus n''ont rien enregistré');

-- Un CDI n'a pas de durée : elle est oubliée plutôt que refusée.
do $$
declare
  cdi uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000003"}', true);
  cdi := public.saisir_une_offre('{"type_offre":"emploi","intitule":"Comptable 0114","entreprise":"Garage",
    "code_postal":"64100","ville":"Bayonne","contrat":"CDI","duree":"2 ans","secteur":"45"}'::jsonb);
  reset role;
  if (select duree_contrat from public.offre_emploi where id = cdi) is not null then
    raise exception 'ÉCHEC — un CDI garde une durée';
  end if;
  if (select type_contrat_libelle from public.offre_emploi where id = cdi) <> 'CDI' then
    raise exception 'ÉCHEC — le contrat n''est pas rangé';
  end if;
  raise notice '  ok — un CDI garde son contrat et perd sa durée';
  insert into t0114 values ('cdi', cdi);
end
$$;

-- ===========================================================================
-- Depuis 0115, elle se lit sur l'écran « Offres internes », et non plus
-- parmi les offres de France Travail : voir 0115_offres_internes.test.sql.
\echo '— l''offre saisie est une offre en cours'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000002"}', true);

select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_internes_en_cours()) e
                   where e->>'id' = :'offre' and e->>'type_offre' = 'stage'
                     and e->>'entreprise_nom' = 'Cabinet Ardouin 0114')),
  'une autre référente la trouve parmi les offres internes en cours, avec son type');

select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_en_cours(null, null, 200, 0, 'plaquiste 0114')->'offres') e
                   where e->>'type_offre' is null)),
  'une offre de France Travail n''a pas de type');

select public.verifier(
  (select contact = 'Mme Ardouin — recrutement@example.com' from public.offre_emploi where id = :'offre'),
  'le contact se lit avec l''offre, comme le reste de l''annonce');

-- ===========================================================================
\echo '— qui l''a saisie reste fermé'
do $$
begin
  begin
    perform 1 from public.offre_saisie limit 1;
    raise exception 'ÉCHEC — offre_saisie se lit depuis le navigateur';
  exception when insufficient_privilege then
    raise notice '  ok — offre_saisie ne se lit pas';
  end;
end
$$;

select public.verifier(
  public.offre_a_modifier(:'offre') is null,
  'une autre référente n''a rien à modifier : la fenêtre n''affiche aucun geste');

do $$
declare
  o uuid := (select valeur from t0114 where cle = 'offre');
  ft uuid := (select id from public.offre_emploi where source_id = 'ft-0114');
begin
  begin
    perform public.modifier_une_offre(o, '{"type_offre":"stage","intitule":"Piraté","entreprise":"x",
      "code_postal":"33000","ville":"Bordeaux","secteur":"F"}'::jsonb);
    raise exception 'ÉCHEC — une autre référente a modifié l''offre';
  exception when insufficient_privilege then
    raise notice '  ok — une autre référente ne modifie pas';
  end;
  begin
    perform public.prolonger_une_offre(o);
    raise exception 'ÉCHEC — une autre référente a prolongé l''offre';
  exception when insufficient_privilege then
    raise notice '  ok — ne prolonge pas';
  end;
  begin
    perform public.retirer_une_offre(o);
    raise exception 'ÉCHEC — une autre référente a retiré l''offre';
  exception when insufficient_privilege then
    raise notice '  ok — ne retire pas';
  end;

  -- L'administratrice non plus ne touche pas à une offre de France Travail.
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000003"}', true);
  begin
    perform public.retirer_une_offre(ft);
    raise exception 'ÉCHEC — une offre de France Travail a été retirée';
  exception when insufficient_privilege then
    raise notice '  ok — une offre de France Travail ne se retire pas';
  end;

  -- Ni la candidate.
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000004"}', true);
  begin
    perform public.prolonger_une_offre(o);
    raise exception 'ÉCHEC — un compte candidat a prolongé l''offre';
  exception when insufficient_privilege then
    raise notice '  ok — un compte candidat ne prolonge pas';
  end;
end
$$;

-- Écrire dans la table directement : aucun droit ne l'ouvre.
do $$
begin
  update public.offre_emploi set intitule = 'Piraté'
   where id = (select valeur from t0114 where cle = 'offre');
  raise exception 'ÉCHEC — la table des offres s''écrit depuis le navigateur';
exception when insufficient_privilege then
  raise notice '  ok — la table des offres ne s''écrit pas directement';
end
$$;
reset role;
select public.verifier(
  (select intitule = 'Assistant de gestion 0114' from public.offre_emploi where id = :'offre'),
  'écrire dans la table directement ne change rien');

-- ===========================================================================
\echo '— son auteur modifie ; la fenêtre lit ce qu''il faut'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000001"}', true);

select public.verifier(
  (select a->>'intitule' = 'Assistant de gestion 0114' and a->>'code_postal' = '33000'
      and a->'secteur'->>'code' = 'F' and a->'secteur'->>'niveau' = 'section'
      and (a->>'en_ligne_jusqu_au')::timestamptz > now() + interval '29 days'
     from (select public.offre_a_modifier(:'offre') as a) x),
  'son auteur lit l''offre à modifier, son secteur et la fin de sa mise en ligne');

select public.modifier_une_offre(:'offre', '{"type_offre":"alternance","intitule":"Apprenti comptable 0114",
  "entreprise":"Cabinet Ardouin 0114","code_postal":"33700","ville":"Mérignac","duree":"2 ans",
  "secteur":"69","contact":""}'::jsonb);

select public.verifier(
  (select a->'secteur'->>'section' = 'M' and a->'secteur'->>'niveau' = 'division'
     from (select public.offre_a_modifier(:'offre') as a) x),
  'une division rend sa section');
reset role;

select public.verifier(
  (select type_offre = 'alternance' and intitule = 'Apprenti comptable 0114' and lieu_libelle = 'Mérignac'
      and code_naf = '69' and contact is null and description is null
      and date_creation > now() - interval '1 minute'
     from public.offre_emploi where id = :'offre'),
  'la modification remplace toute la fiche — un champ vide ou absent s''efface ; la date de parution ne bouge pas');

-- ===========================================================================
\echo '— passé trente jours : hors de la liste, épargnée par la purge, prolongeable'
update public.offre_emploi
   set date_creation = now() - interval '40 days', date_actualisation = now() - interval '40 days'
 where id = :'offre';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000001"}', true);
select public.verifier(
  (select not exists (select 1 from jsonb_array_elements(public.offres_internes_en_cours()) e
                       where e->>'id' = :'offre')),
  'sortie de la liste des offres internes en cours');
select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_saisies_echues()) e where e->>'id' = :'offre')),
  'son auteur la retrouve parmi les offres saisies sorties de la liste');

select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000002"}', true);
select public.verifier(
  (select not exists (select 1 from jsonb_array_elements(public.offres_saisies_echues()) e where e->>'id' = :'offre')),
  'une autre référente ne la voit pas parmi les siennes');

select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000003"}', true);
select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_saisies_echues()) e where e->>'id' = :'offre')),
  'l''administratrice voit toutes les offres saisies sorties de la liste');
reset role;

-- Une vieille offre de France Travail, pour que la purge ait quelque chose à faire.
insert into public.offre_emploi (source_id, intitule, date_actualisation, date_creation)
values ('ft-0114-vieille', 'Ancienne 0114', now() - interval '90 days', now() - interval '90 days');
update public.offre_emploi set date_actualisation = now() - interval '90 days',
                               date_creation = now() - interval '90 days'
 where id = :'offre';

set local role service_role;
select public.purger_les_offres_anciennes();
reset role;

select public.verifier(
  exists (select 1 from public.offre_emploi where id = :'offre')
    and not exists (select 1 from public.offre_emploi where source_id = 'ft-0114-vieille'),
  'la purge emporte la vieille offre de France Travail et épargne l''offre saisie');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000003"}', true);
select public.verifier(
  public.prolonger_une_offre(:'offre') > now() + interval '29 days',
  'l''administratrice la prolonge de trente jours');

-- ===========================================================================
\echo '— sur la page de la candidate : section F, division 43'
-- L'offre est remise dans la section F, à Bordeaux.
select public.modifier_une_offre(:'offre', '{"type_offre":"stage","intitule":"Conducteur de travaux 0114",
  "entreprise":"Cabinet Ardouin 0114","code_postal":"33000","ville":"Bordeaux","secteur":"F"}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000004"}', true);
select public.verifier(
  (select exists (select 1 from jsonb_array_elements(public.offres_pour_moi(null, 100, 0)->'offres') e
                   where e->>'id' = :'offre' and e->>'type_offre' = 'stage')),
  'une offre rangée dans la section F parvient à la candidate de la division 43, avec son type');
reset role;

-- ===========================================================================
\echo '— retirer'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0114-0000-0000-000000000001"}', true);
select public.retirer_une_offre(:'offre');
reset role;

select public.verifier(
  not exists (select 1 from public.offre_emploi where id = :'offre')
    and not exists (select 1 from public.offre_saisie where offre_id = :'offre'),
  'son auteur la retire : l''offre et la trace de son auteur partent ensemble');

-- ===========================================================================
\echo '— les droits sur les fonctions'
select public.verifier(
  not has_function_privilege('anon', 'public.saisir_une_offre(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.offres_saisies_echues()', 'execute')
    and not has_function_privilege('authenticated', 'public.offre_saisie_controlee(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.je_peux_modifier_l_offre(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.saisir_une_offre(jsonb)', 'execute'),
  'rien pour anon ; les contrôles internes ne s''appellent pas du navigateur');

rollback;

\o
\echo
\echo 'Tous les contrôles de 0114_offres_saisies.sql sont passés.'
