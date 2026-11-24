import { lireReglages } from './france-travail';
import { serviceLaBonneBoite, type Recherche, type ResultatLaBonneBoite } from './la-bonne-boite';

/**
 * Le service La Bonne Boîte de l'application : un seul par processus, pour
 * que sa mémoire (jeton, listes) serve à toutes les fiches. `null` quand les
 * identifiants France Travail manquent.
 */
let service: ((r: Recherche) => Promise<ResultatLaBonneBoite>) | null = null;

export function laBonneBoite(): ((r: Recherche) => Promise<ResultatLaBonneBoite>) | null {
  if (service) return service;
  const reglages = lireReglages(process.env);
  if (!reglages) return null;
  service = serviceLaBonneBoite(reglages, {
    fetch: (entree, init) => fetch(entree, { ...init, signal: AbortSignal.timeout(8000) }),
    attendre: (ms) => new Promise((fin) => setTimeout(fin, ms)),
    maintenant: () => Date.now(),
  });
  return service;
}
