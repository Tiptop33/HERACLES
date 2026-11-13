import { NextResponse } from 'next/server';
import { z } from 'zod';
import { formatDImage, typeDeFichier } from '@/lib/fichiers';
import { TAILLE_MAXIMALE_ECUSSON } from '@/lib/loges-du-reseau';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { indisponible, lister, ouvrir } from '../../acces';

/**
 * Déposer l'écusson d'une loge du réseau — Paramètres › Loges du réseau,
 * réservé à l'administration (décisions du 13 novembre 2026).
 *
 * Le même ordre que la photo d'un référent, et pour les mêmes raisons :
 *
 *   1. la session, puis le droit — `ouvrir()` : l'administration seule ;
 *   2. ce que le fichier est se lit dans ses octets, jamais dans son nom ;
 *   3. alors seulement `supabaseAdmin()`, pour écrire dans le seau ;
 *   4. la base range le chemin — et le redemande : si elle refuse, les octets
 *      déposés quittent le seau.
 *
 * Le chemin se déduit de la loge : rien de ce que le navigateur envoie n'entre
 * dans le nom du fichier, et la contrainte de 0089 le vérifie encore.
 */
export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette loge de Guyenne et Gascogne n’existe plus.' }, { status: 404 });
    }

    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const champs = await requete.formData().catch(() => null);
    const depose = champs?.get('ecusson');
    if (!(depose instanceof File) || depose.size === 0) {
      return NextResponse.json({ erreur: 'Choisissez une image à déposer.' }, { status: 400 });
    }
    if (depose.size > TAILLE_MAXIMALE_ECUSSON) {
      return NextResponse.json({ erreur: 'Cette image dépasse 5 Mo.' }, { status: 413 });
    }

    const octets = new Uint8Array(await depose.arrayBuffer());
    const format = formatDImage(octets);
    if (!format) {
      return NextResponse.json(
        { erreur: 'Ce fichier n’est pas une image reconnue : JPEG, PNG, WebP, GIF ou AVIF.' },
        { status: 415 },
      );
    }

    const chemin = `loge-du-reseau/ecusson/${id}.${format}`;
    const stockage = supabaseAdmin().storage.from('documents');
    const { error: souciDepot } = await stockage.upload(chemin, octets, {
      contentType: typeDeFichier(chemin),
      // Redéposer écrase : c'est le même écusson, à la même place.
      upsert: true,
    });
    if (souciDepot) {
      console.error('[loges du réseau] écusson : dépôt refusé', souciDepot);
      return NextResponse.json({ erreur: 'Le dépôt de l’image a échoué.' }, { status: 502 });
    }

    const { data: ancien, error } = await acces.supabase.rpc('poser_l_ecusson_de_la_loge_du_reseau', {
      la_loge: id,
      chemin,
    });
    if (error) {
      await stockage.remove([chemin]).catch(() => undefined);
      if (error.code === 'P0002') {
        return NextResponse.json({ erreur: 'Cette loge de Guyenne et Gascogne n’existe plus.' }, { status: 404 });
      }
      console.error('[loges du réseau] écusson : enregistrement refusé', error.code);
      return NextResponse.json({ erreur: 'L’écusson n’a pas pu être enregistré.' }, { status: 403 });
    }

    // L'écusson remplacé quitte le seau, s'il portait un autre nom : un PNG
    // remplacé par un PNG occupe le même chemin.
    if (typeof ancien === 'string' && ancien !== chemin) {
      const { error: souciMenage } = await stockage.remove([ancien]);
      if (souciMenage) console.error('[loges du réseau] ancien écusson non effacé', souciMenage);
    }

    const loges = await lister(acces.supabase);
    return loges ? NextResponse.json({ loges }) : indisponible();
  } catch (souci) {
    console.error('[loges du réseau] écusson : échec inattendu', souci);
    return indisponible();
  }
}
