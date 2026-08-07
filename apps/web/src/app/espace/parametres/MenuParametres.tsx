'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Rubrique } from '@/lib/parametres';

/**
 * Le volet de gauche. Composant client parce qu'il lui faut l'adresse courante
 * pour savoir quelle rubrique éclairer — c'est sa seule raison d'être cliente.
 */
export default function MenuParametres({ rubriques }: { rubriques: readonly Rubrique[] }) {
  const chemin = usePathname() ?? '';

  return (
    <nav className="parametres-menu" aria-label="Rubriques des paramètres">
      {rubriques.map((r) =>
        r.vers ? (
          <Link
            key={r.libelle}
            href={r.vers}
            aria-current={chemin.startsWith(r.vers) ? 'page' : undefined}
            className={`parametres-entree${chemin.startsWith(r.vers) ? ' parametres-entree--courante' : ''}`}
          >
            {r.libelle}
          </Link>
        ) : (
          <span
            key={r.libelle}
            className="parametres-entree parametres-entree--eteinte"
            title={`À venir — ${r.lot ?? 'plus tard'}`}
          >
            {r.libelle}
          </span>
        ),
      )}
    </nav>
  );
}
