-- ---------------------------------------------------------------------------
-- 0062 — supprimer un candidat
--
-- Ce que ça change : une corbeille dans la liste des candidats supprime un
-- dossier pour de bon — la fiche, son journal de suivi, ses fichiers (CV,
-- lettre, photo) et l'invitation de parrainage qui l'a ouvert. Un dossier
-- ouvert par erreur, un doublon, un essai : jusqu'ici, rien ne permettait de
-- l'enlever.
--
-- TROIS BARRIÈRES, les mêmes que pour effacer une réunion (0041)
--
-- 1. **Pas les dossiers venus de Bubble.** `outils/import-bubble.mjs` écrit
--    chaque fiche par `on conflict (bubble_id) do update` : un candidat repris
--    de Bubble et supprimé reviendrait tel quel à la reprise finale — au plus
--    tard le 5 décembre 2026, quand plus personne ne saurait pourquoi. Ceux-là
--    ne se suppriment pas, et la fonction le dit au lieu de faire semblant.
--
-- 2. **Pas tout le monde.** L'administrateur, et les titres du collège
--    rangés dans `titre_qui_efface` (Vénérable Maître, Secrétaire). Le même
--    registre que pour les réunions : un seul endroit dit qui, dans une loge,
--    peut faire un geste qui ne se défait pas.
--
-- 3. **Sa loge, et rien d'autre** — sauf l'administrateur, qui voit toutes
--    les loges dans cette liste et peut donc agir sur toutes.
--
-- Une quatrième, par prudence : **pas un candidat qui a un compte.** Le
-- compte de connexion vit dans `auth.users`, hors de portée d'une fonction
-- SQL ; supprimer la fiche le laisserait orphelin, avec une adresse et un
-- mot de passe. Les dossiers ouverts dans HERACLES n'en ont pas — le
-- candidat complète sa fiche par un lien, sans compte —, donc ce cas ne
-- devrait pas se présenter. S'il se présente, on refuse plutôt que d'effacer
-- à moitié.
--
-- CE QUI PART AVEC LUI
--
--   * le journal de suivi : `suivi.candidat_id` porte `on delete cascade`
--     depuis 0021 ;
--   * les invitations de parrainage qui l'ont ouvert. La clé est en
--     `on delete set null` (0057), ce qui les aurait laissées en place avec
--     l'adresse du candidat et un lien encore valable vers un dossier
--     disparu. On les supprime explicitement ;
--   * ses fichiers. Ils ne sont pas en base mais dans le seau `documents`, que
--     SQL n'atteint pas : la fonction rend leurs chemins, et la route serveur
--     les retire du seau une fois la suppression faite.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Le droit, pour la session en cours
-- ---------------------------------------------------------------------------
create or replace function public.puis_je_supprimer_des_candidats()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Le même registre de titres que pour les réunions (0041), comparé sur la
  -- forme réduite : `referent.college` est du texte libre.
  select public.est_admin() or exists (
    select 1
      from public.referent r
      join public.titre_qui_efface t
        on t.nom_reduit = lower(btrim(r.college))
     where r.id = public.referent_courant()
  )
$$;

comment on function public.puis_je_supprimer_des_candidats() is
  'Vrai si la session peut supprimer un candidat : administrateur, ou titre du '
  'collège rangé dans titre_qui_efface. L''écran s''en sert pour montrer la '
  'corbeille ; supprimer_un_candidat le redemande.';

revoke all on function public.puis_je_supprimer_des_candidats() from public, anon;
grant execute on function public.puis_je_supprimer_des_candidats() to authenticated;

-- ---------------------------------------------------------------------------
-- Le geste
--
-- Rend un mot plutôt qu'un booléen, comme `effacer_une_reunion` : chaque
-- refus mérite sa phrase.
--
--   'supprime'    — c'est fait ; `fichiers` dit ce qu'il reste à retirer du seau
--   'introuvable' — pas de cette loge, ou déjà supprimé
--   'bubble'      — repris de Bubble : il reviendrait, donc on refuse
--   'compte'      — il a un compte de connexion, qu'on ne laisse pas orphelin
--
-- Le manque de droit, lui, lève : ce n'est pas un cas de figure, c'est une
-- porte fermée.
-- ---------------------------------------------------------------------------
drop function if exists public.supprimer_un_candidat(uuid);

create function public.supprimer_un_candidat(cible uuid)
returns table (issue text, fichiers text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche public.candidat%rowtype;
begin
  if not public.puis_je_supprimer_des_candidats() then
    raise exception 'Ce compte ne peut pas supprimer de candidat'
      using errcode = 'insufficient_privilege';
  end if;

  -- De l'extérieur, un candidat d'une autre loge et un candidat absent se
  -- ressemblent : c'est voulu.
  select c.* into fiche
    from public.candidat c
   where c.id = cible
     and (public.est_admin() or c.loge_id = public.ma_loge());

  if not found then
    return query select 'introuvable'::text, array[]::text[];
    return;
  end if;

  if fiche.bubble_id is not null then
    return query select 'bubble'::text, array[]::text[];
    return;
  end if;

  if fiche.profil_id is not null then
    return query select 'compte'::text, array[]::text[];
    return;
  end if;

  -- L'invitation qui a ouvert le dossier porte l'adresse du candidat et un
  -- lien vers lui : elle part avec lui.
  delete from public.parrainage p where p.candidat_id = cible;

  -- Le journal suit, par la cascade posée en 0021.
  delete from public.candidat c where c.id = cible;

  return query select 'supprime'::text,
    array_remove(array[fiche.cv_chemin, fiche.cv_anonyme_chemin,
                       fiche.lettre_motivation_chemin, fiche.photo_chemin], null);
end
$$;

comment on function public.supprimer_un_candidat(uuid) is
  'Supprime un candidat, son journal et l''invitation qui l''a ouvert, sans '
  'retour. Rend les chemins de ses fichiers, à retirer du seau par la route. '
  'Refuse les dossiers repris de Bubble et ceux qui ont un compte.';

revoke all on function public.supprimer_un_candidat(uuid) from public, anon;
grant execute on function public.supprimer_un_candidat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La liste dit quelles fiches sont supprimables
--
-- Sans quoi l'écran montrerait une corbeille sur un dossier de Bubble, et la
-- base refuserait après coup. Un bouton qui échoue toujours vaut moins qu'un
-- bouton qui n'est pas là.
--
-- Le reste est repris tel quel de 0034 : seule la colonne `supprimable`
-- s'ajoute. Le type de retour change, d'où `drop` puis `create`.
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
  famille           text,
  supprimable       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with droit as (
    select public.est_admin() as admin,
           public.puis_je_supprimer_des_candidats() as titre,
           public.ma_loge() as loge
  )
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
         public.famille_de_recherche(c.type_emploi),
         -- Exactement les conditions de `supprimer_un_candidat`, dans le même
         -- ordre : ce que la liste promet, la fonction le tient.
         c.bubble_id is null
           and c.profil_id is null
           and d.titre
           and (d.admin or c.loge_id = d.loge)
    from public.candidat c
    cross join droit d
    left join public.loge l     on l.id = c.loge_id
    left join public.referent r on r.id = c.referent_id
   where d.admin
      or (c.loge_id is not null and c.loge_id in (select public.loges_visibles()))
   order by public.rang_de_la_famille(public.famille_de_recherche(c.type_emploi)),
            c.numero asc nulls last, c.nom nulls last, c.prenom nulls last
$$;

comment on function public.candidats_de_la_loge() is
  'La liste du volet de gauche : ce que le rang affiche, et rien de plus. '
  'Rangée par famille de recherche depuis 0034, puis par numéro. Depuis 0062, '
  'dit aussi si la session peut supprimer chaque fiche.';

-- Le droit d'appeler se repose avec la fonction : `drop` l'avait emporté.
revoke all on function public.candidats_de_la_loge() from public, anon;
grant execute on function public.candidats_de_la_loge() to authenticated;
