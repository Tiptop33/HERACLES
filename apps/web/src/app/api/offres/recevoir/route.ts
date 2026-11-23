import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  PanneFranceTravail,
  joursARemonter,
  lireReglages,
  recevoirLesOffres,
  type Compte,
} from '@/lib/france-travail';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Recevoir les offres d'emploi de France Travail (migration 0099,
 * docs/france-travail.md).
 *
 * Appelée par une tâche planifiée — `cron` sur le VPS, ou n8n — et par la mise
 * en ligne :
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $RECEPTION_OFFRES_SECRET" \
 *        https://<domaine>/api/offres/recevoir
 *
 * Personne n'est connecté : le secret partagé est le seul droit, et il est
 * vérifié AVANT tout usage de la clé service_role. Sans secret configuré, la
 * route est fermée — une route de service ouverte par oubli serait une route
 * ouverte à tous.
 *
 * `?jours=31` force la profondeur (1 à 31). Sans lui, on remonte depuis la
 * dernière offre connue. L'appel est borné à quatre minutes : s'il n'a pas
 * fini, il répond `termine: false` avec `jours` et `fenetres_lues` ; l'appel
 * suivant les lui rend (`?jours=…&reprise=…`) et reprend où celui-ci s'est
 * arrêté. Déposer deux fois la même offre ne la double pas.
 *
 * Une réception terminée se conclut par la purge des offres de plus de
 * soixante jours (migration 0101) ; `purgees` en donne le nombre.
 *
 * La réponse ne porte que des compteurs : elle finit dans les journaux de la
 * tâche planifiée.
 */

export const dynamic = 'force-dynamic';

/** Au-delà de soixante jours sans actualisation, une offre est supprimée (0101). */
const JOURS_DE_GARDE = 60;

/** Quatre minutes : sous le délai des façades, et large pour une réception du jour. */
const BUDGET_MS = 4 * 60 * 1000;

function secretValable(requete: Request): boolean {
  const attendu = process.env.RECEPTION_OFFRES_SECRET?.trim();
  if (!attendu || attendu.length < 32) return false;

  const recu = requete.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(requete: Request) {
  if (!secretValable(requete)) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const reglages = lireReglages(process.env);
  if (!reglages) {
    return NextResponse.json(
      { erreur: 'La réception n’est pas configurée : identifiants France Travail absents.' },
      { status: 503 },
    );
  }

  const admin = supabaseAdmin();

  const parametres = new URL(requete.url).searchParams;
  const demande = parametres.get('jours') ?? '';
  // Les fenêtres déjà lues par un appel précédent. Tout ce qui n'est pas un
  // petit nombre vaut zéro : on recommence, ce qui ne casse rien.
  const brute = parametres.get('reprise') ?? '';
  const reprise = /^[0-9]{1,4}$/.test(brute) ? Number(brute) : 0;
  let jours: number;
  if (/^([1-9]|[12][0-9]|3[01])$/.test(demande)) {
    jours = Number(demande);
  } else {
    const { data, error } = await admin
      .from('offre_emploi')
      .select('date_actualisation')
      .not('date_actualisation', 'is', null)
      .order('date_actualisation', { ascending: false })
      .limit(1);
    if (error) {
      console.error('[offres] lecture de la dernière offre impossible', error.code);
      return NextResponse.json({ erreur: 'Lecture impossible.' }, { status: 500 });
    }
    const derniere = data?.[0]?.date_actualisation as string | undefined;
    jours = joursARemonter(derniere ? new Date(derniere) : null, Date.now());
  }

  try {
    const bilan = await recevoirLesOffres(reglages, jours, BUDGET_MS, {
      fetch,
      maintenant: () => Date.now(),
      attendre: (ms) => new Promise((fini) => setTimeout(fini, ms)),
      deposer: async (offres) => {
        const { data, error } = await admin.rpc('recevoir_offres_france_travail', {
          les_offres: offres,
        });
        if (error) throw new Error(error.code);
        return data as Compte;
      },
    }, reprise);

    // La réception finie, on purge les offres de plus de soixante jours (0101).
    // Seulement quand elle est finie : une réception écourtée reprend au
    // passage suivant, et la purge avec elle. Si la purge échoue, les offres
    // sont quand même reçues — on le dit par `purgees: null`, sans faire
    // échouer l'appel.
    let purgees: number | null = 0;
    if (bilan.termine) {
      const { data, error } = await admin.rpc('purger_les_offres_anciennes', {
        jours: JOURS_DE_GARDE,
      });
      if (error) console.error('[offres] purge impossible', error.code);
      purgees = error || typeof data !== 'number' ? null : data;
    }

    return NextResponse.json({ ok: true, jours, ...bilan, purgees });
  } catch (panne) {
    // Ni identifiant, ni jeton, ni contenu d'offre dans le journal : l'étape
    // et le code suffisent à savoir où regarder.
    if (panne instanceof PanneFranceTravail) {
      console.error('[offres] réception interrompue', panne.etape, panne.statut ?? '');
      return NextResponse.json(
        { erreur: panne.message, etape: panne.etape, statut: panne.statut ?? null },
        { status: 502 },
      );
    }
    console.error('[offres] réception interrompue');
    return NextResponse.json({ erreur: 'Réception interrompue.' }, { status: 500 });
  }
}
