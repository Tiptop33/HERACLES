# L'aide intégrée

Un bouton « Aide », en bas à droite des espaces de travail. Le référent ou
l'administrateur y pose sa question — « comment avoir la liste de mes
candidats ? » — et l'aide lui montre où cela se passe : un personnage en volume
vient se placer à côté de l'élément, le bras tendu vers lui, et dit quoi faire.

Deux façons de répondre, pour chaque parcours :

- **Montre-moi** — pas à pas depuis le début, sur l'écran réel. La personne
  clique elle-même ; chaque clic sur l'élément désigné fait passer à l'étape
  suivante.
- **Emmène-moi** — l'écran s'ouvre directement, et le personnage désigne
  l'arrivée.

L'aide **ne modifie jamais rien** : elle navigue, comme le ferait un lien, et
elle désigne. Clôturer, archiver, supprimer restent des gestes de la personne.

## Ce qui est livré (version courte, avant la mise en ligne)

| Pièce | Fichier |
| --- | --- |
| Le catalogue des parcours | `apps/web/src/lib/aide/parcours.ts` |
| La compréhension de la question | `apps/web/src/lib/aide/recherche.ts` |
| La place du personnage | `apps/web/src/lib/aide/placement.ts` |
| Le bouton, la fenêtre, le guide | `apps/web/src/components/aide/Aide.tsx` |
| Le personnage en volume | `apps/web/src/components/aide/Personnage.tsx` |
| Les tests | `apps/web/tests/aide.test.ts` |

Elle est montée une fois, dans la coquille des espaces
(`apps/web/src/app/espace/layout.tsx`), et ne propose que les parcours que le
rôle a le droit d'ouvrir.

## Claude en renfort

Quand la recherche locale ne trouve rien, la fenêtre propose un bouton
**« Demander à Claude »**. Sur ce clic — et jamais en tapant — la question part
à `POST /api/aide/renfort`, qui la transmet à Claude avec le catalogue du rôle.
Claude rend des identifiants de parcours ; il ne rédige rien.

| Pièce | Fichier |
| --- | --- |
| La consigne, le schéma, le filtre, la limite | `apps/web/src/lib/aide/renfort.ts` |
| L'appel à Anthropic | `apps/web/src/lib/aide/renfort-serveur.ts` |
| La route | `apps/web/src/app/api/aide/renfort/route.ts` |

- **Garde-fous** : session exigée ; dix questions par personne et par quart
  d'heure ; 300 caractères au plus ; le serveur écarte tout identifiant hors du
  catalogue du rôle (un référent ne reçoit jamais un parcours d'administration).
- **Clé** : `ANTHROPIC_API_KEY`, la même que pour la lecture du CV
  (`docs/lecture-du-cv.md`). Sans elle, le bouton n'apparaît pas.
- **Coût** : une question pèse environ 1 500 jetons en entrée et quelques
  dizaines en sortie, soit de l'ordre d'un centime, pris sur la limite de 10 $
  par mois de l'espace de travail « HERACLES ». Cette limite est partagée avec
  la lecture du CV : si elle est atteinte, les deux s'arrêtent jusqu'au mois
  suivant.
- **Limite connue** : le compteur de questions vit en mémoire du serveur ; il
  repart de zéro à chaque redémarrage.

## Données personnelles

Tant que la recherche locale trouve, la question est comprise **dans le
navigateur** : elle n'est envoyée ni au serveur de HERACLES ni à un
prestataire. Le catalogue ne contient que des libellés et des adresses d'écran.

Avec « Demander à Claude », la question part chez Anthropic (États-Unis). Elle
n'est accompagnée d'aucune donnée de la base, et HERACLES ne la conserve pas ;
mais un nom tapé dans la question partirait avec elle. D'où l'avertissement
sous le bouton, et le § 5 ter du registre des traitements
(`docs/rgpd/registre-des-traitements.md`).

## Sur les formulaires publics

Le même bouton « Aide » est présent sur la fiche que remplit le candidat
(`/candidature/<jeton>`) et sur la présentation que fait le parrain
(`/parrainage/<jeton>`). Chaque formulaire a son propre catalogue, dans
`apps/web/src/lib/aide/parcours-publics.ts` : neuf parcours pour le candidat,
cinq pour le parrain.

Ce qui diffère de l'espace de travail :

- **Une étape par parcours, sur la page.** Le personnage désigne la partie du
  formulaire et dit ce qu'on y attend. Pas de « Emmène-moi » : il n'y a nulle
  part où aller.
- **Pas de Claude.** La route du renfort exige une session, et ces pages n'en
  ont pas : une question tapée par un candidat ne quitte jamais son navigateur.
- **Aucune donnée.** Les textes parlent du formulaire, pas de la personne ; ils
  ne reprennent ni nom, ni loge, ni rien de ce qui est saisi.

Sur un téléphone (moins de 600 px de large), la bulle dit une **version
courte** de chaque réponse : une phrase de cent caractères au plus, écrite à
côté du texte long dans `parcours-publics.ts`. Elle garde ce qui compte — ce
qui est obligatoire, ce qui est facultatif, où vont les données — et un test
le vérifie. Un parcours sans version courte dit son texte entier.

## Les gestes qui retirent ou effacent

L'aide sait aussi montrer où supprimer un dossier, retirer un référent, retirer
une réunion, la rendre au registre ou l'effacer pour de bon. Elle les
**montre**, elle ne les fait pas : chaque bouton désigné ouvre la fenêtre de
confirmation de l'écran, et c'est la personne qui confirme.

Chaque texte dit, avant qu'on aille chercher le bouton : si le geste se défait
ou non, à qui il est réservé, et le geste plus doux quand il existe (clôturer
plutôt que supprimer, la corbeille plutôt que la croix). Un test le vérifie, et
vérifie qu'aucun « Emmène-moi » n'ouvre directement une fenêtre de
confirmation.

Les retraits plus fins y sont aussi : retirer une note du suivi et la rendre,
effacer un PDF archivé, retirer un titre du collège. La note retirée n'est pas
effacée : elle se rend depuis « notes retirées ».

## Ajouter un parcours

1. Poser une **ancre** sur l'élément à désigner : `data-aide="mon-element"`.
   L'attribut est invisible ; il ne change rien à l'écran.
2. Décrire le parcours dans `parcours.ts` : un titre, les mots par lesquels on
   le demande, les étapes (ancre + phrase), et l'adresse d'« Emmène-moi ».
3. Lancer `npm test` : le test refuse une ancre citée qui n'existe pas dans le
   code, et une entrée de menu que le rôle ne voit pas.

Un écran refondu sans son ancre casse le test — c'est voulu : sans lui, le
personnage pointerait dans le vide sans que personne ne s'en aperçoive.

## Le personnage

Construit en code avec `three` (formes simples, facettes apparentes), aux
couleurs de l'application. Aucun fichier de modèle, aucune licence à suivre. La
bibliothèque ne se charge qu'à la première visite guidée. Sans WebGL, une
flèche prend sa place ; avec « réduire les animations », il ne bouge plus.

D'une étape à l'autre, il **marche** : il reste à sa place le temps que le
nouvel élément soit trouvé, puis s'y rend à pied, de profil, bras et jambes en
mouvement (`apps/web/src/lib/aide/marche.ts` pour le trajet, de 0,35 à
1,3 seconde selon la distance). Au premier pas d'une visite, il part du coin où
se trouve le bouton « Aide ». Sa bulle, elle, est déjà à l'arrivée.

## Ce qui vient après la bascule

- Le reste du catalogue, au fil des lots 4 et 5 (offres, messagerie, pilotage).
