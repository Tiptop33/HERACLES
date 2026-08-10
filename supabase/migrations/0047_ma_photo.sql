-- ---------------------------------------------------------------------------
-- 0047 — ma photo
--
-- Ce que ça change : la colonne de gauche montre votre photo, sous votre nom —
-- ou sous votre adresse, tant que votre fiche n'a ni prénom ni nom.
--
-- POURQUOI UNE FONCTION, ET NON UNE COLONNE DE PLUS SUR `profil`
--
-- La photo ne vit pas sur `profil` mais sur `referent.photo_chemin` : le
-- compte porte la session, la fiche de référent porte le visage. L'écran, lui,
-- ne connaît que le profil, et il lui manquait deux choses :
--
--   · l'identifiant de la **fiche** — celui qu'attend
--     /espace/referents/<id>/photo, et qui n'est pas celui du compte ;
--   · le fait qu'il y ait une photo à demander, pour ne pas réclamer une image
--     qui n'existe pas.
--
-- Une fonction plutôt qu'une jointure dans la page : c'est la base qui dit ce
-- qu'on a le droit de voir, ici comme ailleurs. `security definer` lui permet
-- de lire `referent` sans ouvrir la table, et le `where` la referme aussitôt
-- sur la seule ligne de l'appelant.
--
-- `photo_chemin`, ET NON `photo_url`
--
-- Comme dans l'annuaire (0015) : `photo_url` est l'adresse d'origine chez
-- Bubble, que l'application ne sert pas. Annoncer un visage sur la foi de
-- `photo_url` afficherait un cadre vide, puisque la route exige, elle, le
-- fichier rapatrié. Mieux vaut ne rien montrer que montrer une image cassée.
--
-- ELLE NE REND RIEN À QUI N'EST PAS RÉFÉRENT
--
-- Un administrateur n'a pas nécessairement de fiche de référent. La fonction
-- rend alors zéro ligne, et la colonne n'affiche pas de photo — plutôt qu'une
-- silhouette vide qui laisserait croire à une panne.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Ma fiche, et si elle porte un visage
--
-- `referent_courant()` (0006) est la seule définition de « qui je suis » côté
-- fiche : la reprendre ici plutôt que de réécrire `profil_id = auth.uid()`
-- évite d'avoir deux réponses à la même question le jour où elle change.
-- ---------------------------------------------------------------------------
create or replace function public.ma_photo()
returns table (
  referent_id uuid,
  a_une_photo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.photo_chemin is not null
    from public.referent r
   where r.id = public.referent_courant()
$$;

comment on function public.ma_photo() is
  'Ma fiche de référent et le fait qu''elle porte une photo servable — rien '
  'si je n''ai pas de fiche. `photo_chemin` seul compte : celle de Bubble '
  'n''est pas servie par l''application.';

revoke all on function public.ma_photo() from public, anon;
grant execute on function public.ma_photo() to authenticated;
