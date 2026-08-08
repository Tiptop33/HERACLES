-- ---------------------------------------------------------------------------
-- 0026 — de quoi rendre une note retirée depuis l'écran
--
-- Ce que ça change : `rendre_le_suivi()` existait depuis 0025, mais rien ne
-- l'appelait — il fallait passer par le SQL. C'est ce qui manquait pour que le
-- retrait doux tienne sa promesse : une ligne écartée par erreur devait
-- pouvoir revenir d'un clic, pas d'une connexion à la base.
--
-- Il n'y a qu'une chose à ajouter côté base : `suivi_retire_du_candidat()`
-- disait ce qui avait été retiré, pas si l'on avait le droit d'y toucher.
-- L'écran ne pouvait donc pas décider d'afficher le bouton — et la règle du
-- dépôt est de ne pas en afficher un qui mène à un mur.
-- ---------------------------------------------------------------------------

drop function if exists public.suivi_retire_du_candidat(uuid);

create function public.suivi_retire_du_candidat(candidat uuid)
returns table (
  id             uuid,
  fait_le        date,
  texte          text,
  auteur_nom     text,
  retire_par_nom text,
  retire_le      timestamptz,
  /**
   * Puis-je la rendre ? Même règle que partout depuis 0024 : une fiche de
   * référent rattachée au compte suffit, la lecture portant déjà le droit.
   * Faux pour une administratrice sans fiche — elle voit ce qui a été écarté,
   * elle ne le remet pas.
   */
  je_peux_agir   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.fait_le, s.texte,
         nullif(btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')), ''),
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         s.retire_le,
         public.referent_courant() is not null
    from public.suivi s
    join public.candidat c on c.id = s.candidat_id
    left join public.referent a on a.id = s.auteur_id
    left join public.referent r on r.id = s.retire_par
   where s.candidat_id = candidat
     and s.retire_le is not null
     and (public.est_admin()
       or c.referent_id = public.referent_courant()
       or c.parrain_id  = public.referent_courant()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
   order by s.retire_le desc
$$;

comment on function public.suivi_retire_du_candidat(uuid) is
  'Ce qui a été retiré du journal d''un candidat, par qui, et si l''appelant '
  'peut le rendre. Même règle de lecture que le journal lui-même.';

revoke all on function public.suivi_retire_du_candidat(uuid) from public, anon;
grant execute on function public.suivi_retire_du_candidat(uuid) to authenticated;
