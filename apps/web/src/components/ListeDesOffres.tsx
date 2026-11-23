import type { Offre } from '@/lib/accueil';

/**
 * La liste des offres d'emploi en cours : l'intitulé, puis l'entreprise, le
 * lieu et le type de contrat. La même à l'accueil et sur l'écran « France
 * Travail » — un seul composant, pour que les deux ne divergent pas.
 */
export default function ListeDesOffres({
  offres,
  vide = 'Aucune offre en cours.',
}: {
  offres: Offre[];
  /** Ce qu'on dit quand il n'y a rien — l'écran filtré le dit autrement. */
  vide?: string;
}) {
  if (offres.length === 0) return <p className="vide-liste">{vide}</p>;

  return (
    <ul className="liste-nue">
      {offres.map((o) => (
        <li key={o.id}>
          <span>{o.intitule ?? 'Offre sans intitulé'}</span>
          <span className="maigre">
            {[o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}
