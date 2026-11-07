/**
 * Envoyer un courriel, par l'API transactionnelle de Brevo.
 *
 * Brevo et non SMTP : c'est le service que l'application Bubble employait
 * déjà, il s'appelle par une simple requête HTTPS — aucune dépendance à
 * ajouter —, et une clé d'API se révoque sans toucher au mot de passe d'une
 * boîte. Les courriels d'authentification, eux, restent à GoTrue et à son
 * SMTP : ce module ne s'en occupe pas.
 *
 * Trois variables, côté serveur seulement :
 *
 *   BREVO_API_KEY             la clé (Brevo → SMTP & API → Clés API) ;
 *   COURRIEL_EXPEDITEUR       l'adresse d'envoi, déclarée chez Brevo ;
 *   COURRIEL_NOM_EXPEDITEUR   le nom affiché — « HERACLES » par défaut.
 *
 * Sans clé, rien ne part et la fonction le dit : l'appelant décide alors de
 * montrer le lien à la personne qui l'a demandé. Rien n'échoue en silence.
 */

export type Courriel = {
  a: string;
  sujet: string;
  /** Le texte brut. Une version HTML en est tirée, paragraphes et liens compris. */
  texte: string;
  /** Le nom affiché comme expéditeur — la loge, comme chez Bubble. */
  nomExpediteur?: string | null;
  /** À qui répondre : le référent, plutôt qu'une adresse qui ne lit rien. */
  repondreA?: string | null;
};

export type IssueDEnvoi =
  | { envoye: true }
  | { envoye: false; raison: 'non-configure' | 'refuse' | 'injoignable' };

const API = 'https://api.brevo.com/v3/smtp/email';

/** Vrai si l'envoi est configuré. Sert aux écrans qui doivent le dire. */
export function courrielConfigure(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.COURRIEL_EXPEDITEUR?.trim());
}

export async function envoyerCourriel(courriel: Courriel): Promise<IssueDEnvoi> {
  const cle = process.env.BREVO_API_KEY?.trim();
  const expediteur = process.env.COURRIEL_EXPEDITEUR?.trim();

  if (!cle || !expediteur) {
    console.warn('[courriel] BREVO_API_KEY ou COURRIEL_EXPEDITEUR absente : rien n’est parti.');
    return { envoye: false, raison: 'non-configure' };
  }

  const corps = {
    sender: {
      email: expediteur,
      name: courriel.nomExpediteur?.trim() || process.env.COURRIEL_NOM_EXPEDITEUR?.trim() || 'HERACLES',
    },
    to: [{ email: courriel.a }],
    subject: courriel.sujet,
    textContent: courriel.texte,
    htmlContent: enHtml(courriel.texte),
    ...(courriel.repondreA ? { replyTo: { email: courriel.repondreA } } : {}),
  };

  try {
    const reponse = await fetch(API, {
      method: 'POST',
      headers: { 'api-key': cle, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(corps),
      // Un service lent ne doit pas tenir la page de la personne : dix
      // secondes, puis on lui dit que ça n'est pas parti.
      signal: AbortSignal.timeout(10_000),
    });

    if (!reponse.ok) {
      // Le corps de l'erreur peut contenir l'adresse visée : on ne journalise
      // que le statut.
      console.error('[courriel] Brevo a refusé l’envoi', reponse.status);
      return { envoye: false, raison: 'refuse' };
    }

    return { envoye: true };
  } catch (souci) {
    console.error('[courriel] Brevo injoignable', (souci as Error).name);
    return { envoye: false, raison: 'injoignable' };
  }
}

/** Échapper ce qui serait lu comme du HTML. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Le texte brut mis en HTML : un paragraphe par bloc, un `<br>` par retour à
 * la ligne, et les adresses `https://` rendues cliquables. Le texte vient des
 * modèles de la commission, donc d'une saisie libre : tout est échappé avant.
 */
export function enHtml(texte: string): string {
  const paragraphes = texte
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((bloc) => bloc.trim())
    .filter(Boolean)
    .map((bloc) => {
      const sur = echapper(bloc).replace(
        /https:\/\/[^\s<]+/g,
        (lien) => `<a href="${lien}">${lien}</a>`,
      );
      return `<p>${sur.replace(/\n/g, '<br>')}</p>`;
    });

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#16202e">${paragraphes.join('')}</div>`;
}
