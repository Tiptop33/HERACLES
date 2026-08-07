-- ---------------------------------------------------------------------------
-- 0015 — les visages de l'annuaire
--
-- Ce que ça change : la carte d'un référent montre sa photo, quand elle a été
-- rapatriée de Bubble. Les initiales restent pour les autres.
--
-- Deux ajouts, et pas un de plus :
--
--   * `a_une_photo` dans l'annuaire — un booléen, pas un chemin. La page a
--     besoin de savoir s'il y a un visage à afficher, pas où il est rangé.
--   * `chemin_photo_referent(id)` — le chemin, rendu à la seule condition que
--     l'appelant ait le droit de voir cette fiche. C'est la même règle que
--     l'annuaire, écrite au même endroit.
--
-- Pourquoi une fonction plutôt qu'une colonne de plus : chez Bubble, ces
-- fichiers étaient sur un CDN public — qui avait l'adresse avait la photo. Ici,
-- l'adresse ne sort pas de la base. La route qui sert l'image la demande,
-- l'obtient ou non, et c'est la base qui tranche.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le chemin, sous condition
-- ---------------------------------------------------------------------------
create or replace function public.chemin_photo_referent(referent uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.photo_chemin
    from public.referent r
   where r.id = referent
     and r.photo_chemin is not null
     and (public.est_admin()
       or (r.loge_id is not null and r.loge_id in (select public.loges_visibles())))
$$;

comment on function public.chemin_photo_referent(uuid) is
  'Où trouver la photo d''un référent dans le stockage — et rien du tout si '
  'l''appelant n''a pas le droit de voir cette fiche. Même règle que '
  'annuaire_referents().';

revoke all on function public.chemin_photo_referent(uuid) from public, anon;
grant execute on function public.chemin_photo_referent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. L'annuaire dit qui a un visage
--    Le type de retour change : il faut défaire avant de refaire. Les
--    migrations se rejouant toutes à chaque déploiement, 0012 et 0013
--    reposeront leurs versions avant celle-ci — d'où le `drop` chez elles
--    aussi.
-- ---------------------------------------------------------------------------
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
  c_est_moi         boolean,
  a_une_photo       boolean,
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
         coalesce(r.profil_id = auth.uid(), false),
         -- La photo d'origine chez Bubble ne compte pas : cette adresse-là
         -- cessera de répondre à la fermeture. Seule la copie rapatriée
         -- s'affiche.
         r.photo_chemin is not null,
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
  'que la carte affiche : de quoi joindre quelqu''un, savoir si c''est soi '
  '(`c_est_moi`), et s''il y a un visage à montrer (`a_une_photo`). Jamais le '
  'chemin du fichier : voir chemin_photo_referent().';

revoke all on function public.annuaire_referents() from public, anon;
grant execute on function public.annuaire_referents() to authenticated;
