-- Tests de la migration 0090_rechercher_un_secteur.sql.
--
-- Ce qu'on éprouve :
--   * un mot d'activité mène à la bonne division, en tête ;
--   * accents, majuscules et variantes du mot n'empêchent pas de trouver ;
--   * plusieurs mots se cherchent dans le même intitulé ;
--   * un début de code cherche par le code ; un caractère joker ne passe pas ;
--   * seules des sections et des divisions sortent, vingt au plus ;
--   * une demande vide ou inconnue ne rend rien ;
--   * l'application ne peut pas encore l'appeler.

\set ON_ERROR_STOP on
\o /dev/null

-- La réponse en tête pour une demande.
create or replace function pg_temp.premier(demande text)
returns text
language sql
as $$ select code from public.rechercher_secteur(demande) where rang = 1 $$;

\echo '— sans accents ni majuscules'
select public.verifier(
  public.naf_sans_accent('Œuvre ÉLECTRICITÉ çà') = 'oeuvre electricite ca'
    and public.naf_sans_accent('ÀÉÈÊËÎÏÔÖÙÛÜÇàéèêëîïôöùûüçÿ') = 'aeeeeiioouuucaeeeeiioouuucy',
  'accents, majuscules et ligatures sont ramenés à l''essentiel');

\echo '— un mot, la bonne division en tête'
select public.verifier(pg_temp.premier('boulangerie') = '10',
  'boulangerie → 10, Industries alimentaires');
select public.verifier(pg_temp.premier('maçon') = '43',
  'maçon → 43, par « maçonnerie »');
select public.verifier(pg_temp.premier('comptable') = '69',
  'comptable → 69, Activités juridiques et comptables');
select public.verifier(pg_temp.premier('coiffeur') = '96',
  'coiffeur → 96, par « coiffure »');
select public.verifier(pg_temp.premier('Restauration') = 'I'
    and exists (select 1 from public.rechercher_secteur('Restauration') where code = '56'),
  'restauration → la section I d''abord, la division 56 ensuite');
select public.verifier(pg_temp.premier('electricite') = 'D',
  'electricite, sans accent → D');

\echo '— chaque réponse dit par quoi elle a été trouvée'
select public.verifier(
  (select trouve_par from public.rechercher_secteur('boulangerie') where code = '10')
    like 'Fabrication de produits de boulangerie%',
  'boulangerie → 10, trouvé par « Fabrication de produits de boulangerie… »');
select public.verifier(
  (select trouve_par from public.rechercher_secteur('restauration') where code = '56') is null,
  'une division trouvée par son propre intitulé ne dit rien de plus');

\echo '— plusieurs mots, dans le même intitulé'
select public.verifier(pg_temp.premier('aide à domicile') = '88',
  'aide à domicile → 88, par « 88.10A — Aide à domicile »');
select public.verifier(
  not exists (select 1 from public.rechercher_secteur('boulangerie navale')),
  'deux mots qui ne vont jamais ensemble ne trouvent rien');

\echo '— par le code'
select public.verifier(pg_temp.premier('43.21') = '43'
    and pg_temp.premier('43.21A') = '43'
    and pg_temp.premier('62') = '62',
  '43.21 et 43.21A → 43 ; 62 → 62');
select public.verifier(
  not exists (select 1 from public.rechercher_secteur('4%'))
    and not exists (select 1 from public.rechercher_secteur('4_')),
  'un caractère joker ne fait pas tout sortir');

\echo '— seulement ce qui se choisit, vingt au plus'
select public.verifier(
  (select bool_and(niveau in ('section', 'division')) and count(*) <= 20
     from public.rechercher_secteur('fabrication')),
  'fabrication : des sections et des divisions, vingt au plus');
select public.verifier(
  (select bool_and(section = (select coalesce(p.code, c.code) from public.code_naf c
                                left join public.code_naf p on p.code = c.parent
                               where c.code = r.code))
     from public.rechercher_secteur('construction') r),
  'chaque réponse porte sa section');

\echo '— pour une loge : aussi précis qu''on veut'
select public.verifier(
  (select code from public.rechercher_secteur('boulangerie', true) where rang = 1) = '10.71C',
  'boulangerie, en mode précis → 10.71C Boulangerie et boulangerie-pâtisserie, telle quelle');
select public.verifier(
  (select code from public.rechercher_secteur('installation électrique', true) where rang = 1) = '43.21'
    and exists (select 1 from public.rechercher_secteur('installation électrique', true) where code = '43.21A'),
  'installation électrique → 43.21 en tête, 43.21A parmi les réponses');
select public.verifier(
  not exists (select 1 from public.rechercher_secteur('électricien', true) where code like '43%'),
  'électricien, un nom de métier, ne trouve pas l''installation électrique — la limite connue');
select public.verifier(
  (select section from public.rechercher_secteur('installation électrique', true) where code = '43.21A') = 'F'
    and (select section_intitule from public.rechercher_secteur('installation électrique', true) where code = '43.21A') = 'Construction',
  'une sous-classe porte sa section : 43.21A est dans F — Construction');
select public.verifier(
  not exists (select 1 from public.rechercher_secteur('électricité', true) where code = '35.11Z')
    and exists (select 1 from public.rechercher_secteur('électricité', true) where code = '35.11'),
  'une sous-classe qui répète sa classe ne s''affiche pas deux fois');
select public.verifier(
  not exists (select 1 from public.rechercher_secteur('électricien')
               where niveau not in ('section', 'division')),
  'sans le mode précis, rien sous la division');
select public.verifier(
  (select array_agg(code order by rang) from public.rechercher_secteur('43.21', true))
  = array['43.21', '43.21A', '43.21B'],
  'un code en mode précis : la classe, puis ses deux sous-classes');

\echo '— rien pour rien'
select public.verifier(
  not exists (select 1 from public.rechercher_secteur(''))
    and not exists (select 1 from public.rechercher_secteur(null))
    and not exists (select 1 from public.rechercher_secteur('  de la  '))
    and not exists (select 1 from public.rechercher_secteur('zzzzqx')),
  'vide, absent, petits mots seuls, mot inconnu : aucune réponse');

\echo '— l''application ne l''appelle pas encore'
do $$
begin
  set local role authenticated;
  begin
    perform public.rechercher_secteur('boulangerie');
    raise exception 'ÉCHEC — une session connectée appelle la recherche';
  exception when insufficient_privilege then
    raise notice '  ok — refusé à une session connectée';
  end;
end
$$;

do $$
begin
  set local role anon;
  begin
    perform public.rechercher_secteur('boulangerie');
    raise exception 'ÉCHEC — une personne non connectée appelle la recherche';
  exception when insufficient_privilege then
    raise notice '  ok — refusé à une personne non connectée';
  end;
end
$$;

\o
\echo '0090 — trouver un secteur par un mot : tout est vert.'
