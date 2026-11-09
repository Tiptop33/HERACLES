import Link from 'next/link';
import { LISTES_REFERMEES, type ListeRefermee } from '@/lib/candidats-refermes';

/**
 * Les trois boutons de Paramètres › Archives, à la place du titre : les PDF
 * des exercices précédents, les candidats clôturés, les candidats archivés.
 *
 * Chacun est une adresse — elle se partage, revient avec « retour », et le
 * menu de gauche reste sur « Archives ». Les mêmes onglets que Mise en page,
 * pour qu'une rubrique à plusieurs volets se lise partout de la même façon.
 * Le nombre de candidats est dans le bouton ; celui des PDF est sur le titre
 * de chaque colonne.
 */
export default function OngletsDesArchives({
  courant,
  nombres,
}: {
  courant: 'pdf' | ListeRefermee;
  nombres: Record<ListeRefermee, number>;
}) {
  const onglets: { cle: 'pdf' | ListeRefermee; vers: string; libelle: string }[] = [
    { cle: 'pdf', vers: '/espace/parametres/archives', libelle: 'Archives' },
    ...(Object.keys(LISTES_REFERMEES) as ListeRefermee[]).map((cle) => ({
      cle,
      vers: `/espace/parametres/archives/${cle}`,
      libelle: `${LISTES_REFERMEES[cle].bouton} (${nombres[cle]})`,
    })),
  ];
  const titre = onglets.find((o) => o.cle === courant)?.libelle ?? 'Archives';

  return (
    <>
      <h2 className="visuellement-cache">Archives — {titre}</h2>
      <nav className="mise-en-page-onglets archives-onglets" aria-label="Archives">
        {onglets.map((o) => (
          <Link
            key={o.cle}
            href={o.vers}
            aria-current={o.cle === courant ? 'page' : undefined}
            className={`mise-en-page-onglet${o.cle === courant ? ' mise-en-page-onglet--courant' : ''}`}
          >
            {o.libelle}
          </Link>
        ))}
      </nav>
    </>
  );
}
