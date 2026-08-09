-- Tests de la migration 0045_assiduite_de_la_reunion_ouverte.sql.
--
-- Ce qu'on éprouve : les deux comptes de la feuille ne regardent plus que la
-- réunion ouverte. Trois réunions dans l'exercice, la même personne pointée
-- aux trois : le chiffre reste à 1.
--
--   · Ivan  référent à Reims-0045

\set ON_ERROR_STOP on
\o /dev/null

\set ivan 'aaaaaaaa-3333-0000-0000-000000000151'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ivan', 'ivan0045@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values ('loge-0045', 'Reims — 0045')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0045-ivan', :'ivan', 'Ivan', 'I', 'ivan0045@example.org',
   (select id from public.loge where bubble_id = 'loge-0045'))
on conflict do nothing;

select id as r_ivan from public.referent where bubble_id = 'ref-0045-ivan' \gset

insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 60, current_date + 60)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

-- ---------------------------------------------------------------------------
\echo '— trois presences dans l exercice, et le chiffre reste a un'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000151"}';

  select public.ouvrir_une_reunion(current_date - 20) as une   \gset
  select public.ouvrir_une_reunion(current_date - 10) as deux  \gset
  select public.ouvrir_une_reunion(current_date)      as trois \gset

  select public.pointer_a_l_appel(:'une'::uuid,   :'r_ivan'::uuid, 'Présent');
  select public.pointer_a_l_appel(:'deux'::uuid,  :'r_ivan'::uuid, 'Présent');
  select public.pointer_a_l_appel(:'trois'::uuid, :'r_ivan'::uuid, 'Présent');

  -- Avant 0045, ce chiffre valait 3 : c'était le cumul de l'exercice.
  select public.verifier(
    (select presences from public.feuille_d_appel(:'trois'::uuid)
      where referent_id = :'r_ivan'::uuid) = 1,
    'la feuille ne compte que la réunion ouverte');

  select public.verifier(
    (select presences from public.feuille_d_appel(:'une'::uuid)
      where referent_id = :'r_ivan'::uuid) = 1,
    'et celle d''il y a vingt jours ne compte qu''elle-même');
commit;

-- ---------------------------------------------------------------------------
\echo '— excuse ici, present ailleurs : les deux ne se melangent pas'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000151"}';

  select public.pointer_a_l_appel(:'deux'::uuid, :'r_ivan'::uuid, 'Excusé');

  select public.verifier(
    (select presences from public.feuille_d_appel(:'deux'::uuid)
      where referent_id = :'r_ivan'::uuid) = 0
      and (select excuses from public.feuille_d_appel(:'deux'::uuid)
            where referent_id = :'r_ivan'::uuid) = 1,
    'sur la réunion excusée : zéro présence, une excuse');

  select public.verifier(
    (select presences from public.feuille_d_appel(:'trois'::uuid)
      where referent_id = :'r_ivan'::uuid) = 1
      and (select excuses from public.feuille_d_appel(:'trois'::uuid)
            where referent_id = :'r_ivan'::uuid) = 0,
    'et sur celle du jour, l''excuse de l''autre ne déteint pas');
commit;

-- ---------------------------------------------------------------------------
\echo '— rien tant que personne n a ete appele'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000151"}';

  select public.ouvrir_une_reunion(current_date - 5) as vierge \gset

  select public.verifier(
    (select etat from public.feuille_d_appel(:'vierge'::uuid)
      where referent_id = :'r_ivan'::uuid) is null
      and (select presences from public.feuille_d_appel(:'vierge'::uuid)
            where referent_id = :'r_ivan'::uuid) = 0,
    'sans état, aucun compte — et l''état reste vide, pas « absent »');
commit;

-- ---------------------------------------------------------------------------
\echo '— les bornes de l exercice ne commandent plus ce chiffre'
-- ---------------------------------------------------------------------------
-- C'est la conséquence de fond : une réunion hors bornes affiche désormais sa
-- présence, là où le cumul de l'exercice la laissait à zéro.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000151"}';

  select public.ouvrir_une_reunion(current_date + 200) as loin \gset
  select public.pointer_a_l_appel(:'loin'::uuid, :'r_ivan'::uuid, 'Présent');

  select public.verifier(
    (select presences from public.feuille_d_appel(:'loin'::uuid)
      where referent_id = :'r_ivan'::uuid) = 1,
    'hors de l''exercice, la présence du jour se compte quand même');

  -- Le registre, lui, n'a pas changé : il reste borné par l'exercice.
  select public.verifier(
    (select count(*) from public.registre_des_reunions()
      where id = :'loin'::uuid) = 0,
    'mais le registre continue de l''ignorer — 0045 n''y a pas touché');
commit;

\echo ''
\echo 'Tous les contrôles de 0045_assiduite_de_la_reunion_ouverte.sql sont passés.'
