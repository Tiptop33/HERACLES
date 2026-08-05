# Maquette « espace référent » (artefact Claude) — ce qui en a été retenu

- **Maquette :** [`espace-referent-artefact-claude.html`](<espace-referent-artefact-claude.html>)
- **Lot :** 3 — l'espace référent
- **Construit le :** 2026-08-05

Trois écrans : la liste « Mes candidats », la fiche en lecture, la fiche en saisie. Le fichier
d'origine venait d'un artefact Claude ; seul le préambule technique de l'hébergeur a été retiré,
et un `<head>` minimal ajouté pour qu'il s'ouvre dans un navigateur. Le dessin, lui, n'a pas été
touché.

## L'identité visuelle vient d'ici

La maquette porte sa propre palette, reprise telle quelle dans `apps/web/src/app/globals.css` :
encre bleu nuit, vert `--referent`, bleu `--candidat`, ambre `--attention`, violet `--clos`,
titres en serif (`Iowan Old Style`, Georgia), thèmes clair **et** sombre. Rien n'en est repris de
MyCollabus — c'est la règle d'isolation du cadrage, étendue à l'apparence.

La variable `--chercheur` de l'ancien `globals.css` disparaît au profit de `--candidat` : le mot
« chercheur » est abandonné depuis la version 2 du cadrage.

## Chaque élément dessiné, et la colonne qui le porte

### Écran 1 — Mes candidats

| Colonne | Source |
| --- | --- |
| Candidat | `prenom`, `nom`, puis `age` et `ville` en seconde ligne |
| N° | `numero` |
| Recherche | `type_emploi` |
| Secteur visé | `secteur_activite_libelle` |
| Fiche | taux de remplissage, calculé (voir plus bas) |
| Suivi | déduit de `cloture`, `archive` et de l'activité |
| Dernière activité | `maj_le` |

Le compte « 9 suivis · 2 en attente de premier contact » se calcule sur les candidats réellement
visibles. Les filtres **Tous / En recherche / Clôturés** et la recherche passent par l'adresse
(`?filtre=`, `?q=`) : la page reste rendue côté serveur, fonctionne sans JavaScript, et un filtre
posé se partage par simple copie du lien.

### Écran 2 — La fiche

| Bloc | Champs |
| --- | --- |
| Entête | `numero`, `cree_le`, l'état de suivi, `type_emploi`, `secteur_activite_libelle`, `permis_vl` + `vehicule` |
| Identité et contact | `age`, `situation_familiale`, `telephone`, `email`, `ville` + `code_postal` (repli sur `adresse`) |
| Ce qu'elle cherche | `type_emploi`, `emploi_recherche`, `mobilite_geographique`, `debut_stage`, `secteur_activite_libelle` |
| Accompagnement | `referent_id`, `parrain_id`, `loge_id`, `appreciation`, `cloture` |
| Parcours | `formations` et `experiences` en prose ; `competences`, `savoir_etre`, `informatique` en étiquettes |
| Documents | `cv_*`, `lettre_motivation_*`, `cv_anonyme_*` |
| Historique | `cree_le`, `maj_le`, et `bubble_id` pour l'origine |

### Écran 3 — La modification

Enregistrent : `prenom`, `nom`, `telephone`, `email`, `ville`, `code_postal`, `type_emploi`,
`emploi_recherche`, `mobilite_geographique`, `debut_stage`, `experiences`, `appreciation`.

Le référent est en lecture seule, comme dessiné. Ce n'est pas qu'une désactivation d'affichage :
un déclencheur SQL fige `referent_id`, `parrain_id`, `loge_id`, `numero` et `profil_id` sur toute
modification venant de l'application. Le rattachement se changera depuis l'administration de la
loge, au lot 5.

## Les deux indicateurs calculés

**Le taux de remplissage** compte, sur vingt champs qui font une fiche utile — identité, contact,
recherche, parcours, documents — combien sont renseignés. Vingt champs et non cinquante : les
colonnes techniques reprises de Bubble (`bubble_id`, identifiants de nomenclatures non encore
raccordées) ne disent rien du travail d'accompagnement.

**L'état du suivi** se déduit dans cet ordre :

1. `cloture` ou `archive` renseigné → **Clôturé**, suivi de la raison quand elle est donnée ;
2. jamais modifiée depuis sa création → **À contacter** ;
3. sinon → **Suivi**.

## Écarts assumés avec le dessin

1. **`ville` et `code_postal` n'existaient pas.** Bubble ne gardait que `adresse` en texte et
   `adresse_detail` en jsonb. L'écran de saisie les demande séparément : la migration 0006 les
   ajoute. Les fiches reprises gardent leur `adresse`, affichée en repli tant que les deux
   nouvelles colonnes sont vides.
2. **Le poids des fichiers n'est pas affiché.** La maquette montre « 213 Ko » ; aucune colonne ne
   porte cette information, et l'inventer serait afficher un chiffre faux. La place qu'occupait le
   poids sert à dire ce qu'on sait vraiment : « chez Bubble », pour un document dont on n'a encore
   que l'adresse d'origine. Un document rapatrié, lui, est un lien qui télécharge.
3. **« Disponible à partir du » lit `debut_stage`** (`DEBUT-STAGE` chez Bubble), seul champ de
   disponibilité repris.
4. **La barre du haut gagne le compte et la déconnexion.** La maquette ne les dessinait pas ;
   sans elles, on ne peut plus sortir de l'application.
5. **Les lignes du tableau sont de vrais liens.** Le dessin utilisait `tabindex="0"` sur la
   ligne : même apparence, mais un lien s'ouvre au clavier, dans un nouvel onglet, et s'annonce
   correctement aux lecteurs d'écran.
6. **Le cadre de fenêtre disparaît.** La maquette dessine l'application dans un rectangle bordé et
   arrondi — c'est le procédé d'une maquette, qui montre « voici l'écran ». Dans le produit, la
   barre du haut tient toute la largeur et le contenu se centre sous elle. L'intérieur, lui, est
   identique.
7. **Le bouton plein devient lisible en thème sombre.** La maquette pose `color: #fff` sur le
   bleu `--candidat` ; en sombre, ce bleu s'éclaircit à `#7aaefc` et le blanc dessus tombe à un
   contraste d'environ 2:1 — illisible. Un jeton `--sur-candidat` porte donc la couleur du texte :
   blanc en clair, encre foncée en sombre.
8. **Deux libellés perdent leur genre.** Le dessin dit « Ce qu'**elle** cherche » et « Candidate
   n° 108 · suivi**e** depuis » : la candidate de l'exemple est une femme, et rien dans le modèle
   ne dit le genre des 107 autres. Deviennent « **Sa recherche** » et « **Fiche** n° 108 · suivie
   depuis » — l'accord porte alors sur « fiche », et l'écran est juste pour tout le monde.

## Ce que la maquette laissait ouvert

Les quatre questions de son pied de page restent ouvertes — les valeurs exactes des listes de
choix, l'utilité du taux de remplissage, les étapes réelles du suivi, et ce qui manquerait à
l'écran. Elles sont reprises dans le plan du lot,
[`docs/plans/2026-08-05-lot3-espace-referent.md`](../plans/2026-08-05-lot3-espace-referent.md).
