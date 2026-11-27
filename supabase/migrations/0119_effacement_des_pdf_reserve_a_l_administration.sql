-- ---------------------------------------------------------------------------
-- 0119 — effacer un PDF, réservé à l'administration
--
-- Ce que ça change : effacer un compte rendu, une affiche ou une affichette
-- archivés n'appartient plus qu'aux administrateurs (décision du
-- 27 novembre 2026). Le Vénérable Maître et le Secrétaire, qui le pouvaient
-- dans leur loge depuis 0069, ne le peuvent plus.
--
-- POURQUOI MAINTENANT
--
-- Le même jour, l'accueil a perdu ses corbeilles (#203) et l'entrée
-- « Documents » est passée dans la famille Admin, avec l'onglet du téléphone
-- (#204). Il ne restait aux deux titres aucune porte vers ce geste — mais la
-- base, elle, le leur accordait toujours : un appel direct à
-- `effacer_un_document()`, avec la clé publique de l'API, effaçait encore.
-- Un droit ne doit pas être plus large que l'écran qui le justifie
-- (CLAUDE.md) : il se ferme ici, et non dans une page.
--
-- UNE SEULE RÈGLE, À UN SEUL ENDROIT
--
-- 0069 l'avait prévu : `puis_je_effacer_des_documents()` est une fonction à
-- part, « le jour où les deux droits divergent, on ne change qu'elle ». Ce
-- jour est venu. Elle ne s'appuie plus sur `puis_je_effacer_des_reunions()`
-- (0041) mais sur `est_admin()` seul. Ce qui en découle, sans rien réécrire :
--
--   · `effacer_un_document()` lève `insufficient_privilege` pour tout autre
--     compte, avant même de chercher le document ;
--   · `documents_de_l_accueil()` (0070) ne marque plus aucune ligne
--     `effacable` pour eux : la corbeille ne paraît nulle part.
--
-- CE QUI NE CHANGE PAS
--
--   · La lecture : chacun voit toujours les PDF de sa loge (policy
--     `document_lecture_loge`, 0069), l'administrateur ceux de toutes.
--   · Le fichier quitte le seau quand l'administrateur efface : c'est la route
--     qui l'ôte, après que la base a dit oui (inchangée).
--   · `puis_je_effacer_des_reunions()` reste telle qu'en 0041. Pour une
--     réunion, 0117 exige déjà d'administrer.
--   · Supprimer le dossier d'un candidat, qui emporte ses affichettes, est un
--     autre droit (`puis_je_supprimer_des_candidats()`) : il ne bouge pas.
--
-- Rejouable : `create or replace`, même signature et même type de retour
-- qu'en 0069. Le serveur rejoue toutes les migrations à chaque déploiement ;
-- celle-ci, venant après 0069, remet chaque fois la règle.
-- ---------------------------------------------------------------------------

create or replace function public.puis_je_effacer_des_documents()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.est_admin()
$$;

comment on function public.puis_je_effacer_des_documents() is
  'Vrai si la session peut effacer un compte rendu, une affiche ou une '
  'affichette archivés : administrateur seulement, depuis 0119.';

revoke all on function public.puis_je_effacer_des_documents() from public, anon;
grant execute on function public.puis_je_effacer_des_documents() to authenticated;

comment on function public.effacer_un_document(uuid) is
  'Efface un PDF archivé, de toute loge — administrateur seulement, depuis '
  '0119. Un PDF repris de Bubble reste en base, marqué effacé, pour ne pas '
  'revenir à la reprise. Rend le chemin du fichier à retirer du seau.';
