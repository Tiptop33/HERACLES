import Link from 'next/link';
import type { Offre } from '@/lib/accueil';
import { sousTitre } from '@/lib/offres';

/**
 * La liste des offres d'emploi en cours : l'intitulé, puis l'entreprise, le
 * lieu, le type de contrat et la date de parution de l'annonce (24 novembre
 * 2026, à la demande). La même à l'accueil et sur l'écran « France
 * Travail » — un seul composant, pour que les deux ne divergent pas.
 *
 * Avec `lien`, chaque ligne devient un lien vers le détail de l'offre. Sans
 * lui, la liste se lit et c'est tout.
 */
export default function ListeDesOffres({
  offres,
  vide = 'Aucune offre en cours.',
  lien,
  ouverte = null,
}: {
  offres: Offre[];
  /** Ce qu'on dit quand il n'y a rien — l'écran filtré le dit autrement. */
  vide?: string;
  /** L'adresse du détail d'une offre. Absent : les lignes ne se cliquent pas. */
  lien?: (id: string) => string;
  /** L'offre dont le détail est ouvert : sa ligne se distingue. */
  ouverte?: string | null;
}) {
  if (offres.length === 0) return <p className="vide-liste">{vide}</p>;

  return (
    <ul className="liste-nue">
      {offres.map((o) => {
        const contenu = (
          <>
            <span>{o.intitule ?? 'Offre sans intitulé'}</span>
            <span className="maigre">{sousTitre(o)}</span>
          </>
        );
        if (!lien) return <li key={o.id}>{contenu}</li>;

        return (
          <li key={o.id} className="offre-ligne">
            {/* `scroll={false}` : ouvrir un détail ne fait pas remonter la liste. */}
            <Link
              href={lien(o.id)}
              scroll={false}
              className="offre-lien"
              aria-current={ouverte === o.id ? 'true' : undefined}
            >
              {contenu}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
