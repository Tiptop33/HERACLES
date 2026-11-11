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

## Sur un téléphone

Sous 46 rem de large, le bouton flottant disparaît des espaces de travail : il
recouvrait la fiche du candidat. L'aide devient une entrée « Aide », en bas du
menu repliable. Les formulaires publics, qui n'ont pas de menu, gardent leur
bouton.

Le menu étant replié par défaut, ses entrées ne sont pas à l'écran. Quand une
étape désigne l'une d'elles (ancre `menu:…` ou `eteint:…`), l'aide demande à la
colonne de se déployer, et de se replier quand l'étape est passée. Les deux
composants se parlent par deux événements du navigateur, nommés dans
`apps/web/src/lib/aide/signaux.ts`.

Les bulles ne disent pas la même chose non plus. Une étape dont le texte décrit
l'écran large — « dans la colonne de gauche », « la fiche s'ouvre à droite » — porte
une version `court` qui parle du menu et du plein écran. Elle se dit sous
`LARGEUR_DE_TELEPHONE` (736 px, les mêmes 46 rem que la feuille de style). Un
test refuse toute bulle de téléphone qui parlerait encore de « colonne ».

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
- **Le compteur est en base** (migration 0082, table `aide_question`,
  fonction `compter_une_question_d_aide()`) : il tient d'un déploiement à
  l'autre. La table garde qui a demandé et quand, jamais la question ; ses
  lignes de plus d'un jour sont effacées au passage suivant. Si la base ne
  répond pas, la route refuse sans appeler Claude.

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

## Sur « Mon compte »

`/mon-compte` est une page connectée, mais hors de la coquille des espaces :
l'aide y a son propre catalogue (`compte`, dans `parcours-publics.ts`), sur le
modèle des formulaires publics — une étape par réponse, sur la page, sans
Claude. Trois parcours : changer ses informations, mettre ou changer sa photo,
retirer sa photo.

Depuis l'espace de travail, « retirer ma photo » mène à la pastille « Mon
compte » ; l'aide de la page prend le relais. Pour la photo d'un autre
référent — administration seulement — le parcours passe par le stylo de sa
ligne dans l'annuaire.

Le mot de passe ne se change pas dans « Mon compte » : la page n'a pas de champ
pour cela. Le parcours « Changer mon mot de passe » renvoie vers « Mot de passe
oublié ? », sur l'écran de connexion.

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

C'est Héraclès, le héros de l'emblème : la peau du lion sur la tête, la barbe,
la tunique claire, la massue dans le dos (choisi le 11 novembre 2026, parmi
cinq propositions). Construit en code avec `three` (formes simples, facettes
apparentes). Aucun fichier de modèle, aucune licence à suivre. La
bibliothèque ne se charge qu'à la première visite guidée. Sans WebGL, une
flèche prend sa place ; avec « réduire les animations », il ne bouge plus.

D'une étape à l'autre, il **marche** : il reste à sa place le temps que le
nouvel élément soit trouvé, puis s'y rend à pied, de profil, bras et jambes en
mouvement (`apps/web/src/lib/aide/marche.ts` pour le trajet, de 0,35 à
1,3 seconde selon la distance). Au premier pas d'une visite, il part du coin où
se trouve le bouton « Aide ». Sa bulle, elle, est déjà à l'arrivée.

## Ce qui vient après la bascule

- Les vrais parcours des offres, des entreprises et de « Relation », quand
  leurs écrans existeront. D'ici là, l'aide répond déjà à ces questions : elle
  montre les offres en cours sur l'accueil, et désigne les entrées grisées en
  disant qu'elles ne sont pas encore en service. Ses ancres `eteint:` font
  casser le test du catalogue le jour où l'écran arrive — c'est le signal pour
  écrire le vrai parcours.
- De même pour la messagerie, les correspondants, le tableau de bord, le
  bilan, les loges, les secteurs d'activité et les types de document : l'aide
  dit aujourd'hui qu'ils ne sont pas encore en service, et montre ce qui
  existe déjà (les chiffres de l'accueil). Les rubriques grisées des
  paramètres ont le même garde-fou, avec des ancres `rubrique-eteinte:`.

## Récapitulatif — état au 11 novembre 2026

Ce qui a été livré sur l'aide, en quinze pull requests de code (115, 116, 118 à
129, 131), toutes fusionnées et déployées sur l'instance d'essai. Cette section est une
photographie datée : le reste du document décrit le fonctionnement, celle-ci
dit où l'on en est et ce qui reste à éprouver.

### Ce que fait l'aide

- **Question libre** : la personne tape sa question, une recherche locale
  propose les parcours qui y répondent. La question ne quitte pas le
  navigateur.
- **Deux gestes par réponse** : « Montre-moi » guide pas à pas sur l'écran
  réel ; « Emmène-moi » ouvre directement l'écran.
- **Personnage en volume** : construit en code, il marche d'une étape à
  l'autre, se place à côté de l'élément et tend le bras vers lui.
- **Claude en renfort** : dans l'espace de travail seulement, quand la
  recherche locale ne trouve rien, un bouton « Demander à Claude » envoie la
  question, sur ce clic et avec un avertissement.
- **L'aide ne fait rien à la place de la personne** : elle navigue et désigne,
  jamais elle ne clique un bouton qui modifie une donnée.

### Où elle est présente

| Écran | Parcours | Particularités |
| --- | --- | --- |
| Espace de travail (référents, administration) | 60 | Filtrés par rôle ; Claude en renfort |
| Fiche du candidat (formulaire public) | 9 | Une étape par réponse, sans Claude, bulles courtes sur téléphone |
| Présentation du parrain (formulaire public) | 5 | Idem |
| Mon compte | 3 | Idem |

### Ce que couvrent les 60 parcours de l'espace de travail

- **Candidats** : listes, recherche, fiche, nouveau candidat, documents, suivi,
  clôturer, rouvrir, corriger, changer de référent, CV anonyme, impression.
- **Réunion** : appel, affiche, compte rendu, affichette, registre.
- **Réseau et compte** : annuaire des référents, provinces, connectés, mon
  compte, mot de passe, déconnexion.
- **Administration** : paramètres (collège, exercice, mise en page, archives),
  invitations.
- **Gestes de retrait** : supprimer un dossier, retirer ou effacer une réunion,
  retirer un référent, une note, un PDF, un titre, une photo. Chaque texte dit
  si le geste se défait et à qui il est réservé.
- **Écrans pas encore livrés** : offres, entreprises, « Relation », messagerie,
  correspondants, tableau de bord, bilan, loges, secteurs, types de document.
  L'aide dit qu'ils ne sont pas en service et montre ce qui existe déjà.

### La limite des questions à Claude

- **La règle** : dix questions par personne et par quart d'heure.
- **Tenue en base** (migration 0082) : elle survit aux déploiements. Avant, le
  compteur vivait en mémoire du serveur et repartait de zéro à chaque
  redémarrage.
- **Ce que la base garde** : qui a demandé et quand, jamais le texte de la
  question. Les lignes de plus d'un jour sont effacées au passage suivant.
- **Accès** : la table est fermée à tous ; seule une fonction y touche, pour la
  personne connectée, et ne rend qu'un oui ou un non.
- **En cas de panne du compteur** : l'aide refuse sans appeler Claude.

C'est la seule modification de la base de toute la série.

### Changements hors de l'aide, faits en chemin

- Retirer une note du suivi passe par une fenêtre de confirmation, et la
  rendre au journal aussi : les deux gestes se font de la même manière.
- Le pied de l'écran Paramètres ne promet plus de changer son adresse ni son
  mot de passe dans « Mon compte ».
- Les deux formulaires publics ont une marge en bas, pour que le bouton
  « Aide » ne chevauche pas le bouton d'envoi.
- Le registre des traitements a un § 5 ter pour la question posée à Claude.

### Ce qui n'a pas été vérifié

Le lint, les tests de l'application (563 à cette date) et le build passaient à
chaque pull request, ainsi que la suite SQL, migrations rejouées comprises.
Chaque déploiement a réussi. En revanche :

- **Aucun parcours n'a été joué avec une vraie session.** Le personnage, la
  marche, la fenêtre d'aide et la fiche du candidat ont été vus dans un
  navigateur, sur des pages d'essai sans base.
- **L'appel réel à Claude n'a jamais été fait**, faute de clé dans
  l'environnement de développement ; seule une réponse simulée a été essayée.
  La chaîne complète — route, compteur en base, Claude — n'a donc jamais tourné
  d'un bout à l'autre.
- **La migration 0082 sur le serveur d'essai** : le déploiement a réussi, mais
  la présence de la table n'a pas été constatée dans la base elle-même.
- **Jamais vus à l'écran** : la présentation du parrain, « Mon compte », les
  deux fenêtres de confirmation du suivi (retirer une note, la rendre), les
  parcours des gestes de retrait.
- **Aucun vrai téléphone ni iPad** : seulement une émulation d'iPhone 13.

Le premier essai utile, sur l'instance d'essai et avec `ANTHROPIC_API_KEY`
définie : en référent, poser à l'aide une question hors catalogue et cliquer
« Demander à Claude ». Une réponse prouve d'un coup la table, le compteur et
l'appel.

### Points ouverts

- **Lots 4 et 5** : leurs écrans ne sont pas dans le dépôt. Le lot 4 était
  attendu fin octobre, le lot 5 le 14 novembre ; la bascule est le 5 décembre.
- **Clé Anthropic** : sans `ANTHROPIC_API_KEY` sur le serveur, le bouton
  « Demander à Claude » n'apparaît pas. Son coût, de l'ordre d'un centime par
  question (estimation, non mesurée), est pris sur le plafond de 10 $ par mois
  partagé avec la lecture du CV.
- **Recherche locale** : elle fonctionne par mots-clés ; une formulation
  inattendue peut ne rien trouver, et la liste entière s'affiche alors.
