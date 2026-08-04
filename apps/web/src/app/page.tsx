import Link from 'next/link';

export default function Accueil() {
  return (
    <main className="enveloppe">
      <h1>HERACLES</h1>
      <p className="discret">
        Chercher un emploi, une alternance ou un stage, ce n&apos;est pas qu&apos;une affaire
        d&apos;annonces. HERACLES vous met en relation avec un référent : quelqu&apos;un qui
        connaît les démarches, relit vos candidatures et vous conseille — dans la durée.
      </p>

      <div className="voies">
        <Link href="/inscription?role=chercheur" className="carte voie">
          <h2>Je cherche</h2>
          <p>Un emploi, une alternance ou un stage. Je veux être accompagné.</p>
        </Link>

        <Link href="/inscription?role=referent" className="carte voie voie--referent">
          <h2>J&apos;accompagne</h2>
          <p>Bénévole ou professionnel, je peux conseiller et aider dans les démarches.</p>
        </Link>
      </div>

      <p className="discret" style={{ marginTop: '2rem' }}>
        Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
      </p>
    </main>
  );
}
