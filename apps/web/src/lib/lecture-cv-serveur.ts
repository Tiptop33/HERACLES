import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import mammoth from 'mammoth';
import {
  CONSIGNE_DE_LECTURE,
  LectureDuCv,
  MODELE_DE_LECTURE,
  demandeDeLecture,
  nettoyerLecture,
  type Extrait,
  type FormatLisible,
} from './lecture-cv';

/**
 * Faire lire un CV par Claude — serveur seulement.
 *
 * Une variable : `ANTHROPIC_API_KEY`. Sans elle, rien ne part et la fonction
 * le dit : le candidat remplit sa fiche à la main, comme avant.
 *
 * Le CV quitte le serveur pour l'API d'Anthropic, le temps de la lecture. Le
 * candidat en est prévenu à côté du champ. Rien n'est conservé ici : ni le
 * fichier — il part avec la fiche, plus tard, par la route habituelle —, ni ce
 * que le modèle en a tiré. Le journal ne note que la nature d'un échec, jamais
 * un contenu.
 */

export type IssueDeLecture =
  | { ok: true; extrait: Extrait }
  | { ok: false; raison: 'indisponible' | 'illisible' | 'echec' };

const MEDIAS_DES_PHOTOS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

/**
 * Le CV sous la forme que l'API comprend : le PDF en document, la photo en
 * image, le Word par son texte — l'API ne lit pas le Word directement.
 * `null` quand il n'y a rien à lire, un Word vide par exemple.
 */
export async function blocDuCv(
  octets: Uint8Array,
  format: FormatLisible,
): Promise<Anthropic.Beta.BetaContentBlockParam | null> {
  const base64 = () => Buffer.from(octets).toString('base64');

  if (format === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64() },
    };
  }

  if (format === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(octets) });
    const texte = value.trim();
    return texte ? { type: 'text', text: `<cv>\n${texte}\n</cv>` } : null;
  }

  return {
    type: 'image',
    source: { type: 'base64', media_type: MEDIAS_DES_PHOTOS[format], data: base64() },
  };
}

export async function lireLeCv(
  octets: Uint8Array,
  format: FormatLisible,
  aujourdhui = new Date(),
): Promise<IssueDeLecture> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, raison: 'indisponible' };

  let bloc: Anthropic.Beta.BetaContentBlockParam | null;
  try {
    bloc = await blocDuCv(octets, format);
  } catch {
    // Un Word que mammoth n'ouvre pas : abîmé, ou protégé par un mot de passe.
    return { ok: false, raison: 'illisible' };
  }
  if (!bloc) return { ok: false, raison: 'illisible' };

  // Une lecture tient en une minute ; au-delà, le candidat aura déjà commencé
  // à remplir lui-même. Un seul nouvel essai sur une panne passagère.
  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });

  try {
    const reponse = await client.beta.messages.parse({
      model: MODELE_DE_LECTURE,
      max_tokens: 16000,
      system: CONSIGNE_DE_LECTURE,
      messages: [
        {
          role: 'user',
          content: [bloc, { type: 'text', text: demandeDeLecture(aujourdhui) }],
        },
      ],
      // Recopier un CV dans des cases demande peu de réflexion : `low` rend la
      // réponse plus rapide, et le candidat attend devant l'écran.
      output_config: { effort: 'low', format: betaZodOutputFormat(LectureDuCv) },
      // Si un filtre de sécurité refuse la lecture, l'API la refait elle-même
      // sur le modèle de repli qu'Anthropic recommande.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (reponse.stop_reason === 'refusal') {
      console.warn('[lecture-cv] lecture refusée', reponse.stop_details?.category ?? 'sans catégorie');
      return { ok: false, raison: 'echec' };
    }
    if (reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      console.warn('[lecture-cv] réponse incomplète', reponse.stop_reason);
      return { ok: false, raison: 'illisible' };
    }

    return { ok: true, extrait: nettoyerLecture(reponse.parsed_output) };
  } catch (erreur) {
    if (erreur instanceof Anthropic.AuthenticationError) {
      console.error('[lecture-cv] clé ANTHROPIC_API_KEY refusée');
    } else if (erreur instanceof Anthropic.RateLimitError) {
      console.warn('[lecture-cv] limite de débit atteinte');
    } else if (erreur instanceof Anthropic.APIError) {
      console.error('[lecture-cv] erreur de l’API', erreur.status);
    } else {
      // Une réponse que le schéma n'accepte pas, ou le réseau.
      console.error('[lecture-cv] échec de la lecture', erreur instanceof Error ? erreur.name : 'inconnu');
    }
    return { ok: false, raison: 'echec' };
  }
}
