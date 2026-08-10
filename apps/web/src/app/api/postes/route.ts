import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Noter un poste à pourvoir.
 *
 * Ce qu'on remonte à la commission : un Frère dont l'entreprise recrute, une
 * connaissance qui cherche quelqu'un. L'affiche le publie en regard des
 * dossiers en recherche.
 *
 * `noter_un_poste()` (migration 0057) porte les deux règles : le poste entre
 * dans **ma** loge, et il lui faut un intitulé — l'affiche imprimerait sinon
 * une ligne vide, et personne ne saurait ce qu'on lui propose.
 *
 * Le reste est facultatif à dessein : un poste se remonte souvent avant d'être
 * complet, et une saisie qui exige tout est une saisie qu'on remet à plus tard.
 */

const Formulaire = z.object({
  intitule: z.string().trim().min(1, 'Un poste à pourvoir a besoin d’un intitulé.')
    .max(300, 'Cet intitulé est trop long.'),
  societe: z.string().trim().max(200).optional(),
  ville: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  retour: z.string().optional(),
});

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[postes] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne((corps as { retour?: string } | null)?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/reunion', origine(requete));
      if (code) vers.searchParams.set('erreur_poste', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) {
    const souci = lu.error.issues[0];
    const code = souci?.code === 'too_big' ? 'long' : 'intitule';
    return repondre(code, souci?.message ?? 'Ce poste ne se lit pas.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { error } = await supabase.rpc('noter_un_poste', {
    le_poste: lu.data.intitule,
    la_societe: lu.data.societe || null,
    la_ville: lu.data.ville || null,
    le_contact: lu.data.contact || null,
    l_email: lu.data.email || null,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    // La base refuse aussi l'intitulé vide : elle est la dernière à décider,
    // et `zod` n'est là que pour répondre plus tôt et plus clairement.
    if (error.code === '23514' || error.message?.includes('intitulé')) {
      return repondre('intitule', 'Un poste à pourvoir a besoin d’un intitulé.');
    }
    console.error('[postes] enregistrement refusé', error);
    return repondre('echec', 'Le poste n’a pas pu être enregistré.');
  }

  return repondre(null, null);
}
