import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PanneFranceTravail } from '@/lib/france-travail';
import { departementDuCodePostal, divisionsDuCandidat } from '@/lib/la-bonne-boite';
import { laBonneBoite } from '@/lib/la-bonne-boite-serveur';
import { lireFiche } from '@/lib/poste';
import { lireLesSecteursDuCandidat } from '@/lib/secteurs-du-candidat-serveur';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Les entreprises qui recrutent, pour la fiche d'un candidat (La Bonne Boîte,
 * docs/france-travail.md).
 *
 * La session d'abord ; puis la fiche et ses secteurs, lus sous RLS : qui ne
 * lit pas la fiche n'obtient rien, pas même la preuve qu'elle existe. Alors
 * seulement on interroge France Travail — avec des divisions NAF et un
 * département, rien qui désigne le candidat.
 *
 * La réponse dit toujours pourquoi la liste manque : la fiche affiche une
 * phrase, jamais un bloc vide sans explication.
 */

const pasDeFiche = () => NextResponse.json({ erreur: 'Cette fiche n’existe plus.' }, { status: 404 });

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return pasDeFiche();

    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const [fiche, secteurs] = await Promise.all([lireFiche(id), lireLesSecteursDuCandidat(id)]);
    if (!fiche || !secteurs) return pasDeFiche();

    const divisions = divisionsDuCandidat(secteurs.secteurs);
    if (divisions.length === 0) return NextResponse.json({ etat: 'sans-secteur' });

    const departement = departementDuCodePostal(fiche.code_postal);
    if (!departement) return NextResponse.json({ etat: 'sans-departement' });

    const chercher = laBonneBoite();
    if (!chercher) return NextResponse.json({ etat: 'non-configure' }, { status: 503 });

    const resultat = await chercher({ divisions, departement });
    return NextResponse.json({ etat: 'ok', departement, ...resultat });
  } catch (souci) {
    if (souci instanceof PanneFranceTravail) {
      console.error('[la bonne boîte]', souci.etape, souci.statut ?? '');
    } else {
      console.error('[la bonne boîte] échec inattendu', souci);
    }
    return NextResponse.json({ etat: 'indisponible' }, { status: 503 });
  }
}
