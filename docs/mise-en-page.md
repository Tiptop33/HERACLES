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

## Le lien du CV anonyme

`/cv-anonyme/<jeton>` — la colonne « CV » de l'affiche et le QR code de
l'affichette. Seule adresse lisible **sans compte** : le CV anonyme seulement,
d'un dossier en cours, pour qui a le jeton (`candidat.cv_anonyme_jeton`). Voir le
registre RGPD, § 5 bis.
