/**
 * La politique de mot de passe, telle que la maquette l'affiche à l'écran 3.
 *
 * Elle vit ici, en fonctions pures, pour deux raisons : la page peut cocher les
 * règles au fil de la frappe sans aller-retour avec le serveur, et la route qui
 * enregistre applique **exactement** les mêmes — un contrôle fait dans le
 * navigateur ne protège rien, il renseigne.
 */

export type Regle = {
  intitule: string;
  /** Null quand la règle ne peut se vérifier que côté serveur. */
  respectee: ((motDePasse: string) => boolean) | null;
};

export const REGLES: Regle[] = [
  {
    intitule: '12 caractères minimum',
    respectee: (m) => m.length >= 12,
  },
  {
    intitule: '1 majuscule et 1 chiffre',
    // `\p{Lu}` et non `[A-Z]` : « É » est une majuscule, et des gens s'appellent
    // Étienne.
    respectee: (m) => /\p{Lu}/u.test(m) && /\d/.test(m),
  },
  {
    intitule: 'Différent des 3 derniers',
    // La base seule connaît les anciens mots de passe (migration 0008).
    respectee: null,
  },
];

/** Les règles vérifiables ici sont-elles toutes tenues ? */
export function reglesTenues(motDePasse: string): boolean {
  return REGLES.every((regle) => regle.respectee === null || regle.respectee(motDePasse));
}

/** La première règle enfreinte, pour la dire à l'usager. */
export function premiereFaute(motDePasse: string): string | null {
  const fautive = REGLES.find((regle) => regle.respectee !== null && !regle.respectee(motDePasse));
  return fautive ? fautive.intitule : null;
}

/**
 * La force, de 0 à 4 — les quatre segments de la jauge dessinée.
 *
 * Ce n'est pas la même chose que « le mot de passe est acceptable » : un mot de
 * passe peut tenir les règles et rester faible. La jauge encourage, les règles
 * tranchent.
 */
export function force(motDePasse: string): number {
  if (motDePasse === '') return 0;

  let points = 0;
  if (motDePasse.length >= 12) points += 1;
  if (motDePasse.length >= 16) points += 1;
  if (/\p{Lu}/u.test(motDePasse) && /\p{Ll}/u.test(motDePasse) && /\d/.test(motDePasse)) points += 1;
  if (/[^\p{L}\d]/u.test(motDePasse)) points += 1;

  // Un mot de passe trop court reste au premier segment, quoi qu'il contienne.
  if (motDePasse.length < 12) return Math.min(points, 1);

  return Math.max(1, Math.min(points, 4));
}
