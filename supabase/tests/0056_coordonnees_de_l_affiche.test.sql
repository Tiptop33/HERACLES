-- Tests de la migration 0056_coordonnees_de_l_affiche.sql.
--
--   · Sacha référent à Agen-0056 — un compte ordinaire

\set ON_ERROR_STOP on
\o /dev/null

\set sacha 'aaaaaaaa-5600-0000-0000-000000000191'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'sacha', 'sacha0056@example.org', '{"role":"referent"}');

insert into public.loge (bubble_id, nom) values ('loge-0056', 'Agen — 0056')
on conflict do nothing;

insert into public.referent (bubble_id, profil_id, nom, prenom, email, loge_id) values
  ('ref-0056-sacha', :'sacha', 'SAADI', 'Sacha', 'sacha0056@example.org',
   (select id from public.loge where bubble_id = 'loge-0056'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
\echo '— le reglage part vide'
-- ---------------------------------------------------------------------------
-- Le point qui compte : aucune coordonnée n'est livrée avec l'application.
-- Une affiche sans pied se remarque ; une affiche portant les coordonnées de
-- quelqu'un d'autre, non.
insert into public.parametre (id, date_depart, date_fin)
values (true, current_date - 60, current_date + 60)
on conflict (id) do update set date_depart = excluded.date_depart,
                               date_fin    = excluded.date_fin;

select public.verifier(
  (select commission_contacts from public.parametre where id) is null,
  'aucune coordonnee livree avec l application');

-- ---------------------------------------------------------------------------
\echo '— une installation pose les siennes, et la loge les lit'
-- ---------------------------------------------------------------------------
update public.parametre
   set commission_contacts = array[
     'Camille EXEMPLE, Présidente de la commission, Tél : 00 00 00 00 00  presidente@exemple.test',
     'Dominique ESSAI, Secrétariat de la commission, Tél : 00 00 00 00 01  secretariat@exemple.test'
   ]
 where id;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5600-0000-0000-000000000191"}';

  select public.verifier(
    (select array_length(commission_contacts, 1) from public.parametre where id) = 2,
    'les deux lignes se lisent depuis un compte ordinaire');

  select public.verifier(
    (select commission_contacts[1] from public.parametre where id)
      like 'Camille EXEMPLE%',
    'et dans l ordre ou elles ont ete posees');
commit;

-- ---------------------------------------------------------------------------
\echo '— trois lignes, ou une seule, sans migration'
-- ---------------------------------------------------------------------------
-- La forme n'est pas figée : c'est tout l'intérêt d'un tableau de texte.
update public.parametre set commission_contacts = array['Une seule ligne'] where id;

select public.verifier(
  (select array_length(commission_contacts, 1) from public.parametre where id) = 1,
  'une seule suffit');

-- ---------------------------------------------------------------------------
\echo '— et le reglage ne s ecrit pas depuis le navigateur'
-- ---------------------------------------------------------------------------
-- `parametre` n'ouvre que la lecture (0002) : un compte connecté ne peut pas
-- se donner des coordonnées de président.
do $$
declare
  touchees integer;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"aaaaaaaa-5600-0000-0000-000000000191"}';
  begin
    update public.parametre set commission_contacts = array['Intrus'] where id;
    get diagnostics touchees = row_count;
    if touchees > 0 then
      raise exception 'ÉCHEC — authenticated a pu ecrire les coordonnees';
    end if;
    raise notice '  ok — l écriture ne touche aucune ligne';
  exception when insufficient_privilege then
    raise notice '  ok — l écriture est refusée';
  end;
end
$$;

select public.verifier(
  (select commission_contacts[1] from public.parametre where id) = 'Une seule ligne',
  'et le reglage n a pas bouge');

\echo ''
\echo 'Tous les contrôles de 0056_coordonnees_de_l_affiche.sql sont passés.'
