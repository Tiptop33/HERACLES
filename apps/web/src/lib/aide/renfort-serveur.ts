import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Parcours } from './parcours';
import {
  ChoixDeParcours,
  CONSIGNE_DU_RENFORT,
  MODELE_DU_RENFORT,
  demandeDeRenfort,
  retenir,
} from './renfort';

/**
 * Demander à Claude quels parcours répondent à une question — serveur
 * seulement.
 *
 * Une variable : `ANTHROPIC_API_KEY`, la même que pour la lecture du CV. Sans
 * elle, rien ne part et la fonction le dit : l'aide montre sa liste entière,
 * comme avant.
 *
 * Rien n'est conservé ici, et le journal ne note que la nature d'un échec :
 * jamais la question, qui peut porter un nom.
 */

export type IssueDuRenfort =
  | { ok: true; ids: string[] }
  | { ok: false; raison: 'indisponible' | 'echec' };

/** Vrai quand le renfort peut servir : la fenêtre d'aide ne le propose qu'alors. */
export function renfortDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function demanderLesParcours(
  question: string,
  parcours: readonly Parcours[],
): Promise<IssueDuRenfort> {
  if (!renfortDisponible()) return { ok: false, raison: 'indisponible' };

  // La personne attend devant la fenêtre d'aide : vingt secondes, un seul
  // nouvel essai. Au-delà, la liste entière lui rend mieux service.
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });

  try {
    const reponse = await client.beta.messages.parse({
      model: MODELE_DU_RENFORT,
      max_tokens: 4000,
      system: CONSIGNE_DU_RENFORT,
      messages: [{ role: 'user', content: demandeDeRenfort(question, parcours) }],
      // Choisir dans une liste d'une vingtaine de lignes demande peu de
      // réflexion : `low` rend la réponse plus vite et coûte moins.
      output_config: { effort: 'low', format: betaZodOutputFormat(ChoixDeParcours) },
      // Si un filtre de sécurité refuse la demande, l'API la refait elle-même
      // sur le modèle de repli qu'Anthropic recommande.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (reponse.stop_reason === 'refusal') {
      console.warn('[aide] demande refusée', reponse.stop_details?.category ?? 'sans catégorie');
      return { ok: false, raison: 'echec' };
    }
    if (reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      console.warn('[aide] réponse incomplète', reponse.stop_reason);
      return { ok: false, raison: 'echec' };
    }

    return { ok: true, ids: retenir(reponse.parsed_output.parcours, parcours) };
  } catch (erreur) {
    if (erreur instanceof Anthropic.AuthenticationError) {
      console.error('[aide] clé ANTHROPIC_API_KEY refusée');
    } else if (erreur instanceof Anthropic.RateLimitError) {
      console.warn('[aide] limite de débit atteinte');
    } else if (erreur instanceof Anthropic.APIError) {
      // Le statut seul : le message d'un 400 peut citer la requête, donc la question.
      console.error('[aide] erreur de l’API', erreur.status);
    } else {
      console.error('[aide] échec du renfort', erreur instanceof Error ? erreur.name : 'inconnu');
    }
    return { ok: false, raison: 'echec' };
  }
}
