/**
 * Servir un fichier rapatrié de Bubble.
 *
 * Les fichiers vivent dans un seau **privé**. Ils ne sont donc jamais rendus
 * par une adresse — signée ou non —, mais par une route qui a d'abord vérifié
 * le droit, puis lit les octets et les renvoie elle-même.
 *
 * Une adresse signée, même d'une minute, est une adresse qui circule : elle se
 * recopie, s'envoie, se retrouve dans un historique. C'est exactement ce que
 * faisait Bubble avec son CDN public, et ce qu'on ne refait pas.
 */

/**
 * Le type d'un fichier, d'après son extension.
 *
 * D'après l'extension et non d'après ce que dit le stockage : le seau tient de
 * Bubble ce que Bubble lui a donné, et un CV arrivé en
 * `application/octet-stream` s'ouvrirait comme un fichier à télécharger plutôt
 * que comme un PDF.
 */
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function typeDeFichier(chemin: string, secours?: string | null): string {
  const extension = chemin.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[extension] ?? secours ?? 'application/octet-stream';
}

/** L'extension d'un chemin, point compris — « .pdf » —, ou rien. */
export function extensionDe(chemin: string): string {
  const morceaux = chemin.split('/').pop()?.split('.') ?? [];
  return morceaux.length > 1 ? `.${morceaux.pop()!.toLowerCase()}` : '';
}

/**
 * L'en-tête qui décide du nom sous lequel le fichier arrive chez la personne.
 *
 * Deux formes, et il en faut deux : `filename` en repli, dépouillé de tout ce
 * qui n'est pas de l'ASCII, et `filename*` qui porte le nom véritable. Sans la
 * première, un navigateur ancien ne saurait pas quoi faire ; sans la seconde,
 * « CV — Élodie Lefèvre.pdf » arriverait en « CV  lodie Lef vre.pdf ».
 */
export function enTeteDeTelechargement(nom: string): string {
  const propre = nom.replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'document';

  // Le repli : ASCII imprimable seulement, guillemets compris — ils fermeraient
  // la chaîne au milieu du nom.
  const ascii = propre.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(propre)}`;
}
