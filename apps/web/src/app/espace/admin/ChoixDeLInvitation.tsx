'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LogeBreve } from '@/lib/administration';
import { libelleRoleInvitation } from '@/lib/libelle-role';

const ROLES = ['referent', 'chercheur', 'admin'] as const;

type Props = {
  id: string;
  email: string;
  role: string;
  logeId: string | null;
  loges: LogeBreve[];
};

/**
 * Les cellules « Rôle » et « Loge » d'une invitation en attente, sous forme de
 * menus. Le choix s'applique aussitôt : pas de bouton à valider.
 *
 * L'écran montre d'abord le nouveau choix, puis revient à l'ancien si le
 * serveur refuse — la base reste la seule à dire ce qui est enregistré.
 */
export default function ChoixDeLInvitation({ id, email, role, logeId, loges }: Props) {
  const router = useRouter();
  const [roleChoisi, setRoleChoisi] = useState(role);
  const [logeChoisie, setLogeChoisie] = useState(logeId ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(nouveauRole: string, nouvelleLoge: string) {
    const avantRole = roleChoisi;
    const avantLoge = logeChoisie;
    setRoleChoisi(nouveauRole);
    setLogeChoisie(nouvelleLoge);
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch('/api/invitations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          role: nouveauRole,
          loge_id: nouvelleLoge === '' ? null : nouvelleLoge,
        }),
      });
      const resultat = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRoleChoisi(avantRole);
        setLogeChoisie(avantLoge);
        setErreur(resultat.erreur ?? "L'invitation n'a pas pu être modifiée.");
        return;
      }
      // Le nom de la loge et l'état viennent du serveur : on les fait relire.
      router.refresh();
    } catch {
      setRoleChoisi(avantRole);
      setLogeChoisie(avantLoge);
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <td className="maigre">
        <select
          aria-label={`Rôle de l'invitation de ${email}`}
          value={roleChoisi}
          disabled={envoi}
          onChange={(e) => enregistrer(e.target.value, logeChoisie)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {libelleRoleInvitation(r)}
            </option>
          ))}
        </select>
        {erreur && (
          <p className="erreur" role="alert" style={{ margin: '0.3rem 0 0' }}>
            {erreur}
          </p>
        )}
      </td>
      <td className="maigre">
        <select
          aria-label={`Loge de l'invitation de ${email}`}
          value={logeChoisie}
          disabled={envoi}
          onChange={(e) => enregistrer(roleChoisi, e.target.value)}
        >
          <option value="">— aucune pour l&apos;instant —</option>
          {loges.map((loge) => (
            <option key={loge.id} value={loge.id}>
              {loge.nom ?? 'Sans nom'}
            </option>
          ))}
        </select>
      </td>
    </>
  );
}
