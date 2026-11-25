import { envoyerCourriel, type IssueDEnvoi } from './courriel';
import { empreinte, fabriquerJeton } from './invitation';
import {
  COLONNES_DU_DOCUMENT,
  COLONNES_DU_MESSAGE,
  autoriserUnLien,
  courrielDeConnexion,
  courrielDInvitationALaPage,
  lireDocuments,
  lireFicheDuCandidat,
  lireMessages,
  lireOffresPourMoi,
  type DocumentDuCandidat,
  type FicheDuCandidat,
  type MessageDuCandidat,
  type OffresPourMoi,
} from './page-candidat';
import { supabaseAdmin } from './supabase-admin';
import { supabaseServer } from './supabase-server';

/**
 * La page du candidat, côté serveur (migration 0105).
 *
 * Tout ce que lit la page passe par la session du candidat : la base sait qui
 * il est (`mon_dossier()`) et ne rend que sa fiche, ses documents, ses
 * messages. La clé de service ne sert qu'à trois choses, toujours après avoir
 * vérifié ce qui doit l'être : lire et écrire les octets du seau, envoyer un
 * lien de connexion, relier un compte à une fiche par l'invitation.
 */

/** Note la visite — pour le badge « Nouvelle » des offres. */
export async function regarderMaPage(): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('je_regarde_ma_page');
  if (error) console.error('[page-candidat] visite non notée', error.code);
}

export async function lireMaFiche(): Promise<FicheDuCandidat | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('ma_fiche_de_candidat');
  if (error) {
    console.error('[page-candidat] fiche illisible', error.code);
    return null;
  }
  return lireFicheDuCandidat(data);
}

/** Les documents du dossier — la RLS ne rend que ceux qu'on a le droit de voir. */
export async function lireLesDocuments(candidat: string): Promise<DocumentDuCandidat[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('candidat_document')
    .select(COLONNES_DU_DOCUMENT)
    .eq('candidat_id', candidat)
    .order('genre')
    .order('principal', { ascending: false })
    .order('depose_le', { ascending: false });
  return lireDocuments(data ?? []);
}

/** Les messages, du plus récent au plus ancien. Même règle : la RLS tranche. */
export async function lireLesMessages(candidat: string): Promise<MessageDuCandidat[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('candidat_message')
    .select(COLONNES_DU_MESSAGE)
    .eq('candidat_id', candidat)
    .order('ecrit_le', { ascending: false });
  return lireMessages(data ?? []);
}

export async function lireMesOffres(recherche: string, limite: number): Promise<OffresPourMoi | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('offres_pour_moi', {
    la_recherche: recherche || null,
    limite,
    decalage: 0,
  });
  if (error) {
    console.error('[page-candidat] offres illisibles', error.code);
    return null;
  }
  return lireOffresPourMoi(data);
}

// ————————————————————————————————————————————————————————————————————————————
// L'état de la page, vu du référent
// ————————————————————————————————————————————————————————————————————————————

export type EtatDeLaPage = {
  a_un_compte: boolean;
  a_un_email: boolean;
  invitee_le: string | null;
  invitation_expire_le: string | null;
  ouverte_le: string | null;
  vue_le: string | null;
  peut_inviter: boolean;
};

export async function lireEtatDeLaPage(candidat: string): Promise<EtatDeLaPage | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('etat_de_la_page_candidat', { le_candidat: candidat });
  return ((data as EtatDeLaPage[] | null) ?? [])[0] ?? null;
}

// ————————————————————————————————————————————————————————————————————————————
// Les liens : invitation et connexion
// ————————————————————————————————————————————————————————————————————————————

export function lienDInvitation(racine: string, jeton: string): string {
  return `${racine}/invitation-candidat/${jeton}`;
}

/**
 * L'invitation que HERACLES envoie seul, la candidature complétée. Au mieux :
 * un courriel qui ne part pas ne doit pas faire échouer la candidature — le
 * référent pourra toujours inviter depuis la fiche.
 */
export async function inviterApresLaCandidature(candidat: string, racine: string): Promise<void> {
  try {
    const jeton = fabriquerJeton();
    const { data, error } = await supabaseAdmin().rpc('inviter_a_sa_page_apres_candidature', {
      le_candidat: candidat,
      empreinte: empreinte(jeton),
    });
    if (error) {
      console.error('[page-candidat] invitation automatique refusée', error.code);
      return;
    }
    const dossier = ((data as { email: string; prenom: string | null; loge_nom: string | null }[] | null) ?? [])[0];
    if (!dossier) return;
    const message = courrielDInvitationALaPage(dossier.prenom, lienDInvitation(racine, jeton));
    const issue = await envoyerCourriel({ a: dossier.email, ...message, nomExpediteur: dossier.loge_nom });
    if (!issue.envoye) console.warn('[page-candidat] invitation automatique non envoyée', issue.raison);
  } catch (souci) {
    console.error('[page-candidat] invitation automatique : échec inattendu', (souci as Error).name);
  }
}

const journalDesLiens = new Map<string, number[]>();

/**
 * Envoyer un lien de connexion à un candidat. La réponse est la même dans
 * tous les cas : dire « adresse inconnue » ferait de ce formulaire l'annuaire
 * des candidats.
 *
 * Le lien est fabriqué par GoTrue (`generateLink`), mais c'est HERACLES qui
 * l'envoie, avec sa propre page d'arrivée : le lien s'ouvre alors sur
 * n'importe quel appareil — le téléphone qui lit le courriel n'est pas
 * toujours celui qui l'a demandé —, et un bouton protège le jeton des
 * logiciels de messagerie qui ouvrent les liens pour les vérifier.
 *
 * `generateLink` crée le compte quand l'adresse n'en a pas : on vérifie donc
 * d'abord qu'un compte de candidat existe. Personne ne s'inscrit par ici.
 */
export async function envoyerUnLienDeConnexion(adresse: string, racine: string): Promise<void> {
  if (!autoriserUnLien(journalDesLiens, adresse, Date.now())) {
    console.warn('[connexion-lien] plafond atteint pour une adresse');
    return;
  }

  const admin = supabaseAdmin();
  const { data: comptes, error } = await admin.rpc('compte_pour_la_page', { adresse });
  if (error) {
    console.error('[connexion-lien] compte illisible', error.code);
    return;
  }
  const compte = ((comptes as { id: string; role: string | null; candidat_id: string | null }[] | null) ?? [])[0];
  // Un compte de candidat relié à sa fiche, et rien d'autre : les référents
  // gardent leur mot de passe.
  if (!compte || compte.role !== 'chercheur' || !compte.candidat_id) return;

  const { data, error: refus } = await admin.auth.admin.generateLink({ type: 'magiclink', email: adresse });
  const jeton = data?.properties?.hashed_token;
  if (refus || !jeton) {
    console.error('[connexion-lien] lien non fabriqué', refus?.status);
    return;
  }

  const lien = `${racine}/connexion/lien/ouvrir?jeton=${encodeURIComponent(jeton)}`;
  const issue: IssueDEnvoi = await envoyerCourriel({ a: adresse, ...courrielDeConnexion(lien) });
  if (!issue.envoye) console.warn('[connexion-lien] courriel non envoyé', issue.raison);
}

/**
 * Ouvrir la session à partir du jeton d'un lien. `verifyOtp` pose les cookies
 * de session sur la réponse en cours : la route redirige ensuite.
 */
export async function ouvrirLaSession(jeton: string): Promise<boolean> {
  if (!jeton || jeton.length < 20 || jeton.length > 200 || !/^[A-Za-z0-9_-]+$/.test(jeton)) return false;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash: jeton, type: 'magiclink' });
  return !error;
}

/**
 * Ouvrir la session du compte qui porte cette adresse, sans courriel : juste
 * après que l'invitation a relié le compte à la fiche. Le jeton fabriqué ne
 * quitte pas le serveur.
 */
export async function ouvrirLaSessionDe(adresse: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: 'magiclink', email: adresse });
  const jeton = data?.properties?.hashed_token;
  if (error || !jeton) {
    console.error('[invitation-candidat] lien non fabriqué', error?.status);
    return false;
  }
  return ouvrirLaSession(jeton);
}

/**
 * Les messages du candidat pour sa fiche, côté référent — ou `null` pour qui
 * n'est ni son référent ni son parrain : le bloc n'a alors pas à paraître,
 * même vide.
 */
export async function lireLesMessagesSiPermis(candidat: string): Promise<MessageDuCandidat[] | null> {
  const supabase = await supabaseServer();
  const { data: permis } = await supabase.rpc('puis_je_lire_ses_messages', { le_candidat: candidat });
  if (permis !== true) return null;
  return lireLesMessages(candidat);
}
