import Link from 'next/link';
import Logo from '@/components/Logo';

export const metadata = { title: 'Rejoindre HERACLES — HERACLES' };

/**
 * L'inscription libre est fermée.
 *
 * HERACLES porte les dossiers de personnes vulnérables : l'appartenance à une
 * loge et le droit d'accompagner ne se déclarent pas soi-même, ils se donnent.
 * On n'entre qu'invité par un administrateur — c'est le point d'entrée n°1 de
 * la maquette, et la migration 0009 le fait tenir côté base.
 */
export default function Inscription() {
  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        <h1 className="entree-titre">On entre sur invitation</h1>
        <p className="entree-chapo">
          HERACLES ne se rejoint pas de soi-même. Un administrateur vous invite dans une loge, avec
          un rôle : vous recevez alors un e-mail contenant votre lien d&apos;entrée.
        </p>
        <p className="entree-chapo">
          Vous avez reçu cet e-mail ? Ouvrez son lien. Vous n&apos;avez rien reçu ? Demandez à
          l&apos;administrateur de votre loge — et pensez à regarder dans les indésirables.
        </p>

        <Link href="/connexion" className="bouton bouton--marque bouton--pleine-largeur">
          J&apos;ai déjà un compte
        </Link>
      </div>
    </main>
  );
}
