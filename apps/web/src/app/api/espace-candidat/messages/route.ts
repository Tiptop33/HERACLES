import { NextResponse } from 'next/server';
import { envoyerCourriel } from '@/lib/courriel';
import { origine } from '@/lib/formulaire';
import { COLONNES_DU_MESSAGE, courrielDAlerte, lireMessages, validerUnMessage } from '@/lib/page-candidat';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exigerMonDossier, lireJson, refus, refusDeLaBase } from '../commun';

/**
 * Le candidat dit où il en est (0105). Le message s'enregistre sous sa
 * session ; puis, avec la clé de service, HERACLES prévient son référent par
 * courriel — sans le texte, qui reste dans HERACLES.
 */
export async function POST(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const corps = await lireJson(requete);
  const verdict = validerUnMessage(corps?.texte);
  if (!verdict.ok) return refus(400, verdict.message, 'texte');

  const { data: id, error } = await session.supabase.rpc('ecrire_mon_message', { le_texte: verdict.valeur });
  if (error || typeof id !== 'string') {
    if (error?.code === '54000') {
      return refus(429, 'Vous avez écrit vingt messages aujourd’hui : la suite demain.', 'texte');
    }
    return refusDeLaBase(error?.code, 'message refusé', 'texte');
  }

  await prevenirLeReferent(id, origine(requete));

  const { data } = await session.supabase.from('candidat_message').select(COLONNES_DU_MESSAGE).eq('id', id);
  return NextResponse.json({ message: lireMessages(data ?? [])[0] ?? null });
}

/** Au mieux : un courriel qui ne part pas ne retire pas le message. */
async function prevenirLeReferent(message: string, racine: string) {
  try {
    const { data } = await supabaseAdmin().rpc('qui_prevenir_du_message', { le_message: message });
    const a = ((data as {
      email: string;
      prenom: string | null;
      candidat_id: string;
      candidat_prenom: string | null;
      candidat_nom: string | null;
      numero: number | null;
    }[] | null) ?? [])[0];
    if (!a) return;

    const candidat = [a.candidat_prenom, a.candidat_nom].filter(Boolean).join(' ') || 'Votre candidat';
    const lien = `${racine}/espace/candidats?fiche=${a.candidat_id}&onglet=suivi`;
    const issue = await envoyerCourriel({ a: a.email, ...courrielDAlerte(a.prenom, candidat, a.numero, lien) });
    if (!issue.envoye) console.warn('[page-candidat] alerte non envoyée', issue.raison);
  } catch (souci) {
    console.error('[page-candidat] alerte : échec inattendu', (souci as Error).name);
  }
}
