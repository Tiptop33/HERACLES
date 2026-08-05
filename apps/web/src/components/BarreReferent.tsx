import Link from 'next/link';
import Logo from '@/components/Logo';
import { initiales, nomComplet } from '@/lib/format';
import type { Profil } from '@/lib/profil';

/**
 * La barre du haut de l'espace référent.
 *
 * La maquette y dessine la marque, la loge et la pastille aux initiales. On y
 * ajoute la déconnexion : sans elle, on ne peut plus sortir de l'application.
 */
export default function BarreReferent({ profil, loge }: { profil: Profil; loge: string | null }) {
  const nom = nomComplet(profil.prenom, profil.nom);

  return (
    <header className="barre">
      <div className="barre-dedans">
        <Link href="/espace/referent" className="marque">
          <Logo taille="petit" />
          HERACLES <span>· espace référent</span>
        </Link>

        <div className="droite">
          {loge && <span className="maigre">Loge de {loge}</span>}

          <form action="/api/deconnexion" method="post">
            <button type="submit" className="lien-nu">
              Se déconnecter
            </button>
          </form>

          <Link href="/mon-compte" className="pastille" title={`${nom} — mon compte`}>
            {initiales(profil.prenom, profil.nom)}
          </Link>
        </div>
      </div>
    </header>
  );
}
