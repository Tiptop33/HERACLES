import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  estUneCopieFigee,
  figerLeCvAnonyme,
  figerSousLaSession,
  lireLaCopieFigee,
} from '@/lib/documents/copie-figee';
import { donneesDuCvAnonyme, nomDuCvAnonyme } from '@/lib/documents/cv-anonyme';
import { lireLEtatDuCvAnonyme } from '@/lib/documents/donnees';
import { produireLeCvAnonyme } from '@/lib/documents/produire';
import { enTeteDeTelechargement } from '@/lib/fichiers';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { lireFiche } from '@/lib/poste';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le CV anonyme qu'HERACLES produit d'une fiche (migration 0073).
 *
 * GET — « Voir le CV anonyme », sur le bandeau de la fiche : le PDF tel que le
 * lien public le servira. Le droit est celui de voir la fiche
 * (`fiche_candidat()`), comme pour l'affichette. Le CV ne reprend de la fiche
 * que les champs nommés dans `donneesDuCvAnonyme()` : jamais le nom. Validé,
 * c'est la copie figée à la validation (0075) ; sinon, ou si elle manque, le
 * PDF se produit à la volée — et, validé, il est alors rangé (0076).
 *
 * POST — « Valider » ou « Retirer la validation ». `valider_cv_anonyme()`
 * tranche : tout référent de la loge du candidat valide (0074), et la base le
 * vérifie quel que soit ce que l'écran a montré. Validé, le PDF est aussitôt
 * figé dans le seau (`figerLeCvAnonyme()`) : la clé de service n'y sert
 * qu'après les deux vérifications de la base, au chemin qu'elle a donné.
 */

export const runtime = 'nodejs';

const LISTE = '/espace/candidats';

const JOUR = () => new Date().toISOString().slice(0, 10);

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ erreur: 'Ce dossier n’existe pas.' }, { status: 404 });
  }

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const fiche = await lireFiche(id);
    if (!fiche) return NextResponse.json({ erreur: 'Ce dossier n’existe pas.' }, { status: 404 });

    const pdf = (octets: BodyInit) =>
      new NextResponse(octets, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': enTeteDeTelechargement(nomDuCvAnonyme(fiche.numero), 'inline'),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });

    // Validé et figé : la copie de cette validation, celle que le lien public
    // sert. La base a vérifié qu'on voit la fiche avant de rendre le chemin.
    const { data: copie, error: souciCopie } = await supabase.rpc('copie_figee_du_cv_anonyme', {
      candidat_choisi: id,
    });
    if (souciCopie) console.error('[cv-anonyme] copie figée introuvable', souciCopie.code);
    if (estUneCopieFigee(copie, id)) {
      const octets = await lireLaCopieFigee(copie);
      if (octets) return pdf(octets);
    }

    // Sinon, produit à la volée. Validé, le CV porte la date de sa validation,
    // comme sur le lien public ; sinon celle du jour.
    const etat = await lireLEtatDuCvAnonyme(id);
    const octets = await produireLeCvAnonyme(donneesDuCvAnonyme(fiche, etat?.valide_le ?? JOUR()));

    // Validé sans copie — par HERACLES (0076), qui n'a pas de clic pour la
    // ranger, ou avant 0075 : un référent de la loge qui l'ouvre la range. La
    // base ne fige que si la validation n'a pas bougé depuis la lecture.
    if (etat?.valide_le && etat.peut_valider) await figerSousLaSession(id, etat.valide_le, octets);

    return pdf(octets as unknown as BodyInit);
  } catch (souci) {
    console.error('[cv-anonyme] aperçu impossible', souci);
    return NextResponse.json(
      { erreur: 'Le CV anonyme n’a pas pu être produit. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

const Demande = z.object({
  valider: z.enum(['oui', 'non'], { error: 'Dites s’il faut valider ou retirer la validation.' }),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await valider(requete, (await params).id);
  } catch (souci) {
    console.error('[cv-anonyme] validation impossible', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function valider(requete: Request, id: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);
  const retour = demande && (demande === LISTE || demande.startsWith(`${LISTE}?`)) ? demande : LISTE;

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(retour, origine(requete));
      if (code) vers.searchParams.set('cvanonyme', code);
      return NextResponse.redirect(vers, 303);
    }
    return code ? NextResponse.json({ erreur: message }, { status: statut }) : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) {
    return repondre('introuvable', 'Ce dossier n’existe plus.', 404);
  }

  const lu = Demande.safeParse({ valider: corps?.valider });
  if (!lu.success) return repondre('echec', lu.error.issues[0]?.message ?? 'Demande incomplète.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('valider_cv_anonyme', { cible: id, valider: lu.data.valider === 'oui' });
  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Seuls les référents de la loge du candidat valident son CV anonyme.', 403);
    }
    console.error('[cv-anonyme] validation refusée', error.code);
    return repondre('echec', 'Le CV anonyme n’a pas pu être validé.');
  }

  if (data === 'ferme') return repondre('ferme', 'Le dossier est refermé : son CV anonyme ne circule plus.', 409);
  if (data === 'incomplet') {
    return repondre('incomplet', 'La fiche ne dit pas l’emploi recherché : le CV n’aurait pas de titre.', 409);
  }
  if (data !== 'valide' && data !== 'retire') return repondre('echec', 'Le CV anonyme n’a pas pu être validé.');

  // Ce qui vient d'être relu est rangé tel quel. Un échec ne défait pas la
  // validation : le PDF se produira à la volée, et le journal le dit.
  if (data === 'valide') await figerLeCvAnonyme(id);

  return repondre(null, null);
}
