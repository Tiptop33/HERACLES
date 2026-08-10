import { Feuille, lisible } from './pdf';

/**
 * L'affichette : un dossier, une page, faite pour circuler largement.
 *
 * C'est le troisième document de la commission, et le plus exposé. Là où
 * l'affiche liste les dossiers ouverts, l'affichette en met **un seul** en
 * avant, avec un texte d'appel : ceux qui la reçoivent ne cherchent pas dans
 * une liste, ils lisent un cas.
 *
 * Comme l'affiche, et pour la même raison, elle ne porte **aucun nom** : le
 * numéro suffit à demander la fiche à la commission. Elle ne porte pas
 * davantage l'âge, la ville, ni le CV — un document qui circule doit pouvoir
 * être transmis sans que personne n'ait à se demander ce qu'il expose.
 *
 * Ce qu'elle dit d'un dossier : ce que la personne cherche, l'intitulé de sa
 * recherche, son secteur, sa mobilité, et son numéro.
 */

/**
 * Le texte d'appel, repris du document d'origine.
 *
 * Éditorial, donc appelé à changer sans que le code change : il rejoindra les
 * réglages avec l'en-tête des deux autres documents. En attendant il est ici,
 * en un seul endroit, et il ne contient aucune donnée personnelle.
 */
const ADRESSE = 'Mes Bien Chers Frères,';
const APPEL = [
  'La commission HERACLES est de plus en plus sollicitée par des Frères pour trouver ' +
    'un emploi, un stage ou un contrat d’alternance, pour des Frères, des épouses, des ' +
    'fils ou des filles de Frères.',
  'Ceux d’entre vous qui ont des proches dans cette situation savent à quel point cela ' +
    'peut être ardu.',
  'C’est pourquoi nous avons décidé de nous mobiliser, en vous présentant chaque mois ' +
    'un dossier, pour que vous soyez, vous mes Frères, le relais opérationnel de notre ' +
    'Chaîne d’Union.',
  'Comment ? C’est très simple. Prenons le cas de ce mois.',
];

/** Ce que l'affichette accepte d'un dossier — et rien de plus. */
export type DossierAffichette = {
  numero: number | null;
  /** Emploi, stage, alternance : ce que la personne cherche. */
  type_emploi: string | null;
  /** L'intitulé, tel que la personne l'a écrit. */
  emploi_recherche: string | null;
  metier_libelle: string | null;
  secteur_activite_libelle: string | null;
  mobilite_geographique: string | null;
};

/**
 * Les lignes qui décrivent le dossier, dans l'ordre du document d'origine.
 * Une rubrique sans valeur ne s'imprime pas : mieux vaut une affichette courte
 * qu'une affichette pleine de tirets.
 */
export function rubriques(dossier: DossierAffichette): Array<[string, string]> {
  const lignes: Array<[string, string]> = [];
  const poser = (titre: string, valeur: string | null) => {
    const propre = valeur?.trim();
    if (propre) lignes.push([titre, propre]);
  };

  poser('Recherche', dossier.type_emploi);
  poser('Poste', dossier.emploi_recherche ?? dossier.metier_libelle);
  poser('Secteur', dossier.secteur_activite_libelle);
  poser('Mobilité', dossier.mobilite_geographique);
  return lignes;
}

export async function construireAffichette(options: {
  dossier: DossierAffichette;
  /** La signature : la première ligne de contact réglée, s'il y en a une. */
  contacts: string[];
}): Promise<Uint8Array> {
  const { dossier, contacts } = options;
  const feuille = await Feuille.ouvrir(48);

  feuille.espace(10);
  feuille.texte(ADRESSE, { taille: 11, gras: true, interligne: 20 });

  for (const paragraphe of APPEL) {
    feuille.espace(4);
    feuille.texte(paragraphe, { taille: 10, interligne: 15 });
  }

  // Le dossier lui-même, détaché du texte : c'est ce qu'on retient de la page.
  feuille.espace(16);
  feuille.trait();
  feuille.espace(6);
  feuille.centre(
    dossier.numero === null ? 'Dossier de ce mois' : `Dossier n° ${dossier.numero}`,
    { taille: 18 },
  );
  feuille.espace(8);

  for (const [titre, valeur] of rubriques(dossier)) {
    feuille.texte(titre.toUpperCase(), { taille: 8, gras: true, interligne: 12 });
    feuille.texte(valeur, { taille: 11, interligne: 16 });
    feuille.espace(4);
  }

  feuille.espace(4);
  feuille.trait();

  feuille.espace(10);
  feuille.texte(
    'Si ce profil rencontre un besoin autour de vous, faites-le savoir à la commission ' +
      'en indiquant le numéro du dossier.',
    { taille: 9.5, interligne: 14 },
  );

  // La signature. Absente tant que l'installation n'a pas posé ses
  // coordonnées — voir `affiche.ts` : on n'emprunte pas celles d'un autre.
  const signature = contacts[0]?.trim();
  if (signature) {
    feuille.espace(14);
    feuille.texte(signature, { taille: 9, interligne: 13 });
  }

  return feuille.fermer();
}

export function nomDeLAffichette(numero: number | null): string {
  return `affichette-${numero === null ? 'dossier' : lisible(numero)}.pdf`;
}
