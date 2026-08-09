import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Retirer une réunion du registre, ou l'y rendre.
 *
 * **Retirer n'est pas effacer**, comme pour les notes de suivi (0025) : la
 * réunion quitte le registre, ses lignes d'appel restent en base, et le geste
 * se défait. Quinze pointages disparaissent d'un clic — c'est exactement
 * celui qu'on veut pouvoir reprendre.
 */

const Formulaire = z.object({
  geste: z.enum(['retirer', 'rendre'], { message: 'Ce geste n’existe pas.' }),
  retour: z.string().optional(),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[reunion/retirer] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, reunion: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/reunion', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!/^[0-9a-f-]{36}$/i.test(reunion)) {
    return repondre('introuvable', 'Cette réunion n’existe pas.', 404);
  }

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) return repondre('echec', lu.error.issues[0]?.message ?? 'Geste invalide.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc(
    lu.data.geste === 'retirer' ? 'retirer_une_reunion' : 'rendre_une_reunion',
    { reunion_choisie: reunion },
  );

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    console.error('[reunion/retirer] geste refusé', error);
    return repondre('echec', 'La réunion n’a pas pu être mise à jour.');
  }

  if (data === false) {
    return repondre('introuvable', 'Cette réunion n’est pas de votre loge.', 404);
  }

  return repondre(null, null);
}
