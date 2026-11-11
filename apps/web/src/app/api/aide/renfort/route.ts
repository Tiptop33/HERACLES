import { NextResponse } from 'next/server';
import { parcoursDuRole } from '@/lib/aide/parcours';
import { QuestionDAide, questionAutorisee } from '@/lib/aide/renfort';
import { demanderLesParcours } from '@/lib/aide/renfort-serveur';
import { profilCourant } from '@/lib/profil';

/**
 * Claude en renfort de l'aide : `POST /api/aide/renfort`.
 *
 * Reçoit une question, rend les identifiants des parcours qui y répondent.
 * Dans l'ordre : la session, le rôle, la limite par personne, la forme de la
 * question — et seulement alors l'appel à Anthropic.
 *
 * La route ne lit ni n'écrit rien dans la base, hormis le profil de la
 * personne (sa propre ligne, sous RLS). Elle ne conserve pas la question et
 * ne la note pas au journal.
 */

/** Les passages récents de chacun. En mémoire : perdus au redémarrage, sans gravité. */
const passages = new Map<string, number[]>();

const refuser = (erreur: string, statut: number) =>
  NextResponse.json({ erreur }, { status: statut });

export async function POST(requete: Request) {
  try {
    const profil = await profilCourant();
    if (!profil) return refuser('Session expirée.', 401);

    // Le catalogue du rôle : vide pour qui n'a pas d'espace de travail.
    const parcours = parcoursDuRole(profil.role);
    if (parcours.length === 0) return refuser('L’aide n’est pas ouverte à ce compte.', 403);

    if (!questionAutorisee(passages, profil.id)) {
      return refuser('Vous avez posé beaucoup de questions. Réessayez dans un quart d’heure.', 429);
    }

    const lu = QuestionDAide.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return refuser(lu.error.issues[0]?.message ?? 'Question invalide.', 400);
    }

    const issue = await demanderLesParcours(lu.data.question, parcours);
    if (issue.ok) return NextResponse.json({ parcours: issue.ids });

    if (issue.raison === 'indisponible') return refuser('Claude n’est pas disponible.', 503);
    return refuser('Claude n’a pas pu répondre.', 502);
  } catch (souci) {
    console.error('[aide] échec inattendu', souci instanceof Error ? souci.name : 'inconnu');
    return refuser('Claude n’a pas pu répondre.', 503);
  }
}
