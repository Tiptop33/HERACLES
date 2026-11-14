# Maquette « loges du réseau » — ce qui est retenu

Maquette : `loges-du-reseau.html`, validée le 13 novembre 2026, écran par écran.
Un seul fichier, à ouvrir dans un navigateur : feuille de style de l'application
recopiée, nomenclature NAF embarquée. Les loges, les noms et les adresses qui la
peuplent sont inventés.

Ce qui est nouveau y est encadré en pointillé ; le reste de l'écran est grisé.

Les **loges du réseau** sont les 73 loges extérieures à l'application ; elles ne
sont pas les « loges » de HERACLES (voir le vocabulaire du CLAUDE.md et
`docs/secteurs-d-activite.md`, décisions 17 à 27).

## Ajouté après validation : l'écusson (décisions 31 à 34)

- Un écusson propre à chaque loge du réseau, déposé par l'administration — dans
  le formulaire d'ajout (« Écusson (facultatif) ») et dans la loge ouverte
  (« Déposer un écusson » / « Remplacer l'écusson »).
- Il s'affiche en tête de la page du Secrétaire, à gauche du titre, et en tête
  de la ligne de la loge dans Paramètres.
- Sans écusson : l'initiale de la loge dans un rond, comme une province sans
  image (« Loge » et l'article sont sautés : « Les Bâtisseurs » donne B).
- Ajouté le 14 novembre 2026, à la demande : l'écusson se glisse-dépose aussi,
  en plus de « Parcourir », sur « Écusson (facultatif) » du formulaire d'ajout
  (il part avec la loge) et sur la zone de l'écusson de la loge ouverte (il la
  remplace aussitôt). Pendant le glisser, la zone s'encadre en pointillés. Un
  fichier qui n'est pas une image JPEG, PNG, WebP, GIF ou AVIF de 5 Mo au plus
  est refusé, avec le message habituel. Le même geste existe sur l'écran
  Province, où l'image de chaque carte reçoit aussi le dépôt.

## Modifié après validation : le courriel à droite (13 novembre 2026)

- Dans Paramètres, « Le courriel envoyé aux Secrétaires » ne vient plus sous
  la liste des loges mais à sa droite, en face du titre de la rubrique.
- La colonne de gauche — titre, compteurs, filtres, ajout, liste — garde sa
  largeur de 42 rem ; le courriel prend de 21 à 36 rem et s'arrête à la même
  ligne que la liste, quitte à défiler dans son cadre.
- Il faut 1 536 px d'écran pour les deux colonnes. En dessous (un iPad, même
  12,9 pouces en paysage), le courriel reste sous la liste : lui faire place
  aurait serré la liste au point de casser les noms des loges mot à mot.
- Sur deux colonnes, le renvoi « Mon compte — votre nom, votre téléphone,
  votre photo… » passe sous l'aperçu du courriel, en bas de la colonne de
  droite ; sur une seule, il reste au pied de la page.
- Un Secrétaire sans nom est salué « Bonjour mon frère, » — et non plus
  « Bonjour Madame, Monsieur, » —, dans l'aperçu comme dans le courriel envoyé.

## 1. La page du Secrétaire — validée telle quelle

- Ouverte par le lien personnel reçu par courriel, **sans compte ni connexion**.
- En tête : « Les secteurs d'activité de votre loge », puis le nom, le numéro et
  la province de la loge, et un mot d'explication adressé au Secrétaire par son
  nom (sans nom ni nombre ; chaque case s'enregistre aussitôt ; rien à envoyer).
- Le choix des secteurs est celui de l'écran 3 validé le 12 novembre
  (`secteurs-d-activite.html`) : recherche par mot ou code, arborescence
  dépliable, au moins la division puis aussi précis qu'on veut, ✕ pour décocher,
  date de la liste, « Enregistré ».
- En bas : « Ce lien est personnel… jusqu'au <date> » — 90 jours après l'envoi.

## 1 bis. Le lien expiré — validé tel quel

- « Ce lien n'est plus valable » : il a dépassé ses 90 jours, ou un lien plus
  récent l'a remplacé. Demander un nouveau lien à l'équipe HERACLES ; les
  secteurs déjà cochés sont conservés.

## 2. Paramètres › Loges du réseau — validée telle quelle

- Nouvelle rubrique de Paramètres, réservée à l'administration, entre « Loges »
  et « Secteurs d'activité ».
- Compteurs : loges saisies, ont répondu, lien envoyé sans réponse, lien expiré,
  sans lien.
- Bouton d'envoi groupé : « Envoyer le lien aux N loges qui ne l'ont pas reçu »
  (seulement celles qui ont une adresse).
- Filtres : Toutes, Pas de lien, À relancer, Lien expiré, Ont répondu ; champ de
  recherche (loge, numéro, Secrétaire).
- Ajout d'une loge : nom, numéro, province, nom du Secrétaire, adresse —
  « Ajouter ». Le lien ne part pas tout seul.
- Une ligne par loge : numéro, nom, province, Secrétaire et adresse ; état
  (pas encore de lien / lien envoyé le …, sans réponse / lien expiré, sans
  réponse / a répondu · N secteurs) ; « Envoyer le lien » ou « Renvoyer le
  lien » (« adresse manquante » sans adresse) ; ▾ pour ouvrir.
- Ouverte : les cinq champs, corrigés aussitôt ; l'historique du lien (envoyé
  le, valable jusqu'au) et la dernière modification de la liste ; les secteurs
  cochés ; « Changer l'adresse n'envoie rien : renvoyez le lien au nouveau
  Secrétaire. L'ancien lien cesse alors de valoir. » ; « Retirer cette loge du
  réseau ».
- En bas, « Le courriel envoyé aux Secrétaires » : objet et texte, enregistrés
  aussitôt ; variables `{secretaire}`, `{loge}`, `{lien}`, `{expiration}` ;
  aperçu pour la première loge. Première version proposée :

  > **Objet** : HERACLES — les secteurs d'activité de votre loge
  >
  > Bonjour {secretaire},
  >
  > HERACLES accompagne des candidats en recherche d'emploi, d'alternance ou de
  > stage. Pour orienter chacun vers les loges qui peuvent l'aider, nous
  > demandons à chaque loge du réseau d'indiquer les secteurs d'activité où
  > travaillent ses membres — sans nom ni nombre.
  >
  > Pour la loge {loge}, il suffit de cocher ces secteurs sur cette page :
  > {lien}
  >
  > Ce lien vous est personnel. Vous pouvez y revenir pour compléter ou corriger
  > la liste jusqu'au {expiration}.
  >
  > Merci de votre aide,
  > L'équipe HERACLES
