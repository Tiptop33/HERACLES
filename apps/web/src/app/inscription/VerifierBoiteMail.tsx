/**
 * Ce qu'on affiche une fois l'inscription envoyée. Partagé par les deux
 * chemins : le composant client, quand JavaScript répond, et la page
 * elle-même, quand le formulaire est parti sans lui.
 */
export default function VerifierBoiteMail() {
  return (
    <div>
      <h2>Vérifiez votre boîte mail</h2>
      <p className="discret">
        Un email de confirmation vient de partir. Ouvrez-le et cliquez sur le lien pour activer
        votre compte. Pensez à regarder dans les indésirables.
      </p>
    </div>
  );
}
