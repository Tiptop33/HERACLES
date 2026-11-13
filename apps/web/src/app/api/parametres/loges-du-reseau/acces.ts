import { NextResponse } from 'next/server';
import { z } from 'zod';
import { envoyerCourriel } from '@/lib/courriel';
import { origine } from '@/lib/formulaire';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import {
  DUREE_DU_LIEN_JOURS,
  composerLeCourriel,
  dateEnLettres,
  lienDeLaLogeDuReseau,
  lireLoges,
  nomDansLeCourriel,
  type LogeDuReseau,
} from '@/lib/loges-du-reseau';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * La porte commune des routes de Paramètres › Loges du réseau.
 *
 * La session d'abord, puis le droit : l'administration seulement. Les
 * fonctions de la base (0091) refusent d'elles-mêmes une autre session — ce
 * contrôle-ci répond clairement, sans rien demander à la base pour rien.
 */

type Client = Awaited<ReturnType<typeof supabaseServer>>;

export async function ouvrir(): Promise<
  { ok: true; supabase: Client; adresse: string | null } | { ok: false; reponse: NextResponse }
> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reponse: NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 }) };
  }
  const { data: admin } = await supabase.rpc('est_admin');
  if (admin !== true) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { erreur: 'Les loges de Guyenne et Gascogne se gèrent par l’administration.' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, supabase, adresse: user.email ?? null };
}

/** Les cinq champs d'une loge du réseau, tels que l'écran les envoie. */
export const ChampsDeLaLoge = z
  .object({
    nom: z.string().trim().min(1, 'Le nom de la loge est obligatoire.').max(160, 'Ce nom est trop long.'),
    numero: z.string().trim().max(20, 'Ce numéro est trop long.').default(''),
    province_id: z.uuid('Cette province n’existe pas.').nullable().default(null),
    secretaire_nom: z.string().trim().max(160, 'Ce nom est trop long.').default(''),
    secretaire_email: z
      .string()
      .trim()
      .max(254, 'Cette adresse est trop longue.')
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Cette adresse électronique n’est pas valable.')
      .default(''),
  })
  .strict();

/** La liste à jour, que chaque route rend pour que l'écran l'affiche telle quelle. */
export async function lister(supabase: Client): Promise<LogeDuReseau[] | null> {
  const { data, error } = await supabase.rpc('lister_loges_du_reseau');
  if (error) return null;
  return lireLoges(data);
}

/** Traduire un refus de la base en message pour l'écran. */
export function refus(etiquette: string, error: { code?: string }) {
  switch (error.code) {
    case '42501':
      return NextResponse.json({ erreur: 'Les loges de Guyenne et Gascogne se gèrent par l’administration.' }, { status: 403 });
    case '23505':
      return NextResponse.json({ erreur: 'Ce numéro est déjà pris par une autre loge de Guyenne et Gascogne.' }, { status: 409 });
    case '23514':
      return NextResponse.json({ erreur: 'Une valeur n’est pas acceptée : vérifiez le nom et l’adresse.' }, { status: 400 });
    case 'P0002':
      return NextResponse.json({ erreur: 'Cette loge de Guyenne et Gascogne n’existe plus.' }, { status: 404 });
    default:
      console.error(`[loges du réseau] ${etiquette}`, error.code);
      return indisponible();
  }
}

export function indisponible() {
  return NextResponse.json(
    { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
    { status: 503 },
  );
}

/** Ce qu'un envoi raté dit à l'écran. */
type Raison = 'non-configure' | 'refuse' | 'injoignable' | 'sans-adresse' | 'echec';

const RAISONS: Record<Raison, string> = {
  'non-configure': 'L’envoi de courriels n’est pas configuré sur ce serveur : rien n’est parti.',
  refuse: 'Le service d’envoi a refusé le courriel : rien n’est parti. Vérifiez l’adresse.',
  injoignable: 'Le service d’envoi ne répond pas : rien n’est parti. Réessayez dans un instant.',
  'sans-adresse': 'Cette loge n’a pas d’adresse de Secrétaire.',
  echec: 'Le courriel est parti, mais le lien n’a pas pu être enregistré : renvoyez-le.',
};

export type IssueDuLien = { envoye: true } | { envoye: false; raison: Raison; message: string };

/**
 * Envoyer son lien au Secrétaire d'une loge du réseau.
 *
 * Le courriel part d'abord ; le lien n'est enregistré qu'ensuite
 * (`poser_le_lien_de_la_loge_du_reseau`, 0091). Si l'envoi échoue, l'ancien
 * lien vaut encore et rien ne change à l'écran. Le jeton ne quitte la route
 * que dans le courriel : il n'est ni rendu à l'écran, ni gardé en base.
 */
export async function envoyerLeLien(
  requete: Request,
  supabase: Client,
  loge: LogeDuReseau,
  repondreA: string | null,
): Promise<IssueDuLien> {
  const rate = (raison: Raison): IssueDuLien => ({ envoye: false, raison, message: RAISONS[raison] });
  if (!loge.secretaire_email) return rate('sans-adresse');

  const { data: modele, error: erreurModele } = await supabase.rpc('courriel_des_loges_du_reseau');
  const lu = z.object({ objet: z.string(), texte: z.string() }).safeParse(modele);
  if (erreurModele || !lu.success) return rate('echec');

  const jeton = fabriquerJeton();
  const fin = new Date(Date.now() + DUREE_DU_LIEN_JOURS * 86_400_000);
  const courriel = composerLeCourriel(lu.data, {
    secretaire: loge.secretaire_nom,
    loge: nomDansLeCourriel(loge),
    lien: lienDeLaLogeDuReseau(origine(requete), jeton),
    expiration: dateEnLettres(fin),
  });

  const issue = await envoyerCourriel({
    a: loge.secretaire_email,
    sujet: courriel.sujet,
    texte: courriel.texte,
    repondreA,
  });
  if (!issue.envoye) return rate(issue.raison);

  const { error } = await supabase.rpc('poser_le_lien_de_la_loge_du_reseau', {
    la_loge: loge.id,
    empreinte: empreinte(jeton),
  });
  if (error) {
    console.error('[loges du réseau] lien parti mais non enregistré', error.code);
    return rate('echec');
  }
  return { envoye: true };
}
