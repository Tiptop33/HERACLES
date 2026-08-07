-- ---------------------------------------------------------------------------
-- 0013 — l'annuaire s'ouvre sur sa loge
--
-- Ce que ça change : la page des référents s'ouvre sur la loge de la personne
-- connectée, et non sur les soixante-dix fiches de toutes les loges réunies.
--
-- Pour un référent, rien ne bouge : depuis 0012, l'annuaire ne lui rendait
-- déjà que sa loge. C'est l'administrateur qui voyait tout le monde d'un bloc,
-- alors qu'il travaille lui aussi dans une loge. Il garde le droit de voir les
-- autres — c'est son rôle —, mais il ne commence plus par là.
--
-- Une colonne suffit à le faire : `c_est_moi`. La page y trouve la fiche de la
-- personne connectée, et donc sa loge, sans avoir à demander deux fois ni à
-- deviner un rattachement.
--
-- Rien n'est élargi ici. Les mêmes lignes qu'en 0012 sortent de la fonction ;
-- il y a une colonne de plus, qui ne dit rien de personne d'autre que de soi.
-- ---------------------------------------------------------------------------

-- `create or replace` ne suffit pas : le type de retour change, PostgreSQL
-- refuse. On enlève, on repose — la fonction est reconstruite en entier.
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
         -- `coalesce` : sans lui, une fiche sans compte rendrait `null` au
         -- lieu de `false`, et « ce n'est pas moi » se lirait « on ne sait
         -- pas ».
         coalesce(r.profil_id = auth.uid(), false),
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
  'que la carte affiche, compte les candidats sans ouvrir leurs fiches, et '
  'signale par `c_est_moi` la fiche de la personne connectée : c''est de là '
  'que la page tire la loge sur laquelle s''ouvrir.';

-- Le droit d'appeler se repose avec la fonction : `drop` l'avait emporté.
revoke all on function public.annuaire_referents() from public, anon;
grant execute on function public.annuaire_referents() to authenticated;
