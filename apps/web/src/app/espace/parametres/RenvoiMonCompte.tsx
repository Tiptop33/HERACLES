import Link from 'next/link';

/**
 * Le renvoi vers « Mon compte », au pied de Paramètres.
 *
 * Un composant à part pour qu'un seul texte serve partout : le layout le pose
 * au pied de chaque rubrique, et Paramètres › Loges de Guyenne et Gascogne le
 * reprend sous le dernier cadre de sa colonne de droite (demande du
 * 13 novembre 2026) — la feuille de style n'en montre jamais qu'un
 * (`.parametres-pied`).
 */
export default function RenvoiMonCompte() {
  return (
    <p className="aide parametres-pied">
      {/* Ce que « Mon compte » règle vraiment : il n'a de champ ni pour
          l'adresse électronique ni pour le mot de passe. */}
      {/* L'espace avant le tiret, écrite en toutes lettres : laissée nue après
          le lien, la compilation la perdait (« Mon compte— votre nom »). */}
      <Link href="/mon-compte">Mon compte</Link>
      {' — '}votre nom, votre téléphone, votre photo. C&apos;est ailleurs : ce qui se règle ici vaut pour
      tout le monde.
    </p>
  );
}
