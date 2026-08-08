/**
 * Les icônes de l'application.
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

/** La coche : la tâche est faite, l'appuyer la referme. */
export function Coche() {
  return (
    <svg
      className="icone icone--coche"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.4 12.3 2.5 2.5 4.7-5.5" />
    </svg>
  );
}

/** La flèche qui revient sur ses pas : la tâche était close, l'appuyer la rouvre. */
export function FlecheRetour() {
  return (
    <svg
      className="icone icone--fleche-retour"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/** La feuille cornée : un document déposé, qui s'ouvre. */
export function Feuille() {
  return (
    <svg
      className="icone icone--feuille"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7.5Z" />
      <path d="M14.5 2.5v5h5" />
    </svg>
  );
}

/**
 * La même feuille, barrée d'un trait : la place d'un document, et rien dedans.
 *
 * C'est le tiret que la carte écrivait, rentré dans la feuille — la place
 * existe, elle est vide. Un document manquant se distingue ainsi d'un document
 * déposé à la forme, sans avoir à lire l'étiquette.
 */
export function FeuilleVide() {
  return (
    <svg
      className="icone icone--feuille"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7.5Z" />
      <path d="M14.5 2.5v5h5" />
      <path d="M9 14.5h6" />
    </svg>
  );
}

export function Roue() {
  return (
    <svg
      className="icone icone--roue"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

/** L'œil ouvert : le mot de passe est masqué, l'appuyer le montre. */
export function Oeil() {
  return (
    <svg
      className="icone icone--oeil"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** L'œil barré : le mot de passe est en clair, l'appuyer le remasque. */
export function OeilBarre() {
  return (
    <svg
      className="icone icone--oeil"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.2" />
      <path d="M6.7 6.7A17.5 17.5 0 0 0 2 12s3.6 7 10 7a10.5 10.5 0 0 0 4.4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

/** La poignée qu'on attrape pour ranger : six points, comme partout. */
export function Poignee() {
  return (
    <svg className="icone icone--poignee" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}
