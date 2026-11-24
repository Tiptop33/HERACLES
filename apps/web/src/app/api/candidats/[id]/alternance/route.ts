import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PanneFranceTravail } from '@/lib/france-travail';
import { RAYON_KM, codePostalValide, estEnAlternance, metierAPredire } from '@/lib/la-bonne-alternance';
import { laBonneAlternance } from '@/lib/la-bonne-alternance-serveur';
import { lireFiche } from '@/lib/poste';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Les offres en alternance, pour la fiche d'un candidat qui en cherche une
 * (La bonne alternance, docs/france-travail.md).
 *
 * La session d'abord ; puis la fiche, lue sous RLS : qui ne la lit pas
 * n'obtient rien. Alors seulement on interroge ROMEO et l'API apprentissage —
 * avec l'intitulé du métier, un code postal, des codes ROME et le centre de
 * la commune, rien qui désigne le candidat.
 *
 * La réponse dit toujours pourquoi la liste manque.
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

    const fiche = await lireFiche(id);
    if (!fiche) return pasDeFiche();
    if (!estEnAlternance(fiche.type_emploi)) return NextResponse.json({ etat: 'pas-alternance' });

    const metier = metierAPredire(fiche.emploi_recherche, fiche.metier_libelle);
    if (!metier) return NextResponse.json({ etat: 'sans-metier' });

    const codePostal = codePostalValide(fiche.code_postal);
    if (!codePostal) return NextResponse.json({ etat: 'sans-code-postal' });

    const chercher = laBonneAlternance();
    if (!chercher) return NextResponse.json({ etat: 'non-configure' }, { status: 503 });

    const reponse = await chercher({ metier, codePostal, ville: fiche.ville });
    if (reponse.etat !== 'ok') return NextResponse.json({ etat: reponse.etat });
    return NextResponse.json({ etat: 'ok', rayon: RAYON_KM, ...reponse.resultat });
  } catch (souci) {
    if (souci instanceof PanneFranceTravail) {
      console.error('[la bonne alternance]', souci.message, souci.statut ?? '');
    } else {
      console.error('[la bonne alternance] échec inattendu', souci);
    }
    return NextResponse.json({ etat: 'indisponible' }, { status: 503 });
  }
}
