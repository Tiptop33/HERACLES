/**
 * Les titres du collège — Vénérable Maître, Secrétaire, Trésorier…
 *
 * Un référentiel, tenu par l'administration (migration 0017). Le champ
 * « Collège » d'un référent y puise sa liste, mais n'y est pas contraint :
 * `referent.college` reste du texte, et une fiche qui porte un titre retiré de
 * la liste le garde.
 *
 * Ce module ne contient que des fonctions pures : il est importé par la liste,
 * qui est un composant client. Les lectures en base sont dans
 * `college-serveur.ts`.
 */

export type TitreCollege = {
  id: string;
  nom: string;
  rang: number;
  /** Combien de référents portent ce titre aujourd'hui. */
  utilisations: number;
};

/**
 * Les choix à proposer pour une fiche, la valeur qu'elle porte comprise.
 *
 * Une fiche reprise de Bubble peut porter un titre qui n'est pas dans la
 * liste — ou qui en a été retiré depuis. Sans cette précaution, ouvrir la
 * fiche et l'enregistrer sans y toucher effacerait ce titre : le menu
 * déroulant aurait choisi à la place de la personne.
 */
export function choixDeCollege(titres: string[], valeur: string | null): string[] {
  const actuel = valeur?.trim();
  if (!actuel) return titres;

  const deja = titres.some((t) => t.toLowerCase() === actuel.toLowerCase());
  return deja ? titres : [...titres, actuel];
}

/**
 * L'ordre obtenu en déposant un titre sur un autre : le tiré prend la place du
 * survolé, les autres se décalent.
 *
 * Une fonction à part, et pure : c'est le seul endroit où le rangement peut
 * être faux, et le glisser-déposer d'un navigateur ne s'éprouve pas en
 * regardant l'écran.
 */
export function deplacerDans<T extends { id: string }>(
  liste: readonly T[],
  tire: string,
  cible: string,
): T[] {
  if (tire === cible) return [...liste];

  const depuis = liste.findIndex((t) => t.id === tire);
  const vers = liste.findIndex((t) => t.id === cible);
  if (depuis < 0 || vers < 0) return [...liste];

  const range = [...liste];
  const [deplace] = range.splice(depuis, 1);
  range.splice(vers, 0, deplace);
  return range;
}
