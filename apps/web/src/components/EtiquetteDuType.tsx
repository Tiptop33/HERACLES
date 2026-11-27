import { ETIQUETTE_DU_TYPE, type TypeDOffre } from '@/lib/offres-saisies';

/**
 * L'étiquette d'une offre saisie à la main, dans les listes : Emploi, Stage,
 * Alternance (27 novembre 2026, à la demande). La pastille reprend la couleur
 * des familles de recherche de la liste des candidats. Une offre de France
 * Travail n'en porte pas.
 */
export default function EtiquetteDuType({ type }: { type: TypeDOffre }) {
  return <span className={`etiquette-offre etiquette-offre--${type}`}>{ETIQUETTE_DU_TYPE[type]}</span>;
}
