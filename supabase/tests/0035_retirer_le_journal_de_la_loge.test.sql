-- Tests de la migration 0035_retirer_le_journal_de_la_loge.sql.
--
-- Une porte fermée se vérifie comme une porte ouverte. Ce fichier remplace
-- `0022_suivi_de_la_loge.test.sql`, qui éprouvait la fonction disparue.

\set ON_ERROR_STOP on
\o /dev/null

-- ---------------------------------------------------------------------------
\echo '— la fonction du journal de la loge n existe plus'
-- ---------------------------------------------------------------------------
select public.verifier(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'suivi_de_la_loge') = 0,
  'suivi_de_la_loge() a été retirée avec l''écran qui la justifiait');

-- Et l'appeler ne rend pas une erreur de droit, mais une absence : il n'y a
-- plus rien à appeler.
do $$
begin
  set local role authenticated;
  begin
    perform public.suivi_de_la_loge();
    raise exception 'ÉCHEC — la fonction répond encore';
  exception when undefined_function then
    raise notice '  ok — plus rien à cette adresse';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '— le journal d un candidat, lui, repond toujours'
-- ---------------------------------------------------------------------------
-- Ce qui compte : avoir fermé une porte sans fermer l'autre. Le suivi se lit
-- et s'écrit dans la fiche, et c'est désormais la seule voie.
select public.verifier(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'suivi_du_candidat') = 1,
  'suivi_du_candidat() est restée : le journal se lit dans la fiche');

select public.verifier(
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('modifier_le_suivi', 'retirer_le_suivi',
                        'rendre_le_suivi', 'changer_etat_du_suivi')) = 4,
  'et les quatre gestes du suivi aussi — corriger, retirer, rendre, refermer');

\echo ''
\echo 'Tous les contrôles de 0035_retirer_le_journal_de_la_loge.sql sont passés.'
