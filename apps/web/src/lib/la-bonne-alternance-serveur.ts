import { lireReglagesAlternance, serviceLaBonneAlternance, type Demande, type Reponse } from './la-bonne-alternance';

/**
 * Le service La bonne alternance de l'application : un seul par processus,
 * pour que sa mémoire serve à toutes les fiches. `null` quand la clé de l'API
 * apprentissage ou les identifiants France Travail manquent.
 */
let service: ((d: Demande) => Promise<Reponse>) | null = null;

export function laBonneAlternance(): ((d: Demande) => Promise<Reponse>) | null {
  if (service) return service;
  const reglages = lireReglagesAlternance(process.env);
  if (!reglages) return null;
  service = serviceLaBonneAlternance(reglages, {
    fetch: (entree, init) => fetch(entree, { ...init, signal: AbortSignal.timeout(8000) }),
    attendre: (ms) => new Promise((fin) => setTimeout(fin, ms)),
    maintenant: () => Date.now(),
  });
  return service;
}
