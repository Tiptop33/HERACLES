import { RUBRIQUES } from '@/lib/parametres';
import { lireLoges } from '@/lib/loges-du-reseau';
import { rangerProvinces } from '@/lib/provinces';
import { supabaseServer } from '@/lib/supabase-server';
import RenvoiMonCompte from '../RenvoiMonCompte';
import GestionDesLogesDuReseau from './GestionDesLogesDuReseau';

export const metadata = { title: 'Loges de Guyenne et Gascogne — Paramètres — HERACLES' };

/**
 * Paramètres › Loges du réseau (maquette validée le 13 novembre 2026,
 * docs/maquettes/loges-du-reseau.html, écran 2).
 *
 * Les 73 loges du réseau — extérieures à l'application, pas ses « loges » —,
 * leur Secrétaire, et le lien qui lui permet de cocher les secteurs d'activité
 * de sa loge. L'administration les saisit, envoie les liens, suit les
 * réponses et règle le courriel. Le layout de Paramètres réserve déjà la
 * rubrique à l'administration ; la base le redit (0091).
 */
export default async function LogesDuReseau() {
  const supabase = await supabaseServer();
  const [loges, provinces, courriel] = await Promise.all([
    supabase.rpc('lister_loges_du_reseau'),
    supabase.from('province').select('id, nom'),
    supabase.rpc('courriel_des_loges_du_reseau'),
  ]);

  const propos = RUBRIQUES.find((r) => r.libelle === 'Loges de Guyenne et Gascogne')?.propos ?? '';
  const modele = courriel.data as { objet?: string; texte?: string } | null;

  // Le titre et le propos ouvrent la colonne de gauche : sur un écran large,
  // le courriel se range à leur droite, en face d'eux et de la liste.
  const entete = (
    <>
      <h2>Loges de Guyenne et Gascogne</h2>
      <p className="aide">{propos}</p>
    </>
  );

  if (loges.error) {
    return (
      <>
        {entete}
        <p className="erreur" role="alert">
          La liste des loges de Guyenne et Gascogne n’a pas pu être lue. Réessayez dans un instant.
        </p>
      </>
    );
  }

  return (
    <GestionDesLogesDuReseau
      entete={entete}
      // Repris sous l'aperçu du courriel, en bas de la colonne de droite.
      pied={<RenvoiMonCompte />}
      initiales={lireLoges(loges.data)}
      provinces={rangerProvinces(
        ((provinces.data ?? []) as { id: string; nom: string | null }[]).filter((p) => p.nom),
      ).map((p) => ({ id: p.id, nom: p.nom as string }))}
      courriel={{ objet: modele?.objet ?? '', texte: modele?.texte ?? '' }}
      // L'adresse du site, pour l'aperçu du lien : celle que le courriel portera.
      origine={(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')}
    />
  );
}
