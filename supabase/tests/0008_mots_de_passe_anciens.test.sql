-- Tests de la migration 0008_mots_de_passe_anciens.sql.
--
-- Deux choses à prouver : la règle « différent des 3 derniers » tient
-- réellement, et rien de ce qu'elle mémorise n'est atteignable depuis
-- l'application.

\set ON_ERROR_STOP on
\o /dev/null

\set bernard 'aaaaaaaa-0000-0000-0000-000000000001'

\echo '— la table est fermée'
select public.verifier(
  (select rowsecurity from pg_tables
    where schemaname = 'public' and tablename = 'mot_de_passe_ancien'),
  'la RLS est active sur les empreintes');

select public.verifier(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'mot_de_passe_ancien') = 0,
  'aucune policy : la table n''est lisible que sous clé service_role');

select public.verifier(
  public.refuse('authenticated', 'mot_de_passe_ancien')
    and public.refuse('anon', 'mot_de_passe_ancien'),
  'ni une personne connectée ni un visiteur ne peuvent l''atteindre');

\echo '— rien n est stocké en clair'
select public.retenir_mot_de_passe(:'bernard', 'Bordeaux2026!');
select public.verifier(
  (select count(*) from public.mot_de_passe_ancien
    where profil_id = :'bernard' and empreinte = 'Bordeaux2026!') = 0,
  'le mot de passe ne se retrouve pas tel quel dans la table');

select public.verifier(
  (select empreinte like '$2a$%' or empreinte like '$2b$%'
     from public.mot_de_passe_ancien where profil_id = :'bernard') ,
  'ce qui est gardé est une empreinte bcrypt');

\echo '— la règle des trois derniers'
select public.verifier(
  public.mot_de_passe_deja_utilise(:'bernard', 'Bordeaux2026!'),
  'le mot de passe qu''on vient de poser est reconnu comme déjà utilisé');

select public.verifier(
  not public.mot_de_passe_deja_utilise(:'bernard', 'Toulouse2027!'),
  'un mot de passe jamais employé passe');

select public.retenir_mot_de_passe(:'bernard', 'Toulouse2027!');
select public.retenir_mot_de_passe(:'bernard', 'Perigueux2028!');

select public.verifier(
  public.mot_de_passe_deja_utilise(:'bernard', 'Bordeaux2026!')
    and public.mot_de_passe_deja_utilise(:'bernard', 'Toulouse2027!')
    and public.mot_de_passe_deja_utilise(:'bernard', 'Perigueux2028!'),
  'les trois derniers sont tous refusés');

\echo '— au quatrième, le plus ancien sort'
select public.retenir_mot_de_passe(:'bernard', 'Bayonne2029!');
select public.verifier(
  not public.mot_de_passe_deja_utilise(:'bernard', 'Bordeaux2026!'),
  'le premier est sorti de la fenêtre des trois : il redevient utilisable');

select public.verifier(
  (select count(*) from public.mot_de_passe_ancien where profil_id = :'bernard') <= 4,
  'on ne conserve pas plus que nécessaire');

\echo '— la mémoire meurt avec le compte'
select public.verifier(
  (select count(*) from public.mot_de_passe_ancien where profil_id = :'bernard') > 0,
  'les empreintes de Bernard sont là avant la suppression');

delete from auth.users where id = :'bernard';
select public.verifier(
  (select count(*) from public.mot_de_passe_ancien where profil_id = :'bernard') = 0,
  'supprimer le compte efface ses empreintes');

\echo ''
\echo 'Tous les contrôles de 0008_mots_de_passe_anciens.sql sont passés.'
