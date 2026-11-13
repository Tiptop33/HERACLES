import { RUBRIQUES } from '@/lib/parametres';
import { lireSecteursBubble } from '@/lib/secteurs-bubble';
import { supabaseServer } from '@/lib/supabase-server';
import CorrespondanceDesSecteurs from './CorrespondanceDesSecteurs';

export const metadata = { title: 'Secteurs d’activité — Paramètres — HERACLES' };

/**
 * Paramètres › Secteurs d'activité (maquette validée le 13 novembre 2026,
 * docs/maquettes/secteurs-repris-de-bubble.html).
 *
 * Chaque secteur que portaient les fiches Bubble, et le secteur de la
 * nomenclature qui lui correspond : HERACLES le propose, l'administration le
 * valide ou le change. Le layout de Paramètres réserve déjà la rubrique à
 * l'administration ; la base le redit (0093).
 */
export default async function SecteursDActivite() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('secteurs_repris_de_bubble');
  const propos = RUBRIQUES.find((r) => r.libelle === "Secteurs d'activité")?.propos ?? '';

  return (
    <>
      <h2>Secteurs d&apos;activité</h2>
      <p className="aide">{propos}</p>
      {error ? (
        <p className="erreur" role="alert">
          La liste des secteurs repris de Bubble n’a pas pu être lue. Réessayez dans un instant.
        </p>
      ) : (
        <CorrespondanceDesSecteurs initiales={lireSecteursBubble(data)} />
      )}
    </>
  );
}
