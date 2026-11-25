import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Ce que partagent les routes de la page candidat (0105).
 *
 * Toutes commencent pareil : une session, et un dossier relié à ce compte
 * (`mon_dossier()`). Sans l'un ou l'autre, rien ne se fait — et la base, de
 * toute façon, refuserait : ses fonctions repartent de `mon_dossier()`.
 */

export type Session = {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  dossier: string;
};

export async function exigerMonDossier(): Promise<Session | NextResponse> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refus(401, 'Votre session a expiré. Reconnectez-vous.');

  const { data: dossier } = await supabase.rpc('mon_dossier');
  if (typeof dossier !== 'string') return refus(403, 'Ce compte n’est relié à aucune fiche.');

  return { supabase, dossier };
}

export function refus(statut: number, message: string, champ: string | null = null) {
  return NextResponse.json({ erreur: message, champ }, { status: statut });
}

/**
 * Les codes que la base renvoie (0105), traduits pour la personne. Un code
 * inattendu est journalisé, jamais montré.
 */
export function refusDeLaBase(code: string | undefined, contexte: string, champ: string | null = null) {
  switch (code) {
    case '23514':
      return refus(400, 'Cette valeur est refusée.', champ);
    case '22023':
      return refus(400, 'Ce champ ne se modifie pas ici.', champ);
    case '42501':
      return refus(403, 'Ce compte n’est relié à aucune fiche.');
    case 'P0002':
      return refus(404, 'Introuvable : la page a peut-être changé. Rechargez-la.');
    case '54000':
      return refus(409, 'Vous avez atteint la limite. Supprimez-en un pour en ajouter un autre.');
    case '55000':
      return refus(409, 'Ce message a plus de 24 heures : il est gardé tel quel.');
    default:
      console.error(`[page-candidat] ${contexte}`, code);
      return refus(503, 'L’enregistrement a échoué. Réessayez dans un instant.');
  }
}

export async function lireJson(requete: Request): Promise<Record<string, unknown> | null> {
  const corps = await requete.json().catch(() => null);
  return corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : null;
}
