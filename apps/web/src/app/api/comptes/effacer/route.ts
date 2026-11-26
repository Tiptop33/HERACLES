import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Effacer un compte : la personne ne peut plus se connecter. **Réservé aux
 * administrateurs.**
 *
 * Une route à part, en `POST`, comme pour supprimer une invitation : la fenêtre
 * de confirmation est un formulaire HTML, qui doit marcher avant que la moindre
 * ligne de script ne soit chargée.
 *
 * Même ordre que partout : la session, le droit métier, puis seulement la clé
 * service_role. `preparer_effacement_compte` (migration 0113) refait le
 * contrôle d'administrateur, porte les refus — son propre compte, le compte
 * d'un candidat, le référent qui accompagne encore — et retire les invitations
 * acceptées du compte. Le compte lui-même part ensuite par l'API
 * d'authentification ; son profil suit, sa fiche référent reste.
 */

const Effacement = z.object({
  id: z.uuid("Ce compte n'est pas reconnu."),
});

/** Les codes que l'écran Admin › Comptes sait traduire. */
type Refus = 'absent' | 'droit' | 'session' | 'soi' | 'accompagne' | 'candidat' | 'echec';

/** Ce que la base répond, traduit pour la personne qui a cliqué. */
function refusDeLaBase(code: string | undefined): { refus: Refus; erreur: string; statut: number } {
  switch (code) {
    case 'P0002':
      return { refus: 'absent', erreur: "Ce compte n'existe plus.", statut: 404 };
    case '42501':
      return { refus: 'droit', erreur: 'Seul un administrateur peut effacer un compte.', statut: 403 };
    case '23514':
      return { refus: 'soi', erreur: 'Vous ne pouvez pas effacer votre propre compte.', statut: 409 };
    case '23001':
      return {
        refus: 'accompagne',
        erreur:
          'Ce compte accompagne encore des candidats : confiez-les à quelqu’un d’autre avant de l’effacer.',
        statut: 409,
      };
    case '22023':
      return {
        refus: 'candidat',
        erreur: 'Le compte d’un candidat ne s’efface pas ici.',
        statut: 409,
      };
    default:
      return { refus: 'echec', erreur: "Le compte n'a pas pu être effacé.", statut: 400 };
  }
}

export async function POST(requete: Request) {
  try {
    return await effacer(requete);
  } catch (souci) {
    console.error('[comptes] échec inattendu de l’effacement', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function effacer(requete: Request) {
  const natif = vientDUnFormulaire(requete);

  // Le formulaire natif revient à la liste ; le message s'affiche là-bas.
  const repondre = (code: Refus | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL('/espace/admin/comptes', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  const lu = Effacement.safeParse(await lireCorps(requete));
  if (!lu.success) return repondre('absent', "Ce compte n'existe plus.", 404);

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  // 2. Le droit métier. La RLS ne laisse lire que son propre profil.
  const { data: profil } = await supabase.from('profil').select('role').single();
  if (profil?.role !== 'admin') {
    return repondre('droit', 'Seul un administrateur peut effacer un compte.', 403);
  }

  // 3. Alors seulement la clé qui contourne la RLS : les contrôles de la base
  //    d'abord, le retrait du compte ensuite.
  const admin = supabaseAdmin();
  const { error: souci } = await admin.rpc('preparer_effacement_compte', {
    emetteur: user.id,
    cible: lu.data.id,
  });
  if (souci) {
    const refus = refusDeLaBase(souci.code);
    if (refus.refus === 'echec') console.error('[comptes] effacement refusé', souci);
    return repondre(refus.refus, refus.erreur, refus.statut);
  }

  const { error: souciRetrait } = await admin.auth.admin.deleteUser(lu.data.id);
  if (souciRetrait) {
    // Jamais l'adresse au journal : l'identifiant suffit à retrouver le compte.
    console.error('[comptes] compte non retiré', lu.data.id, souciRetrait.status);
    return repondre('echec', "Le compte n'a pas pu être effacé.", 502);
  }

  return repondre(null, null);
}
