-- ---------------------------------------------------------------------------
-- 0057 — un signe de vie
--
-- Ce que ça change : quelqu'un qui ferme son onglet sort de « aussi en ligne »
-- au bout de deux minutes. Jusqu'ici il y restait jusqu'à douze heures, et ses
-- collègues voyaient son visage dans la colonne longtemps après son départ.
--
-- LE DÉFAUT
--
-- `connecte_depuis` (0042) est posée à la connexion et effacée à la
-- déconnexion — par `je_me_deconnecte()`, donc par le seul clic sur « Se
-- déconnecter ». Or on ferme un onglet, on ne se déconnecte pas : c'est écrit
-- en tête de 0042, qui l'assumait faute de mieux.
--
-- Le garde-fou des douze heures ne rattrapait rien, parce qu'il se comptait
-- depuis **le début** de la session et non depuis le départ : parti à 9 h
-- après s'être connecté à 8 h, on restait affiché jusqu'à 20 h.
--
-- CE QUI SERT DE SIGNE DE VIE
--
-- Rien de neuf n'est envoyé. La colonne redemande déjà sa liste toutes les
-- trente secondes, et seulement quand l'onglet est visible (`Connectes.tsx`).
-- Ce passage **est** le signe de vie : demander qui est là, c'est être devant
-- l'écran. `/api/connectes` note l'heure au passage, et c'est tout.
--
-- Conséquence à connaître : un onglet laissé en arrière-plan ne demande plus
-- rien, donc s'efface au bout de deux minutes — et reparaît dès qu'on y
-- revient, le retour à l'écran déclenchant un passage.
--
-- DEUX MINUTES
--
-- Quatre fois la cadence de trente secondes : trois passages peuvent se perdre
-- — un réseau qui hoquette, une requête lente, une page qu'on recharge — sans
-- que personne ne clignote dans la colonne des autres.
--
-- L'OUVERTURE DE SESSION VAUT SIGNE DE VIE
--
-- `coalesce(vu_le, connecte_depuis)` : tant qu'aucun passage n'a eu lieu,
-- c'est l'ouverture de la session qui fait foi — se connecter, c'est être là.
-- Cela couvre la première demi-minute, et les sessions déjà ouvertes au moment
-- où cette migration passe : celles-ci retrouvent leur place au premier
-- passage, et celles qui n'en font plus s'effacent, ce qui est le but.
--
-- CE QUE ÇA COÛTE
--
-- Sans JavaScript, il n'y a pas de passage, donc pas de signe de vie : on
-- apparaît deux minutes aux yeux des autres, puis on s'efface. Une présence
-- qui se mesure se paie de ce prix-là. L'écran, lui, se dégrade comme avant :
-- la liste rendue par le serveur reste affichée, simplement elle ne bouge
-- plus.
--
-- CE QUE ÇA N'EST TOUJOURS PAS : UN REGISTRE
--
-- `vu_le` n'est pas historisée, pas plus que `connecte_depuis` : une seule
-- heure, écrasée au passage suivant et effacée à la déconnexion. On ne peut
-- pas plus reconstituer les horaires de quelqu'un qu'avant — et on ne saurait
-- toujours dire que « il y a moins de deux minutes », jamais « depuis quand ».
--
-- LES DOUZE HEURES QUITTENT `les_connectes()`
--
-- La fonction ne regarde plus l'âge de la session. Deux minutes de silence
-- suffisent désormais à sortir de la liste ; et treize heures de travail avec
-- un signe de vie toutes les trente secondes ne suffisent plus à en sortir —
-- ce qui était le défaut symétrique, celui que 0051 avait déjà dû corriger une
-- première fois.
--
-- `je_me_connecte()` (0051) garde les siennes : elles disent quand une session
-- est neuve, pas qui est là. Les deux fonctions ne lisent donc plus la même
-- limite, et c'est voulu : elles ne parlent plus de la même chose.
-- ---------------------------------------------------------------------------

alter table public.profil
  add column if not exists vu_le timestamptz;

comment on column public.profil.vu_le is
  'Dernier signe de vie de la session en cours, ou nul : la colonne « aussi '
  'en ligne » redemande sa liste toutes les trente secondes, et l''heure est '
  'notée au passage. Écrasée à chaque fois, effacée à la déconnexion — donc '
  'sans historique et sans usage de surveillance.';

-- ---------------------------------------------------------------------------
-- Le passage
-- ---------------------------------------------------------------------------
create or replace function public.je_suis_la()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  -- `connecte_depuis is not null` : un onglet resté ouvert après une
  -- déconnexion continue de demander la liste. Son passage ne doit pas rouvrir
  -- ce que « Se déconnecter » vient de fermer.
  update public.profil
     set vu_le = now()
   where id = auth.uid()
     and connecte_depuis is not null
$$;

comment on function public.je_suis_la() is
  'Note un signe de vie sur ma session. Appelée au passage de '
  '/api/connectes : demander qui est là, c''est être devant l''écran. Sans '
  'effet sur une session close.';

revoke all on function public.je_suis_la() from public, anon;
grant execute on function public.je_suis_la() to authenticated;

-- ---------------------------------------------------------------------------
-- La déconnexion efface les deux
--
-- `connecte_depuis` suffirait à sortir de la liste. Mais laisser derrière soi
-- l'heure de son dernier passage serait garder une trace dont plus rien n'a
-- besoin : la session est close, la ligne se remet à zéro entière.
-- ---------------------------------------------------------------------------
create or replace function public.je_me_deconnecte()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.profil
     set connecte_depuis = null,
         vu_le = null
   where id = auth.uid()
$$;

comment on function public.je_me_deconnecte() is
  'Marque la session comme close et efface le dernier signe de vie. Appelée '
  'avant `signOut()`, tant que la session vaut encore.';

-- ---------------------------------------------------------------------------
-- Qui est là
--
-- Une session ouverte, et un signe de vie récent. Le reste — ma loge, moi
-- excepté — est celui de 0042.
-- ---------------------------------------------------------------------------
create or replace function public.les_connectes()
returns table (
  referent_id uuid,
  nom         text,
  prenom      text,
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- `photo_chemin`, et non `photo_url` : celle de Bubble n'est pas servie par
  -- l'application, comme dans l'annuaire (0015).
  select r.id, r.nom, r.prenom, r.photo_chemin is not null
    from public.referent r
    join public.profil p on p.id = r.profil_id
   where r.loge_id = public.ma_loge()
     and r.id is distinct from public.referent_courant()
     -- Une session ouverte…
     and p.connecte_depuis is not null
     -- …et vu il y a moins de deux minutes. À défaut de passage, l'ouverture
     -- de la session en tient lieu.
     and coalesce(p.vu_le, p.connecte_depuis) > now() - interval '2 minutes'
   -- Le dernier arrivé en tête, comme avant — et surtout pas par `vu_le` :
   -- tout le monde vient d'être vu, les visages se remettraient dans un ordre
   -- neuf toutes les trente secondes.
   order by p.connecte_depuis desc, r.nom, r.prenom
$$;

comment on function public.les_connectes() is
  'Les référents de ma loge qui sont là, moi excepté : session ouverte et '
  'signe de vie de moins de deux minutes. Depuis 0057 la liste ne regarde '
  'plus l''âge de la session — on ferme un onglet, on ne se déconnecte pas, '
  'et c''est le silence qui fait sortir de la liste.';

revoke all on function public.les_connectes() from public, anon;
grant execute on function public.les_connectes() to authenticated;
