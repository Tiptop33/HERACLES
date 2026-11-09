import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Rouvrir un dossier clôturé (migration 0072) — le bouton « Rouvrir le
 * dossier » de la fiche, après sa fenêtre.
 *
 * Les mêmes que pour clôturer : **administrateur, Vénérable Maître et
 * Secrétaire**, chacun dans sa loge, l'administrateur partout.
 * `rouvrir_un_dossier()` tranche tout : le titre, la loge, et refuse un
 * dossier en cours ou archivé. Aucune clé de service.
 *
 * On revient à l'écran Candidats tel qu'on l'avait laissé ; toute autre
 * adresse reçue ramène à la liste.
 */

const LISTE = '/espace/candidats';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[candidats/rouvrir] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, id: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);
  const retour = demande && (demande === LISTE || demande.startsWith(`${LISTE}?`)) ? demande : LISTE;

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(retour, origine(requete));
      if (code) vers.searchParams.set('reouverture', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) {
    return repondre('introuvable', 'Ce dossier n’existe plus.', 404);
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('rouvrir_un_dossier', { cible: id });
  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Ce compte ne peut pas rouvrir de dossier.', 403);
    }
    console.error('[candidats/rouvrir] réouverture refusée', error.code);
    return repondre('echec', 'Le dossier n’a pas pu être rouvert.');
  }

  if (data === 'pas-cloture') {
    return repondre('pas-cloture', 'Seul un dossier clôturé, et pas archivé, se rouvre.', 409);
  }
  if (data !== 'rouvert') return repondre('introuvable', 'Ce dossier n’existe plus.', 404);

  return repondre(null, null);
}
