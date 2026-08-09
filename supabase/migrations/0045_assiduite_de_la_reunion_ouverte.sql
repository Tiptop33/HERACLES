-- ---------------------------------------------------------------------------
-- 0045 — l'assiduité ne porte que sur la réunion ouverte
--
-- Ce que ça change : sous chaque nom, la feuille d'appel affichait le cumul de
-- l'exercice — « 7 présences · 2 excuses », toutes réunions confondues.
-- Désormais elle ne compte que **la réunion ouverte**.
--
-- Ce qui s'affiche donc : « 1 présence », « 1 excuse », ou rien tant que
-- personne n'a été appelé.
--
-- CE QUE CELA COÛTE, PUISQUE C'EST DEMANDÉ EN CONNAISSANCE DE CAUSE
--
-- Le chiffre devient redondant avec les trois boutons de la même ligne, qui
-- disent déjà l'état du jour, et le liseré de couleur à gauche aussi. Et l'on
-- perd de vue l'assiduité sur l'exercice — celle qui donnait son sens à
-- l'appel : savoir, en cochant, qu'on coche la troisième absence d'affilée de
-- quelqu'un.
--
-- Les bornes de l'exercice ne commandent plus ce chiffre. Elles continuent de
-- commander le registre : `registre_des_reunions()` et ses voisines ne sont
-- pas touchées.
--
-- REVENIR EN ARRIÈRE
--
-- Une migration qui remet les deux sous-requêtes bornées par l'exercice, comme
-- en 0036. Rien d'autre n'a bougé.
-- ---------------------------------------------------------------------------

drop function if exists public.feuille_d_appel(uuid);

create function public.feuille_d_appel(reunion_choisie uuid)
returns table (
  referent_id       uuid,
  nom               text,
  prenom            text,
  college           text,
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo       boolean,
  /** Vide tant que personne ne l'a appelé — ce n'est pas « absent ». */
  etat              text,
  /** Sur **cette réunion** seulement : 1 ou 0. */
  presences         integer,
  excuses           integer
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.ma_loge()
  )
  select r.id, r.nom, r.prenom, r.college,
         (r.photo_chemin is not null or r.photo_url is not null),
         a.etat,
         case when a.etat = 'Présent' then 1 else 0 end,
         case when a.etat = 'Excusé'  then 1 else 0 end
    from public.referent r
    join la_reunion lr on r.loge_id = lr.loge_id
    left join public.appel a on a.reunion_id = lr.id and a.referent_id = r.id
   order by r.nom, r.prenom
$$;

comment on function public.feuille_d_appel(uuid) is
  'La feuille d''appel d''une réunion : les référents de la loge et leur état '
  'du jour. Les comptes ne portent que sur cette réunion — le cumul de '
  'l''exercice a été retiré en 0045.';

revoke all on function public.feuille_d_appel(uuid) from public, anon;
grant execute on function public.feuille_d_appel(uuid) to authenticated;
