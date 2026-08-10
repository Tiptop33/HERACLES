-- Tests de la migration 0057_un_signe_de_vie.sql.
--
--   · Nour référente à Tours-0057, celle qui regarde la colonne
--   · Omar référent  à Tours-0057, celui qui s'en va sans se déconnecter
--
-- Ce que 0042 et 0051 éprouvaient, c'était l'âge de la session. Ce qui décide
-- ici, c'est le dernier signe de vie — le passage de la colonne, toutes les
-- trente secondes, tant que l'onglet est visible.

\set ON_ERROR_STOP on
\o /dev/null

\set nour 'aaaaaaaa-5700-0000-0000-000000000191'
\set omar 'aaaaaaaa-5700-0000-0000-000000000192'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'nour', 'nour0057@example.org', '{"role":"referent"}'),
  (:'omar', 'omar0057@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values
  ('loge-0057-tours', 'Tours — 0057')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0057-nour', :'nour', 'Nour', 'N', 'nour0057@example.org',
   (select id from public.loge where bubble_id = 'loge-0057-tours')),
  ('ref-0057-omar', :'omar', 'Omar', 'O', 'omar0057@example.org',
   (select id from public.loge where bubble_id = 'loge-0057-tours'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— se connecter suffit a paraitre, avant tout passage'
-- ---------------------------------------------------------------------------
-- La demi-minute qui sépare l'ouverture de la page du premier passage :
-- `vu_le` est encore vide, et c'est l'ouverture de la session qui fait foi.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000192"}';
  select public.je_me_connecte();
commit;

select public.verifier(
  (select vu_le from public.profil where id = :'omar') is null,
  'aucun passage n a encore eu lieu');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'Nour voit quand meme Omar');
commit;

-- ---------------------------------------------------------------------------
\echo '— deux minutes de silence, et il s efface'
-- ---------------------------------------------------------------------------
-- L'onglet fermé : plus personne ne demande la liste. On fait vieillir la
-- seule heure connue, celle de l'ouverture de session.
update public.profil set connecte_depuis = now() - interval '3 minutes'
 where id = :'omar';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'la colonne de Nour est vide');
commit;

-- ---------------------------------------------------------------------------
\echo '— un passage le fait revenir, sans qu il ait a se reconnecter'
-- ---------------------------------------------------------------------------
select connecte_depuis as ouverture_omar from public.profil where id = :'omar' \gset

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000192"}';
  select public.je_suis_la();
commit;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'Omar est de retour dans la colonne de Nour');
commit;

-- L'ordre de la colonne suit l'ordre d'arrivée : un passage ne doit pas
-- remettre les visages dans un autre ordre toutes les trente secondes.
select public.verifier(
  (select connecte_depuis from public.profil where id = :'omar')
    = :'ouverture_omar'::timestamptz,
  'le passage ne decale pas l heure d ouverture');

-- ---------------------------------------------------------------------------
\echo '— deux minutes apres son dernier passage, il ressort'
-- ---------------------------------------------------------------------------
update public.profil set vu_le = now() - interval '3 minutes' where id = :'omar';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'le silence sort de la liste, meme session ouverte');
commit;

-- ---------------------------------------------------------------------------
\echo '— treize heures de travail, et un signe de vie : il est la'
-- ---------------------------------------------------------------------------
-- Le défaut symétrique, celui que 0042 laissait passer : une réunion du soir
-- commencée le matin sortait de la liste alors que la personne était devant
-- son écran. C'est tout l'objet de 0057.
update public.profil
   set connecte_depuis = now() - interval '13 hours', vu_le = now()
 where id = :'omar';

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 1,
    'l age de la session ne fait plus sortir de la liste');
commit;

-- ---------------------------------------------------------------------------
\echo '— se deconnecter efface les deux heures, et sort tout de suite'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000192"}';
  select public.je_me_deconnecte();
commit;

select public.verifier(
  (select connecte_depuis from public.profil where id = :'omar') is null
    and (select vu_le from public.profil where id = :'omar') is null,
  'la deconnexion ne laisse aucune trace derriere elle');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'et l on sort sans attendre les deux minutes');
commit;

-- ---------------------------------------------------------------------------
\echo '— un passage ne rouvre pas une session close'
-- ---------------------------------------------------------------------------
-- L'onglet resté ouvert dans un coin après un « Se déconnecter » fait ailleurs :
-- il redemande la liste, mais il ne remet personne dedans.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000192"}';
  select public.je_suis_la();
commit;

select public.verifier(
  (select vu_le from public.profil where id = :'omar') is null,
  'le passage n a rien note sur une session close');

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.verifier(
    (select count(*) from public.les_connectes()) = 0,
    'et Omar reste hors de la colonne');
commit;

-- ---------------------------------------------------------------------------
\echo '— je_suis_la() ne touche qu a la ligne de l appelant'
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}';
  select public.je_me_connecte();
  select public.je_suis_la();
commit;

select public.verifier(
  (select vu_le from public.profil where id = :'nour') is not null,
  'Nour a bien son signe de vie');

select public.verifier(
  (select vu_le from public.profil where id = :'omar') is null,
  'et celui d Omar n a pas bouge');

-- ---------------------------------------------------------------------------
\echo '— le signe de vie des autres ne se lit pas en direct'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-5700-0000-0000-000000000191"}', true);
  -- La RLS de `profil` ne laisse lire que sa propre ligne. `vu_le` est plus
  -- bavarde que `connecte_depuis` — elle dit l'instant, pas le début de la
  -- journée : elle doit être fermée au moins autant.
  if (select count(*) from public.profil where vu_le is not null) > 1 then
    raise exception 'ÉCHEC — le signe de vie des autres se lit en direct';
  end if;
  raise notice '  ok — le signe de vie ne se lit que par la fonction';
end
$$;

-- ---------------------------------------------------------------------------
\echo '— et personne ne se pointe sans etre connecte'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;
  begin
    perform public.je_suis_la();
    raise exception 'ÉCHEC — anon a pu poser un signe de vie';
  exception when insufficient_privilege then
    raise notice '  ok — anon ne pose pas de signe de vie';
  end;
end
$$;

\echo ''
\echo 'Tous les contrôles de 0057_un_signe_de_vie.sql sont passés.'
