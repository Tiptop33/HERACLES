-- ---------------------------------------------------------------------------
-- 0019 — le poste de travail : la liste des candidats de la loge
--
-- Ce que ça change : la maquette 1c — « liste permanente + fiche à droite » —
-- veut une liste qui ne disparaît jamais, pour enchaîner dix candidats sans
-- revenir en arrière. Cette liste-là est celle de la loge, pas celle d'une
-- personne.
--
-- Or la RLS posée en 0006 ne laisse voir que **ses** candidats : ceux dont on
-- est le référent ou le parrain. Un Vénérable Maître ne voit donc rien de sa
-- loge, et un administrateur — qui n'a pas de fiche de référent — ne voit rien
-- du tout. Les 118 candidats repris de Bubble ne sont visibles par personne.
--
-- CE QUE CETTE FONCTION OUVRE, ET CE QU'ELLE N'OUVRE PAS
--
-- Elle élargit la LISTE à la loge. Elle ne rend que ce que la liste affiche :
-- un nom, un âge, un métier, une ville, l'état du dossier, qui accompagne.
-- Ni adresse, ni téléphone, ni e-mail, ni CV, ni appréciation — rien de ce
-- qu'on lit dans une fiche.
--
-- La FICHE, elle, reste sur la RLS de 0006 : on n'ouvre en grand que l'écran
-- qui le justifie, et une liste ne justifie qu'une liste.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La liste
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
  loge_id           uuid,
  loge_nom          text,
  referent_nom      text,
  a_une_photo       boolean,
  -- Les deux colonnes qui portent les filtres de la maquette : « Mes suivis »
  -- et « Urgents ».
  c_est_mon_suivi   boolean,
  sans_referent     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.numero, c.nom, c.prenom, c.age,
         coalesce(nullif(btrim(c.metier_libelle), ''), c.emploi_recherche),
         c.ville,
         c.cloture,
         c.loge_id, l.nom,
         nullif(btrim(coalesce(r.prenom, '') || ' ' || coalesce(r.nom, '')), ''),
         c.photo_chemin is not null,
         coalesce(
           c.referent_id = public.referent_courant()
             or c.parrain_id = public.referent_courant(),
           false),
         c.referent_id is null
    from public.candidat c
    left join public.loge l     on l.id = c.loge_id
    left join public.referent r on r.id = c.referent_id
   where public.est_admin()
      or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))
   order by c.nom nulls last, c.prenom nulls last
$$;

comment on function public.candidats_de_la_loge() is
  'La liste permanente du poste de travail (maquette 1c) : les candidats de '
  'ses loges — toutes pour un administrateur. Ne rend que ce que la liste '
  'affiche. Ni coordonnées, ni CV, ni appréciation : la fiche reste sous la '
  'RLS de 0006.';

revoke all on function public.candidats_de_la_loge() from public, anon;
grant execute on function public.candidats_de_la_loge() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La photo, sous la même condition
--    Même dessin que pour les référents (0015) : le chemin ne sort de la base
--    que pour qui a le droit de voir la personne dans sa liste. La route qui
--    sert l'image le demande, l'obtient ou non, et c'est la base qui tranche.
-- ---------------------------------------------------------------------------
create or replace function public.chemin_photo_candidat(candidat uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.photo_chemin
    from public.candidat c
   where c.id = candidat
     and c.photo_chemin is not null
     and (public.est_admin()
       or (c.loge_id is not null and c.loge_id in (select public.loges_visibles())))
$$;

comment on function public.chemin_photo_candidat(uuid) is
  'Où trouver la photo d''un candidat — et rien du tout si l''appelant n''a '
  'pas le droit de le voir dans sa liste. Même règle que '
  'candidats_de_la_loge().';

revoke all on function public.chemin_photo_candidat(uuid) from public, anon;
grant execute on function public.chemin_photo_candidat(uuid) to authenticated;
