-- ---------------------------------------------------------------------------
-- 0055 — de quoi écrire le compte rendu d'une réunion
--
-- Ce que ça change : deux fonctions de lecture, qui rendent exactement les
-- deux tableaux du compte rendu que la commission produit après chaque
-- réunion — celui que l'application Bubble sort aujourd'hui, et qu'HERACLES
-- doit savoir sortir avant la bascule.
--
--   · `compte_rendu_presences()` — le tableau des présences : nom, e-mail,
--     téléphone, l'état du jour, et le taux de présence sur l'exercice ;
--   · `compte_rendu_candidats()` — la liste des candidats : date, emploi
--     recherché, nom, référent, dernier commentaire, numéro de dossier.
--
-- Rien ne s'écrit ici. Le document est une photographie de ce que la base sait
-- déjà ; c'est la feuille d'appel qui le remplit, réunion après réunion.
--
-- LE TAUX DE PRÉSENCE
--
-- Présences sur l'exercice, divisées par le nombre de réunions de l'exercice.
-- Les bornes sont celles de `parametre`, comme partout depuis 0036, et les
-- réunions retirées ne comptent ni au numérateur ni au dénominateur — une
-- réunion retirée n'a pas eu lieu.
--
-- Seules les présences comptent : le document dit « PRÉSENCE % », et un excusé
-- n'est pas une présence. Il reste visible dans la colonne du jour.
--
-- Sans aucune réunion à l'exercice, le taux vaut zéro et non une division par
-- zéro — cas réel le lendemain d'un changement de dates d'exercice.
--
-- LA PORTE
--
-- Les deux fonctions passent par `la_reunion`, qui ne rend la réunion que si
-- elle est de ma loge — le motif de `feuille_d_appel` (0036). Une réunion
-- d'ailleurs ne rend aucune ligne, plutôt qu'une erreur : on ne dit pas ce qui
-- existe ailleurs.
--
-- La liste des candidats suit la loge **de la réunion**, et non `ma_loge()` :
-- les deux sont égales puisque la porte l'impose, mais l'écrire ainsi rend la
-- fonction juste par construction plutôt que par coïncidence.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Les présences
-- ---------------------------------------------------------------------------
create or replace function public.compte_rendu_presences(reunion_choisie uuid)
returns table (
  referent_id uuid,
  nom         text,
  prenom      text,
  email       text,
  telephone   text,
  /** L'état du jour : Présent, Excusé, Absent — ou null, jamais appelé. */
  etat        text,
  /** Réunions de l'exercice où cette personne était présente. */
  presences   integer,
  /** Ce que cela fait en pourcentage des réunions de l'exercice. */
  taux        integer
)
language sql
stable
security definer
set search_path = public
as $$
  with la_reunion as (
    select r.* from public.reunion r
     where r.id = reunion_choisie and r.loge_id = public.ma_loge()
  ),
  bornes as (
    select coalesce(p.date_depart, now() - interval '1 year') as debut,
           coalesce(p.date_fin,    now() + interval '1 year') as fin
      from public.parametre p where p.id
  ),
  -- Les réunions de l'exercice, pour la loge de celle qu'on imprime.
  tenues as (
    select u.id
      from public.reunion u
      join la_reunion lr on u.loge_id = lr.loge_id
      join bornes b on true
     where u.retire_le is null
       and u.tenue_le between b.debut and b.fin
  ),
  combien as (select count(*)::int as n from tenues)
  select r.id, r.nom, r.prenom, r.email, r.telephone,
         a.etat,
         venues.n,
         -- Zéro réunion à l'exercice : zéro pour tout le monde, et pas une
         -- division par zéro.
         case when combien.n = 0 then 0
              else round(100.0 * venues.n / combien.n)::int
         end
    from public.referent r
    join la_reunion lr on r.loge_id = lr.loge_id
    join combien on true
    left join public.appel a on a.reunion_id = lr.id and a.referent_id = r.id
    cross join lateral (
      select count(*)::int as n
        from public.appel p
        join tenues t on t.id = p.reunion_id
       where p.referent_id = r.id and p.etat = 'Présent'
    ) as venues
   order by r.nom, r.prenom
$$;

comment on function public.compte_rendu_presences(uuid) is
  'Le tableau des présences du compte rendu : la loge, son état du jour, et '
  'son taux de présence sur l''exercice. Seules les présences comptent — un '
  'excusé n''est pas une présence. Rien hors de ma loge.';

revoke all on function public.compte_rendu_presences(uuid) from public, anon;
grant execute on function public.compte_rendu_presences(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La liste des candidats
-- ---------------------------------------------------------------------------
create or replace function public.compte_rendu_candidats(reunion_choisie uuid)
returns table (
  candidat_id  uuid,
  numero       integer,
  /** Le jour où le dossier est entré — la colonne « DATE » du document. */
  ouvert_le    date,
  /** Court : ce que le métier s'appelle. */
  emploi       text,
  /** Long : ce que la personne cherche, tel qu'elle l'a écrit. */
  recherche    text,
  nom          text,
  prenom       text,
  referent_nom text,
  /** Le dernier mot du journal de suivi, celui qu'on relit en séance. */
  commentaire  text
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
  select c.id, c.numero, c.cree_le::date,
         coalesce(nullif(btrim(c.metier_libelle), ''), c.emploi_recherche),
         c.emploi_recherche,
         c.nom, c.prenom,
         r.nom,
         dernier.texte
    from public.candidat c
    join la_reunion lr on c.loge_id = lr.loge_id
    left join public.referent r on r.id = c.referent_id
    left join lateral (
      select s.texte
        from public.suivi s
       where s.candidat_id = c.id and s.retire_le is null
       order by s.fait_le desc nulls last, s.cree_le desc
       limit 1
    ) as dernier on true
   -- Le travail en cours, et lui seul : un dossier clôturé ou archivé ne se
   -- relit pas en séance. Même règle qu'à l'écran, et c'est `mot_de_fermeture`
   -- (0029) qui la porte — les « Non » de Bubble ne referment rien.
   where public.mot_de_fermeture(c.cloture) is null
     and public.mot_de_fermeture(c.archive) is null
   order by c.numero asc nulls last, c.nom, c.prenom
$$;

comment on function public.compte_rendu_candidats(uuid) is
  'La liste des candidats du compte rendu : les dossiers en cours de la loge '
  'de cette réunion, avec leur dernier commentaire de suivi. Clôturés et '
  'archivés en sont exclus, selon mot_de_fermeture() (0029).';

revoke all on function public.compte_rendu_candidats(uuid) from public, anon;
grant execute on function public.compte_rendu_candidats(uuid) to authenticated;
