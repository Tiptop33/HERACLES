import { NextResponse } from 'next/server';
import { z } from 'zod';
import { envoyerLeLien, indisponible, lister, ouvrir } from '../../acces';

/**
 * Envoyer — ou renvoyer — son lien au Secrétaire d'une loge du réseau.
 * Un nouveau lien remplace l'ancien, qui cesse aussitôt de valoir ; si
 * l'envoi échoue, rien ne change (`envoyerLeLien`).
 */
export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette loge du réseau n’existe plus.' }, { status: 404 });
    }
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const loges = await lister(acces.supabase);
    if (!loges) return indisponible();
    const loge = loges.find((l) => l.id === id);
    if (!loge) return NextResponse.json({ erreur: 'Cette loge du réseau n’existe plus.' }, { status: 404 });

    const issue = await envoyerLeLien(requete, acces.supabase, loge, acces.adresse);
    if (!issue.envoye) return NextResponse.json({ erreur: issue.message }, { status: 502 });

    const apres = await lister(acces.supabase);
    return apres ? NextResponse.json({ loges: apres }) : indisponible();
  } catch (souci) {
    console.error('[loges du réseau] envoi du lien : échec inattendu', souci);
    return indisponible();
  }
}
