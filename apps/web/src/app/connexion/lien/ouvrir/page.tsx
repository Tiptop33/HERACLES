import Logo from '@/components/Logo';

export const metadata = { title: 'Ouvrir mon espace — HERACLES' };

/**
 * L'arrivée du lien reçu par courriel (0105). La page ne consomme rien : c'est
 * le bouton qui ouvre la session, en POST. Les messageries qui ouvrent les
 * liens pour les vérifier ne cliquent pas sur les boutons.
 */
export default async function OuvrirMonEspace({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const { jeton } = await searchParams;
  const plausible = typeof jeton === 'string' && /^[A-Za-z0-9_-]{20,200}$/.test(jeton);

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        {plausible ? (
          <>
            <h1 className="entree-titre">Votre espace candidat</h1>
            <p className="entree-chapo">Un clic, et vous y êtes.</p>
            <form action="/api/connexion/lien/ouvrir" method="post">
              <input type="hidden" name="jeton" value={jeton} />
              <button className="bouton bouton--marque bouton--pleine-largeur" type="submit">
                Ouvrir mon espace
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="entree-titre">Ce lien est incomplet</h1>
            <p className="entree-chapo">
              Copiez-le en entier depuis le courriel, ou demandez-en un nouveau.
            </p>
            <a className="bouton bouton--marque bouton--pleine-largeur" href="/connexion/lien">
              Recevoir un nouveau lien
            </a>
          </>
        )}
      </div>
    </main>
  );
}
