/**
 * Le glisser-déposer d'une image d'écusson — écran Province et Paramètres ›
 * Loges de Guyenne et Gascogne (demande du 14 novembre 2026).
 *
 * Ce module est pur : il sert au navigateur comme aux tests. Le dépôt ne
 * remplace pas « Parcourir », il s'y ajoute ; et rien de ce qu'il vérifie ici
 * ne dispense le serveur de lire le fichier dans ses octets (`formatDImage`).
 * Il évite seulement d'envoyer, ou de garder dans un formulaire, ce qui sera
 * refusé de toute façon.
 */

/** Les formats d'image acceptés pour un écusson, ceux que le serveur reconnaît. */
export const TYPES_D_ECUSSON = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;

/** La valeur de l'attribut `accept` des champs « Parcourir ». */
export const ACCEPTE_ECUSSON = TYPES_D_ECUSSON.join(',');

const EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)$/i;

/**
 * Pourquoi ce fichier ne peut pas être un écusson, ou `null` s'il peut l'être.
 *
 * Un fichier dont le système ne dit pas le type (`type` vide, cela arrive
 * pour un AVIF) est jugé à son extension ; le serveur tranchera sur ses octets.
 */
export function refusDeLEcusson(
  fichier: { name: string; type: string; size: number },
  tailleMaximale: number,
): string | null {
  const type = fichier.type.trim().toLowerCase();
  const reconnu = type
    ? (TYPES_D_ECUSSON as readonly string[]).includes(type)
    : EXTENSIONS.test(fichier.name);
  if (!reconnu) return 'Ce fichier n’est pas une image reconnue : JPEG, PNG, WebP, GIF ou AVIF.';
  if (fichier.size === 0) return 'Ce fichier est vide.';
  if (fichier.size > tailleMaximale) {
    return `Cette image dépasse ${Math.round(tailleMaximale / (1024 * 1024))} Mo.`;
  }
  return null;
}

/** Le glisser en cours porte-t-il des fichiers ? Un texte ou un lien glissés ne sont pas pour nous. */
export function porteDesFichiers(donnees: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  return Boolean(donnees && Array.from(donnees.types ?? []).includes('Files'));
}
