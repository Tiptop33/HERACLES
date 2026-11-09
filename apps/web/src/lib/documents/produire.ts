import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { definitionDeLAffiche, type DonneesAffiche } from './affiche';
import { definitionDeLAffichette, type DonneesAffichette } from './affichette';
import { definitionDuCompteRendu, type DonneesCompteRendu } from './compte-rendu';
import { lireLaMiseEnPage } from './donnees';
import type { DocumentCle } from './gabarits';
import { imagesDuDocument, rendre } from './moteur';
import { lecteur, type Lecteur } from './reglages';

/**
 * Produire un document : lire sa mise en page, choisir ses images, le décrire,
 * le rendre. Les routes n'ont plus qu'à fournir les données.
 */

type Definir<D> = (donnees: D, r: Lecteur, presentes: ReadonlySet<string>) => TDocumentDefinitions;

async function produire<D>(document: DocumentCle, donnees: D, definir: Definir<D>): Promise<Uint8Array> {
  const { ecarts, images: deposees } = await lireLaMiseEnPage(document);
  const r = lecteur(document, ecarts);
  const images = imagesDuDocument(document, deposees, (prefixe) => r.imageDeposee(prefixe));
  return rendre(definir(donnees, r, new Set(images.keys())), images);
}

export const produireLeCompteRendu = (d: DonneesCompteRendu) => produire('compte_rendu', d, definitionDuCompteRendu);
export const produireLAffiche = (d: DonneesAffiche) => produire('affiche', d, definitionDeLAffiche);
export const produireLAffichette = (d: DonneesAffichette) => produire('affichette', d, definitionDeLAffichette);
