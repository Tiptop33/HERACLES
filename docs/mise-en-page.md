# Les documents de la commission et leur mise en page

Le compte rendu, l'affiche et l'affichette sortent **à l'identique** de ceux que
produisait l'application Bubble, et leur présentation se règle dans
**Paramètres › Mise en page** (administration seulement), sans mise en ligne.

## Où est quoi

| | |
| --- | --- |
| Gabarits (ce qui se règle, valeurs d'origine) | `apps/web/src/lib/documents/gabarits.ts` |
| Mise en page de chaque document | `affiche.ts`, `affichette.ts`, `compte-rendu.ts` (fonctions pures) |
| Moteur, polices, emblèmes d'origine | `moteur.ts`, `ressources/` |
| Données lues en base | `donnees.ts` — sous la session, jamais la clé de service |
| Réunions : 2e et 4e mercredi, jours fériés | `calendrier.ts` |
| Écran | `app/espace/parametres/mise-en-page/` |
| Base | migration `0067_mise_en_page_des_documents.sql` |
| Exemplaires archivés : noms, période, colonnes | `archives.ts` (pur), dépôt dans le seau : `archiver.ts` |
| Ouvrir, effacer un exemplaire | `app/api/documents/[id]/`, base : migration `0069_archives_des_documents.sql` |

## Pourquoi pdfmake

Les PDF de Bubble sortaient de pdfmake (c'est écrit dans leurs métadonnées).
Décrire le même document au même moteur redonne le même PDF : coupes de lignes,
colonnes « auto », pagination des tableaux. Les gabarits ont été calés au point
près sur trois PDF de référence (compte rendu du 28 octobre 2026, affiche du
14 octobre, affichette du dossier 856) ; ces PDF portent des données réelles et
ne sont **pas** dans le dépôt.

Polices : Poppins (OFL, `ressources/polices/OFL-Poppins.txt`) et Roboto (celle
que pdfmake livre). Elles entrent dans l'image par `outputFileTracingIncludes`
(`next.config.ts`), pas par `public/`.

## L'aperçu

L'écran ne montre pas l'aperçu dans un cadre : nginx envoie
`X-Frame-Options: DENY` sur toutes les réponses, et un `<iframe>` restait blanc.
Le PDF est lu par `fetch` puis dessiné page par page par pdf.js
(`ApercuPdf.tsx`), ce qui marche aussi sur iPad, où Safari n'affiche que la
première page d'un PDF en cadre. Ne pas assouplir `X-Frame-Options` pour cela.

## Les réglages

- La base ne garde que les **écarts** à l'origine (`mise_en_page.reglages`,
  clé par clé). « Revenir à la présentation d'origine » les efface, images
  déposées comprises.
- Les textes acceptent des **variables** (`{commission}`, `{venerable}`,
  `{numero}`…, la liste est sous chaque onglet), du `**gras**` et de
  l'`*italique*`. Le balisage est lu **avant** de remplir les variables : une
  donnée saisie ne peut pas mettre le document en forme.
- Une ligne dont toutes les variables sont vides ne s'imprime pas.
- Ajouter un réglage : le déclarer dans `gabarits.ts`, le lire dans le gabarit.
  L'écran et la validation suivent d'eux-mêmes.

## Ce qui vient de la base, et pas du dépôt

- **Président** et **secrétaire** : les référents de la loge qui portent les
  titres « Vénérable Maître » et « Secrétaire » au collège.
- **Liste de diffusion** du compte rendu : à saisir dans les réglages de chaque
  installation (vide par défaut).
- **Prochaine réunion** : celle déjà inscrite au registre ; à défaut, le 2e ou
  4e mercredi suivant, reporté s'il tombe un jour férié (au lendemain par
  défaut, réglable).

## L'affichette se choisit en réunion

Sur la feuille d'appel, « Dossier de l'affichette » propose les dossiers en
cours de la loge ; le choix s'enregistre aussitôt (`reunion.affichette_candidat_id`,
migration 0068) et le bouton « Affichette » le tire, à côté de l'affiche et du
compte rendu, sous le nom `<numéro> du <jour où on la tire>.pdf`. Toute la loge
peut choisir, comme pour l'appel. Un dossier refermé depuis ne s'imprime plus.
Le bouton « Affichette » de la fiche du candidat reste disponible.

## Chaque PDF tiré de la feuille d'appel est archivé

Migration 0069. Les trois boutons de la feuille d'appel — Affiche, Compte rendu,
Affichette — ouvrent le PDF **et en rangent un exemplaire** :

| Document | Nom de l'exemplaire et du fichier |
| --- | --- |
| Compte rendu | `Compte-Rendu du 28-10-2026` — la date de la réunion |
| Affiche | `Affiche du 28-10-2026` — la date de la réunion |
| Affichette | `856 du 09-11-2026` — le numéro du dossier, le jour où on la tire |

- **Un exemplaire par nom et par loge** : redemander le même document le
  remplace. On corrige la feuille, on redemande, c'est la dernière version qui
  reste. L'affichette de la fiche du candidat, elle, ne s'archive pas.
- **Où** : une ligne dans `document` (la table des `PDFs` de Bubble, mêmes
  valeurs de `type_document`), liée à la réunion ; le fichier dans le seau
  privé `documents`, sous `archives/<loge>/<uuid>.pdf`. La base n'accepte pas
  d'autre chemin.
- **Si le seau ne répond pas**, le PDF s'ouvre quand même et le journal du
  serveur dit `[archives] … PDF non archivé` : il suffit de le redemander.
- **L'accueil** les montre en trois colonnes — Compte-rendu, Affiche,
  Affichette —, ceux de **l'exercice réglé dans Paramètres › Exercice** (du
  1er septembre au 31 juillet). Ce sont les dates de l'onglet qui font foi,
  même dépassées : au changement d'exercice, c'est là qu'on règle le suivant.
  Tant qu'aucune date n'y est réglée, l'accueil prend la saison en cours. Du
  plus récent au plus ancien. Les PDF repris de Bubble y sont aussi, à leur
  date de création. **Seuls les PDF dont le fichier est dans notre stockage
  se montrent** (migration 0070) : un lien qui ne s'ouvrirait pas n'est pas
  affiché. Un PDF de Bubble apparaît donc à la mise en ligne qui le rapatrie ;
  ceux dont Bubble refuse le fichier (6 au 9 novembre 2026, HTTP 403) restent
  en base, invisibles. Le drapeau `archive` de Bubble (« prêt pour envoi » /
  « archivé ») n'y change rien.
- **Paramètres › Archives** (administration seulement, comme tout Paramètres)
  montre le même tableau à trois colonnes pour **tout ce qui précède**
  l'exercice en cours : un PDF est à l'accueil pendant son exercice, dans les
  archives ensuite, jamais aux deux endroits. Même corbeille, même fenêtre de
  confirmation ; l'effacement ramène à la page d'où l'on vient
  (`ColonnesDesArchives.tsx`, partagé par les deux écrans). Chaque colonne y a
  **son champ de recherche** : le filtre s'applique à chaque lettre, sans
  accents ni majuscules, sur le nom et sur la date en chiffres comme en
  lettres — « octobre » et « 10-2026 » trouvent « Compte-Rendu du 28-10-2026 »
  comme « Compte-rendu du Mercredi 14 Octobre 2026 »
  (`chercherDansLaColonne()`). Le titre de chaque colonne porte le **nombre de
  PDF** — « Compte-rendu (50) », et pendant une recherche « (2 sur 50) ».
  Tout ce qui est au-dessus des premiers liens **reste en place** : chaque
  liste défile dans sa colonne, sur la hauteur qui reste à l'écran (mesurée
  dans le navigateur, remesurée quand on tourne l'iPad). Les colonnes prennent
  la largeur de leur plus long nom, **un lien par ligne**, et l'onglet occupe
  toute la largeur de l'écran ; trop étroit pour les trois (iPad en portrait),
  le tableau défile de côté. Sur téléphone, les colonnes s'empilent et la page
  défile normalement. L'accueil n'a ni recherche, ni nombre, ni en-tête figé.
- **Trois boutons en tête de Paramètres › Archives** : « Archives » (ces
  colonnes de PDF), « Candidat Clôturé (N) » et « Candidat Archivé (N) ». Les
  deux derniers listent tous les dossiers refermés — toutes loges pour
  l'administration —, rangés par la même règle que les pastilles « Clôturés »
  et « Archivés » de l'écran Candidats (un dossier clôturé *et* archivé est
  dans les archivés). Même ligne que l'écran Candidats, une recherche à chaque
  lettre (nom, prénom, n°, métier, ville), et un clic ouvre la fiche dans
  l'écran Candidats. Aucune lecture nouvelle en base : `candidats_de_la_loge()`
  filtrée par `filtrerParVue()` (`app/espace/parametres/archives/[liste]/`).
  Chaque ligne porte aussi, à droite, la **date de création** du dossier et
  celle de sa **clôture** (liste des clôturés) ou de son **archivage** (liste
  des archivés). Bubble ne datait ni l'une ni l'autre : pour les dossiers
  repris, c'est la dernière modification de la fiche dans Bubble, marquée
  « ≈ » (`dates_des_dossiers_refermes()`, migration 0071).

## Clôturer un dossier, puis l'archiver deux mois après

Migration 0071.

- **Clôturer** : bouton « Clôturer le dossier » sur la fiche d'un dossier en
  cours, pour l'administrateur, le Vénérable Maître et le Secrétaire. Une
  fenêtre demande qui l'a refermé — « Lui-même », « Heraclés », « Autre », les
  mots de Bubble — et la date du jour est notée (`candidat.clos_le`).
- **Archiver** : deux mois après la clôture, l'accueil du **Vénérable Maître
  et du Secrétaire** (pas de l'administrateur sans titre) ouvre une fenêtre
  qui liste les dossiers de leur loge à trancher, chacun avec « Archiver »
  (daté, `archive_le`) et « Pas encore » (la question revient dans un mois,
  `archivage_reporte_au`), jusqu'à ce que l'archivage soit confirmé.
  « Fermer » ne tranche rien : la fenêtre revient au passage suivant.
- **Dossiers de Bubble** : leur date de clôture approchée vient de
  `bubble_modifie_le`, recopiée à chaque mise en ligne
  (`reprendre-bubble.sh --dates-candidats`). Sans elle, la date est inconnue et
  le dossier n'entre pas dans la règle des deux mois.
- **Rouvrir** (migration 0072) : sur la fiche d'un dossier clôturé — et pas
  archivé —, le même emplacement porte « Rouvrir le dossier », pour les mêmes
  personnes. Une fenêtre rappelle la clôture qui va être effacée (qui, et
  quand) ; le dossier revient dans les dossiers en cours, sans motif ni date de
  clôture, et la réouverture est datée (`candidat.rouvert_le`). Le refermer se
  fait de nouveau par « Clôturer le dossier ».
- **La reprise ne défait rien** : un déclencheur empêche MAJBUBBLE de rouvrir
  un dossier clôturé ou archivé dans HERACLES, et de refermer — par CLOTURE ou
  ARCHIVER — un dossier qu'HERACLES a rouvert.
- Recopier la date de Bubble ou repousser l'archivage ne changent pas la
  « dernière mise à jour » affichée sur la fiche.
- **Les PDF de Bubble arrivent à chaque mise en ligne**, jusqu'à la bascule :
  `mettre-a-jour.sh` lance `reprendre-bubble.sh --pdf-commission`, qui reprend
  la table des PDF et ne rapatrie que les comptes rendus, affiches et
  affichettes (pas les CV anonymes, laissés à MAJBUBBLE). Non bloquant, borné à
  cinq minutes, rejouable ; le journal du déploiement finit par un bilan
  chiffré par sorte. À la main : `sudo …/infra/essai/reprendre-bubble.sh
  --pdf-commission`.
- **Effacer** : la corbeille rouge, sur la ligne du PDF, pour l'administrateur,
  le Vénérable Maître et le Secrétaire (`puis_je_effacer_des_documents()`),
  après une fenêtre de confirmation. Un PDF d'HERACLES quitte la base et le
  seau. Un PDF de Bubble reste en base, marqué `efface_le`, sans fichier : la
  reprise finale ne le fera pas revenir, et `rapatrier-fichiers.mjs` le saute.

## Le lien du CV anonyme

`/cv-anonyme/<jeton>` — la colonne « CV » de l'affiche et le QR code de
l'affichette. Seule adresse lisible **sans compte** : le CV anonyme seulement,
d'un dossier en cours, pour qui a le jeton (`candidat.cv_anonyme_jeton`). Voir le
registre RGPD, § 5 bis.

Il sert, dans cet ordre : le CV **produit par HERACLES**, s'il a été validé par
un référent de la loge — sa **copie figée** à la validation, ou à défaut le PDF
produit à la volée ; à défaut, le **fichier** repris de Bubble ou déposé à la
main.

## Le CV anonyme produit par HERACLES

Migration 0073. Bubble produisait le CV anonyme à l'envoi de la fiche ;
HERACLES le produit de la fiche, et en **range une copie à chaque validation**
(0075) : c'est elle qui circule.

| | |
| --- | --- |
| Mise en page (modèle B, « La colonne ») | `apps/web/src/lib/documents/cv-anonyme.ts` |
| Le choix, et les cinq autres modèles | `docs/maquettes/cv-anonyme-propositions.html`, décisions dans `…-notes.md` |
| Réglages | Paramètres › Mise en page › CV anonyme : écriture du numéro, couleurs, adresse de contact, phrases du pied |
| Aperçu et validation (référent) | `app/api/candidats/[id]/cv-anonyme/` — GET : le PDF ; POST : valider ou retirer |
| Copie figée | `lib/documents/copie-figee.ts` — `figer_cv_anonyme()`, `copie_figee_du_cv_anonyme()` (0075) |
| Lien public | `app/cv-anonyme/[jeton]/` — `cv_anonyme_valide_public()`, puis `cv_anonyme_public()` |

- **Ce qu'il imprime** : le numéro du dossier en haut à gauche, sur l'aplat ;
  ce qui est recherché, le secteur, le métier ; le début souhaité, la mobilité,
  le permis B (seulement s'il est là), le savoir-être et l'informatique dans la
  colonne ; les expériences, les formations et les compétences à droite. Une
  rubrique vide ne s'imprime pas. Un parcours trop long passe sur une seconde
  page.
- **Ce qu'il n'imprime jamais** : nom, prénom, photo, âge, adresse, ville,
  téléphone, courriel, situation familiale, loge, référent, parrain. Ces
  colonnes ne sont ni lues par `cv_anonyme_valide_public()`, ni connues du
  gabarit.
- **La validation** : sur la fiche, onglet *Documents*, un bandeau sous les
  cartes dit « À valider » ou « Validé le … par … ». Tout le monde peut
  « Voir le CV anonyme » ; **tout référent de la loge du candidat** — pas
  seulement le référent du dossier (0074) — voit « Valider » et « Retirer la
  validation », et la base le revérifie. Le CV n'a pas à être « fait » : il est
  produit depuis la fiche dès que le candidat a envoyé son formulaire et son
  CV, il ne reste qu'à le relire. Modifier un champ
  imprimé — à l'écran ou par la reprise de Bubble — efface la validation :
  le CV est à relire. Valider ne change pas la « dernière mise à jour » de la
  fiche.
- **Automatique dès qu'il y a un CV original** (décision du 10 novembre
  2026) : la carte « CV anonyme » de l'onglet *Documents* s'ouvre alors sur le
  CV produit depuis la fiche, marquée « à valider » — plus de « non fourni ».
  Vaut pour les dossiers déjà en base comme pour les nouveaux, CV original
  déposé ou encore chez Bubble. L'ordre de la carte suit celui du lien public :
  validé, le CV produit (copie figée) ; sinon le fichier déposé ou repris de
  Bubble ; sinon, s'il y a un CV original, le CV produit à valider ; sinon
  « non fourni ». Avant la validation, rien n'est rangé : la fiche peut encore
  bouger, le PDF se produit à l'ouverture, toujours à jour. Il ne circule
  qu'une fois validé (`lib/documents/carte-cv-anonyme.ts`).
- **La copie figée** (0075) : au clic sur « Valider », le PDF tel qu'il est à
  cet instant est rangé dans le seau privé `documents`
  (`candidats/<id>/cv-anonyme-valide-<instant>.pdf`). Le lien public — affiche,
  QR code de l'affichette — et « Voir le CV anonyme » servent cette copie : ce
  qui circule est exactement ce qui a été relu, même si la mise en page change
  ensuite. Elle ne sert que **sa** validation : fiche modifiée ou validation
  retirée, elle se tait ; la validation suivante en range une nouvelle, qui
  remplace l'ancienne dans le seau. Le chemin est calculé par la base, jamais
  reçu de la requête. Si la copie n'a pas pu être rangée (seau indisponible),
  la validation tient quand même et le PDF se produit à la volée, comme avant
  0075 — de même pour un CV validé avant 0075, jusqu'à sa prochaine validation.
  Supprimer le dossier efface la copie.
- **Le contact** (migration 0076) : par défaut, l'adresse électronique du
  **Secrétaire de la loge du candidat** — le référent qui porte le titre
  « Secrétaire » au collège, celui que l'affichette nomme —, lue à chaque CV :
  quand le titre change de mains, les CV suivent. Une adresse saisie dans
  Paramètres › Mise en page › CV anonyme la remplace sur tous les CV. Sans
  l'une ni l'autre, la phrase « Pour rencontrer ce candidat… » ne s'imprime
  pas. La copie figée d'une validation (0075) garde l'adresse du moment :
  pour la mettre à jour, retirer la validation puis valider de nouveau.
- **Les champs libres** sont lus dans la forme de la lecture du CV
  (« 2019-2025 — Poste, employeur : missions ») ; une ligne tapée autrement
  reste entière. Une liste tapée sur une ligne se coupe aux virgules.
