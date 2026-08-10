-- ---------------------------------------------------------------------------
-- 0050 — ma photo, depuis mon compte
--
-- Ce que ça change : un référent dépose et retire **sa propre** photo depuis
-- « Mon compte ». Jusqu'ici, seul un administrateur pouvait le faire (0048,
-- 0049) : quelqu'un qui voulait un visage — ou qui n'en voulait plus — devait
-- demander à quelqu'un d'autre, et attendre.
--
-- POURQUOI DEUX FONCTIONS DE PLUS, ET NON LE MÊME DROIT ÉLARGI
--
-- Élargir `poser_la_photo_du_referent()` à « l'administrateur, ou bien la
-- personne elle-même » aurait été plus court d'une ligne. C'eût été une erreur :
-- une fonction qui prend un identifiant en paramètre **et** accepte deux titres
-- de droit se relit mal, et le jour où l'un des deux bouge, l'autre bouge avec
-- lui sans qu'on l'ait voulu.
--
-- Ici, les fonctions ne prennent aucun identifiant : elles agissent sur
-- `referent_courant()`, c'est-à-dire sur soi, et sur personne d'autre. Il n'y a
-- rien à contrôler parce qu'il n'y a rien à choisir — la meilleure façon de ne
-- pas se tromper de fiche est de ne pas pouvoir en désigner une.
--
-- LE CHEMIN EST PLUS ÉTROIT QU'EN 0048
--
-- L'administrateur peut ranger n'importe quel nom du dossier des photos : il
-- reprend parfois un fichier venu de Bubble, dont le nom vient de là-bas. Pour
-- soi-même, aucune raison d'être aussi large — le chemin doit être exactement
-- `referent/photo/<ma fiche>.<format>`. On ne peut donc pas faire pointer sa
-- propre photo vers le fichier de quelqu'un d'autre, fût-il de sa loge.
--
-- `photo_url` PART AU RETRAIT, POUR LA MÊME RAISON QU'EN 0049
--
-- L'outil de reprise rapatrie ce qui a « une adresse, pas encore de copie ».
-- Un retrait qui n'effacerait que le chemin laisserait la reprise du
-- 5 décembre remettre le visage en place.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Déposer ma photo
-- ---------------------------------------------------------------------------
create or replace function public.poser_ma_photo(chemin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche  uuid := public.referent_courant();
  ancien text;
begin
  -- Aucune fiche de référent : rien à quoi accrocher un visage. Un
  -- administrateur qui n'est pas référent tombe ici, et c'est normal — il a
  -- l'écran des référents pour cela.
  if fiche is null then
    raise exception 'Votre compte n''est rattaché à aucune fiche de référent.'
      using errcode = 'no_data_found';
  end if;

  -- Exactement ma fiche, et un format d'image. Rien d'autre ne passe.
  if chemin is null
     or chemin !~ ('^referent/photo/' || fiche::text || '\.(jpg|png|webp|gif|avif)$') then
    raise exception 'Ce chemin n''est pas celui de votre photo : %', chemin
      using errcode = 'check_violation';
  end if;

  select r.photo_chemin into ancien from public.referent r where r.id = fiche;

  update public.referent set photo_chemin = chemin where id = fiche;

  -- Le chemin remplacé, pour que l'appelant efface l'ancien fichier.
  return ancien;
end
$$;

comment on function public.poser_ma_photo(text) is
  'Ranger le chemin de ma propre photo, et rendre celui qu''elle remplace. '
  'Aucun identifiant en paramètre : on n''agit que sur sa propre fiche.';

revoke all on function public.poser_ma_photo(text) from public, anon;
grant execute on function public.poser_ma_photo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Retirer ma photo
-- ---------------------------------------------------------------------------
create or replace function public.retirer_ma_photo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fiche  uuid := public.referent_courant();
  ancien text;
begin
  if fiche is null then
    raise exception 'Votre compte n''est rattaché à aucune fiche de référent.'
      using errcode = 'no_data_found';
  end if;

  select r.photo_chemin into ancien from public.referent r where r.id = fiche;

  -- Les deux colonnes, comme en 0049 : garder l'adresse Bubble ferait revenir
  -- la photo à la prochaine reprise.
  update public.referent
     set photo_chemin = null,
         photo_url    = null
   where id = fiche;

  return ancien;
end
$$;

comment on function public.retirer_ma_photo() is
  'Retirer ma propre photo, et rendre son chemin pour que le fichier quitte le '
  'stockage. Efface aussi l''adresse Bubble d''origine, sans quoi la prochaine '
  'reprise remettrait le visage en place.';

revoke all on function public.retirer_ma_photo() from public, anon;
grant execute on function public.retirer_ma_photo() to authenticated;
