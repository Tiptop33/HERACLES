-- ---------------------------------------------------------------------------
-- 0033 — la liste des candidats dit ce que chacun cherche
--
-- Ce que ça change : chaque rang du volet de gauche porte un liseré vertical
-- coloré selon la famille de recherche — emploi, alternance, stage ou
-- changement d'emploi. On voit la composition de sa liste sans la lire.
--
-- La liste ne connaissait pas cette information : `candidats_de_la_loge()`
-- rend le métier, pas le type de contrat cherché. Elle gagne une colonne.
--
-- C'est la **famille** qui sort, et non `type_emploi` brut. La règle de
-- rangement vit dans `famille_de_recherche()` (0031, 0032) et nulle part
-- ailleurs : les pastilles de l'accueil et les liserés de la liste se
-- décideront toujours ensemble, et une couleur ne pourra pas contredire un
-- compteur.
--
-- Le type de retour change : `drop` puis `create`, comme 0019 le fait déjà —
-- `create or replace` refuserait, et la migration ne se rejouerait plus.
--
-- Rien n'est élargi : une colonne de plus sur des lignes déjà rendues, et la
-- même clause `where` qu'en 0019.
-- ---------------------------------------------------------------------------
drop function if exists public.candidats_de_la_loge();

create function public.candidats_de_la_loge()
returns table (
  id                uuid,
  numero            integer,
  nom               text,
  prenom            text,
  age               integer,
  metier            text,
  ville             text,
  cloture           text,
  archive           text,
  loge_id           uuid,
  loge_nom          text,
  referent_nom      text,
  a_une_photo       boolean,
  c_est_mon_suivi   boolean,
  sans_referent     boolean,
  -- « emploi », « alternance », « stage », « changement », ou vide quand le
  -- libellé ne se reconnaît pas. Vide veut dire vide : le rang n'aura pas de
  -- liseré, plutôt qu'une couleur prise au hasard.
  famille           text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero, c.nom, c.prenom, c.age,
         coalesce(nullif(btrim(c.metier_libelle), ''), c.emploi_recherche),
         c.ville,
         c.cloture, c.archive,
         c.loge_id, l.nom,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         c.photo_chemin is not null,
         coalesce(
           c.referent_id = public.referent_courant()
             or c.parrain_id = public.referent_courant(),
           false),
         c.referent_id is null,
         public.famille_de_recherche(c.type_emploi)
    from public.candidat c
    left join public.loge l     on l.id = c.loge_id
    left join public.referent r on r.id = c.referent_id
   where public.est_admin()
      or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))
   -- Le tri de 0019, repris à l'identique : par numéro croissant, les fiches
   -- sans numéro à la fin plutôt que devant tout le monde.
   order by c.numero asc nulls last, c.nom nulls last, c.prenom nulls last
$$;

comment on function public.candidats_de_la_loge() is
  'La liste du volet de gauche : ce que le rang affiche, et rien de plus. La '
  'famille de recherche s''y ajoute depuis 0033 — c''est elle qui colore le '
  'liseré, et elle vient de la même règle que les pastilles de l''accueil.';

-- Le droit d'appeler se repose avec la fonction : `drop` l'avait emporté.
revoke all on function public.candidats_de_la_loge() from public, anon;
grant execute on function public.candidats_de_la_loge() to authenticated;
