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
| Dernière mise à jour du registre | 9 novembre 2026 |

---

## 1. Le suivi des candidats

| | |
| --- | --- |
| **Finalité** | Accompagner une personne dans sa recherche d'emploi, d'alternance ou de stage : tenir sa fiche, la suivre dans la durée, lui proposer des offres. |
| **Base légale** | Consentement : le candidat coche la case de consentement en envoyant sa fiche (`/candidature/<jeton>`). ⚖️ *Pour les 107 fiches reprises de Bubble, la base légale de l'époque est à retrouver.* |
| **Personnes concernées** | Les candidats. |
| **Données** | Identité (nom, prénom, âge, situation familiale, photo) ; coordonnées (adresse électronique, téléphone, adresse postale) ; recherche (type, métier visé, mobilité, dates de stage) ; permis et véhicule ; parcours (formation, expériences, compétences, informatique, savoir-être, centres d'intérêt) ; CV et lettre de motivation ; suivi écrit par les référents. |
| **Données sensibles** | Aucune n'est demandée. Mais les champs libres — parcours, suivi, motif d'urgence — peuvent en recevoir (santé, situation financière). ⚖️ *Une consigne aux référents est à prévoir : n'y écrire que ce qui sert l'accompagnement.* |
| **Destinataires** | Les référents de la loge du candidat : un référent ne voit que les dossiers de sa loge, et la base l'impose (RLS). Les administrateurs. |
| **Sous-traitants** | Hostinger (hébergement), Brevo (courriels), Anthropic (lecture du CV, si le candidat la demande). Voir § 8. |
| **Transferts hors UE** | Seulement si le candidat demande la lecture de son CV (§ 5). |
| **Durée de conservation** | ⚠️ *À fixer* — point ouvert n° 4 du cadrage : combien de temps garde-t-on le dossier d'un candidat inactif ? Proposition à trancher : 2 ans après le dernier contact, puis suppression, documents compris. |
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
| Anthropic | le CV, si le candidat demande la lecture | États-Unis | DPA du 24 février 2025, clauses contractuelles types |
| Bubble | l'ancienne application, jusqu'au 5 décembre 2026 | ⚠️ *à vérifier* | ⚠️ *à archiver* |

Ne voient **aucune** donnée personnelle : GitHub (le code seul, et le dépôt n'en
contient aucune), France Travail (les offres viennent de chez eux, rien n'y
part).

## 9. Les mesures de sécurité, pour tous les traitements

- **Fermé par défaut** : chaque table porte la sécurité au niveau des lignes
  (RLS) ; une règle d'accès ne s'ajoute qu'avec l'écran qui la justifie.
- **Liens personnels** pour les parrains et les candidats : seule leur empreinte
  est conservée, ils expirent au bout de 30 jours.
- **Chiffrement en transit** (HTTPS) ; base jamais exposée sur Internet.
- **Aucun secret ni aucune donnée réelle dans le dépôt de code.**
- **Sauvegardes** quotidiennes, sorties du serveur (§ 6).

## 10. Les droits des personnes

⚠️ *À écrire : comment un candidat, un parrain ou un référent demande l'accès à
ses données, leur rectification ou leur suppression — à quelle adresse, sous
quel délai (un mois), et qui le fait dans l'application. La case de
consentement promet déjà que le candidat « peut demander leur suppression ».*
