import { NextResponse } from 'next/server';
import { parcoursDuRole } from '@/lib/aide/parcours';
import { QuestionDAide } from '@/lib/aide/renfort';
import { demanderLesParcours } from '@/lib/aide/renfort-serveur';
import { profilCourant } from '@/lib/profil';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Claude en renfort de l'aide : `POST /api/aide/renfort`.
 *
 * Reçoit une question, rend les identifiants des parcours qui y répondent.
 * Dans l'ordre : la session, le rôle, la forme de la question, la limite par
 * personne — et seulement alors l'appel à Anthropic. La limite vient après la
 * validation : une question refusée pour sa forme ne compte pas.
 *
 * En base, la route lit le profil de la personne (sa propre ligne, sous RLS)
 * et fait compter sa demande par `compter_une_question_d_aide()` (0082), qui
 * n'enregistre que « qui, quand ». La question elle-même n'est ni conservée
 * ni notée au journal.
 */

const refuser = (erreur: string, statut: number) =>
  NextResponse.json({ erreur }, { status: statut });

export async function POST(requete: Request) {
  try {
    const profil = await profilCourant();
    if (!profil) return refuser('Session expirée.', 401);

    // Le catalogue du rôle : vide pour qui n'a pas d'espace de travail.
    const parcours = parcoursDuRole(profil.role);
    if (parcours.length === 0) return refuser('L’aide n’est pas ouverte à ce compte.', 403);

    const lu = QuestionDAide.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return refuser(lu.error.issues[0]?.message ?? 'Question invalide.', 400);
    }

    // Le compte est en base : il tient d'un déploiement à l'autre. La session
    // de la personne suffit — la fonction ne compte que pour `auth.uid()`.
    const supabase = await supabaseServer();
    const { data: passe, error } = await supabase.rpc('compter_une_question_d_aide');
    if (error) {
      // Sans compteur, on n'appelle pas Claude : mieux vaut une aide sans
      // renfort qu'un renfort sans plafond.
      console.error('[aide] compteur indisponible', error.code ?? 'sans code');
      return refuser('Claude n’est pas disponible.', 503);
    }
    if (passe !== true) {
      return refuser('Vous avez posé beaucoup de questions. Réessayez dans un quart d’heure.', 429);
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
