import { NextResponse } from 'next/server';
import { anciennesLettres, formatAccepte } from '@/lib/espace-candidat';
import { lireMaFiche } from '@/lib/espace-candidat-serveur';
import { formatDeDocument, typeDeFichier } from '@/lib/fichiers';
import { TAILLE_MAXIMALE_DOCUMENT, cheminDuDocument } from '@/lib/parrainage';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le candidat dépose son CV, ou sa lettre de motivation.
 *
 *   1. la session, puis la fiche dont il est titulaire (`ma_fiche()`) : c'est
 *      elle qui donne le chemin, jamais le navigateur ;
 *   2. le fichier : sa taille, et son format lu dans ses octets — le CV est
 *      un PDF ;
 *   3. le seau privé, sous la clé service_role, puisque le candidat n'y écrit
 *      pas lui-même — et seulement après 1 et 2 ;
 *   4. la base rattache le chemin par la session du candidat
 *      (`ranger_mon_document`), et refuse tout autre chemin que celui de SON
 *      dossier. Si elle refuse, le fichier déposé repart.
 */
export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[ma-fiche/document] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  // 1. La session, la fiche.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erreur: 'Session expirée. Reconnectez-vous.' }, { status: 401 });
  }

  const fiche = await lireMaFiche();
  if (!fiche) {
    return NextResponse.json({ erreur: 'Aucune fiche n’est rattachée à ce compte.' }, { status: 403 });
  }

  // 2. Le fichier.
  const champs = await requete.formData().catch(() => null);
  const genre = champs?.get('genre');
  if (genre !== 'cv' && genre !== 'lettre') {
    return NextResponse.json({ erreur: 'Document inconnu.' }, { status: 400 });
  }

  const fichier = champs?.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json(
      { erreur: genre === 'cv' ? 'Choisissez votre CV.' : 'Choisissez votre lettre.' },
      { status: 400 },
    );
  }
  if (fichier.size > TAILLE_MAXIMALE_DOCUMENT) {
    return NextResponse.json({ erreur: 'Ce fichier dépasse 10 Mo.' }, { status: 413 });
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const format = formatDeDocument(octets);
  if (!formatAccepte(genre, format)) {
    return NextResponse.json(
      {
        erreur:
          genre === 'cv'
            ? 'Votre CV doit être un fichier PDF.'
            : 'Ce fichier n’est pas reconnu : PDF, Word, OpenDocument, RTF, JPEG, PNG ou WebP.',
      },
      { status: 415 },
    );
  }

  // 3. Le seau.
  const chemin = cheminDuDocument(genre, fiche.id, format!);
  const stockage = supabaseAdmin().storage.from('documents');
  const { error: souciDepot } = await stockage.upload(chemin, octets, {
    contentType: typeDeFichier(chemin),
    upsert: true,
  });
  if (souciDepot) {
    console.error('[ma-fiche/document] dépôt refusé', genre);
    return NextResponse.json({ erreur: 'Le dépôt a échoué. Réessayez.' }, { status: 502 });
  }

  // 4. La base tranche, par la session du candidat.
  const { error } = await supabase.rpc('ranger_mon_document', { genre, chemin });
  if (error) {
    await stockage.remove([chemin]).catch(() => undefined);
    console.error('[ma-fiche/document] rattachement refusé', error.code);
    return NextResponse.json({ erreur: 'Le document n’a pas pu être enregistré.' }, { status: 400 });
  }

  // Une lettre qui change de format laisserait l'ancienne dans le seau, sans
  // que plus rien n'y mène : on ne garde pas un document personnel orphelin.
  if (genre === 'lettre') {
    await stockage.remove(anciennesLettres(fiche.id, format!)).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
