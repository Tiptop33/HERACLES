import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Corriger une ligne de suivi : son texte, sa nature, son jour.
 *
 * Rien n'est vérifié ici sur le droit : `modifier_le_suivi()` (migration 0025)
 * n'agit que si l'appelant a le droit de voir la fiche du candidat, laisse son
 * nom dans `modifie_par`, et ne touche ni à l'auteur d'origine ni au candidat.
 * Elle rend `false` quand la ligne est hors de portée — ou déjà retirée.
 */

const Formulaire = z.object({
  texte: z
    .string()
    .trim()
    .min(1, 'Une note vide ne dit rien.')
    .max(4000, 'Cette note est trop longue.'),
  nature: z.string().trim().max(120, 'Cette nature est trop longue.').optional(),
  fait_le: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Cette date ne se lit pas.')
    .optional()
    .or(z.literal('')),
  retour: z.string().optional(),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[suivi/modifier] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, ligne: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/candidats', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!/^[0-9a-f-]{36}$/i.test(ligne)) {
    return repondre('introuvable', 'Cette note n’existe pas.', 404);
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

  const { data, error } = await supabase.rpc('modifier_le_suivi', {
    ligne,
    nouveau_texte: lu.data.texte,
    nouvelle_nature: lu.data.nature?.trim() || null,
    nouveau_fait_le: lu.data.fait_le || null,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre(
        'sans-fiche',
        'Votre compte n’est rattaché à aucune fiche de référent.',
        403,
      );
    }
    // 23514 : la fonction refuse un texte vide ou démesuré. `zod` l'a déjà
    // écarté ; ceci couvre un appel qui ne passerait pas par le formulaire.
    if (error.code === '23514') {
      return repondre('vide', 'Cette note ne peut pas être enregistrée telle quelle.');
    }
    console.error('[suivi/modifier] correction refusée', error);
    return repondre('echec', 'La note n’a pas pu être corrigée.');
  }

  if (data === false) {
    return repondre('introuvable', 'Cette note n’existe pas, ou elle ne vous est pas visible.', 404);
  }

  return repondre(null, null);
}
