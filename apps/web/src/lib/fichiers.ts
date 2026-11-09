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

/**
 * Le format d'une image, lu **dans ses octets** — ou `null` si ce n'en est pas
 * une.
 *
 * Dans les octets, et surtout pas dans le nom du fichier : celui-ci vient du
 * navigateur, donc de qui dépose. Un `.jpg` ne prouve rien, et c'est ce nom-là
 * qui déciderait ensuite du `Content-Type` sous lequel le fichier serait
 * renvoyé à tout le monde (`typeDeFichier`, plus haut).
 *
 * Le format retenu sert donc aussi d'extension au fichier rangé : ce qui est
 * annoncé est ce qui a été reconnu, et les deux ne peuvent plus diverger.
 *
 * Les cinq formats que les navigateurs affichent sans rien installer. Le SVG
 * n'y est pas, et c'est délibéré : c'est un document qui peut porter du script,
 * pas une image inerte.
 */
export type FormatDImage = 'jpg' | 'png' | 'webp' | 'gif' | 'avif';

export function formatDImage(octets: Uint8Array): FormatDImage | null {
  const a = (position: number, ...attendus: number[]) =>
    attendus.every((valeur, decalage) => octets[position + decalage] === valeur);

  /** Quatre octets lus comme du texte — les formats en boîtes en usent. */
  const mot = (position: number) =>
    String.fromCharCode(...octets.subarray(position, position + 4));

  if (a(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (a(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (mot(0) === 'GIF8') return 'gif';
  if (mot(0) === 'RIFF' && mot(8) === 'WEBP') return 'webp';

  // AVIF : une boîte ISO-BMFF. La marque tient en quatre octets après `ftyp`,
  // et `avis` est la variante en séquence — le navigateur affiche les deux.
  if (mot(4) === 'ftyp' && ['avif', 'avis'].includes(mot(8))) return 'avif';

  return null;
}

/**
 * Le format d'un document déposé par un candidat — CV ou lettre —, lu **dans
 * ses octets**, ou `null`.
 *
 * Même règle que pour les images : le nom du fichier vient du navigateur et ne
 * prouve rien. Le format reconnu devient l'extension du fichier rangé, et la
 * base (migration 0057) n'accepte que ces extensions-là.
 *
 *   · PDF   — `%PDF-` ;
 *   · DOC   — le conteneur OLE de Word 97-2003 ;
 *   · DOCX  — une archive ZIP. On ne l'ouvre pas : tout ZIP qui n'est pas un
 *             ODT est rangé en `.docx`, et le téléchargement l'annoncera ainsi ;
 *   · ODT   — une archive ZIP dont le premier membre, `mimetype`, le dit en
 *             clair à l'octet 30 — c'est la norme OpenDocument qui l'impose ;
 *   · RTF   — `{\rtf` ;
 *   · et les images qu'un téléphone produit en photographiant un CV.
 */
export type FormatDeDocument = 'pdf' | 'doc' | 'docx' | 'odt' | 'rtf' | 'jpg' | 'png' | 'webp';

export function formatDeDocument(octets: Uint8Array): FormatDeDocument | null {
  const a = (position: number, ...attendus: number[]) =>
    attendus.every((valeur, decalage) => octets[position + decalage] === valeur);
  const texte = (position: number, longueur: number) =>
    String.fromCharCode(...octets.subarray(position, position + longueur));

  if (texte(0, 5) === '%PDF-') return 'pdf';
  if (a(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'doc';
  if (texte(0, 5) === '{\\rtf') return 'rtf';
  if (a(0, 0x50, 0x4b, 0x03, 0x04)) {
    return texte(30, 47) === 'mimetypeapplication/vnd.oasis.opendocument.text' ? 'odt' : 'docx';
  }

  const image = formatDImage(octets);
  if (image === 'jpg' || image === 'png' || image === 'webp') return image;

  return null;
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
export function enTeteDeTelechargement(nom: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  const propre = nom.replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'document';

  // Le repli : ASCII imprimable seulement, guillemets compris — ils fermeraient
  // la chaîne au milieu du nom.
  const ascii = propre.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(propre)}`;
}
