-- ---------------------------------------------------------------------------
-- 0070 — l'accueil et les archives ne montrent que les PDF qu'on peut ouvrir
--
-- Ce que ça change : un PDF dont le fichier n'est pas dans notre stockage
-- n'apparaît plus dans les trois colonnes — ni à l'accueil, ni dans
-- Paramètres › Archives.
--
-- Jusqu'ici, `documents_de_l_accueil()` (0069) listait aussi les PDF de
-- Bubble pas encore rapatriés, qu'on ouvrait par leur adresse sur le CDN de
-- Bubble. Le 9 novembre 2026, six d'entre eux sont restés hors de portée : la
-- fiche existe toujours chez Bubble, mais son CDN refuse le fichier (HTTP
-- 403). Leurs liens ne menaient nulle part.
--
-- La règle devient : **un lien n'est montré que s'il s'ouvre**. Un PDF
-- produit par HERACLES a toujours son fichier ; un PDF de Bubble le reçoit à
-- la mise en ligne suivante (`reprendre-bubble.sh --pdf-commission`), et
-- apparaît alors. Ceux que Bubble refuse restent en base, invisibles : rien
-- n'est effacé, et si leur fichier revenait, ils reviendraient avec lui.
--
-- Même signature qu'en 0069 : `create or replace` suffit, et les droits sont
-- reposés à l'identique.
-- ---------------------------------------------------------------------------

create or replace function public.documents_de_l_accueil(du date, au date)
returns table (
  id            uuid,
  nom           text,
  type_document text,
  date_document date,
  effacable     boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with droit as (
    select public.puis_je_effacer_des_documents() as peut,
           public.est_admin()                     as admin,
           public.ma_loge()                       as loge
  ),
  lu as (
    select d.id, d.nom, d.loge_id, d.cree_le,
           lower(btrim(d.type_document)) as sorte,
           coalesce(d.date_document, (d.cree_le at time zone 'Europe/Paris')::date) as le
      from public.document d
     where d.efface_le is null
       -- Le fichier est chez nous : le lien s'ouvrira.
       and d.chemin is not null
  )
  select lu.id, lu.nom, lu.sorte, lu.le,
         droit.peut and (droit.admin or lu.loge_id = droit.loge)
    from lu, droit
   where lu.sorte in ('compte-rendu', 'affiche', 'affichette')
     and lu.le between du and au
   order by lu.le desc, lu.cree_le desc, lu.id
$$;

comment on function public.documents_de_l_accueil(date, date) is
  'Les comptes rendus, affiches et affichettes lisibles par la session, datés '
  'de la période, dont le fichier est dans notre stockage, du plus récent au '
  'plus ancien, avec le droit de les effacer. Sert l''accueil et '
  'Paramètres › Archives.';

revoke all on function public.documents_de_l_accueil(date, date) from public, anon;
grant execute on function public.documents_de_l_accueil(date, date) to authenticated;
