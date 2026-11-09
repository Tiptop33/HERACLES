-- Tests de la migration 0064_telephone_du_parrain.sql.
--
-- Une loge, Lyon-0064, et des invitations de parrains écrites directement :
-- le déclencheur doit ranger chaque numéro français sous la forme
-- « 06 12 34 56 78 », et laisser le reste tel quel.

\set ON_ERROR_STOP on
\o /dev/null

insert into public.loge (bubble_id, nom) values ('loge-0064-lyon', 'Lyon — 0064')
on conflict do nothing;

select id as lyon from public.loge where bubble_id = 'loge-0064-lyon' \gset

-- ---------------------------------------------------------------------------
\echo '— chaque presentation d un numero francais donne la meme ecriture'
-- ---------------------------------------------------------------------------
insert into public.parrainage (loge_id, parrain_email, jeton_parrain_empreinte, revoque_le, parrain_telephone)
values
  (:'lyon', 'a0064@example.org', repeat('1', 64), now(), '0612345678'),
  (:'lyon', 'b0064@example.org', repeat('2', 64), now(), '06.12.34.56.78'),
  (:'lyon', 'c0064@example.org', repeat('3', 64), now(), '  06-12-34-56-78 '),
  (:'lyon', 'd0064@example.org', repeat('4', 64), now(), '+33 6 12 34 56 78'),
  (:'lyon', 'e0064@example.org', repeat('5', 64), now(), '+33612345678'),
  (:'lyon', 'f0064@example.org', repeat('6', 64), now(), '01 23 45 67 89');

select public.verifier(
  (select count(*) from public.parrainage
    where loge_id = :'lyon'::uuid
      and parrain_email in ('a0064@example.org', 'b0064@example.org', 'c0064@example.org',
                            'd0064@example.org', 'e0064@example.org')
      and parrain_telephone = '06 12 34 56 78') = 5,
  'sans séparateur, avec points, tirets, blancs ou +33 : « 06 12 34 56 78 »');

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'f0064@example.org')
    = '01 23 45 67 89',
  'un fixe garde ses chiffres, groupés deux par deux');

-- ---------------------------------------------------------------------------
\echo '— ce qui n est pas un numero francais reste tel quel'
-- ---------------------------------------------------------------------------
insert into public.parrainage (loge_id, parrain_email, jeton_parrain_empreinte, revoque_le, parrain_telephone)
values
  (:'lyon', 'g0064@example.org', repeat('7', 64), now(), '+41 22 123 45 67'),
  (:'lyon', 'h0064@example.org', repeat('8', 64), now(), 'le soir'),
  (:'lyon', 'i0064@example.org', repeat('9', 64), now(), null);

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'g0064@example.org')
    = '+41 22 123 45 67'
  and (select parrain_telephone from public.parrainage where parrain_email = 'h0064@example.org')
    = 'le soir'
  and (select parrain_telephone from public.parrainage where parrain_email = 'i0064@example.org')
    is null,
  'un numéro étranger, un texte libre et une case vide ne sont pas touchés');

-- ---------------------------------------------------------------------------
\echo '— une modification du numero passe par la meme regle'
-- ---------------------------------------------------------------------------
update public.parrainage set parrain_telephone = '+33 7 00 00 00 01'
 where parrain_email = 'a0064@example.org';

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'a0064@example.org')
    = '07 00 00 00 01',
  'un numéro modifié est rangé comme un numéro saisi');

-- ---------------------------------------------------------------------------
\echo '— le parrain presente le candidat : son numero est range'
-- ---------------------------------------------------------------------------
insert into public.parrainage (loge_id, parrain_email, jeton_parrain_empreinte)
values (:'lyon', 'j0064@example.org', repeat('a', 64));

begin;
  set local role service_role;
  select public.presenter_un_candidat(repeat('a', 64), jsonb_build_object(
    'parrain_nom',          'Durand',
    'parrain_telephone',    '+33612345678',
    'connait_appartenance', 'Oui',
    'peut_se_devoiler',     'Oui',
    'urgence',              '2',
    'candidat_nom',         'Petit',
    'candidat_prenom',      'Léa',
    'candidat_email',       'lea.petit0064@example.org',
    'type_emploi',          'emploi'
  ), repeat('b', 64));
commit;

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'j0064@example.org')
    = '06 12 34 56 78',
  'le numéro tapé sur « Présenter un candidat » arrive rangé');

-- ---------------------------------------------------------------------------
\echo '— les numeros deja enregistres sont remis au propre, et la migration se rejoue'
-- ---------------------------------------------------------------------------
-- Un numéro écrit avant 0064 : le déclencheur n'existait pas encore.
alter table public.parrainage disable trigger parrainage_telephone_lisible;
insert into public.parrainage (loge_id, parrain_email, jeton_parrain_empreinte, revoque_le, parrain_telephone)
values (:'lyon', 'k0064@example.org', repeat('c', 64), now(), '06.98.76.54.32');
alter table public.parrainage enable trigger parrainage_telephone_lisible;

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'k0064@example.org')
    = '06.98.76.54.32',
  'le numéro ancien est bien resté tel qu''il avait été tapé');

\ir ../migrations/0064_telephone_du_parrain.sql

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'k0064@example.org')
    = '06 98 76 54 32',
  'la migration range les numéros déjà enregistrés');

\ir ../migrations/0064_telephone_du_parrain.sql

select public.verifier(
  (select parrain_telephone from public.parrainage where parrain_email = 'g0064@example.org')
    = '+41 22 123 45 67'
  and (select parrain_telephone from public.parrainage where parrain_email = 'k0064@example.org')
    = '06 98 76 54 32',
  'rejouée, elle ne change plus rien');

-- ---------------------------------------------------------------------------
\echo '— la fonction n est pas offerte aux sessions'
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  begin
    perform public.telephone_lisible('0612345678');
    raise exception 'ÉCHEC — une session appelle telephone_lisible';
  exception when insufficient_privilege then
    raise notice '  ok — telephone_lisible est réservée à la base et à la clé serveur';
  end;
end
$$;

\o
\echo '0064 — le téléphone du parrain : tout est vert.'
