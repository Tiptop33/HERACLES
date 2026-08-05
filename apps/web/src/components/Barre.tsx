import Link from 'next/link';
import Logo from '@/components/Logo';
import { initiales, nomComplet } from '@/lib/format';
import type { Profil } from '@/lib/profil';

/**
 * La barre du haut, commune aux espaces.
 *
 * La maquette y dessine la marque, le rattachement et la pastille aux
 * initiales. On y ajoute la déconnexion : sans elle, on ne peut plus sortir de
 * l'application.
 */
export default function Barre({
  profil,
  espace,
  accueil,
  cote,
}: {
  profil: Profil;
  espace: string;
  accueil: string;
  /** Ce qui s'affiche à droite : la loge d'un référent, par exemple. */
  cote?: string | null;
}) {
  const nom = nomComplet(profil.prenom, profil.nom);

  return (
    <header className="barre">
      <div className="barre-dedans">
        <Link href={accueil} className="marque">
          <Logo taille="petit" />
          HERACLES <span>· {espace}</span>
        </Link>

        <div className="droite">
          {cote && <span className="maigre">{cote}</span>}

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
