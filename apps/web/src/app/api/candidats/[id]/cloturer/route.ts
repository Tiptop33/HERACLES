import { NextResponse } from 'next/server';
import { z } from 'zod';
import { estUnMotifDeCloture } from '@/lib/candidats-refermes';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Clôturer un dossier (migration 0071) — le bouton « Clôturer le dossier » de
 * la fiche, après sa fenêtre.
 *
 * **Administrateur, Vénérable Maître et Secrétaire**, chacun dans sa loge,
 * l'administrateur partout. `cloturer_un_dossier()` tranche tout : le titre,
 * la loge, le motif, et refuse un dossier déjà refermé. Aucune clé de
 * service.
 *
 * On revient à l'écran Candidats tel qu'on l'avait laissé ; toute autre
 * adresse reçue ramène à la liste.
 */

const LISTE = '/espace/candidats';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[candidats/cloturer] échec inattendu', souci);
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
      if (code) vers.searchParams.set('cloture', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) {
    return repondre('introuvable', 'Ce dossier n’existe plus.', 404);
  }

  const par = corps?.par;
  if (!estUnMotifDeCloture(par)) {
    return repondre('motif', 'Dites qui a refermé le dossier : Lui-même, Heraclés ou Autre.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('cloturer_un_dossier', { cible: id, par });
  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Ce compte ne peut pas clôturer de dossier.', 403);
    }
    if (error.code === '22023') {
      return repondre('motif', 'Dites qui a refermé le dossier : Lui-même, Heraclés ou Autre.');
    }
    console.error('[candidats/cloturer] clôture refusée', error.code);
    return repondre('echec', 'Le dossier n’a pas pu être clôturé.');
  }

  if (data === 'deja') return repondre('deja', 'Ce dossier est déjà clôturé ou archivé.', 409);
  if (data !== 'cloture') return repondre('introuvable', 'Ce dossier n’existe plus.', 404);

  return repondre(null, null);
}
