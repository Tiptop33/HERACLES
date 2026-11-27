import type { Parcours } from './parcours';

/**
 * La visite guidée qui survit à un rechargement de page.
 *
 * Beaucoup d'écrans enregistrent par un formulaire classique : « Ouvrir
 * l'appel », le dossier de l'affichette, la date de la prochaine réunion, les
 * présences. Le navigateur recharge alors la page entière, et l'aide, remontée
 * de zéro, oubliait la visite au beau milieu — « Montre-moi » s'arrêtait à la
 * deuxième étape du compte rendu.
 *
 * La visite en cours est donc retenue dans le `sessionStorage` de l'onglet :
 * le parcours, l'étape, et le moment. Rien d'autre — ni la question tapée, ni
 * ce qui est à l'écran. Le stockage meurt avec l'onglet.
 *
 * Ce fichier ne touche pas au navigateur : il dit quoi écrire et comment le
 * relire, et `Aide.tsx` fait l'écriture. Les tests le prennent tel quel.
 */

/** La clé du `sessionStorage`. */
export const CLE_DE_LA_VISITE = 'heracles:aide:visite';

/**
 * Au-delà, une visite retenue n'est plus reprise : celui qui revient sur
 * l'onglet une heure après ne s'attend pas à voir le guide surgir.
 */
export const REPRISE_AU_PLUS_TARD_MS = 30 * 60 * 1000;

export type Visite = { parcours: Parcours; index: number };

type Retenue = { lieu: string; id: string; index: number; le: number };

/** L'étape d'après, ou `null` quand la visite est finie. */
export function etapeSuivante(visite: Visite, depuis: number): Visite | null {
  if (visite.index !== depuis) return visite;
  return depuis + 1 < visite.parcours.etapes.length ? { ...visite, index: depuis + 1 } : null;
}

/**
 * Ce qu'il faut écrire pour cette visite, ou `null` pour effacer.
 *
 * `lieu` sépare les catalogues : l'espace de travail, la fiche du candidat, la
 * présentation du parrain, « Mon compte ». Une visite n'est reprise que là où
 * elle a commencé.
 */
export function retenirLaVisite(lieu: string, visite: Visite | null, maintenant: number): string | null {
  if (!visite) return null;
  const retenue: Retenue = { lieu, id: visite.parcours.id, index: visite.index, le: maintenant };
  return JSON.stringify(retenue);
}

/**
 * La visite à reprendre, si ce qui est retenu le permet : même catalogue,
 * parcours encore proposé à cette personne, étape qui existe, et pas trop
 * ancienne. Tout le reste — texte abîmé, parcours disparu, rôle changé — ne
 * reprend rien.
 */
export function reprendreLaVisite(
  texte: string | null,
  lieu: string,
  parmi: readonly Parcours[],
  maintenant: number,
): Visite | null {
  if (!texte) return null;

  let lu: unknown;
  try {
    lu = JSON.parse(texte);
  } catch {
    return null;
  }
  if (typeof lu !== 'object' || lu === null) return null;

  const { lieu: ou, id, index, le } = lu as Partial<Retenue>;
  if (ou !== lieu || typeof id !== 'string') return null;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  if (typeof le !== 'number' || maintenant - le > REPRISE_AU_PLUS_TARD_MS) return null;

  const parcours = parmi.find((p) => p.id === id);
  if (!parcours || index >= parcours.etapes.length) return null;
  return { parcours, index };
}
