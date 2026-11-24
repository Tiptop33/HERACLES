'use client';

import { useEffect, useState } from 'react';
import { dateEnLettres } from '@/lib/format';
import { RAYON_KM, type MetierRome, type OffreEnAlternance } from '@/lib/la-bonne-alternance';

/**
 * Le bloc « Offres en alternance » de la fiche d'un candidat qui cherche une
 * alternance (décision du 24 novembre 2026, option a) : les offres de La
 * bonne alternance pour son métier, à moins de 30 km de sa commune. Rien à
 * saisir : le métier et le code postal de la fiche suffisent.
 *
 * En tête, le métier que ROMEO a reconnu dans celui de la fiche : c'est lui,
 * et lui seul, qui choisit les offres (décision du 24 novembre 2026).
 *
 * Chargé après la fiche, comme « Entreprises qui recrutent » : la fiche
 * n'attend pas les services extérieurs.
 */

type Reponse =
  | {
      etat: 'ok';
      rayon: number;
      metier: MetierRome;
      total: number;
      offres: OffreEnAlternance[];
    }
  | {
      etat:
        | 'pas-alternance'
        | 'sans-metier'
        | 'sans-code-postal'
        | 'metier-inconnu'
        | 'commune-inconnue'
        | 'non-configure'
        | 'indisponible';
    };

type Etat = { charge: true } | { charge: false; reponse: Reponse };

const PHRASES: Record<Exclude<Reponse['etat'], 'ok'>, string> = {
  'pas-alternance': 'Ce candidat ne cherche pas d’alternance.',
  'sans-metier': 'Indiquez le métier recherché pour voir les offres en alternance.',
  'sans-code-postal': 'Indiquez le code postal du candidat pour voir les offres autour de chez lui.',
  'metier-inconnu': 'Le métier recherché n’a pas été reconnu. Précisez-le sur la fiche.',
  'commune-inconnue': 'Le code postal du candidat ne correspond à aucune commune.',
  'non-configure': 'La recherche des offres en alternance n’est pas encore configurée.',
  indisponible: 'La bonne alternance ne répond pas pour l’instant. Rouvrez la fiche un peu plus tard.',
};

/** « apprentissage · dès septembre 2027 · 24 mois » */
function contrat(o: OffreEnAlternance): string {
  const debut = o.debut
    ? `dès ${new Date(o.debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
    : null;
  return [
    o.contrats.map((c) => c.toLowerCase()).join(' ou ') || null,
    debut,
    o.duree_mois ? `${o.duree_mois} mois` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function OffresEnAlternance({ candidat }: { candidat: string }) {
  const [etat, setEtat] = useState<Etat>({ charge: true });

  useEffect(() => {
    const abandon = new AbortController();
    fetch(`/api/candidats/${candidat}/alternance`, {
      signal: abandon.signal,
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((reponse: Reponse) => setEtat({ charge: false, reponse }))
      .catch(() => {
        if (!abandon.signal.aborted) setEtat({ charge: false, reponse: { etat: 'indisponible' } });
      });
    return () => abandon.abort();
  }, [candidat]);

  return (
    <section className="bloc bloc--large entreprises-qui-recrutent" aria-busy={etat.charge}>
      <h2>Offres en alternance</h2>
      {etat.charge ? (
        <p className="entreprises-note">Recherche en cours…</p>
      ) : etat.reponse.etat !== 'ok' ? (
        <p className="entreprises-note">{PHRASES[etat.reponse.etat] ?? PHRASES.indisponible}</p>
      ) : (
        <>
          <p className="entreprises-note">
            Métier reconnu&nbsp;: {etat.reponse.metier.libelle ?? 'non nommé'} ({etat.reponse.metier.code})
          </p>
          {etat.reponse.offres.length === 0 ? (
            <p className="entreprises-note">Aucune offre en alternance pour ce métier à moins de {RAYON_KM} km.</p>
          ) : (
            <>
              <ul className="entreprises-liste">
                {etat.reponse.offres.map((o) => {
                  const detail = [o.entreprise, o.adresse, contrat(o)].filter(Boolean).join(' · ');
                  const date = dateEnLettres(o.parue_le);
                  const parue = date ? `parue le ${date}` : null;
                  return (
                    <li key={o.id} className="offre-rangee">
                      {/* À gauche l'intitulé et sa ligne grise ; à droite la
                          date de parution, comme dans la liste France Travail. */}
                      <span className="offre-texte">
                        {o.lien ? (
                          <a
                            href={o.lien}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ouvrir l’offre sur La bonne alternance"
                          >
                            {o.titre}
                          </a>
                        ) : (
                          <strong>{o.titre}</strong>
                        )}
                        {detail && <span className="entreprises-detail">{detail}</span>}
                      </span>
                      {parue && <span className="entreprises-detail offre-parution">{parue}</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="entreprises-note">
                {etat.reponse.total > etat.reponse.offres.length
                  ? `Les ${etat.reponse.offres.length} premières sur ${etat.reponse.total}, `
                  : ''}
                à moins de {RAYON_KM} km de sa commune. Source&nbsp;: La bonne alternance.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
