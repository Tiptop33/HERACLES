-- ---------------------------------------------------------------------------
-- 0051 — revenir dans « qui est là »
--
-- Ce que ça change : quelqu'un qui se reconnecte réapparaît dans la colonne de
-- gauche de ses collègues. Jusqu'ici, il pouvait en disparaître pour de bon.
--
-- LE DÉFAUT, ET POURQUOI IL NE SE VOYAIT PAS
--
-- `je_me_connecte()` (0042) posait :
--
--   set connecte_depuis = coalesce(connecte_depuis, now())
--
-- Le `coalesce` avait une bonne raison : ouvrir un second onglet ne doit pas
-- remettre le compteur à zéro, sans quoi le garde-fou des douze heures ne
-- s'appliquerait jamais à qui rafraîchit sa session.
--
-- Mais il dit aussi : **si l'heure est déjà posée, ne jamais y toucher.** Or
-- on ferme un onglet, on ne se déconnecte pas — c'est écrit noir sur blanc en
-- tête de 0042. L'heure restait donc celle de la toute première connexion.
-- Passé douze heures, `les_connectes()` écartait la personne ; et se
-- reconnecter ne changeait rien, puisque `coalesce` gardait la vieille valeur.
--
-- Résultat : dès sa première session laissée ouverte, quelqu'un disparaissait
-- de la colonne de ses collègues **définitivement**. Seule une déconnexion
-- explicite — qui, elle, remet la colonne à `null` — le faisait revenir. Le
-- geste que personne ne fait était devenu le seul qui répare.
--
-- Les tests de 0042 ne pouvaient pas l'attraper : l'un vérifie qu'une
-- reconnexion ne décale pas l'heure, l'autre qu'une session de treize heures
-- n'est plus comptée. Les deux passent. Ce qui manquait, c'est de les enchaîner
-- — treize heures, **puis** une reconnexion.
--
-- CE QUE FAIT LA CORRECTION
--
-- Elle garde la promesse du `coalesce` là où elle vaut, et seulement là : tant
-- que la session est vivante, l'heure de début ne bouge pas. Au-delà des douze
-- heures, la session est réputée close — s'y reconnecter en ouvre une neuve, et
-- l'heure repart de maintenant.
--
-- Les douze heures sont écrites ici comme dans `les_connectes()`. Les deux
-- fonctions parlent de la même limite, et doivent la lire pareil : une session
-- que l'une compte comme close et l'autre comme vivante ferait réapparaître
-- quelqu'un une fois sur deux.
-- ---------------------------------------------------------------------------

create or replace function public.je_me_connecte()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.profil
     set connecte_depuis = case
           -- Session encore vivante : on garde l'heure de début. C'est le cas
           -- du second onglet, et de qui rafraîchit sa page.
           when connecte_depuis > now() - interval '12 hours' then connecte_depuis
           -- Tout le reste — jamais connecté, déconnecté, ou revenu après plus
           -- de douze heures — ouvre une session neuve.
           else now()
         end
   where id = auth.uid()
$$;

comment on function public.je_me_connecte() is
  'Marque la session comme ouverte. Rejouable : tant que la session est '
  'vivante, une seconde connexion ne décale pas l''heure de début. Passé les '
  'douze heures du garde-fou, elle en ouvre une neuve — sans quoi on ne '
  'reviendrait jamais dans « qui est là ».';
