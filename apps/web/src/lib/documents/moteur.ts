import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as module from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { champsDe, type DocumentCle } from './gabarits';

/**
 * Le moteur : pdfmake, ses polices, les images d'origine.
 *
 * POURQUOI PDFMAKE
 *
 * Les trois documents de Bubble sortaient de pdfmake (c'est écrit dans leurs
 * métadonnées). Le même moteur coupe les lignes, mesure les colonnes « auto »
 * et pagine les tableaux exactement de la même façon : décrire le même
 * document lui fait produire le même PDF, au point près. Refaire ces calculs à
 * la main sur `pdf-lib` aurait donné un document voisin, jamais le même.
 *
 * LES RESSOURCES
 *
 * Polices (Poppins, Roboto — licence libre, voir `ressources/polices`) et
 * emblèmes d'origine vivent dans `ressources/`, à côté du code, et entrent dans
 * l'image de production par `outputFileTracingIncludes` (next.config.ts). Elles
 * ne sont pas dans `public/` : rien ici n'a à être servi au navigateur.
 *
 * Aucune ressource ne se charge d'ailleurs : pdfmake n'a le droit ni d'aller
 * sur le réseau, ni de lire un fichier hors de ce dossier. Un réglage ou une
 * donnée qui glisserait une adresse dans le document ne ferait rien charger.
 */

const pdfmake = ((module as unknown as { default?: typeof module }).default ?? module) as typeof module;

export const RESSOURCES = path.join(process.cwd(), 'src', 'lib', 'documents', 'ressources');

const police = (nom: string) => path.join(RESSOURCES, 'polices', `${nom}.ttf`);

let pret = false;

function preparer(): void {
  if (pret) return;
  pdfmake.setFonts({
    Poppins: {
      normal: police('Poppins-Regular'),
      bold: police('Poppins-Bold'),
      italics: police('Poppins-Italic'),
      bolditalics: police('Poppins-BoldItalic'),
    },
    // Les fichiers que pdfmake livre lui-même, ceux de l'affichette d'origine.
    Roboto: {
      normal: police('Roboto-Regular'),
      bold: police('Roboto-Medium'),
      italics: police('Roboto-Italic'),
      bolditalics: police('Roboto-MediumItalic'),
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((chemin: string) => path.resolve(chemin).startsWith(RESSOURCES + path.sep));
  pret = true;
}

const origines = new Map<string, Buffer>();

/** Une image d'origine, lue une fois puis gardée. */
export function imageDOrigine(fichier: string): Buffer {
  // Le nom vient du gabarit, jamais d'une saisie : on le vérifie quand même.
  if (!/^[a-z0-9-]+\.(png|jpg)$/.test(fichier)) throw new Error(`Image d'origine inattendue : ${fichier}`);
  let octets = origines.get(fichier);
  if (!octets) {
    octets = readFileSync(path.join(RESSOURCES, 'images', fichier));
    origines.set(fichier, octets);
  }
  return octets;
}

/** Une image déposée dans les réglages, déjà décodée. */
export type ImageDeposee = { type: 'image/png' | 'image/jpeg'; octets: Buffer };

/**
 * Les images d'un document : pour chaque emplacement, celle qu'on a déposée si
 * le réglage le demande, sinon l'emblème d'origine.
 */
export function imagesDuDocument(
  document: DocumentCle,
  deposees: ReadonlyMap<string, ImageDeposee>,
  employerDeposee: (prefixe: string) => boolean,
): Map<string, Buffer> {
  const images = new Map<string, Buffer>();
  for (const c of champsDe(document)) {
    if (c.genre !== 'image' || !c.fichier) continue;
    const prefixe = c.cle.slice(0, -'.image'.length);
    const deposee = employerDeposee(prefixe) ? deposees.get(prefixe) : undefined;
    images.set(prefixe, deposee ? deposee.octets : imageDOrigine(c.fichier));
  }
  return images;
}

/** Produit le PDF. */
export async function rendre(definition: TDocumentDefinitions, images: ReadonlyMap<string, Buffer>): Promise<Uint8Array> {
  preparer();
  const complete: TDocumentDefinitions = {
    ...definition,
    // pdfmake accepte des octets à la place d'une adresse ; son typage ne le dit pas.
    images: Object.fromEntries(images) as unknown as TDocumentDefinitions['images'],
  };
  const tampon = await pdfmake.createPdf(complete).getBuffer();
  return new Uint8Array(tampon.buffer, tampon.byteOffset, tampon.byteLength);
}
