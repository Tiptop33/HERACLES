/**
 * Un petit drapeau français, dessiné plutôt qu'écrit.
 *
 * L'emoji 🇫🇷 aurait été plus court, mais il ne s'affiche comme un drapeau que
 * sur Apple : ailleurs — Windows, la plupart des Linux — il se rend en deux
 * lettres, « FR ». Trois rectangles ne dépendent d'aucune police et pèsent
 * moins qu'une image.
 *
 * Il précède le numéro et le qualifie : d'où `role="img"` et son intitulé,
 * plutôt qu'un `aria-hidden` qui le tairait aux lecteurs d'écran.
 */
export function DrapeauFrance() {
  return (
    <svg className="drapeau" viewBox="0 0 9 6" role="img" aria-label="Numéro français">
      <rect width="3" height="6" x="0" fill="#002395" />
      <rect width="3" height="6" x="3" fill="#ffffff" />
      <rect width="3" height="6" x="6" fill="#ed2939" />
    </svg>
  );
}
