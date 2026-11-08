import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Supprimer un candidat. **Administrateur, Vénérable Maître et Secrétaire**,
 * chacun dans sa loge — l'administrateur dans toutes.
 *
 * Une route à part, et non un verbe `DELETE` sur la fiche : un formulaire HTML
 * ne sait envoyer qu'un `POST`, et la corbeille doit marcher avant que la
 * moindre ligne de script ne soit chargée.
 *
 * L'ordre du projet, et il compte doublement puisque les fichiers sont dans un
 * seau que `service_role` ouvre en grand :
 *
 *   1. la session ;
 *   2. le droit et la suppression, d'un seul geste : `supprimer_un_candidat`
 *      (migration 0062) refuse à qui n'a pas le titre, hors de sa loge, sur un
 *      dossier repris de Bubble et sur un dossier qui a un compte ;
 *   3. alors seulement `supabaseAdmin()`, pour retirer du seau les fichiers
 *      dont la base vient de rendre les chemins.
 *
 * Les fichiers partent après la fiche, et non avant : si le seau ne répond
 * pas, il reste un fichier sans fiche — que personne ne peut plus atteindre,
 * et que le journal signale —, plutôt qu'une fiche sans ses fichiers.
 */

/** Ce que la base répond, traduit en code pour l'écran. */
const ISSUES: Record<string, { code: string; message: string; statut: number }> = {
  introuvable: { code: 'introuvable', message: 'Ce dossier n’existe plus.', statut: 404 },
  bubble: {
    code: 'bubble',
    message: 'Ce dossier vient de Bubble : il ne se supprime pas, la reprise finale le ferait revenir.',
    statut: 409,
  },
  compte: {
    code: 'compte',
    message: 'Ce candidat a un compte de connexion : son dossier ne peut pas être supprimé ici.',
    statut: 409,
  },
};

const RETOUR = '/espace/candidats';

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, params);
  } catch (souci) {
    console.error('[candidats] suppression : échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, params: Promise<{ id: string }>) {
  const { id } = await params;
  const natif = vientDUnFormulaire(requete);
  const champs = natif ? await requete.formData().catch(() => null) : null;

  // On revient à la liste telle qu'on l'avait laissée — même vue, même
  // recherche. L'adresse vient du formulaire : on n'accepte que la liste
  // elle-même, sans quoi un lien fabriqué choisirait où l'on atterrit.
  const demande = destinationInterne(champs?.get('retour'));
  const retour =
    demande && (demande === RETOUR || demande.startsWith(`${RETOUR}?`)) ? demande : RETOUR;

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(retour, origine(requete));
      if (code) vers.searchParams.set('suppression', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) {
    return repondre('introuvable', 'Ce dossier n’existe plus.', 404);
  }

  // 1. La session.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  // 2. Le droit et la suppression : la base tranche, et elle seule.
  const { data, error } = await supabase.rpc('supprimer_un_candidat', { cible: id });

  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Ce compte ne peut pas supprimer de candidat.', 403);
    }
    console.error('[candidats] suppression refusée', error.code);
    return repondre('echec', 'Le dossier n’a pas pu être supprimé.', 400);
  }

  const resultat = (data as { issue: string; fichiers: string[] | null }[] | null)?.[0];

  if (resultat?.issue !== 'supprime') {
    const issue = ISSUES[resultat?.issue ?? ''] ?? ISSUES.introuvable;
    return repondre(issue.code, issue.message, issue.statut);
  }

  // 3. Le seau, enfin. Un CV ou une photo qui resteraient dans le stockage
  //    après qu'on a supprimé le dossier ne seraient pas un oubli de ménage :
  //    ce sont des données personnelles, et elles ne restent pas « au cas où ».
  const fichiers = resultat.fichiers ?? [];
  if (fichiers.length > 0) {
    const { error: souciMenage } = await supabaseAdmin().storage.from('documents').remove(fichiers);
    // Les chemins ne sont pas journalisés : ils portent l'identifiant du
    // dossier, qu'il n'y a pas lieu de semer dans les journaux.
    if (souciMenage) console.error('[candidats] fichiers non effacés', fichiers.length);
  }

  return repondre(null, null);
}
