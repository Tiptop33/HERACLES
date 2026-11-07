import Logo from '@/components/Logo';

export const metadata = { title: 'Merci — HERACLES' };

/**
 * Où arrivent le parrain et le candidat une fois leur formulaire envoyé. Ils
 * n'ont pas de compte : il n'y a nulle part ailleurs où les emmener.
 */
const TEXTES = {
  parrain: {
    titre: 'Merci pour votre présentation',
    chapo:
      'La commission a bien reçu votre présentation. Le candidat va recevoir par e-mail un lien pour compléter sa fiche et joindre son CV.',
  },
  candidat: {
    titre: 'Votre fiche est envoyée',
    chapo:
      'Merci. La commission a bien reçu votre fiche et votre CV. Un membre de la commission vous contactera.',
  },
} as const;

export default async function Merci({
  searchParams,
}: {
  searchParams: Promise<{ pour?: string }>;
}) {
  const { pour } = await searchParams;
  const texte = pour === 'candidat' ? TEXTES.candidat : TEXTES.parrain;

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>
        <h1 className="entree-titre">{texte.titre}</h1>
        <p className="entree-chapo">{texte.chapo}</p>
      </div>
    </main>
  );
}
