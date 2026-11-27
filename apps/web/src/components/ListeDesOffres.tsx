import Link from 'next/link';
import type { Offre } from '@/lib/accueil';
import { parution, sousTitre } from '@/lib/offres';
import EtiquetteDuType from './EtiquetteDuType';

/**
 * La liste des offres d'emploi en cours : l'intitulé, puis l'entreprise, le
 * lieu et le type de contrat ; à droite de la ligne, la date de parution de
 * l'annonce (24 novembre 2026, à la demande). Une offre saisie à la main porte
 * avant la date l'étiquette de son type — Emploi, Stage, Alternance (27
 * novembre 2026, à la demande). La même à l'accueil et sur l'écran « Offres
 * externes » — un seul composant, pour que les deux ne divergent pas.
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
        const date = parution(o);
        // À gauche l'offre, sur deux lignes ; à droite, l'étiquette d'une
        // offre saisie, puis sa date de parution (24 novembre 2026, à la demande).
        const contenu = (
          <>
            <span className="offre-texte">
              <span>{o.intitule ?? 'Offre sans intitulé'}</span>
              <span className="maigre">{sousTitre(o)}</span>
            </span>
            {(o.type_offre || date) && (
              <span className="offre-parution">
                {o.type_offre && <EtiquetteDuType type={o.type_offre} />}
                {date && <span className="maigre">{date}</span>}
              </span>
            )}
          </>
        );
        if (!lien) {
          return (
            <li key={o.id} className="offre-rangee">
              {contenu}
            </li>
          );
        }

        return (
          <li key={o.id} className="offre-ligne">
            {/* `scroll={false}` : ouvrir un détail ne fait pas remonter la liste. */}
            <Link
              href={lien(o.id)}
              scroll={false}
              className="offre-lien offre-rangee"
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
