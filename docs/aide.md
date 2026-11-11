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

## Données personnelles

La question est comprise **dans le navigateur** : elle n'est envoyée ni au
serveur de HERACLES ni à un prestataire, et elle n'est pas enregistrée. Un nom
de candidat tapé par mégarde ne quitte donc pas l'écran. Le catalogue ne
contient que des libellés et des adresses d'écran. Le registre des traitements
n'a pas à bouger pour cette version.

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

## Ce qui vient après la bascule

- **Claude en renfort** quand la recherche locale ne trouve rien. La question
  partirait alors chez Anthropic : il faudra un avertissement près du champ et
  une ligne au registre des traitements avant de l'activer.
- Le reste du catalogue, au fil des lots 4 et 5 (offres, messagerie, pilotage).
- Un personnage plus animé (il marche d'une étape à l'autre).
- L'aide sur les formulaires publics (candidature, parrainage).
