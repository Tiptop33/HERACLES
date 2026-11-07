import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { envoyerCourriel } from '@/lib/courriel';
import { origine } from '@/lib/formulaire';
import { empreinte, fabriquerJeton } from '@/lib/invitation';
import { courrielDeRelance, lienDuParrain } from '@/lib/parrainage';
import { lireModeles } from '@/lib/parrainage-serveur';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Relancer les parrains qui n'ont pas répondu en vingt-quatre heures — le
 * workflow `EnvoyerEmailRappel` de Bubble.
 *
 * Appelée par une tâche planifiée — n8n, ou `cron` sur le VPS —, toutes les
 * heures :
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $RELANCE_SECRET" \
 *        https://<domaine>/api/relances
 *
 * Personne n'est connecté : le secret partagé est le seul droit, et il est
 * vérifié AVANT tout usage de la clé service_role. Sans secret configuré, la
 * route est fermée — une route de service ouverte par oubli serait une route
 * ouverte à tous.
 *
 * Chaque relance porte un nouveau lien ; le premier reste valable (0057).
 * `noter_la_relance()` réserve le parrainage avant l'envoi : deux tâches qui
 * se chevauchent ne relancent pas deux fois la même personne.
 */

function secretValable(requete: Request): boolean {
  const attendu = process.env.RELANCE_SECRET?.trim();
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

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc('parrainages_a_relancer');
  if (error) {
    console.error('[relances] lecture impossible', error.code);
    return NextResponse.json({ erreur: 'Lecture impossible.' }, { status: 500 });
  }

  const aRelancer = (data ?? []) as {
    id: string;
    parrain_email: string;
    loge_nom: string | null;
    envoye_par_nom: string | null;
  }[];

  const modeles = aRelancer.length > 0 ? await lireModeles(true) : {};
  let envoyees = 0;
  let echecs = 0;

  for (const parrainage of aRelancer) {
    const jeton = fabriquerJeton();
    const { data: reserve } = await admin.rpc('noter_la_relance', {
      le_parrainage: parrainage.id,
      empreinte: empreinte(jeton),
    });
    // Une autre tâche l'a pris entre-temps, ou le parrain vient de répondre.
    if (reserve !== true) continue;

    const message = courrielDeRelance(
      modeles,
      lienDuParrain(origine(requete), jeton),
      parrainage.loge_nom,
      parrainage.envoye_par_nom,
    );
    const issue = await envoyerCourriel({
      a: parrainage.parrain_email,
      sujet: message.sujet,
      texte: message.texte,
      nomExpediteur: parrainage.loge_nom,
    });

    if (issue.envoye) envoyees += 1;
    else echecs += 1;
  }

  // Des compteurs, jamais d'adresse : cette réponse finit dans les journaux
  // de la tâche planifiée.
  return NextResponse.json({ ok: true, a_relancer: aRelancer.length, envoyees, echecs });
}
