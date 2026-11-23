-- ---------------------------------------------------------------------------
-- 0099 — recevoir les offres de France Travail
--
-- Ce que ça change : HERACLES reçoit lui-même les offres d'emploi de France
-- Travail, au lieu de les tenir d'une reprise de Bubble. Le 23 novembre 2026,
-- la plus récente des 4 539 offres reprises datait du 25 mai : aucune n'était
-- « en cours », et l'écran France Travail restait vide. C'est la « réception
-- France Travail » du lot 4.
--
-- Comment : une route de l'application (`/api/offres/recevoir`), appelée par
-- une tâche planifiée, interroge l'API de France Travail et passe chaque page
-- de réponses, telle quelle, à la fonction ci-dessous. C'est ICI, et non dans
-- la route, que les champs de France Travail deviennent nos colonnes : la
-- correspondance s'éprouve ainsi dans les tests de la base.
--
-- Une offre se reconnaît à l'identifiant que France Travail lui donne
-- (`source_id`, le `ft_id` de Bubble). Déjà là, elle est mise à jour — y
-- compris une offre reprise de Bubble, qui garde son `bubble_id` ; absente,
-- elle est créée. Rien n'est jamais supprimé : une offre que France Travail ne
-- renvoie plus cesse d'être actualisée, et sort d'elle-même des « offres en
-- cours » au bout de trente jours.
--
-- Ce qu'on ne garde pas : le contact du recruteur (nom, courriel, téléphone).
-- France Travail le fournit parfois ; c'est une donnée personnelle dont aucun
-- écran n'a besoin. L'offre porte l'adresse de sa page d'origine, où il se lit.
--
-- Accès : `service_role` seulement. La route n'a personne de connecté ; elle
-- vérifie un secret partagé avant de prendre la clé de service (règle n° 3).
--
-- Rejouable : `create or replace`.
-- ---------------------------------------------------------------------------

-- Un texte de France Travail, ou rien : les chaînes vides ne remplissent pas
-- une colonne.
create or replace function public.texte_recu(valeur text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(valeur), '')
$$;

revoke all on function public.texte_recu(text) from public, anon, authenticated;

create or replace function public.recevoir_offres_france_travail(les_offres jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recues         integer;
  mises_a_jour   integer;
  creees         integer;
begin
  if les_offres is null or jsonb_typeof(les_offres) <> 'array' then
    raise exception 'Une liste d''offres est attendue' using errcode = 'invalid_parameter_value';
  end if;
  -- Une page de l'API fait 150 offres. Mille, c'est déjà une erreur d'appel.
  if jsonb_array_length(les_offres) > 1000 then
    raise exception 'Trop d''offres en un seul appel (1 000 au plus)'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Les offres de la page, une ligne par identifiant, champs traduits. Une
  -- valeur mal formée — un nombre de postes qui n'en est pas un, une date
  -- illisible — laisse la colonne vide plutôt que de faire échouer la page.
  create temporary table offres_recues on commit drop as
  select distinct on (public.texte_recu(o->>'id'))
         public.texte_recu(o->>'id')                                  as source_id,
         public.texte_recu(o->>'intitule')                            as intitule,
         public.texte_recu(o->>'description')                         as description,
         public.texte_recu(o->>'appellationlibelle')                  as appellation_libelle,
         public.texte_recu(o->>'natureContrat')                       as nature_contrat,
         public.texte_recu(o->>'typeContrat')                         as type_contrat,
         public.texte_recu(o->>'typeContratLibelle')                  as type_contrat_libelle,
         case lower(o->>'alternance') when 'true' then true when 'false' then false end
                                                                      as alternance,
         case when o->>'nombrePostes' ~ '^[0-9]{1,6}$' then (o->>'nombrePostes')::integer end
                                                                      as nombre_postes,
         public.texte_recu(o->>'dureeTravailLibelle')                 as duree_travail_libelle,
         public.texte_recu(o->>'dureeTravailLibelleConverti')         as duree_travail_type,
         public.texte_recu(o->>'qualificationLibelle')                as qualification_libelle,
         public.texte_recu(o#>>'{salaire,libelle}')                   as salaire_libelle,
         public.texte_recu(o->>'experienceExige')                     as experience_exige,
         public.texte_recu(o->>'experienceLibelle')                   as experience_libelle,
         case lower(o->>'accessibleTH') when 'true' then true when 'false' then false end
                                                                      as accessible_th,
         case lower(o#>>'{entreprise,entrepriseAdaptee}') when 'true' then true when 'false' then false end
                                                                      as entreprise_adaptee,
         public.texte_recu(o#>>'{lieuTravail,libelle}')               as lieu_libelle,
         public.texte_recu(o#>>'{lieuTravail,codePostal}')            as lieu_code_postal,
         public.texte_recu(o#>>'{lieuTravail,commune}')               as lieu_code_insee,
         case when o#>>'{lieuTravail,latitude}' ~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
              then (o#>>'{lieuTravail,latitude}')::double precision end  as lieu_latitude,
         case when o#>>'{lieuTravail,longitude}' ~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
              then (o#>>'{lieuTravail,longitude}')::double precision end as lieu_longitude,
         public.texte_recu(o->>'romeCode')                            as rome_code,
         public.texte_recu(o->>'romeLibelle')                         as rome_libelle,
         public.texte_recu(o->>'codeNAF')                             as code_naf,
         public.texte_recu(o->>'secteurActivite')                     as secteur_code,
         public.texte_recu(o->>'secteurActiviteLibelle')              as secteur_libelle,
         public.texte_recu(o#>>'{entreprise,nom}')                    as entreprise_nom,
         public.texte_recu(o#>>'{entreprise,description}')            as entreprise_description,
         public.texte_recu(o#>>'{entreprise,url}')                    as entreprise_url,
         public.texte_recu(o#>>'{entreprise,logo}')                   as entreprise_logo_url,
         public.texte_recu(o->>'trancheEffectifEtab')                 as entreprise_taille,
         public.texte_recu(o#>>'{origineOffre,urlOrigine}')           as url_origine,
         case when o->>'dateCreation' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
              then (o->>'dateCreation')::timestamptz end              as date_creation,
         case when o->>'dateActualisation' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
              then (o->>'dateActualisation')::timestamptz end         as date_actualisation
    from jsonb_array_elements(les_offres) as t(o)
   where jsonb_typeof(o) = 'object'
     and public.texte_recu(o->>'id') is not null
   order by public.texte_recu(o->>'id');

  select count(*) into recues from offres_recues;

  update public.offre_emploi e
     set intitule               = r.intitule,
         description            = r.description,
         appellation_libelle    = r.appellation_libelle,
         nature_contrat         = r.nature_contrat,
         type_contrat           = r.type_contrat,
         type_contrat_libelle   = r.type_contrat_libelle,
         alternance             = r.alternance,
         nombre_postes          = r.nombre_postes,
         duree_travail_libelle  = r.duree_travail_libelle,
         duree_travail_type     = r.duree_travail_type,
         qualification_libelle  = r.qualification_libelle,
         salaire_libelle        = r.salaire_libelle,
         experience_exige       = r.experience_exige,
         experience_libelle     = r.experience_libelle,
         accessible_th          = r.accessible_th,
         entreprise_adaptee     = r.entreprise_adaptee,
         lieu_libelle           = r.lieu_libelle,
         lieu_code_postal       = r.lieu_code_postal,
         lieu_code_insee        = r.lieu_code_insee,
         departement            = public.departement_d_une_offre(
                                    null, r.lieu_code_postal, r.lieu_code_insee, r.lieu_libelle),
         lieu_latitude          = r.lieu_latitude,
         lieu_longitude         = r.lieu_longitude,
         rome_code              = r.rome_code,
         rome_libelle           = r.rome_libelle,
         code_naf               = r.code_naf,
         secteur_code           = r.secteur_code,
         secteur_libelle        = r.secteur_libelle,
         entreprise_nom         = r.entreprise_nom,
         entreprise_description = r.entreprise_description,
         entreprise_url         = r.entreprise_url,
         entreprise_logo_url    = r.entreprise_logo_url,
         entreprise_taille      = r.entreprise_taille,
         url_origine            = r.url_origine,
         -- France Travail ne renvoie pas toujours la date de création : on ne
         -- perd pas celle qu'on avait.
         date_creation          = coalesce(r.date_creation, e.date_creation),
         date_actualisation     = coalesce(r.date_actualisation, r.date_creation, e.date_actualisation),
         maj_le                 = now()
    from offres_recues r
   where e.source_id = r.source_id;
  get diagnostics mises_a_jour = row_count;

  insert into public.offre_emploi
    (source_id, intitule, description, appellation_libelle, nature_contrat, type_contrat,
     type_contrat_libelle, alternance, nombre_postes, duree_travail_libelle, duree_travail_type,
     qualification_libelle, salaire_libelle, experience_exige, experience_libelle, accessible_th,
     entreprise_adaptee, lieu_libelle, lieu_code_postal, lieu_code_insee, departement,
     lieu_latitude, lieu_longitude, rome_code, rome_libelle, code_naf, secteur_code,
     secteur_libelle, entreprise_nom, entreprise_description, entreprise_url,
     entreprise_logo_url, entreprise_taille, url_origine, date_creation, date_actualisation)
  select r.source_id, r.intitule, r.description, r.appellation_libelle, r.nature_contrat,
         r.type_contrat, r.type_contrat_libelle, r.alternance, r.nombre_postes,
         r.duree_travail_libelle, r.duree_travail_type, r.qualification_libelle,
         r.salaire_libelle, r.experience_exige, r.experience_libelle, r.accessible_th,
         r.entreprise_adaptee, r.lieu_libelle, r.lieu_code_postal, r.lieu_code_insee,
         public.departement_d_une_offre(null, r.lieu_code_postal, r.lieu_code_insee, r.lieu_libelle),
         r.lieu_latitude, r.lieu_longitude, r.rome_code, r.rome_libelle, r.code_naf,
         r.secteur_code, r.secteur_libelle, r.entreprise_nom, r.entreprise_description,
         r.entreprise_url, r.entreprise_logo_url, r.entreprise_taille, r.url_origine,
         r.date_creation, coalesce(r.date_actualisation, r.date_creation)
    from offres_recues r
   where not exists (select 1 from public.offre_emploi e where e.source_id = r.source_id);
  get diagnostics creees = row_count;

  -- La table temporaire part avec la transaction ; on la retire tout de suite
  -- pour qu'un second appel dans la même transaction (les tests) ne bute pas.
  drop table offres_recues;

  return jsonb_build_object('recues', recues, 'creees', creees, 'mises_a_jour', mises_a_jour);
end
$$;

comment on function public.recevoir_offres_france_travail(jsonb) is
  'Range une page d''offres telles que l''API de France Travail les renvoie : '
  'met à jour celles déjà connues par leur identifiant, crée les autres. Ne '
  'garde pas le contact du recruteur. Clé de service seulement.';

revoke all on function public.recevoir_offres_france_travail(jsonb) from public, anon, authenticated;
grant execute on function public.recevoir_offres_france_travail(jsonb) to service_role;
