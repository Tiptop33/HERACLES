import { NextResponse } from 'next/server';
import { champ, type DocumentCle } from '@/lib/documents/gabarits';
import { imageDOrigine } from '@/lib/documents/moteur';
import { formatDImage } from '@/lib/fichiers';
import { indisponible, ouvrir } from '../acces';

/**
 * Les images de la mise en page : voir celle qui sert, en déposer une autre,
 * revenir à l'emblème d'origine.
 *
 * Un emplacement se désigne par la clé du gabarit (`entete.logo_gauche`) : on
 * n'accepte que celles qui y sont déclarées comme images.
 *
 * Le format se lit dans les octets, jamais dans le nom du fichier : PNG ou
 * JPEG, les deux qu'un PDF sait embarquer. Deux mégaoctets au plus — un
 * emblème, pas une photographie en pleine résolution.
 */

const TAILLE_MAXIMALE = 2 * 1024 * 1024;

export const runtime = 'nodejs';

function emplacement(document: DocumentCle, cle: unknown): { cle: string; fichier: string } | null {
  if (typeof cle !== 'string' || !/^[a-z0-9_.]{1,80}$/.test(cle)) return null;
  const c = champ(document, `${cle}.image`);
  return c?.genre === 'image' && c.fichier ? { cle, fichier: c.fichier } : null;
}

/** L'image qui sert aujourd'hui à cet emplacement — la vignette de l'écran. */
export async function GET(requete: Request, { params }: { params: Promise<{ document: string }> }) {
  try {
    const acces = await ouvrir((await params).document);
    if (!acces.ok) return acces.reponse;
    const { document, supabase } = acces;

    const ici = emplacement(document, new URL(requete.url).searchParams.get('cle'));
    if (!ici) return NextResponse.json({ erreur: 'Emplacement inconnu.' }, { status: 404 });

    const { data } = await supabase
      .from('mise_en_page_image')
      .select('type, donnees')
      .eq('document', document)
      .eq('cle', ici.cle)
      .maybeSingle();
    const deposee = data as { type: string; donnees: string } | null;

    const octets = deposee ? Buffer.from(deposee.donnees, 'base64') : imageDOrigine(ici.fichier);
    const type = deposee?.type ?? (ici.fichier.endsWith('.png') ? 'image/png' : 'image/jpeg');
    return new NextResponse(new Uint8Array(octets), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    return indisponible('lecture d’image', souci);
  }
}

/** Déposer une image à la place de l'emblème d'origine. */
export async function POST(requete: Request, { params }: { params: Promise<{ document: string }> }) {
  try {
    const acces = await ouvrir((await params).document);
    if (!acces.ok) return acces.reponse;
    const { document, supabase } = acces;

    const champs = await requete.formData().catch(() => null);
    const ici = emplacement(document, champs?.get('cle'));
    if (!ici) return NextResponse.json({ erreur: 'Emplacement inconnu.' }, { status: 400 });

    const fichier = champs?.get('fichier');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return NextResponse.json({ erreur: 'Choisissez une image.' }, { status: 400 });
    }
    if (fichier.size > TAILLE_MAXIMALE) {
      return NextResponse.json({ erreur: 'L’image dépasse deux mégaoctets.' }, { status: 400 });
    }

    const octets = new Uint8Array(await fichier.arrayBuffer());
    const format = formatDImage(octets);
    if (format !== 'png' && format !== 'jpg') {
      return NextResponse.json({ erreur: 'Seules les images PNG et JPEG entrent dans un PDF.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('deposer_une_image_de_mise_en_page', {
      document_choisi: document,
      cle_choisie: ici.cle,
      type_choisi: format === 'png' ? 'image/png' : 'image/jpeg',
      donnees_base64: Buffer.from(octets).toString('base64'),
    });
    if (error) return indisponible('dépôt refusé', error);

    const { error: reglage } = await supabase.rpc('regler_la_mise_en_page', {
      document_choisi: document,
      valeurs: { [`${ici.cle}.image`]: 'deposee' },
    });
    if (reglage) return indisponible('réglage de l’image refusé', reglage);

    return NextResponse.json({ ok: true });
  } catch (souci) {
    return indisponible('dépôt d’image', souci);
  }
}

/** Revenir à l'emblème d'origine. */
export async function DELETE(requete: Request, { params }: { params: Promise<{ document: string }> }) {
  try {
    const acces = await ouvrir((await params).document);
    if (!acces.ok) return acces.reponse;
    const { document, supabase } = acces;

    const ici = emplacement(document, new URL(requete.url).searchParams.get('cle'));
    if (!ici) return NextResponse.json({ erreur: 'Emplacement inconnu.' }, { status: 404 });

    const { error } = await supabase.rpc('retirer_une_image_de_mise_en_page', {
      document_choisi: document,
      cle_choisie: ici.cle,
    });
    if (error) return indisponible('retrait refusé', error);

    const { error: reglage } = await supabase.rpc('regler_la_mise_en_page', {
      document_choisi: document,
      valeurs: {},
      retirer: [`${ici.cle}.image`],
    });
    if (reglage) return indisponible('réglage de l’image refusé', reglage);

    return NextResponse.json({ ok: true });
  } catch (souci) {
    return indisponible('retrait d’image', souci);
  }
}
