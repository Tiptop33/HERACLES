import Link from 'next/link';
import Logo from '@/components/Logo';

export default function Accueil() {
  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
          <h1>HERACLES</h1>
        </div>

        <p className="entree-chapo">
          L&apos;outil de travail des référents et des parrains qui accompagnent des personnes en
          recherche d&apos;emploi, d&apos;alternance ou de stage.
        </p>

        <Link href="/connexion" className="bouton bouton--marque bouton--pleine-largeur">
          Se connecter
        </Link>

        <p className="entree-pied">
          Vous avez reçu une invitation ? <Link href="/inscription">Comment entrer</Link>
        </p>
      </div>
    </main>
  );
}
