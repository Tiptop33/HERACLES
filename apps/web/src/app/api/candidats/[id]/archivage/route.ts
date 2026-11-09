import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Trancher l'archivage d'un dossier clôturé depuis plus de deux mois
 * (migration 0071) — les deux boutons de la fenêtre de l'accueil :
 *
 *   · `archiver`   — le dossier est archivé, daté du jour ;
 *   · `pas-encore` — la question revient dans un mois.
 *
 * **Le Vénérable Maître et le Secrétaire seuls**, dans leur loge :
 * `trancher_l_archivage()` le vérifie. Aucune clé de service. On revient
 * toujours à l'accueil, où la fenêtre montre les dossiers qui restent.
 */

const ACCUEIL = '/espace/accueil';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[candidats/archivage] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, id: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(ACCUEIL, origine(requete));
      if (code) vers.searchParams.set('archivage', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) {
    return repondre('introuvable', 'Ce dossier n’est plus à trancher.', 404);
  }

  const decision = corps?.decision;
  if (decision !== 'archiver' && decision !== 'pas-encore') {
    return repondre('echec', 'Archiver, ou pas encore : il faut choisir.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('trancher_l_archivage', {
    cible: id,
    archiver: decision === 'archiver',
  });
  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Seuls le Vénérable Maître et le Secrétaire tranchent l’archivage.', 403);
    }
    console.error('[candidats/archivage] décision refusée', error.code);
    return repondre('echec', 'La décision n’a pas pu être enregistrée.');
  }
  if (data !== 'archive' && data !== 'reporte') {
    return repondre('introuvable', 'Ce dossier n’est plus à trancher.', 404);
  }

  return repondre(null, null);
}
