import { NextResponse } from 'next/server';
import { ReglageDuSecteurBubble, lireSecteursBubble } from '@/lib/secteurs-bubble';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Paramètres › Secteurs d'activité : valider, changer, ou « aucun ne
 * convient » pour un secteur Bubble. La correspondance s'applique aussitôt aux
 * fiches (0093) ; la route rend la liste à jour.
 *
 * La session d'abord, puis le droit : l'administration seulement. La base le
 * redit (`regler_un_secteur_bubble` refuse toute autre session).
 */
export async function PATCH(requete: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const { data: admin } = await supabase.rpc('est_admin');
    if (admin !== true) {
      return NextResponse.json({ erreur: 'Les secteurs repris de Bubble se règlent par l’administration.' }, { status: 403 });
    }

    const corps = ReglageDuSecteurBubble.safeParse(await requete.json().catch(() => null));
    if (!corps.success) {
      return NextResponse.json({ erreur: corps.error.issues[0]?.message ?? 'Demande incomplète.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('regler_un_secteur_bubble', {
      la_source: corps.data.source,
      la_valeur: corps.data.valeur,
      le_code: corps.data.code,
    });
    if (error) {
      switch (error.code) {
        case '42501':
          return NextResponse.json({ erreur: 'Les secteurs repris de Bubble se règlent par l’administration.' }, { status: 403 });
        case 'P0002':
          return NextResponse.json({ erreur: 'Aucune fiche ne porte plus ce secteur Bubble. Rechargez la page.' }, { status: 404 });
        case '23514':
          return NextResponse.json({ erreur: 'Choisissez un grand secteur ou une division.' }, { status: 400 });
        case '23503':
          return NextResponse.json({ erreur: 'Ce secteur n’existe pas dans la nomenclature.' }, { status: 400 });
        default:
          console.error('[secteurs-bubble] réglage', error.code);
          return NextResponse.json({ erreur: 'L’enregistrement a échoué. Réessayez.' }, { status: 503 });
      }
    }
    return NextResponse.json({ lignes: lireSecteursBubble(data) });
  } catch (souci) {
    console.error('[secteurs-bubble] réglage : échec inattendu', souci);
    return NextResponse.json({ erreur: 'L’enregistrement a échoué. Réessayez.' }, { status: 503 });
  }
}
