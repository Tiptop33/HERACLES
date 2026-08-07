# Le poste de travail — la liste permanente et la fiche à côté

Maquette **1c**, « Poste de travail — liste permanente + fiche à droite », dont la légende dit
tout : *« Pour l'usage quotidien : la liste ne disparaît jamais, la fiche s'ouvre à côté. On
enchaîne 10 candidats sans revenir en arrière — l'inverse du dépliage inline actuel. »*

Adresse : `/espace/candidats`. C'est l'entrée « Candidats » de la colonne de gauche.

## Ce que ça remplace

| Avant | Après |
| --- | --- |
| `/espace/referent` — un tableau de sept colonnes | redirige vers `/espace/candidats` |
| `/espace/referent/candidats/<id>` — la fiche en pleine page | redirige vers `/espace/candidats?fiche=<id>` |

Les deux anciennes adresses restent valables : elles traînent dans des favoris et dans les
courriels déjà partis. L'écran de correction, lui, n'a pas bougé de place.

## Tout l'état tient dans l'adresse

`?q=` la recherche · `?vue=` le filtre · `?fiche=` la fiche ouverte · `?onglet=` l'onglet.

Trois conséquences, et les trois comptent :

1. l'écran fonctionne **avant l'hydratation** — pas une ligne de script n'est nécessaire pour
   choisir un candidat, filtrer ou changer d'onglet ;
2. une adresse se met en favori et s'envoie à un collègue ;
3. le bouton « retour » du navigateur revient au **candidat précédent**, ce qu'aucun panneau
   ouvert en JavaScript ne sait faire.

Les onglets sont des liens, et non des blocs masqués : ce qu'on ne regarde pas n'est pas envoyé
au navigateur. Un CV et une appréciation ne traversent pas le réseau « au cas où ».

## La décision qui mérite d'être dite : la fiche s'ouvre à la loge

La maquette montre une fiche ouverte dont l'étiquette dit « Référent : DURAND ». Autrement dit,
on lit la fiche de quelqu'un qu'on n'accompagne pas soi-même. Et le volet annonce « 13 en cours »
— un référent en suit un ou deux (118 candidats pour 74 référents). La liste de la maquette est
donc celle de la **loge**, et la fiche s'ouvre pour toute la loge.

C'est un élargissement, et il est délibéré :

- **la lecture** d'une fiche s'ouvre aux candidats de ses loges — et à l'administration, qui n'a
  pas de fiche de référent et ne voyait donc **rien** des 118 dossiers repris de Bubble ;
- **l'écriture** ne bouge pas d'un pouce : seuls le référent et le parrain corrigent. Le stylo
  n'apparaît que pour eux, et si l'écran se trompait, la base refuserait quand même.

**Une fonction, et non une policy plus large.** Élargir `candidat_lecture_accompagnes` ouvrirait
la *table* : toutes ses colonnes, à toutes les requêtes, pour toujours. La table reste fermée
telle que 0006 l'a laissée — « fermé par défaut » n'est pas entamé — et c'est
`fiche_candidat()` (0020) qui rend exactement ce que la fiche affiche. Le test le vérifie dans
les deux sens : Gaëlle ouvre la fiche que Hugo accompagne, et la *table* continue de ne lui
rendre que ses propres candidats.

Le jour où on retire l'écran, on retire la fonction, et rien d'autre n'a bougé.

**Si ce n'est pas la règle voulue**, elle se resserre en une ligne : retirer le
`or c.loge_id in (select public.loges_visibles())` de `fiche_candidat()`. La liste continuerait
de montrer la loge, et seules les fiches qu'on accompagne s'ouvriraient.

## Ce que la base rend

| Migration | Fonction | Ce qu'elle ouvre |
| --- | --- | --- |
| 0019 | `candidats_de_la_loge()` | la liste — nom, âge, métier, ville, qui accompagne. Ni coordonnées, ni CV, ni appréciation |
| 0019 | `chemin_photo_candidat()` | où est la photo, pour qui a le droit de voir la personne |
| 0020 | `fiche_candidat()` | la fiche, et la colonne `modifiable` qui dit où mettre le stylo |

Les photos et les documents passent par l'application, jamais par une adresse signée : une
adresse signée, même d'une minute, est une adresse qui circule. Chez Bubble, ces fichiers
pendaient à un CDN public.

## Les quatre vues

| Vue | Ce qu'elle montre |
| --- | --- |
| `Mes candidats` | ceux qu'on suit ou qu'on parraine, ni clôturés ni archivés |
| `En cours` | toute la loge, ni clôturée ni archivée |
| `Clôturés` | la colonne `CLOTURE` de la loge, hors archivés |
| `Archivés` | la colonne `ARCHIVER` de la loge |

**L'écran s'ouvre sur « Mes candidats »** : c'est ce qu'un référent vient faire. Lui présenter
d'abord les vingt-quatre dossiers de sa loge lui donnerait du tri à faire avant de commencer.

**Sauf pour qui n'accompagne personne** — un administrateur, qui n'a pas de fiche de référent, ou
un compte pas encore rattaché à la sienne : l'écran s'ouvre alors sur « En cours ». C'est la seule
chose de cet écran qui dépende des données plutôt que de l'adresse, et c'est voulu : la première
seconde décide de ce qu'on croit que l'application contient.

L'adresse nue `/espace/candidats` désigne donc la vue d'ouverture, quelle qu'elle soit ; toute
autre vue s'écrit `?vue=`.

**Deux vues et non une pour ce qui est refermé.** `CLOTURE` et `ARCHIVER` sont deux colonnes
distinctes reprises de Bubble, donc deux gestes distincts. Les confondre à l'écran ferait perdre
l'information au premier tri. Toutes deux portent sur la loge — on referme rarement un dossier,
et jamais dans l'urgence.

**L'archive l'emporte.** Un dossier à la fois clôturé et archivé n'apparaît que sous « Archivés » :
il est rangé, et c'est là qu'on ira le chercher. Les deux vues ne se recoupent donc jamais —
additionnées, elles donnent exactement les dossiers refermés, et le même dossier ne se compte
pas deux fois.

**Le décompte en tête suit la vue** : « 12 en cours », « 5 clôturés », « 3 archivés ». Il porte
sur ce que la vue montre et non sur la loge entière — un décompte qui annonce treize au-dessus
d'une liste de deux ne compte rien du tout.

Le rang d'un candidat que **personne n'accompagne** porte un point ambre, et le texte le dit aux
lecteurs d'écran — la couleur seule ne suffit jamais. Le point occupe sa place sur tous les
rangs, même quand il ne se montre pas : sinon la colonne des numéros ondulerait.

`candidats_de_la_loge()` rend encore `c_est_mon_suivi`, que plus aucun écran n'utilise depuis le
retrait de « Mes suivis ». La colonne reste : elle est éprouvée, et le lot 4 en aura besoin pour
rapprocher un candidat d'une offre.

### La précaution sur les valeurs de clôture

Les valeurs de `CLOTURE` et `ARCHIVER` n'ont **jamais été relevées** : ce sont des listes de
choix Bubble que l'API rend en simple texte, et le modèle le note (§ « Ce qui manque encore »).
Rien ne garantit donc qu'elles ne contiennent pas un « Non ».

D'où la règle de `suivi.ts` : une valeur qui commence par une négation — `Non`, `Non archivé`,
`Aucune`, `false`, `0` — ne referme rien. Si ces listes ne contiennent que des motifs de
clôture, elle ne change rien ; si l'une est un oui/non, elle évite qu'un « Non » vide l'écran de
tout le monde. Le mauvais côté de l'erreur n'est pas le même des deux côtés.

**À confirmer** avec un relevé sur les données réelles :

```sql
select cloture, count(*) from public.candidat group by 1 order by 2 desc;
select archive, count(*) from public.candidat group by 1 order by 2 desc;
```

## L'ordre de la liste

Par **numéro croissant**, et le tri vient de la base. C'est le repère que les référents ont en
tête et celui qui est écrit sur les dossiers. Les fiches sans numéro passent à la fin.

Le numéro s'affiche à droite du rang, en chiffres à chasse fixe : une liste triée sur une clé
invisible se lit comme une liste en désordre.

## Ce qui reste éteint, à sa place définitive

Comme la colonne de gauche : visible, à l'endroit où ce sera, et désactivé.

- les onglets **Suivi & tâches** et **Offres proposées** — lot 4 ;
- le bouton **Proposer une offre** — lot 4 ;
- la carte **Affichette** dans les documents. Elle ne vient d'aucune colonne : l'affichette est
  un document à produire, pas à stocker.

## Vérifier

```bash
cd apps/web && npm run lint && npm test && npm run build
PGHOST=localhost PGPORT=54332 PGUSER=postgres ./supabase/tests/executer.sh
```
