import { NextResponse } from 'next/server';
import { formatDImage, typeDeFichier } from '@/lib/fichiers';
import { TAILLE_MAXIMALE_DE_LA_PHOTO, cheminDeLaPhoto } from '@/lib/page-candidat';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exigerMonDossier, refus, refusDeLaBase } from '../commun';

/**
 * La photo de sa fiche (0105) : celle que son référent voit déjà dans la liste
 * et en tête de la fiche (0019, 0066). La voir, la poser, la retirer.
 */

export async function GET() {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const { data: chemin } = await session.supabase.rpc('chemin_de_ma_photo');
  if (typeof chemin !== 'string') return refus(404, 'Pas de photo.');

  const { data, error } = await supabaseAdmin().storage.from('documents').download(chemin);
  if (error || !data) return refus(404, 'Photo indisponible.');

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(chemin, data.type),
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const champs = await requete.formData().catch(() => null);
  const photo = champs?.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return refus(400, 'Choisissez une photo.', 'photo');
  if (photo.size > TAILLE_MAXIMALE_DE_LA_PHOTO) return refus(413, 'La photo dépasse 2 Mo.', 'photo');

  const octets = new Uint8Array(await photo.arrayBuffer());
  const format = formatDImage(octets);
  if (format !== 'jpg' && format !== 'png' && format !== 'webp') {
    return refus(415, 'Cette photo n’est pas reconnue : JPEG, PNG ou WebP.', 'photo');
  }

  const chemin = cheminDeLaPhoto(session.dossier, format);
  const stockage = supabaseAdmin().storage.from('documents');
  const { error: refusDuSeau } = await stockage.upload(chemin, octets, {
    contentType: typeDeFichier(chemin),
    upsert: true,
  });
  if (refusDuSeau) {
    console.error('[page-candidat] photo refusée par le seau');
    return refus(502, 'Le dépôt a échoué. Réessayez.', 'photo');
  }

  const { data: ancien, error } = await session.supabase.rpc('poser_la_photo_de_ma_fiche', { le_chemin: chemin });
  if (error) return refusDeLaBase(error.code, 'photo refusée', 'photo');

  // Une photo JPEG remplacée par une PNG : l'ancienne ne reste pas dans le seau.
  if (typeof ancien === 'string' && ancien !== chemin) await stockage.remove([ancien]).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const { data: ancien, error } = await session.supabase.rpc('retirer_la_photo_de_ma_fiche');
  if (error) return refusDeLaBase(error.code, 'retrait de photo refusé', 'photo');
  if (typeof ancien === 'string') {
    await supabaseAdmin().storage.from('documents').remove([ancien]).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
