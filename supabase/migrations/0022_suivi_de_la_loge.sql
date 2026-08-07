-- ---------------------------------------------------------------------------
-- 0022 — le journal de la loge, d'un seul tenant
--
-- Ce que ça change : `suivi_du_candidat()` (0021) rend le journal d'une
-- personne, et il faut ouvrir sa fiche pour le lire. On ne voit donc jamais
-- l'ensemble — ce qui a bougé cette semaine, et sur qui rien n'a bougé depuis
-- trois mois. Cette fonction rend le tout, en une fois.
--
-- Même règle que 0021, à la ligne près : ce qu'on a le droit de voir dans une
-- fiche, on a le droit de le voir dans cette liste. Elle n'ouvre rien de plus,
-- elle épargne seulement d'ouvrir cent sept fiches.
--
-- Elle rend `candidat_id` sans rien d'autre du candidat : le nom, le numéro et
-- le métier viennent de `candidats_de_la_loge()` (0019), qui les rend déjà.
-- Deux fonctions, deux responsabilités — et aucune colonne recopiée à deux
-- endroits, donc aucune à tenir d'accord.
-- ---------------------------------------------------------------------------

drop function if exists public.suivi_de_la_loge();

create function public.suivi_de_la_loge()
returns table (
  candidat_id uuid,
  id          uuid,
  fait_le     date,
  nature      text,
  texte       text,
  auteur_nom  text,
  c_est_moi   boolean,
  cree_le     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.candidat_id, s.id, s.fait_le, s.nature, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         coalesce(s.auteur_id = public.referent_courant(), false),
         s.cree_le
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
   where public.est_admin()
      or c.referent_id = public.referent_courant()
      or c.parrain_id  = public.referent_courant()
      or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))
   order by s.fait_le desc, s.cree_le desc
$$;

comment on function public.suivi_de_la_loge() is
  'Toutes les notes de suivi que l''appelant a le droit de lire, du plus '
  'récent au plus ancien. Même règle que suivi_du_candidat() : elle épargne '
  'd''ouvrir cent sept fiches, elle n''ouvre rien de plus.';

revoke all on function public.suivi_de_la_loge() from public, anon;
grant execute on function public.suivi_de_la_loge() to authenticated;
