import { NextResponse } from 'next/server';
import { exempleDAffiche, exempleDAffichette, exempleDeCompteRendu, exempleDeCvAnonyme } from '@/lib/documents/exemples';
import { produireLAffiche, produireLAffichette, produireLeCompteRendu, produireLeCvAnonyme } from '@/lib/documents/produire';
import { origine } from '@/lib/formulaire';
import { indisponible, ouvrir } from '../acces';

/**
 * L'aperçu de Paramètres › Mise en page : le document avec la mise en page
 * enregistrée, sur des données d'exemple — inventées, voir
 * `lib/documents/exemples.ts`.
 *
 * L'écran le recharge après chaque réglage enregistré : ce qu'on voit est ce
 * que la prochaine réunion imprimera.
 */

export const runtime = 'nodejs';

export async function GET(requete: Request, { params }: { params: Promise<{ document: string }> }) {
  try {
    const acces = await ouvrir((await params).document);
    if (!acces.ok) return acces.reponse;

    const racine = origine(requete);
    const octets =
      acces.document === 'compte_rendu'
        ? await produireLeCompteRendu(exempleDeCompteRendu())
        : acces.document === 'affiche'
          ? await produireLAffiche(exempleDAffiche(racine))
          : acces.document === 'affichette'
            ? await produireLAffichette(exempleDAffichette(racine))
            : await produireLeCvAnonyme(exempleDeCvAnonyme());

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="apercu-${acces.document}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    return indisponible('aperçu', souci);
  }
}
