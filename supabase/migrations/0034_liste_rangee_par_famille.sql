-- ---------------------------------------------------------------------------
-- 0034 — la liste se range par famille de recherche
--
-- Ce que ça change : le volet de gauche groupe les candidats par ce qu'ils
-- cherchent, dans cet ordre — emploi, alternance, stage, changement d'emploi.
-- Les liserés colorés posés par 0033 forment ainsi des blocs continus, au lieu
-- d'un damier qui obligeait à parcourir toute la liste pour voir combien de
-- personnes cherchent un stage.
--
-- **Le numéro reste le second critère.** À l'intérieur d'une famille, l'ordre
-- ne change pas : par numéro croissant, les fiches sans numéro à la fin. C'est
-- le repère que les référents ont en tête et celui qui est écrit sur les
-- dossiers ; on le déplace d'un cran, on ne le perd pas.
--
-- Les candidats dont le type ne se reconnaît pas ferment la marche. Ils n'ont
-- pas de liseré non plus : ils forment un bloc à part, et c'est utile — c'est
-- la liste de ce qu'il reste à renseigner.
--
-- L'ordre vit dans `rang_de_la_famille()`, et non dans un `case` noyé au fond
-- d'une clause `order by` : le jour où l'association voudra voir les stages en
-- premier, il y aura un seul endroit à changer, et un test pour le dire.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. L'ordre des familles
-- ---------------------------------------------------------------------------
create or replace function public.rang_de_la_famille(famille text)
returns integer
language sql
immutable
as $$
  select case famille
    when 'emploi'     then 1
    when 'alternance' then 2
    when 'stage'      then 3
    when 'changement' then 4
    else 5              -- ce qui ne se reconnaît pas ferme la marche
  end
$$;

comment on function public.rang_de_la_famille(text) is
  'L''ordre d''affichage des familles de recherche dans la liste : emploi, '
  'alternance, stage, changement d''emploi, puis ce qui n''a pas de famille.';

-- ---------------------------------------------------------------------------
-- 2. La liste, rangée
--    Le type de retour ne change pas ; `drop` puis `create` quand même, pour
--    que cette migration se rejoue derrière 0033 comme derrière elle-même.
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
   order by public.rang_de_la_famille(public.famille_de_recherche(c.type_emploi)),
            c.numero asc nulls last, c.nom nulls last, c.prenom nulls last
$$;

comment on function public.candidats_de_la_loge() is
  'La liste du volet de gauche : ce que le rang affiche, et rien de plus. '
  'Rangée par famille de recherche depuis 0034 — emploi, alternance, stage, '
  'changement d''emploi —, puis par numéro à l''intérieur de chacune.';

-- Le droit d'appeler se repose avec la fonction : `drop` l'avait emporté.
revoke all on function public.candidats_de_la_loge() from public, anon;
grant execute on function public.candidats_de_la_loge() to authenticated;
grant execute on function public.rang_de_la_famille(text) to authenticated;
