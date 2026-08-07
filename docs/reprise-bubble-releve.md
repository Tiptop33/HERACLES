# Relevé de la reprise Bubble → Supabase

- **Date :** 2026-08-04
- **Source :** application Bubble `heracles-42268`, base en service (« live ») pour les tables
  métier, base de l'éditeur (« version-test ») pour les référentiels
- **Destination :** base Supabase locale
- **Outil :** `outils/import-bubble.mjs`

## Ce qui a été repris

| Table | Enregistrements | Source |
| --- | ---: | --- |
| `candidat` | 107 | live |
| `referent` | 71 | live |
| `offre_emploi` | 4 539 | live |
| `document` | 135 | live |
| `loge` | 3 | live |
| `entreprise` | 1 | live |
| `parametre` | 1 | live |
| `bubble_brut` | 12 847 | version-test |
| **Total** | **≈ 17 700** | |

Les comptes constatés à l'arrivée correspondent exactement à ceux relevés côté Bubble avant
la reprise.

## Pourquoi deux sources

Au moment de la reprise, les deux bases de Bubble n'étaient pas au même niveau :

- la base **en service** portait les vraies données (107 candidats, 4 539 offres, 3 loges) mais
  n'exposait que sept types à l'API, les réglages n'ayant pas été déployés ;
- la base de **l'éditeur** exposait les 45 types mais avec des données plus maigres
  (83 candidats, 3 153 offres, 2 loges).

Les tables métier ont donc été prises dans la première, les référentiels — métiers, villes,
provinces, codes NAF, nomenclature ROME, identiques de part et d'autre — dans la seconde, avec
`SEULEMENT_BRUT=1` pour que le second passage n'écrase pas le premier.

## Sept types déclarés mais vides

`appels`, `tag`, `tenue`, `ft_auth`, `offre_cliquee`, `emailrelance`,
`candidat_offre_cliquee` : zéro enregistrement. Rien à reconstruire dans HERACLES.

## Ce qui n'est PAS repris

**Les fichiers.** CV, CV anonymes, lettres de motivation, photos et PDF sont hébergés sur le
CDN de Bubble. Les tables conservent leurs adresses (`cv_url`, `photo_url`,
`lettre_motivation_url`, `document.lien_url`), mais **ces adresses cesseront de répondre à la
fermeture de l'application**. Leur rapatriement dans Supabase Storage est une étape à part, à
mener avant la bascule du 5 décembre.

## À faire côté Bubble

- [ ] Refermer l'API : décocher *Enable Data API*, ou au minimum les types portant des données
      personnelles (`CANDIDATS`, `User`, `PDFs`, `Messages`, `CORRESPONDANTS`). Au moment de la
      reprise, l'application en service répondait **sans jeton** à n'importe quelle requête.
- [ ] Régénérer les cinq jetons d'API : ils ont circulé pendant la mise au point.

**Vérifié le 7 août 2026, toujours ouvert.** Sans jeton, sur l'application en service :
`CANDIDATS`, `User` et `PDFs` répondent tous les trois `HTTP 200`. Fermeture reportée, décision
prise ce jour-là. À reprendre avant la bascule du 5 décembre : l'application Bubble reste en
service jusque-là, et son API avec elle.

Le réglage est versionné : le décocher dans l'éditeur ne suffit pas, il faut déployer en
production pour que l'application en service change. C'est ce qui explique que les deux bases
n'exposaient pas les mêmes types au moment de la reprise.

## La prochaine fois : MAJBUBBLE

Cette reprise-ci a servi à modeler la base. Elle sera périmée à la bascule.
La procédure pour la rejouer une dernière fois — au plus tard le 5 décembre
2026 — est dans [`MAJBUBBLE.md`](MAJBUBBLE.md).
