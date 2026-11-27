-- ---------------------------------------------------------------------------
-- 0118 — la durée cumulée des connexions, par référent
--
-- Ce que ça change : en haut d'Admin › Connexions, un second tableau donne une
-- ligne par référent — son nom, et le temps passé sur l'application, toutes
-- ses connexions additionnées. Demandé le 27 novembre 2026.
--
-- POURQUOI EN BASE
--
-- Le journal ne rend que les 500 connexions les plus récentes (0110). Faire la
-- somme dans la page, ce serait additionner ces 500-là seulement : la durée
-- d'un référent assidu serait tronquée, et celui dont les connexions sont
-- anciennes disparaîtrait. La somme se fait donc sur tout le journal.
--
-- CE QUI EST ADDITIONNÉ
--
-- Chaque connexion compte pour la durée que le journal affiche :
-- `coalesce(deconnecte_le, dernier_signe) - debut`, arrondie à la seconde
-- **ligne par ligne**, avant l'addition — le total est exactement la somme des
-- durées que l'administrateur lit dans le journal en dessous. Une connexion en
-- cours compte jusqu'à son dernier signe de vie.
--
-- Le journal ne garde que douze mois (0110) : la durée cumulée porte donc sur
-- les douze derniers mois, au plus.
--
-- QUI FIGURE
--
-- Les référents qui ont au moins une connexion au journal — les mêmes que le
-- menu du filtre (0112). Un référent jamais connecté n'a pas de ligne.
--
-- L'ORDRE
--
-- La plus longue durée en tête ; à durée égale, par nom.
--
-- QUI LIT
--
-- Les administrateurs seulement, comme le journal : la fonction vérifie
-- `est_admin()` elle-même et ne rend rien à quiconque d'autre.
--
-- Rejouable : `create or replace`.
-- ---------------------------------------------------------------------------

create or replace function public.la_duree_cumulee_des_referents()
returns table (
  referent_id    uuid,
  nom            text,
  prenom         text,
  duree_secondes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.nom,
         r.prenom,
         sum(
           extract(epoch from coalesce(c.deconnecte_le, c.dernier_signe) - c.debut)::integer
         )::bigint as duree
    from public.connexion_referent c
    join public.referent r on r.id = c.referent_id
   where public.est_admin()
   group by r.id, r.nom, r.prenom
   order by duree desc, r.nom nulls last, r.prenom nulls last, r.id
$$;

comment on function public.la_duree_cumulee_des_referents() is
  'Une ligne par référent qui a au moins une connexion au journal : la durée '
  'de toutes ses connexions additionnées, en secondes, la plus longue en tête. '
  'Pour Admin › Connexions. Ne rend rien à qui n''est pas administrateur.';

revoke all on function public.la_duree_cumulee_des_referents() from public, anon;
grant execute on function public.la_duree_cumulee_des_referents() to authenticated;
