-- ---------------------------------------------------------------------------
-- 0048 — déposer la photo d'un référent
--
-- Ce que ça change : l'écran « modifier un référent » permet de déposer une
-- photo. Jusqu'ici un visage ne pouvait venir que de la reprise Bubble — un
-- référent inscrit dans HERACLES n'en avait donc aucun, et rien ne permettait
-- de lui en donner un.
--
-- POURQUOI UNE FONCTION, ET NON UN DROIT D'ÉCRITURE DE PLUS
--
-- 0012 ouvre l'écriture colonne par colonne :
--
--   grant update (nom, prenom, email, telephone, college, loge_id)
--     on public.referent to authenticated;
--
-- `photo_chemin` n'y figure pas, et il vaut mieux qu'elle n'y entre pas. Cette
-- colonne ne porte pas une donnée qu'on saisit, mais **l'emplacement d'un
-- fichier dans le stockage**. Ouverte à l'écriture directe, elle laisserait
-- faire pointer la photo d'un référent vers n'importe quel objet du seau — le
-- CV d'un candidat, par exemple, que /espace/referents/<id>/photo servirait
-- alors comme une image, sous le contrôle d'accès de la photo et non sous
-- celui du CV.
--
-- La fonction n'accepte donc qu'un chemin du dossier des photos de référent.
-- C'est la base qui tient cette règle, pas la route qui l'appelle : une route
-- se réécrit, une contrainte de la base vaut pour tout ce qui passera par là.
--
-- ELLE REND LE CHEMIN PRÉCÉDENT
--
-- Pour que l'appelant puisse effacer le fichier remplacé. Sans cela, chaque
-- dépôt laisserait un orphelin dans le seau : invisible, jamais servi, et
-- pourtant conservé — avec un visage dessus.
--
-- QUI A LE DROIT
--
-- L'administrateur seul, comme pour le reste de la fiche (policy
-- `referent_modification_admin`, 0012). La fonction est `security definer` :
-- elle écrit sans passer par la RLS, donc c'est `est_admin()` qui fait la
-- porte, et elle est la première ligne du corps.
-- ---------------------------------------------------------------------------

create or replace function public.poser_la_photo_du_referent(
  referent_choisi uuid,
  chemin text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ancien text;
begin
  -- La porte, avant toute chose : `security definer` a déjà mis la RLS de
  -- côté, il ne reste que ce test pour tenir le droit.
  if not public.est_admin() then
    raise exception 'Seul un administrateur change la photo d''un référent.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Le chemin doit rester dans le dossier des photos de référent, et n'être
  -- qu'un nom de fichier : ni sous-dossier, ni « .. », ni espace. C'est ce qui
  -- empêche de faire servir un CV à la place d'un visage.
  if chemin is null or chemin !~ '^referent/photo/[A-Za-z0-9._-]+$' then
    raise exception 'Ce chemin n''est pas celui d''une photo de référent : %', chemin
      using errcode = 'check_violation';
  end if;

  select r.photo_chemin into ancien
    from public.referent r
   where r.id = referent_choisi;

  if not found then
    raise exception 'Fiche de référent inconnue.'
      using errcode = 'no_data_found';
  end if;

  update public.referent
     set photo_chemin = chemin
   where id = referent_choisi;

  -- Nul, quand la fiche n'avait pas encore de photo. L'appelant n'a alors rien
  -- à effacer, et c'est très bien ainsi.
  return ancien;
end
$$;

comment on function public.poser_la_photo_du_referent(uuid, text) is
  'Ranger le chemin d''une photo de référent, et rendre celui qu''elle '
  'remplace pour que l''ancien fichier puisse être effacé. Administrateurs '
  'seuls ; le chemin doit être dans referent/photo/.';

revoke all on function public.poser_la_photo_du_referent(uuid, text) from public, anon;
grant execute on function public.poser_la_photo_du_referent(uuid, text) to authenticated;
