import { empreinte } from './invitation';
import { lirePage, type ReponseDuLien } from './loges-du-reseau';
import { jetonPlausible } from './parrainage-serveur';
import { supabaseAdmin } from './supabase-admin';

/**
 * Ce que la page du Secrétaire d'une loge du réseau affiche, pour le jeton de
 * son lien.
 *
 * Même chemin que la page du candidat : le jeton n'atteint jamais la base. Un
 * jeton qui n'a pas la forme d'un jeton ne mérite pas de requête ; sinon on le
 * hache, et c'est la base qui dit s'il vaut (`page_de_la_loge_du_reseau`,
 * 0091), appelée avec la clé de service — la seule à pouvoir l'appeler, le
 * Secrétaire n'ayant pas de compte.
 */
export async function lirePageDuLien(jeton: string): Promise<ReponseDuLien> {
  if (!jetonPlausible(jeton)) return null;
  const { data, error } = await supabaseAdmin().rpc('page_de_la_loge_du_reseau', {
    empreinte: empreinte(jeton),
  });
  if (error) {
    console.error('[loge du réseau] lecture refusée', error.code);
    return null;
  }
  return lirePage(data);
}
