-- ---------------------------------------------------------------------------
-- 0012 — l'annuaire des référents
--
-- Ce que ça change : un référent voit les autres référents de sa loge, avec de
-- quoi les joindre. Il travaille avec eux — il passe un candidat, il prépare
-- une réunion —, et jusqu'ici il ne voyait que son binôme.
--
-- C'est un **élargissement assumé**, et il faut le dire : jusqu'à cette
-- migration, un référent ne lisait que sa propre fiche et celles qui
-- accompagnent ses candidats. Il lira désormais les coordonnées de la
-- vingtaine de personnes de sa loge.
--
-- Ce qui le justifie : ce sont des bénévoles qui travaillent ensemble, pas les
-- personnes accompagnées. L'application Bubble le fait déjà, et cet écran-là
-- est un annuaire — c'est son objet. La règle « jamais plus large que l'écran
-- qui la justifie » tient : hors de sa loge, rien ne bouge.
--
-- Trois divergences avec l'écran de Bubble, décidées ici :
--
--   1. **Pas de champ « mot de passe ».** Chez Bubble, un administrateur
--      saisit celui d'un autre. HERACLES ne le permet nulle part : on invite,
--      et la personne choisit le sien. Personne ne connaît le mot de passe
--      d'autrui, pas même l'administration.
--
--   2. **Pas de corbeille.** Supprimer un référent qui accompagne des
--      candidats laisserait des dossiers sans personne. Ce que cela doit
--      devenir — transfert, archivage — est une décision de produit, pas un
--      bouton qu'on pose en passant.
--
--   3. **Modifier est réservé aux administrateurs**, et à six colonnes. Un
--      référent modifie sa propre fiche par « Mon compte », pas celle des
--      autres.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Lire l'annuaire
--    Une fonction, et non une policy : la carte affiche le nombre de candidats
--    accompagnés, qui suppose de compter des fiches que l'appelant n'a pas le
--    droit de lire. La fonction ne rend que le compte.
--
--    Elle ne rend pas non plus tout de la fiche : ni immatriculation, ni
--    grade, ni officier, ni dernière visite. L'annuaire sert à joindre
--    quelqu'un, pas à le passer en revue.
-- ---------------------------------------------------------------------------
--    `drop` avant de créer : les migrations se rejouent toutes, dans l'ordre, à
--    chaque déploiement. Or 0013 redéfinit cette fonction avec une colonne de
--    plus, et `create or replace` refuse de changer un type de retour. Sans ce
--    `drop`, le second passage échouerait ici — et il l'a fait.
drop function if exists public.annuaire_referents();

create function public.annuaire_referents()
returns table (
  id                uuid,
  nom               text,
  prenom            text,
  email             text,
  telephone         text,
  photo_url         text,
  college           text,
  loge_id           uuid,
  loge_nom          text,
  compte_rattache   boolean,
  candidats_suivis  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.nom, r.prenom, r.email, r.telephone, r.photo_url, r.college,
         r.loge_id, l.nom,
         r.profil_id is not null,
         (select count(*)::integer
            from public.candidat c
           where (c.referent_id = r.id or c.parrain_id = r.id)
             and not public.candidat_est_clos(c))
    from public.referent r
    left join public.loge l on l.id = r.loge_id
   where public.est_admin()
      or (r.loge_id is not null and r.loge_id in (select public.loges_visibles()))
   order by r.nom nulls last, r.prenom nulls last
$$;

comment on function public.annuaire_referents() is
  'Les référents de ses loges — toutes, pour un administrateur. Ne rend que ce '
  'que la carte affiche, et compte les candidats sans ouvrir leurs fiches.';

-- ---------------------------------------------------------------------------
-- 2. Modifier une fiche — administrateurs seulement
--    Deux verrous, comme toujours. Le `grant` dit **quelles colonnes** ; la
--    policy dit **quelles lignes**. Ni `bubble_id` ni `profil_id` n'est de la
--    partie : le premier est la trace de la reprise, le second le rattachement
--    au compte. Les changer déplacerait une personne d'un compte à un autre.
-- ---------------------------------------------------------------------------
grant update (nom, prenom, email, telephone, college, loge_id)
  on public.referent to authenticated;

drop policy if exists referent_modification_admin on public.referent;
create policy referent_modification_admin on public.referent
  for update
  to authenticated
  using (public.est_admin())
  with check (public.est_admin());

comment on policy referent_modification_admin on public.referent is
  'Seul un administrateur corrige la fiche d''un autre. Chacun modifie la '
  'sienne par « Mon compte ».';

-- ---------------------------------------------------------------------------
-- 3. Ce qu'un administrateur a besoin de relire après avoir modifié
--    La policy d'écriture ne donne pas la lecture : sans celle-ci, il
--    écrirait sans jamais revoir ce qu'il a écrit.
-- ---------------------------------------------------------------------------
drop policy if exists referent_lecture_admin on public.referent;
create policy referent_lecture_admin on public.referent
  for select
  to authenticated
  using (public.est_admin());

comment on policy referent_lecture_admin on public.referent is
  'Un administrateur lit toutes les fiches de référent. Un référent, lui, ne '
  'lit que son binôme (0006) et l''annuaire de sa loge, par fonction.';

-- ---------------------------------------------------------------------------
-- 4. Le droit d'appeler
-- ---------------------------------------------------------------------------
revoke all on function public.annuaire_referents() from public, anon;
grant execute on function public.annuaire_referents() to authenticated;
