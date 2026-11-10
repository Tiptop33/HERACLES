import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { definitionDeLAffiche, type DonneesAffiche } from './affiche';
import { definitionDeLAffichette, type DonneesAffichette } from './affichette';
import { definitionDuCompteRendu, type DonneesCompteRendu } from './compte-rendu';
import { avecLeContactParDefaut, definitionDuCvAnonyme, type DonneesCvAnonyme } from './cv-anonyme';
import { lireLaMiseEnPage } from './donnees';
import type { DocumentCle, Reglages } from './gabarits';
import { imagesDuDocument, rendre } from './moteur';
import { lecteur, nettoyer, type Lecteur } from './reglages';

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

/** La mise en page du CV, le Secrétaire de la loge pour origine du contact. */
const lecteurDuCvAnonyme = (ecarts: Reglages, d: DonneesCvAnonyme) =>
  lecteur('cv_anonyme', avecLeContactParDefaut(ecarts, d.contact_par_defaut));

/**
 * Le CV anonyme, avec la mise en page enregistrée — sous la session de qui le
 * demande : l'aperçu du référent, celui de Paramètres › Mise en page. Le CV
 * anonyme n'a pas d'image.
 */
export async function produireLeCvAnonyme(d: DonneesCvAnonyme): Promise<Uint8Array> {
  const { ecarts } = await lireLaMiseEnPage('cv_anonyme');
  return rendre(definitionDuCvAnonyme(d, lecteurDuCvAnonyme(ecarts, d)), new Map());
}

/**
 * Le même, pour le lien public : sans session, `anon` ne lit pas la table des
 * réglages. `cv_anonyme_valide_public()` (migration 0073) les lui rend avec le
 * CV ; ils sont vérifiés ici comme ceux qu'on lit en base. Le CV anonyme n'a
 * pas d'image.
 */
export async function produireLeCvAnonymePublic(d: DonneesCvAnonyme, reglages: unknown): Promise<Uint8Array> {
  const ecarts: Reglages = nettoyer('cv_anonyme', reglages);
  return rendre(definitionDuCvAnonyme(d, lecteurDuCvAnonyme(ecarts, d)), new Map());
}
