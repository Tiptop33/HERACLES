/**
 * Les deux gestes d'une carte de l'annuaire : corriger, retirer.
 *
 * Dessinés, comme le drapeau : une police d'icônes se charge, échoue parfois,
 * et laisse alors des carrés vides à la place des boutons. Trois traits pèsent
 * moins et arrivent toujours.
 *
 * `aria-label` et non `aria-hidden` : ce sont les seuls libellés de ces
 * boutons depuis que le mot « Modifier » a disparu. Sans lui, un lecteur
 * d'écran annoncerait « lien », et rien d'autre.
 */

export function Stylo() {
  return (
    <svg
      className="icone icone--stylo"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function Corbeille() {
  return (
    <svg
      className="icone icone--corbeille"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
