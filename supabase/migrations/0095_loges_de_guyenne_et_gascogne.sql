-- ---------------------------------------------------------------------------
-- 0095 — « Loges de Guyenne et Gascogne »
--
-- Ce que ça change : à l'écran, les « loges du réseau » s'appellent désormais
-- les « Loges de Guyenne et Gascogne » (décision 41 du 13 novembre 2026). Le
-- courriel qui porte son lien au Secrétaire suit : « nous demandons à chaque
-- loge du réseau » devient « à chaque loge de Guyenne et Gascogne ».
--
-- Ce qui ne change pas, à dessein : les noms de tables, de colonnes, de
-- fonctions et les adresses gardent `loge_du_reseau`. Les renommer ferait
-- tomber les liens déjà envoyés aux Secrétaires (`/loge-du-reseau/<jeton>`).
--
-- Deux gestes, rejouables :
--   * le texte proposé par défaut, pour une base où le réglage n'existe pas
--     encore ;
--   * le texte déjà enregistré, s'il porte encore l'ancienne formule — le
--     reste de ce que l'administration y a écrit n'est pas touché.
-- ---------------------------------------------------------------------------

alter table public.parametre
  alter column mot_loge_du_reseau set default $texte$Bonjour {secretaire},

HERACLES accompagne des candidats en recherche d'emploi, d'alternance ou de stage. Pour orienter chacun vers les loges qui peuvent l'aider, nous demandons à chaque loge de Guyenne et Gascogne d'indiquer les secteurs d'activité où travaillent ses membres — sans nom ni nombre.

Pour la loge {loge}, il suffit de cocher ces secteurs sur cette page :
{lien}

Ce lien vous est personnel. Vous pouvez y revenir pour compléter ou corriger la liste jusqu'au {expiration}.

Merci de votre aide,
L'équipe HERACLES$texte$;

update public.parametre
   set mot_loge_du_reseau = replace(mot_loge_du_reseau, 'à chaque loge du réseau', 'à chaque loge de Guyenne et Gascogne')
 where position('à chaque loge du réseau' in mot_loge_du_reseau) > 0;

comment on column public.parametre.objet_loge_du_reseau is
  'Objet du courriel qui porte son lien au Secrétaire d''une loge de Guyenne et Gascogne (« loge du réseau » dans le code).';
