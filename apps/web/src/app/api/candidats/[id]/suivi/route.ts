import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  destinationInterne,
  lireCorps,
  origine,
  vientDUnFormulaire,
} from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Écrire une ligne dans le journal d'un candidat.
 *
 * Rien n'est vérifié ici sur le droit : la policy `suivi_ecriture_accompagnes`
 * (migration 0021) ne laisse écrire que le référent et le parrain du candidat,
 * et exige que l'auteur déclaré soit soi. L'insertion échoue d'elle-même
 * autrement. Cette route ne fait que traduire son refus en une phrase
 * française — et poser l'auteur, que le formulaire n'a pas à porter : un
 * champ caché « qui écrit » se réécrit dans le navigateur.
 */

const Formulaire = z.object({
  texte: z
    .string()
    .trim()
    .min(1, 'Une note vide ne dit rien.')
    .max(4000, 'Cette note est trop longue.'),
  nature: z.string().trim().max(120, 'Cette nature est trop longue.').optional(),
  // Vide : une note, ce qui a eu lieu. Rempli : une tâche, ce qui reste à
  // faire. Le formulaire n'envoie que `A_FAIRE`, mais la valeur est validée
  // ici comme le reste — un champ caché se réécrit dans le navigateur.
  etat: z.string().trim().max(120, 'Cet état est trop long.').optional(),
  // D'où l'on écrit : la fiche, ou la liste « Action / Candidat ». On y
  // revient après coup, plutôt que de renvoyer tout le monde dans la fiche.
  retour: z.string().optional(),
  // Vide, c'est aujourd'hui. La base a le même défaut ; on ne le recopie ici
  // que pour laisser antidater — on note le lundi l'appel du vendredi.
  fait_le: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Cette date ne se lit pas.')
    .optional()
    .or(z.literal('')),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[suivi] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, candidat: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);

  // Où renvoyer après coup. `destinationInterne` écarte `//ailleurs.example` :
  // sans ce contrôle, un formulaire fabriqué déposerait la personne hors du
  // site juste après qu'elle a écrit dans un dossier.
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = demande
        ? new URL(demande, origine(requete))
        : (() => {
            const fiche = new URL('/espace/candidats', origine(requete));
            fiche.searchParams.set('fiche', candidat);
            fiche.searchParams.set('onglet', 'suivi');
            return fiche;
          })();
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!/^[0-9a-f-]{36}$/i.test(candidat)) {
    return repondre('introuvable', 'Ce candidat n’existe pas.', 404);
  }

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) {
    return repondre('vide', lu.error.issues[0]?.message ?? 'Note invalide.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  // La fiche de référent de la personne connectée. C'est elle qui signe — et
  // la policy vérifiera que c'est bien la sienne.
  const { data: moi } = await supabase
    .from('referent')
    .select('id')
    .eq('profil_id', user.id)
    .maybeSingle();

  if (!moi) {
    return repondre(
      'sans-fiche',
      'Votre compte n’est rattaché à aucune fiche de référent.',
      403,
    );
  }

  const { error } = await supabase.from('suivi').insert({
    candidat_id: candidat,
    auteur_id: moi.id,
    texte: lu.data.texte,
    nature: lu.data.nature?.trim() || null,
    etat: lu.data.etat?.trim() || null,
    ...(lu.data.fait_le ? { fait_le: lu.data.fait_le } : {}),
  });

  if (error) {
    // 42501 : la policy. On n'accompagne pas ce candidat.
    if (error.code === '42501') {
      return repondre(
        'droit',
        'Seuls le référent et le parrain de ce candidat écrivent dans son journal.',
        403,
      );
    }
    // 23503 : la clé étrangère. Le candidat n'existe pas.
    if (error.code === '23503') {
      return repondre('introuvable', 'Ce candidat n’existe pas.', 404);
    }
    console.error('[suivi] insertion refusée', error);
    return repondre('echec', "La note n'a pas pu être enregistrée.");
  }

  return repondre(null, null);
}
