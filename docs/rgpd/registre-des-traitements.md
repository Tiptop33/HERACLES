# Registre des traitements — HERACLES

Le registre que l'article 30 du RGPD demande de tenir : ce que l'application
fait des données personnelles, pour qui, chez qui, et combien de temps. Il
suit la trame du modèle de la CNIL.

**Il vit à côté du code**, et il évolue avec lui : toute PR qui ajoute une
donnée, un écran qui en montre, ou un prestataire qui en voit passer, met ce
fichier à jour dans la même PR.

Il ne contient aucune donnée personnelle : seulement la description des
traitements.

> **À compléter avant la bascule du 5 décembre 2026** — tout ce qui est marqué
> ⚠️ ci-dessous. Faire relire l'ensemble par la personne chargée du RGPD dans
> l'association, et par un juriste pour les points ⚖️.

---

## Le responsable de traitement

| | |
| --- | --- |
| Organisme | ⚠️ *nom de l'association, forme juridique, n° RNA ou SIREN* |
| Adresse | ⚠️ |
| Représentant légal | ⚠️ *nom, qualité (président…)* |
| Délégué à la protection des données | ⚠️ *aucun désigné, ou nom et contact* |
| Contact pour exercer ses droits | ⚠️ *adresse électronique à afficher aux candidats* |
| Dernière mise à jour du registre | 12 novembre 2026 |

---

## 1. Le suivi des candidats

| | |
| --- | --- |
| **Finalité** | Accompagner une personne dans sa recherche d'emploi, d'alternance ou de stage : tenir sa fiche, la suivre dans la durée, lui proposer des offres. |
| **Base légale** | Consentement : le candidat coche la case de consentement en envoyant sa fiche (`/candidature/<jeton>`). ⚖️ *Pour les 107 fiches reprises de Bubble, la base légale de l'époque est à retrouver.* |
| **Personnes concernées** | Les candidats. |
| **Données** | Identité (nom, prénom, âge, situation familiale, photo) ; coordonnées (adresse électronique, téléphone, adresse postale) ; recherche (type, métier visé, mobilité, dates de stage, jusqu'à trois secteurs d'activité classés dans la nomenclature NAF — proposés par le candidat, confirmés par un référent, migration 0088) ; permis et véhicule ; parcours (formation, expériences, compétences, informatique, savoir-être, centres d'intérêt) ; CV et lettre de motivation ; suivi écrit par les référents. |
| **Données sensibles** | Aucune n'est demandée. Mais les champs libres — parcours, suivi, motif d'urgence — peuvent en recevoir (santé, situation financière). ⚖️ *Une consigne aux référents est à prévoir : n'y écrire que ce qui sert l'accompagnement.* |
| **Destinataires** | Les référents de la loge du candidat : un référent ne voit que les dossiers de sa loge, et la base l'impose (RLS). Les administrateurs — qui retrouvent aussi les dossiers refermés, toutes loges, dans Paramètres › Archives (« Candidat Clôturé », « Candidat Archivé ») : photo, nom, prénom, métier, ville, numéro de fiche, rien de plus que la liste de l'écran Candidats. Avec, depuis la migration 0071, la date de création, et celle de la clôture ou de l'archivage. ⚠️ *Ces dossiers refermés restent en base sans limite : c'est la durée de conservation ci-dessous qui doit y mettre fin.* |
| **Sous-traitants** | Hostinger (hébergement), Brevo (courriels), Anthropic (lecture du CV, si le candidat la demande). Voir § 8. |
| **Transferts hors UE** | Seulement si le candidat demande la lecture de son CV (§ 5). |
| **Clôture et archivage** | Depuis la migration 0071, un dossier se clôture dans HERACLES (administrateur, Vénérable Maître, Secrétaire) : qui l'a refermé — « Lui-même », « Heraclés », « Autre » — et la date. Deux mois plus tard, le Vénérable Maître ou le Secrétaire de la loge confirme l'archivage, ou le repousse d'un mois. Pour les dossiers repris de Bubble, la date approchée est la dernière modification de la fiche dans Bubble (`bubble_modifie_le`, recopiée à chaque mise en ligne jusqu'à la bascule). L'archivage date le dossier, il ne l'efface pas. Depuis la migration 0072, les mêmes personnes peuvent rouvrir un dossier clôturé et pas archivé : le motif et la date de clôture sont effacés, la date de réouverture est notée (`rouvert_le`). |
| **Durée de conservation** | ⚠️ *À fixer* — point ouvert n° 4 du cadrage : combien de temps garde-t-on le dossier d'un candidat inactif ? Proposition à trancher : 2 ans après le dernier contact, puis suppression, documents compris. La date d'archivage (0071) donne désormais un point de départ. |
| **Sécurité** | Voir § 9. |

## 2. La présentation d'un candidat par un parrain

| | |
| --- | --- |
| **Finalité** | Permettre à un parrain de présenter un candidat à la commission, par un lien personnel (`/parrainage/<jeton>`). |
| **Base légale** | ⚖️ *Intérêt légitime de l'association à recevoir les présentations, ou consentement du parrain qui remplit le formulaire : à trancher.* |
| **Personnes concernées** | Les parrains ; les candidats qu'ils présentent. |
| **Données** | Du parrain : nom, prénom, téléphone, loge, adresse électronique d'invitation. Du candidat : nom, prénom, adresse électronique, type de recherche, lien avec le parrain. Pour la commission : le candidat connaît-il l'appartenance du parrain, un membre peut-il se dévoiler, degré et motif d'urgence. |
| **Données sensibles** | ⚖️ *L'appartenance d'une personne à une loge peut révéler des convictions philosophiques (article 9 du RGPD). Elle se lit dans le rattachement d'un parrain ou d'un référent à une loge, et dans les réponses « connaît votre appartenance » et « peut se dévoiler ». L'exception de l'article 9.2.d (traitement par une association à but philosophique, pour ses membres, sans communication à des tiers) est à confirmer.* |
| **Destinataires** | Les référents de la loge qui a invité le parrain. |
| **Sous-traitants** | Hostinger, Brevo. |
| **Transferts hors UE** | Aucun. |
| **Durée de conservation** | Lien du parrain : valable 30 jours. Données de la présentation : ⚠️ *celle du dossier du candidat (§ 1).* |
| **Sécurité** | Le lien est le seul droit : seule son empreinte est conservée en base, il expire et ne sert qu'une fois. |

## 3. Les comptes des référents et la vie de la loge

| | |
| --- | --- |
| **Finalité** | Donner accès à l'application aux référents et aux administrateurs ; tenir l'annuaire, les réunions et les présences de la loge. |
| **Base légale** | ⚖️ *Intérêt légitime de l'association, ou exécution de l'adhésion : à trancher.* |
| **Personnes concernées** | Les référents, les parrains qui ont un compte, les administrateurs. |
| **Données** | Identité, adresse électronique, téléphone, photo, loge, fonction (Vénérable Maître, Secrétaire…), présences aux réunions, empreintes des derniers mots de passe (pour en interdire la réutilisation). |
| **Décompte des secteurs de la loge** | Combien de membres de la loge travaillent dans chaque secteur d'activité (division NAF, migration 0089), tenu par le Secrétaire. **Sans aucun nom** : ce n'est pas, en soi, une donnée personnelle. ⚖️ *Un décompte de 1 dans une petite loge peut toutefois désigner quelqu'un pour qui connaît la loge. Il ne sera montré qu'aux référents et administrateurs, jamais aux candidats ; ses droits d'accès arriveront avec l'écran.* |
| **Données sensibles** | ⚖️ *Même remarque qu'au § 2 : l'appartenance à une loge.* |
| **Destinataires** | Les membres de la loge, selon leur fonction ; les administrateurs. |
| **Sous-traitants** | Hostinger, Brevo (courriels de connexion et de réinitialisation). |
| **Transferts hors UE** | Aucun. |
| **Durée de conservation** | ⚠️ *À fixer : jusqu'au départ de la loge, puis… ?* |
| **Sécurité** | Entrée sur invitation seulement ; mots de passe hachés ; messages d'erreur qui ne révèlent pas qu'une adresse est inscrite. |

## 4. Les courriels de l'application

| | |
| --- | --- |
| **Finalité** | Envoyer le lien au parrain, le lien au candidat, et les courriels de connexion. |
| **Base légale** | Celle du traitement que le courriel sert (§ 1 à 3). |
| **Données** | Adresse électronique et prénom du destinataire, nom de la loge, texte du courriel, lien personnel. |
| **Sous-traitant** | Brevo, société française — hébergement dans l'Union européenne. Voir `docs/brevo.md`. |
| **Transferts hors UE** | Aucun. |
| **Durée de conservation** | ⚠️ *Celle des journaux d'envoi chez Brevo : à relever dans le compte Brevo.* |

## 5. La lecture du CV pour pré-remplir la fiche

| | |
| --- | --- |
| **Finalité** | Éviter au candidat de recopier son CV dans le formulaire. |
| **Base légale** | Consentement : la lecture ne part que si le candidat clique sur « Remplir le formulaire à partir de mon CV », après en avoir été informé sous le bouton. La case de consentement le rappelle. |
| **Personnes concernées** | Les candidats qui demandent la lecture. |
| **Données** | Le contenu du CV : identité, coordonnées, âge, formation, expériences, compétences. Et sa photo, quand il en a une : le serveur de HERACLES sort du fichier les images qui pourraient l'être, et Claude désigne celle qui est un portrait. Ces images font partie du CV déjà transmis. |
| **Destinataires** | Le candidat lui-même : ce qui est lu remplit son formulaire, qu'il relit avant d'envoyer. La photo lui est montrée : il la garde ou la refuse. Gardée, elle rejoint son dossier (§ 1), et ses référents la voient. |
| **Sous-traitant** | Anthropic. Cocontractant : Anthropic Ireland, Limited (client dans l'EEE). Accord de traitement des données (DPA) du 24 février 2025, intégré aux conditions commerciales : <https://www.anthropic.com/legal/data-processing-addendum>. Espace de travail « HERACLES » dédié, clé dédiée, limite de 10 $ par mois. |
| **Transferts hors UE** | États-Unis. Le traitement est restreint aux États-Unis dans la console d'Anthropic (zone d'inférence « US », réglée le 9 novembre 2026). Garantie : clauses contractuelles types de la Commission européenne (DPA, module 2, responsable vers sous-traitant). |
| **Durée de conservation** | Chez HERACLES : rien n'est conservé de la lecture, sauf la photo que le candidat a gardée, qui suit la durée de son dossier (§ 1). Chez Anthropic : suppression automatique sous 30 jours ; jamais utilisé pour entraîner les modèles (conditions commerciales, § B). La conservation zéro se demande à leur équipe commerciale. |
| **Sécurité** | Cinq lectures par lien et par quart d'heure ; le journal du serveur ne note jamais un contenu. Voir `docs/lecture-du-cv.md`. |

## 5 ter. L'aide intégrée : la question posée à Claude

| | |
| --- | --- |
| **Finalité** | Aider un référent ou un administrateur à trouver une fonction de l'application, quand la recherche locale de l'aide n'a rien trouvé. |
| **Base légale** | Intérêt légitime : faciliter l'usage de l'outil. Rien ne part sans un clic sur « Demander à Claude », et l'avertissement est écrit sous le bouton. |
| **Personnes concernées** | Les référents et les administrateurs qui posent la question. Par ricochet, toute personne dont ils taperaient le nom dans la question — ce que l'avertissement demande de ne pas faire. |
| **Données** | Le texte de la question (300 caractères au plus) et le catalogue de l'aide (des libellés d'écran). **Aucune donnée de la base** : ni fiche, ni nom, ni identifiant de la personne qui demande. |
| **Destinataires** | La personne elle-même : Claude rend des identifiants de parcours d'aide, que le serveur recoupe avec le catalogue de son rôle. |
| **Sous-traitant** | Anthropic, aux conditions du § 5 : même espace de travail, même clé, même limite de 10 $ par mois. |
| **Transferts hors UE** | États-Unis, comme au § 5 (zone d'inférence « US », clauses contractuelles types). |
| **Durée de conservation** | Chez HERACLES : la question n'est ni enregistrée ni notée au journal. Pour tenir la limite, la base garde **qui a demandé et quand** (table `aide_question`, migration 0082) — jamais le texte ; ces lignes sont effacées au-delà d'un jour, au passage suivant. Chez Anthropic : suppression automatique sous 30 jours ; jamais utilisé pour entraîner les modèles. |
| **Sécurité** | Session exigée ; dix questions par personne et par quart d'heure, comptées en base dans une table fermée à tous (RLS sans policy) ; le journal ne note que la nature d'un échec. Tant que la recherche locale trouve, la question ne quitte pas le navigateur. Voir `docs/aide.md`. |

## 5 bis. Les documents de la commission : compte rendu, affiche, affichette, CV anonyme

| | |
| --- | --- |
| **Finalité** | Rendre compte de chaque réunion (compte rendu) et faire connaître les dossiers en cours au-delà de la loge (affiche, affichette), comme le faisait l'application Bubble. |
| **Base légale** | Celle du suivi des candidats (§ 1) et de la vie de la loge (§ 3). ⚖️ *La diffusion de l'affiche et de l'affichette hors de la loge, avec le lien du CV anonyme, est à couvrir par la case de consentement du candidat : à vérifier dans son libellé.* |
| **Personnes concernées** | Les candidats ; les référents présents ou absents ; le Vénérable Maître et le Secrétaire de la loge, qui signent ; les personnes de la liste de diffusion. |
| **Données** | **Compte rendu** — référents : nom, prénom, adresse électronique, téléphone, présence du jour, taux de présence ; candidats en cours : numéro, date d'entrée, définition et intitulé de l'emploi recherché, nom, prénom, référent, dernier commentaire du suivi. **Affiche** — par dossier : numéro, date d'entrée, intitulé de l'emploi recherché, lien du CV anonyme ; **aucun nom de candidat**. **Affichette** — un dossier : numéro, type et intitulé de l'emploi recherché, rayon d'action, QR code du CV anonyme ; **aucun nom de candidat**. Les deux portent les nom, téléphone et adresse du Vénérable Maître et du Secrétaire. **CV anonyme produit par HERACLES** (migration 0073) — un dossier : numéro, type et intitulé de l'emploi recherché, secteur, métier, date de début souhaitée, mobilité, permis B et véhicule, expériences, formations, compétences, savoir-être, informatique, date de validation, et une adresse de contact : celle réglée dans Paramètres › Mise en page, ou à défaut **l'adresse électronique du Secrétaire de la loge** (migration 0076) — une donnée du référent qui porte ce titre, publique comme sur l'affichette, que le lien sans compte rend aussi quand il doit refaire le PDF, et que Paramètres › Mise en page montre à l'administration dans le champ du contact (`email_du_secretaire_de_ma_loge()`, 0077, la loge de la personne connectée seulement) ; **ni nom, ni prénom, ni photo, ni âge, ni adresse, ni ville, ni téléphone, ni courriel, ni situation familiale, ni loge, ni référent, ni parrain**. Les champs sont recopiés un à un (`donneesDuCvAnonyme()`), jamais la fiche entière. |
| **Destinataires** | Compte rendu : les membres de la loge. Affiche et affichette : faites pour circuler — les loges de la province et leurs membres. Les exemplaires archivés (ci-dessous) : les référents de la loge, depuis leur accueil, pour l'exercice en cours ; l'administration, toutes loges, et pour les exercices précédents dans Paramètres › Archives. |
| **Le lien du CV anonyme** | `/cv-anonyme/<jeton>` s'ouvre **sans compte** (migration 0067) : c'est la seule porte de l'application ouverte à `anon`. Elle ne donne que le CV anonyme, jamais le CV nominatif ni la fiche ; seulement tant que le dossier est en cours ; à qui détient le jeton (122 bits tirés au hasard, propres au candidat). Réponse ni mise en cache, ni indexée (`X-Robots-Tag: noindex`), sans `Referer`. ⚠️ *Un lien qui a circulé ne se reprend pas : pour couper l'accès avant la fin du dossier, il faut aujourd'hui changer le jeton en base. Un geste d'administration est à prévoir.* ⚖️ *Le CV « anonyme » doit l'être réellement.* Pour le fichier déposé (Bubble, ou à la main), c'est la commission qui le prépare, et c'est sa responsabilité de n'y laisser ni nom ni coordonnée. Pour le CV **produit par HERACLES** (0073), le choix des champs écarte l'identité ; les champs libres pourraient encore porter un nom d'employeur, voire le nom de la personne : le lien ne le sert donc qu'une fois **validé** : par un référent de la loge du candidat après relecture — le référent du dossier ou tout autre (0074), `valider_cv_anonyme()`, contrôlée en base —, ou **par HERACLES** (0078, décision du 10 novembre 2026) quand le candidat a un CV original et qu'aucun champ imprimé ne contient son nom, son prénom, son adresse ou son téléphone, ni aucune adresse électronique, aucun numéro de téléphone, aucun lien web (`cv_anonyme_suspect()`). ⚠️ *Cette vérification cherche des mots, elle ne lit pas : un nom d'employeur, un surnom, un nom mal orthographié ou celui d'un tiers passent. Pour ces CV, plus personne ne relit avant la diffusion ; un référent peut retirer la validation à tout moment, et elle ne revient pas d'elle-même avant la prochaine modification du CV.* Un dossier qui a déjà un CV anonyme déposé par la commission n'est pas validé d'office. Toute modification d'un champ imprimé efface la validation ; jusqu'à la relecture, le lien sert le fichier déposé s'il y en a un, sinon rien. Depuis la migration 0075, le PDF validé est **conservé** : une copie par validation, voir la ligne « Conservation des exemplaires ». |
| **Sous-traitants** | Hostinger. Aucun autre : les documents se produisent sur le serveur, sans service extérieur. |
| **Transferts hors UE** | Aucun. |
| **Conservation des exemplaires** | Depuis la migration 0069, chaque compte rendu, affiche ou affichette produit depuis la feuille d'appel est **archivé** : un PDF dans le seau privé `documents` (`archives/<loge>/…`), une ligne dans `document`, liée à la réunion. Redemander le même document remplace l'exemplaire du même nom. Les 139 PDF repris de Bubble (table `PDFs`) sont dans la même table. Les comptes rendus, affiches et affichettes de Bubble sont rapatriés dans ce même seau à chaque mise en ligne, jusqu'à la bascule. L'accueil montre ceux de l'exercice réglé dans Paramètres › Exercice, et l'écran « Documents » (`/espace/documents`, l'onglet du téléphone) montre exactement les mêmes, lus par la même fonction de la base, donc avec les mêmes droits ; l'administrateur, le Vénérable Maître et le Secrétaire peuvent les effacer, fichier compris. Supprimer le dossier d'un candidat efface ses affichettes. **CV anonyme validé** (migration 0075) : à chaque validation, le PDF relu est rangé dans le même seau (`candidats/<id>/cv-anonyme-valide-<instant>.pdf`) ; une seule copie par candidat — la validation suivante remplace la précédente —, mêmes champs que le CV servi, **sans nom ni coordonnée** ; elle reste après une validation retirée ou effacée, comme trace de ce qui a été relu, et part avec le dossier quand on le supprime. ⚠️ *Le compte rendu archivé garde le nom, le prénom et le dernier commentaire des candidats de la séance, et les coordonnées des référents, même après la suppression d'un dossier : c'est le registre de la commission. Sa durée de conservation est à fixer avec celle des dossiers (§ 1, point ouvert n° 4 du cadrage) — rien ne l'efface aujourd'hui de lui-même.* |
| **Durée de conservation** | Le lien du CV anonyme s'éteint à la clôture ou à l'archivage du dossier — y compris le QR code d'une affichette archivée. La copie figée du CV anonyme reste dans le seau, non servie, jusqu'à la suppression du dossier : ⚠️ *à fixer avec la durée de conservation des dossiers*. Les exemplaires archivés : ⚠️ *à fixer*, voir la ligne précédente. |
| **Sécurité** | Production sous la session de qui demande, sous la RLS ; réglages de mise en page écrits par l'administration seule ; aucune ressource chargée depuis le réseau à la production d'un PDF. Exemplaires archivés : déposés par le serveur après vérification de la réunion, lus par une route qui vérifie la session puis la policy de `document`, jamais par une adresse signée ; un exemplaire effacé ne se lit plus. |

## 6. Les sauvegardes

| | |
| --- | --- |
| **Finalité** | Pouvoir restaurer la base et les documents après une panne ou une erreur. |
| **Base légale** | Intérêt légitime : la sécurité des données (article 32 du RGPD). |
| **Données** | Toute la base et tous les fichiers déposés (CV, lettres, photos). |
| **Où** | Sur le serveur (`/var/backups/heracles`, lisible par `root` seul), et une copie tirée chaque jour sur le poste de l'administrateur. ⚠️ *Vérifier que ce dossier est chiffré sur le poste (FileVault).* |
| **Durée de conservation** | 14 archives sur le serveur, 30 sur le poste. Voir `docs/sauvegarde.md`. |

## 7. La reprise des données de l'application Bubble

| | |
| --- | --- |
| **Finalité** | Reprendre dans HERACLES les dossiers tenus dans l'application Bubble (`heracles-42268`), qui ferme le 5 décembre 2026. |
| **Données** | 107 candidats, 71 comptes, leurs documents. |
| **Sous-traitant** | Bubble Group, Inc. ⚠️ *Hébergement à vérifier (probablement aux États-Unis) — jusqu'à la fermeture de l'application.* |
| **Durée** | Fin du traitement à la fermeture de Bubble. ⚠️ *Après la bascule : supprimer l'application Bubble et ses données, et la table `bubble_brut` une fois la reprise vérifiée — à décider.* |
| **Remarque** | Le 4 août 2026, l'API de Bubble exposait les fiches à tout Internet (cadrage, § 9). Le correctif a été transmis. ⚖️ *Une violation de données a-t-elle à être notifiée à la CNIL ? À examiner.* |

---

## 8. Les prestataires

| Prestataire | Ce qu'il voit | Où | Contrat |
| --- | --- | --- | --- |
| Hostinger | tout : le serveur porte la base et les fichiers | ⚠️ *centre de données à relever dans hPanel* | ⚠️ *DPA d'Hostinger à archiver* |
| Brevo | adresses électroniques, texte des courriels | Union européenne | ⚠️ *DPA de Brevo à archiver* |
| Anthropic | le CV, si le candidat demande la lecture ; la question posée à l'aide, si le référent clique sur « Demander à Claude » | États-Unis | DPA du 24 février 2025, clauses contractuelles types |
| Bubble | l'ancienne application, jusqu'au 5 décembre 2026 | ⚠️ *à vérifier* | ⚠️ *à archiver* |

Ne voient **aucune** donnée personnelle : GitHub (le code seul, et le dépôt n'en
contient aucune), France Travail (les offres viennent de chez eux, rien n'y
part).

## 9. Les mesures de sécurité, pour tous les traitements

- **Fermé par défaut** : chaque table porte la sécurité au niveau des lignes
  (RLS) ; une règle d'accès ne s'ajoute qu'avec l'écran qui la justifie.
- **Liens personnels** pour les parrains et les candidats : seule leur empreinte
  est conservée, ils expirent au bout de 30 jours.
- **Lien du CV anonyme** (§ 5 bis) : la seule adresse lisible sans compte ; elle
  ne sert que le CV anonyme d'un dossier en cours — celui qu'HERACLES produit,
  une fois validé par un référent de la loge (0073, 0074) ou par HERACLES
  quand rien n'y est suspect (0078), dans sa copie figée à la validation
  (0075), ou à défaut le fichier déposé. La copie est lue au
  chemin que la base rend, jamais à un chemin venu de la requête.
- **Chiffrement en transit** (HTTPS) ; base jamais exposée sur Internet.
- **Aucun secret ni aucune donnée réelle dans le dépôt de code.**
- **Sauvegardes** quotidiennes, sorties du serveur (§ 6).

## 10. Les droits des personnes

⚠️ *À écrire : comment un candidat, un parrain ou un référent demande l'accès à
ses données, leur rectification ou leur suppression — à quelle adresse, sous
quel délai (un mois), et qui le fait dans l'application. La case de
consentement promet déjà que le candidat « peut demander leur suppression ».*
