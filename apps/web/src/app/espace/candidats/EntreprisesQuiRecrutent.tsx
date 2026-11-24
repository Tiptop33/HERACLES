'use client';

import { useEffect, useState } from 'react';
import { effectif, type EntrepriseQuiRecrute } from '@/lib/la-bonne-boite';

/**
 * Le bloc « Entreprises qui recrutent » de la fiche (décision du 24 novembre
 * 2026) : les entreprises de ses secteurs et de son département que La Bonne
 * Boîte juge susceptibles de recruter dans les six mois. Rien à saisir : la
 * liste se déduit de la fiche.
 *
 * Chargée après la fiche, pour ne pas la retarder : France Travail peut être
 * lent, la fiche ne l'attend pas. Rechargée quand les secteurs de la fiche
 * changent (`annoncerSecteursModifies`), sans recharger la page.
 */

const SECTEURS_MODIFIES = 'heracles:secteurs-modifies';

/** Prévient le bloc que les secteurs de ce candidat viennent d'être enregistrés. */
export function annoncerSecteursModifies(candidat: string) {
  window.dispatchEvent(new CustomEvent(SECTEURS_MODIFIES, { detail: candidat }));
}

type Reponse =
  | { etat: 'ok'; departement: string; total: number; entreprises: EntrepriseQuiRecrute[] }
  | { etat: 'sans-secteur' | 'sans-departement' | 'non-configure' | 'indisponible' };

type Etat = { charge: true } | { charge: false; reponse: Reponse };

const PHRASES: Record<Exclude<Reponse['etat'], 'ok'>, string> = {
  'sans-secteur': 'Indiquez au moins un secteur pour voir les entreprises qui recrutent.',
  'sans-departement': 'Indiquez le code postal du candidat pour voir les entreprises de son département.',
  'non-configure': 'La recherche des entreprises n’est pas encore configurée.',
  indisponible: 'France Travail ne répond pas pour l’instant. Rouvrez la fiche un peu plus tard.',
};

export default function EntreprisesQuiRecrutent({ candidat }: { candidat: string }) {
  const [etat, setEtat] = useState<Etat>({ charge: true });
  // Chaque modification des secteurs fait monter ce compteur, donc relance la recherche.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    function ecouter(evenement: Event) {
      if ((evenement as CustomEvent<string>).detail !== candidat) return;
      setEtat({ charge: true });
      setVersion((v) => v + 1);
    }
    window.addEventListener(SECTEURS_MODIFIES, ecouter);
    return () => window.removeEventListener(SECTEURS_MODIFIES, ecouter);
  }, [candidat]);

  useEffect(() => {
    const abandon = new AbortController();
    // Une modification rapide en interrompt une autre : seule la dernière réponse s'affiche.
    fetch(`/api/candidats/${candidat}/entreprises`, { signal: abandon.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((reponse: Reponse) => setEtat({ charge: false, reponse }))
      .catch(() => {
        if (!abandon.signal.aborted) setEtat({ charge: false, reponse: { etat: 'indisponible' } });
      });
    return () => abandon.abort();
  }, [candidat, version]);

  return (
    <section className="bloc bloc--large entreprises-qui-recrutent" aria-busy={etat.charge}>
      <h2>Entreprises qui recrutent</h2>
      {etat.charge ? (
        <p className="entreprises-note">Recherche en cours…</p>
      ) : etat.reponse.etat !== 'ok' ? (
        <p className="entreprises-note">{PHRASES[etat.reponse.etat] ?? PHRASES.indisponible}</p>
      ) : etat.reponse.entreprises.length === 0 ? (
        <p className="entreprises-note">
          Aucune entreprise de ces secteurs ne prévoit de recruter dans le département {etat.reponse.departement}.
        </p>
      ) : (
        <>
          <ul className="entreprises-liste">
            {etat.reponse.entreprises.map((e) => {
              const taille = effectif(e.effectif_min, e.effectif_max);
              return (
                <li key={e.siret}>
                  <a
                    href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${e.siret}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir sa fiche dans l’Annuaire des entreprises"
                  >
                    {e.nom}
                  </a>
                  {e.fort_potentiel && <span className="entreprises-fort">fort potentiel</span>}
                  <span className="entreprises-detail">
                    {[e.ville, e.activite, taille].filter(Boolean).join(' · ')}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="entreprises-note">
            {etat.reponse.total > etat.reponse.entreprises.length
              ? `Les ${etat.reponse.entreprises.length} plus susceptibles de recruter sur ${etat.reponse.total}, `
              : ''}
            département {etat.reponse.departement}, d’ici six mois. Source&nbsp;: La Bonne Boîte, France Travail.
          </p>
        </>
      )}
    </section>
  );
}
