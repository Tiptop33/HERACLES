/**
 * Ce qu'ouvre la carte « CV anonyme » de la fiche, onglet *Documents*.
 *
 * Décision du 10 novembre 2026 : **le CV anonyme se fait automatiquement dès
 * qu'il y a un CV original.** HERACLES le produit depuis la fiche (0073) ; la
 * carte s'ouvre dessus, marquée « à valider », sans que personne ait à le
 * fabriquer. Il ne circule — affiche, QR code de l'affichette — qu'une fois
 * validé par un référent de la loge (0074), dans sa copie figée (0075).
 *
 * L'ordre suit celui du lien public :
 *
 *   1. **validé** — le CV produit, dans la copie figée à la validation ;
 *   2. un **fichier déposé** (repris de Bubble ou déposé à la main) ;
 *   3. le même, resté **chez Bubble** — il ne s'ouvre pas encore ;
 *   4. un **CV original** — le CV produit depuis la fiche, **à valider** ;
 *   5. rien.
 *
 * Pas de copie rangée avant la validation : la fiche peut encore bouger, et
 * c'est la version du moment qu'il faut relire. Le PDF se produit à
 * l'ouverture, toujours à jour.
 */

export type CarteDuCvAnonyme =
  | { sorte: 'produit'; aValider: boolean }
  | { sorte: 'depose' }
  | { sorte: 'bubble' }
  | { sorte: 'absent' };

export type DocumentsDeLaFiche = {
  cv_chemin: string | null;
  cv_url: string | null;
  cv_anonyme_chemin: string | null;
  cv_anonyme_url: string | null;
};

export function carteDuCvAnonyme(fiche: DocumentsDeLaFiche, valideLe: string | null | undefined): CarteDuCvAnonyme {
  if (valideLe) return { sorte: 'produit', aValider: false };
  if (fiche.cv_anonyme_chemin) return { sorte: 'depose' };
  if (fiche.cv_anonyme_url) return { sorte: 'bubble' };
  if (fiche.cv_chemin || fiche.cv_url) return { sorte: 'produit', aValider: true };
  return { sorte: 'absent' };
}
