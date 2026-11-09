import { NextResponse } from 'next/server';
import { enPdf, titreDeLAffichette } from '@/lib/documents/archives';
import { archiverLeDocument } from '@/lib/documents/archiver';
import { donneesDeLAffichette } from '@/lib/documents/donnees';
import { produireLAffichette } from '@/lib/documents/produire';
import { enTeteDeTelechargement } from '@/lib/fichiers';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { lireFiche } from '@/lib/poste';
import { lireLAffichette, lireUneReunion } from '@/lib/reunion';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * L'affichette de la réunion : le dossier du mois, choisi en séance.
 *
 *   · `POST` — choisir le dossier, ou n'en choisir aucun. Toute la loge le
 *     peut, comme l'appel ; `choisir_l_affichette()` (migration 0068) n'accepte
 *     qu'un dossier en cours de la loge de la réunion ;
 *   · `GET` — produire l'affichette du dossier choisi, nommée du numéro et du
 *     jour où on la tire — « 856 du 09-11-2026 » —, et en ranger un exemplaire
 *     (migration 0069). Tirée deux fois le même jour, elle remplace le sien.
 *
 * La porte est celle des réunions (`ma_loge()`), puis celle de la fiche
 * (`fiche_candidat()`) pour lire le dossier. La clé de service ne sert qu'à
 * déposer l'exemplaire dans le seau, une fois les deux portes passées.
 */

export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await choisir(requete, (await params).id);
  } catch (souci) {
    console.error('[reunion/affichette] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function choisir(requete: Request, reunion: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? `/espace/reunion?appel=${reunion}`, origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code ? NextResponse.json({ erreur: message }, { status: statut }) : NextResponse.json({ ok: true });
  };

  if (!UUID.test(reunion)) return repondre('introuvable', 'Cette réunion n’existe pas.', 404);

  // Vide : « aucun dossier ». Sinon un identifiant, et rien d'autre.
  const brut = typeof corps?.candidat === 'string' ? corps.candidat.trim() : '';
  if (brut !== '' && !UUID.test(brut)) {
    return repondre('dossier', 'Ce dossier ne peut pas être choisi pour l’affichette.');
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('choisir_l_affichette', {
    reunion_choisie: reunion,
    candidat_choisi: brut === '' ? null : brut,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    console.error('[reunion/affichette] choix refusé', error);
    return repondre('echec', 'Le choix n’a pas pu être enregistré.');
  }
  if (data === 'reunion') return repondre('introuvable', 'Cette réunion n’est pas de votre loge.', 404);
  if (data === 'candidat') {
    return repondre('dossier', 'Ce dossier ne peut pas être choisi pour l’affichette : il est refermé, ou d’une autre loge.');
  }
  return repondre(null, null);
}

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Cette réunion n’existe pas.' }, { status: 404 });
  }

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const reunion = await lireUneReunion(id);
    if (!reunion) return NextResponse.json({ erreur: 'Cette réunion n’existe pas.' }, { status: 404 });

    const choix = await lireLAffichette(id);
    const fiche = choix ? await lireFiche(choix.candidat_id) : null;
    if (!choix || !fiche) {
      return NextResponse.json(
        { erreur: 'Aucun dossier n’est encore choisi pour l’affichette de cette réunion.' },
        { status: 404 },
      );
    }

    const octets = await produireLAffichette(await donneesDeLAffichette(choix.candidat_id, fiche, origine(requete)));
    const titre = titreDeLAffichette(fiche.numero);

    // La réunion et le dossier sont vérifiés : l'exemplaire peut se ranger.
    await archiverLeDocument({
      reunion: reunion.id,
      sorte: 'affichette',
      titre,
      octets,
      candidat: choix.candidat_id,
    });

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': enTeteDeTelechargement(enPdf(titre), 'inline'),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    console.error('[reunion/affichette] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'L’affichette n’a pas pu être produite. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
