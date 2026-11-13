import { NextResponse } from 'next/server';
import { aEnvoyerEnGroupe } from '@/lib/loges-du-reseau';
import { envoyerLeLien, indisponible, lister, ouvrir } from '../acces';

/**
 * L'envoi groupé : le lien part à chaque loge du réseau qui ne l'a jamais
 * reçu et dont le Secrétaire a une adresse (décision 23). Une loge après
 * l'autre — 73 courriels tiennent largement dans le quota du jour de Brevo
 * (docs/brevo.md). Un envoi raté n'arrête pas les suivants : la route dit
 * combien sont partis, combien ont échoué, et la loge ratée reste « sans
 * lien », prête pour un nouvel essai.
 */
export async function POST(requete: Request) {
  try {
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const loges = await lister(acces.supabase);
    if (!loges) return indisponible();

    let envoyes = 0;
    let echecs = 0;
    let premiereErreur: string | null = null;
    for (const loge of aEnvoyerEnGroupe(loges)) {
      const issue = await envoyerLeLien(requete, acces.supabase, loge, acces.adresse);
      if (issue.envoye) {
        envoyes += 1;
      } else {
        echecs += 1;
        premiereErreur ??= issue.message;
        // Sans configuration d'envoi, aucun des suivants ne partira : inutile d'insister.
        if (issue.raison === 'non-configure') break;
      }
    }

    const apres = await lister(acces.supabase);
    if (!apres) return indisponible();
    return NextResponse.json({ loges: apres, envoyes, echecs, erreur: premiereErreur });
  } catch (souci) {
    console.error('[loges du réseau] envoi groupé : échec inattendu', souci);
    return indisponible();
  }
}
