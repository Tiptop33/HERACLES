'use client';

import { useState } from 'react';
import ChoixDesSecteursDuCandidat from '@/components/ChoixDesSecteursDuCandidat';
import type { SecteurDuCandidat, SecteursDuCandidat } from '@/lib/secteurs';

/**
 * Les secteurs d'un candidat, dans le bloc « Sa recherche » de sa fiche
 * (maquette validée le 12 novembre 2026, docs/maquettes/secteurs-d-activite.html,
 * écran 2 ; décisions 13 et 14).
 *
 * Pour son référent et son parrain : chaque geste s'enregistre aussitôt, et
 * « Confirmer » valide un secteur proposé par le candidat. Pour les autres
 * référents de la loge : en lecture seule. La ligne grise « Repris de
 * Bubble » garde ce que l'ancienne application portait, tant que les
 * secteurs ne sont pas tous confirmés ; la base dit quand elle s'efface.
 */
export default function SecteursDeLaFiche({ candidat, initial }: { candidat: string; initial: SecteursDuCandidat }) {
  const [reprisDeBubble, setReprisDeBubble] = useState(initial.repris_de_bubble);

  /** Un appel au serveur ; rend la liste retenue, ou le message d'erreur. */
  async function appeler(adresse: string, methode: string, corps: unknown): Promise<SecteurDuCandidat[] | string> {
    try {
      const reponse = await fetch(adresse, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const lu = (await reponse.json().catch(() => null)) as {
        secteurs?: SecteurDuCandidat[];
        repris_de_bubble?: string | null;
        erreur?: string;
      } | null;
      if (!reponse.ok || !lu?.secteurs) return lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.';
      setReprisDeBubble(lu.repris_de_bubble ?? null);
      return lu.secteurs;
    } catch {
      return 'Le serveur ne répond pas. Ce changement n’est pas enregistré.';
    }
  }

  return (
    <div className="secteurs-du-candidat">
      <p className="champs-intitule" id="intitule-secteurs">
        Secteurs
      </p>
      <ChoixDesSecteursDuCandidat
        mode={initial.modifiable ? 'referent' : 'lecture'}
        initiale={initial.secteurs}
        idDuTitre="intitule-secteurs"
        adresses={{ recherche: '/api/secteurs/recherche', liste: '/api/secteurs/liste' }}
        enregistrer={(codes) => appeler(`/api/candidats/${candidat}/secteurs`, 'PATCH', { codes })}
        confirmer={(code) => appeler(`/api/candidats/${candidat}/secteurs/confirmer`, 'POST', { code })}
      />
      {reprisDeBubble && <p className="repris-bubble">Repris de Bubble&nbsp;: «&nbsp;{reprisDeBubble}&nbsp;»</p>}
    </div>
  );
}
