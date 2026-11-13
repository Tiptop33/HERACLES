-- Tests de la migration 0091_loges_du_reseau_a_l_ecran.sql.
--
-- Qui est qui :
--   · Ada     administratrice        — gère les loges du réseau et leurs liens
--   · Rémi    référent d'une loge    — n'y a pas accès
--   · Camille compte candidat        — non plus
--   · le Secrétaire d'une loge du réseau, sans compte : il n'a que son lien,
--     que la route web hache et passe à la base avec la clé de service.
--
-- Chaque contrôle se joue en devenant la personne (CLAUDE.md).
--
-- Données fabriquées : loges, noms et adresses inventés.

\set ON_ERROR_STOP on
\o /dev/null

\set ada     'eeeeeeee-0091-0000-0000-000000000001'
\set remi    'eeeeeeee-0091-0000-0000-000000000002'
\set camille 'eeeeeeee-0091-0000-0000-000000000003'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ada',     'ada0091@example.org',     '{"role":"referent"}'),
  (:'remi',    'remi0091@example.org',    '{"role":"referent"}'),
  (:'camille', 'camille0091@example.org', '{"role":"chercheur"}')
on conflict (id) do nothing;
update public.profil set role = 'admin' where id = :'ada';

insert into public.province (nom) values ('Province d''essai 0091');
select id as province from public.province where nom = 'Province d''essai 0091' \gset

-- Les empreintes de trois liens, calculées comme la route web le fait.
select encode(sha256('jeton-0091-a'::bytea), 'hex') as e_a \gset
select encode(sha256('jeton-0091-a-bis'::bytea), 'hex') as e_a2 \gset
select encode(sha256('jeton-0091-b'::bytea), 'hex') as e_b \gset
select encode(sha256('jeton-0091-inconnu'::bytea), 'hex') as e_x \gset

-- ===========================================================================
\echo '— Ada, administratrice : saisir, corriger, lister'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);

  select public.enregistrer_loge_du_reseau(null, ' L''Essai 0091 ', '10', :'province'::uuid,
                                           'Dominique Modèle', ' Secretaire-A-0091@Example.org ') as a \gset
  select public.enregistrer_loge_du_reseau(null, 'La Concorde 0091', '9', null, null, null) as b \gset

  select public.verifier(
    (select e ->> 'nom' = 'L''Essai 0091' and e ->> 'secretaire_email' = 'secretaire-a-0091@example.org'
            and e ->> 'province' = 'Province d''essai 0091'
       from jsonb_array_elements(public.lister_loges_du_reseau()) e where e ->> 'id' = :'a'),
    'la loge est saisie, nom sans espaces autour, adresse en minuscules, province nommée');

  select public.verifier(
    (select array_agg(e ->> 'numero') from jsonb_array_elements(public.lister_loges_du_reseau()) e
      where e ->> 'numero' in ('9', '10')) = array['9', '10'],
    'la liste se range par numéro, lu comme un nombre : 9 avant 10');

  select public.verifier(
    not exists (select 1 from jsonb_array_elements(public.lister_loges_du_reseau()) e where e ? 'lien_empreinte'),
    'la liste ne rend jamais l''empreinte du lien');

  select public.enregistrer_loge_du_reseau(:'b'::uuid, 'La Concorde 0091', '9', :'province'::uuid,
                                           'Claude Témoin', 'secretaire-b-0091@example.org');
  select public.verifier(
    (select e ->> 'secretaire_nom' = 'Claude Témoin'
       from jsonb_array_elements(public.lister_loges_du_reseau()) e where e ->> 'id' = :'b'),
    'une correction s''enregistre');

  \echo '— le courriel'
  select public.verifier(
    public.courriel_des_loges_du_reseau() ->> 'objet' = 'HERACLES — les secteurs d''activité de votre loge'
      and position('{lien}' in public.courriel_des_loges_du_reseau() ->> 'texte') > 0,
    'la première version du courriel est en place, avec son lien');
  select public.regler_le_courriel_des_loges_du_reseau('Objet 0091', 'Bonjour {secretaire}, voici : {lien}');
  select public.verifier(
    public.courriel_des_loges_du_reseau() ->> 'objet' = 'Objet 0091',
    'le courriel se règle');

  \echo '— poser un lien'
  select public.verifier(
    public.poser_le_lien_de_la_loge_du_reseau(:'a'::uuid, :'e_a') between now() + interval '89 days' and now() + interval '91 days',
    'un lien posé vaut 90 jours');
  select public.poser_le_lien_de_la_loge_du_reseau(:'b'::uuid, :'e_b');
  select public.verifier(
    (select e ->> 'lien_envoye_le' is not null and e ->> 'lien_expire_le' is not null
       from jsonb_array_elements(public.lister_loges_du_reseau()) e where e ->> 'id' = :'a'),
    'la liste dit quand le lien est parti, et jusqu''à quand il vaut');
commit;

select set_config('essai.a', :'a', false);
select set_config('essai.b', :'b', false);

do $$
declare
  a uuid := current_setting('essai.a')::uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0091-0000-0000-000000000001"}', true);

  begin
    perform public.regler_le_courriel_des_loges_du_reseau('Objet', 'Bonjour, rien à ouvrir');
    raise exception 'ÉCHEC — un courriel sans {lien} a été enregistré';
  exception when check_violation then
    raise notice '  ok — refusé : un courriel sans {lien}';
  end;

  begin
    perform public.regler_le_courriel_des_loges_du_reseau('  ', 'Voici {lien}');
    raise exception 'ÉCHEC — un objet vide a été enregistré';
  exception when check_violation then
    raise notice '  ok — refusé : un objet vide';
  end;

  begin
    perform public.poser_le_lien_de_la_loge_du_reseau(a, 'pas-une-empreinte');
    raise exception 'ÉCHEC — une empreinte mal formée a été posée';
  exception when invalid_parameter_value then
    raise notice '  ok — refusé : une empreinte mal formée';
  end;

  begin
    perform public.enregistrer_loge_du_reseau(null, 'Doublon 0091', ' 10 ', null, null, null);
    raise exception 'ÉCHEC — un numéro déjà pris a été saisi';
  exception when unique_violation then
    raise notice '  ok — refusé : un numéro déjà pris';
  end;

  begin
    perform public.enregistrer_loge_du_reseau('eeeeeeee-0091-0000-0000-0000000000ff', 'Fantôme', null, null, null, null);
    raise exception 'ÉCHEC — une loge inexistante a été corrigée';
  exception when no_data_found then
    raise notice '  ok — refusé : corriger une loge qui n''existe plus';
  end;
end
$$;

-- ===========================================================================
\echo '— Rémi, référent, et Camille, compte candidat : rien'
do $$
declare
  a   uuid := current_setting('essai.a')::uuid;
  qui uuid;
begin
  foreach qui in array array['eeeeeeee-0091-0000-0000-000000000002'::uuid,
                             'eeeeeeee-0091-0000-0000-000000000003'::uuid] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', qui)::text, true);

    begin
      perform public.lister_loges_du_reseau();
      raise exception 'ÉCHEC — % lit les loges du réseau', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : lire les loges du réseau sans être administrateur';
    end;

    begin
      perform public.enregistrer_loge_du_reseau(a, 'Piratée', null, null, null, null);
      raise exception 'ÉCHEC — % corrige une loge du réseau', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : corriger';
    end;

    begin
      perform public.poser_le_lien_de_la_loge_du_reseau(a, repeat('c', 64));
      raise exception 'ÉCHEC — % pose un lien', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : poser un lien';
    end;

    begin
      perform public.courriel_des_loges_du_reseau();
      raise exception 'ÉCHEC — % lit le courriel', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : lire le courriel';
    end;

    begin
      perform public.page_de_la_loge_du_reseau(encode(sha256('jeton-0091-a'::bytea), 'hex'));
      raise exception 'ÉCHEC — % appelle une fonction du lien', qui;
    exception when insufficient_privilege then
      raise notice '  ok — refusé : les fonctions du lien ne sont qu''à la clé de service';
    end;
    reset role;
  end loop;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.page_de_la_loge_du_reseau(encode(sha256('jeton-0091-a'::bytea), 'hex'));
    raise exception 'ÉCHEC — une personne non connectée appelle une fonction du lien';
  exception when insufficient_privilege then
    raise notice '  ok — refusé à une personne non connectée, même avec une empreinte';
  end;
  begin
    perform public.lister_loges_du_reseau();
    raise exception 'ÉCHEC — une personne non connectée lit les loges du réseau';
  exception when insufficient_privilege then
    raise notice '  ok — refusé : la liste, sans être connecté';
  end;
end
$$;

-- ===========================================================================
\echo '— le Secrétaire, par son lien (la route web, avec la clé de service)'
begin;
  set local role service_role;

  select public.verifier(
    public.page_de_la_loge_du_reseau(:'e_a') ->> 'etat' = 'valable'
      and public.page_de_la_loge_du_reseau(:'e_a') ->> 'nom' = 'L''Essai 0091'
      and public.page_de_la_loge_du_reseau(:'e_a') ->> 'secretaire_nom' = 'Dominique Modèle'
      and public.page_de_la_loge_du_reseau(:'e_a') ->> 'province' = 'Province d''essai 0091',
    'la page dit la loge, son numéro, sa province, et le nom du Secrétaire');
  select public.verifier(
    not (public.page_de_la_loge_du_reseau(:'e_a') ? 'secretaire_email')
      and not (public.page_de_la_loge_du_reseau(:'e_a')::text like '%@example.org%'),
    'jamais l''adresse du Secrétaire');

  select public.verifier(
    (public.cocher_par_le_lien(:'e_a', '43', true) -> 'secteurs' -> 0 ->> 'code') = '43',
    'cocher 43 rend la liste à jour');
  select public.cocher_par_le_lien(:'e_a', '43.21A', true);
  select public.cocher_par_le_lien(:'e_a', '43', true);  -- deux fois : sans effet, sans erreur
  select public.verifier(
    jsonb_array_length(public.page_de_la_loge_du_reseau(:'e_a') -> 'liste' -> 'secteurs') = 2
      and (public.page_de_la_loge_du_reseau(:'e_a') -> 'liste' ->> 'maj_le') is not null,
    'deux secteurs, une fois chacun, et la liste est datée');
  select public.verifier(
    (select e ->> 'section' = 'F' and e ->> 'division' = '43'
       from jsonb_array_elements(public.page_de_la_loge_du_reseau(:'e_a') -> 'liste' -> 'secteurs') e
      where e ->> 'code' = '43.21A'),
    'chaque secteur porte sa division et sa section');

  select public.verifier(
    exists (select 1 from public.rechercher_secteur_par_le_lien(:'e_a', 'restauration') where code = '56.10A'),
    'le lien ouvre la recherche, jusqu''aux niveaux fins');
  select public.verifier(
    jsonb_array_length(public.nomenclature_par_le_lien(:'e_a')) = 1728,
    'et toute la nomenclature');

  select public.cocher_par_le_lien(:'e_a', '43.21A', false);
  select public.verifier(
    jsonb_array_length(public.page_de_la_loge_du_reseau(:'e_a') -> 'liste' -> 'secteurs') = 1,
    'décocher retire le secteur');

  select public.verifier(
    jsonb_array_length(public.page_de_la_loge_du_reseau(:'e_b') -> 'liste' -> 'secteurs') = 0,
    'le lien d''une loge ne touche pas l''autre');

  select public.verifier(public.page_de_la_loge_du_reseau(:'e_x') is null,
    'une empreinte inconnue n''ouvre rien');
commit;

do $$
begin
  set local role service_role;
  begin
    perform public.cocher_par_le_lien(encode(sha256('jeton-0091-a'::bytea), 'hex'), 'F', true);
    raise exception 'ÉCHEC — une section seule a été cochée par le lien';
  exception when check_violation then
    raise notice '  ok — refusé : une section seule (0089)';
  end;
  begin
    perform public.cocher_par_le_lien(encode(sha256('jeton-0091-inconnu'::bytea), 'hex'), '43', true);
    raise exception 'ÉCHEC — un lien inconnu a coché';
  exception when invalid_authorization_specification then
    raise notice '  ok — refusé : cocher par un lien inconnu';
  end;
  begin
    perform public.page_de_la_loge_du_reseau('pas-une-empreinte');
    raise exception 'ÉCHEC — une empreinte mal formée a été lue';
  exception when invalid_parameter_value then
    raise notice '  ok — refusé : une empreinte mal formée';
  end;
end
$$;

-- ===========================================================================
\echo '— un lien expiré'
update public.loge_du_reseau set lien_expire_le = now() - interval '1 day' where id = :'b';
begin;
  set local role service_role;
  select public.verifier(
    public.page_de_la_loge_du_reseau(:'e_b') = '{"etat": "expire"}'::jsonb,
    'la page dit seulement « expiré » — ni loge, ni Secrétaire');
commit;

do $$
begin
  set local role service_role;
  begin
    perform public.cocher_par_le_lien(encode(sha256('jeton-0091-b'::bytea), 'hex'), '43', true);
    raise exception 'ÉCHEC — un lien expiré a coché';
  exception when invalid_authorization_specification then
    raise notice '  ok — refusé : cocher par un lien expiré';
  end;
  begin
    perform 1 from public.rechercher_secteur_par_le_lien(encode(sha256('jeton-0091-b'::bytea), 'hex'), 'restauration');
    raise exception 'ÉCHEC — un lien expiré a cherché';
  exception when invalid_authorization_specification then
    raise notice '  ok — refusé : chercher par un lien expiré';
  end;
end
$$;

\echo '— un nouveau lien remplace l''ancien'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.poser_le_lien_de_la_loge_du_reseau(:'a'::uuid, :'e_a2');
commit;
begin;
  set local role service_role;
  select public.verifier(public.page_de_la_loge_du_reseau(:'e_a') is null,
    'l''ancien lien ne vaut plus');
  select public.verifier(
    public.page_de_la_loge_du_reseau(:'e_a2') ->> 'etat' = 'valable'
      and jsonb_array_length(public.page_de_la_loge_du_reseau(:'e_a2') -> 'liste' -> 'secteurs') = 1,
    'le nouveau vaut, et retrouve les secteurs déjà cochés');
commit;

-- ===========================================================================
\echo '— retirer une loge du réseau'
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"' || :'ada' || '"}', true);
  select public.retirer_loge_du_reseau(:'b'::uuid);
  select public.verifier(
    not exists (select 1 from jsonb_array_elements(public.lister_loges_du_reseau()) e where e ->> 'id' = :'b'),
    'la loge retirée quitte la liste');
commit;

\echo '— les tables restent fermées'
select public.verifier(
  not has_table_privilege('authenticated', 'public.loge_du_reseau', 'select')
    and not has_table_privilege('anon', 'public.loge_du_reseau', 'select')
    and not has_table_privilege('authenticated', 'public.loge_du_reseau_secteur', 'insert'),
  'aucun droit de table : tout passe par les fonctions');

-- --- Ménage ----------------------------------------------------------------
delete from public.loge_du_reseau where nom like '%0091%';
delete from public.province where nom = 'Province d''essai 0091';
update public.parametre
   set objet_loge_du_reseau = default, mot_loge_du_reseau = default
 where id;

\o
\echo '0091 — les loges du réseau, à l''écran : tout est vert.'
