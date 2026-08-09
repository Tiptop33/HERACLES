import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dateEnLettres, initiales, nomAffichable } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import {
  ABSENT,
  EXCUSE,
  PRESENT,
  compter,
  lireFeuilleDAppel,
  lireRegistre,
  lireUneReunion,
  phraseDeRefusReunion,
  type LigneDAppel,
  type LigneDeRegistre,
} from '@/lib/reunion';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Réunion — HERACLES' };

/**
 * « Réunion » — l'appel des référents, et le registre de l'exercice.
 *
 * L'écran a deux temps : le registre des réunions passées, et la feuille
 * d'appel de celle qu'on ouvre. L'adresse dit laquelle est ouverte — comme
 * partout ici, l'état de l'écran tient dans l'URL, donc un rafraîchissement
 * ne perd rien et une adresse se partage.
 *
 * Chaque clic enregistre. L'appel se fait à voix haute, nom par nom, et la
 * réponse doit être en base au moment où elle est donnée : une feuille qu'on
 * remplit puis qu'on soumet perd tout si le téléphone se verrouille au milieu.
 */
export default async function Reunion({
  searchParams,
}: {
  searchParams: Promise<{ appel?: string | string[]; erreur?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

  const ouverte = premier(parametres.appel);
  const refus = phraseDeRefusReunion(premier(parametres.erreur));

  // La réunion ouverte se lit par son identifiant, et non dans le registre :
  // celui-ci ne rend que l'exercice en cours, et une réunion tenue hors bornes
  // ne s'affichait alors nulle part (migration 0037).
  const [registre, feuille, laReunion] = await Promise.all([
    lireRegistre(),
    ouverte ? lireFeuilleDAppel(ouverte) : Promise.resolve([]),
    ouverte ? lireUneReunion(ouverte) : Promise.resolve(null),
  ]);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <main className="corps">
      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      <div className="entete-liste">
        <div>
          <h1>Réunion</h1>
          <span className="compte">
            {registre.length} réunion{registre.length > 1 ? 's' : ''} sur l’exercice
          </span>
        </div>
      </div>

      {ouverte && laReunion ? (
        <FeuilleDAppel reunion={laReunion} lignes={feuille} />
      ) : (
        <OuvrirUneReunion aujourdhui={aujourdhui} />
      )}

      <Registre lignes={registre} ouverte={ouverte} />
    </main>
  );
}

/** Le bandeau qui ouvre la réunion du jour, ou d'un autre jour. */
function OuvrirUneReunion({ aujourdhui }: { aujourdhui: string }) {
  return (
    <section className="bloc reunion-ouvrir">
      <div>
        <h2>Faire l’appel</h2>
        <p className="maigre">
          La réunion du jour s’ouvre d’un clic. Si elle l’est déjà, vous retombez sur la
          même feuille — deux personnes ne tiennent jamais deux appels séparés.
        </p>
      </div>

      <form method="post" action="/api/reunions" className="reunion-ouvrir-form">
        <label className="visuellement-cache" htmlFor="tenue_le">
          Jour de la réunion
        </label>
        <input type="date" id="tenue_le" name="tenue_le" defaultValue={aujourdhui} />
        <input
          type="text"
          name="lieu"
          maxLength={200}
          placeholder="Lieu (facultatif)"
          aria-label="Lieu de la réunion"
        />
        <button className="bouton bouton--fort" type="submit">
          Ouvrir l’appel
        </button>
      </form>
    </section>
  );
}

/**
 * La feuille : une ligne par référent, la photo à gauche, trois boutons à
 * droite. C'est l'appel papier transposé — on descend la liste, on coche, et
 * personne ne se demande où il en est.
 */
function FeuilleDAppel({
  reunion,
  lignes,
}: {
  reunion: LigneDeRegistre;
  lignes: LigneDAppel[];
}) {
  const n = compter(lignes);
  const retour = `/espace/reunion?appel=${reunion.id}`;

  return (
    <section className="bloc appel">
      <div className="appel-tete">
        <div>
          <h2>
            Réunion du <time dateTime={reunion.tenue_le}>{dateEnLettres(reunion.tenue_le)}</time>
          </h2>
          <p className="maigre">
            {reunion.lieu ? `${reunion.lieu} · ` : ''}
            {lignes.length} référent{lignes.length > 1 ? 's' : ''}
          </p>

          {/* Une réunion hors des bornes de l'exercice s'appelle et se compte
              comme les autres, mais n'entre dans aucun total. Le taire
              donnerait des chiffres d'assiduité inexplicables. */}
          {reunion.hors_exercice && (
            <p className="aide">
              Cette réunion est hors de l’exercice en cours : elle ne compte dans aucun
              total, et n’apparaît pas au registre. Les dates d’exercice se règlent dans
              les paramètres de l’application.
            </p>
          )}
        </div>

        <div className="appel-compte">
          <span className="etat etat--suivi">{n.presents} présents</span>
          <span className="etat etat--attente">{n.excuses} excusés</span>
          <span className="etat etat--clos">{n.absents} absents</span>
          {n.aAppeler > 0 && <span className="maigre">{n.aAppeler} à appeler</span>}
        </div>
      </div>

      {lignes.length === 0 ? (
        <p className="vide-liste">
          Aucun référent dans votre loge. Rattachez-les depuis l’annuaire avant de faire
          l’appel.
        </p>
      ) : (
        <ol className="appel-feuille">
          {lignes.map((ligne) => (
            <LigneDeFeuille
              key={ligne.referent_id}
              ligne={ligne}
              reunion={reunion.id}
              retour={retour}
            />
          ))}
        </ol>
      )}

      <p className="maigre" style={{ marginTop: '0.8rem' }}>
        Chaque clic est enregistré tout de suite. <Link href="/espace/reunion">Fermer la feuille</Link>
      </p>
    </section>
  );
}

/** Un référent : sa photo, son nom, son assiduité, et les trois boutons. */
function LigneDeFeuille({
  ligne,
  reunion,
  retour,
}: {
  ligne: LigneDAppel;
  reunion: string;
  retour: string;
}) {
  const nom = nomAffichable(ligne.prenom, ligne.nom, null) ?? 'Référent sans nom';

  // Ce qu'on a vu de cette personne depuis le début de l'exercice. C'est ce
  // chiffre qui donne son sens à l'appel : sans lui, on coche sans savoir.
  const assiduite = [
    ligne.presences > 0 && `${ligne.presences} présence${ligne.presences > 1 ? 's' : ''}`,
    ligne.excuses > 0 && `${ligne.excuses} excuse${ligne.excuses > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="appel-ligne" data-etat={ligne.etat ?? ''}>
      {/* La photo tout à gauche, avant le nom : on reconnaît un visage plus
          vite qu'on ne lit un patronyme, et l'appel se fait des gens devant
          soi. Les initiales prennent le relais quand Bubble n'a pas de photo. */}
      {ligne.a_une_photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="appel-portrait"
          src={`/espace/referents/${ligne.referent_id}/photo`}
          alt=""
          width={44}
          height={44}
        />
      ) : (
        <span className="appel-portrait appel-initiales" aria-hidden="true">
          {initiales(ligne.prenom, ligne.nom)}
        </span>
      )}

      <span className="appel-nom">
        {nom}
        <small>{assiduite || 'aucune présence cette année'}</small>
      </span>

      <span className="appel-segments" role="group" aria-label={`Appel de ${nom}`}>
        {[PRESENT, EXCUSE, ABSENT].map((etat) => (
          <form key={etat} method="post" action={`/api/reunions/${reunion}/appel`}>
            <input type="hidden" name="referent" value={ligne.referent_id} />
            <input type="hidden" name="etat" value={etat} />
            <input type="hidden" name="retour" value={retour} />
            <button
              type="submit"
              data-etat={etat}
              aria-pressed={ligne.etat === etat}
              aria-label={`${etat} — ${nom}`}
            >
              {etat}
            </button>
          </form>
        ))}
      </span>
    </li>
  );
}

/** Le registre de l'exercice, et les gestes sur chaque réunion. */
function Registre({ lignes, ouverte }: { lignes: LigneDeRegistre[]; ouverte: string }) {
  if (lignes.length === 0) {
    return (
      <p className="vide-liste">
        Aucune réunion sur cet exercice. La première ouvre le registre.
      </p>
    );
  }

  return (
    <section className="bloc" style={{ marginTop: '1rem' }}>
      <h2>Le registre de l’exercice</h2>
      <p className="maigre">
        Les dates d’exercice viennent des paramètres de l’application. Une réunion hors
        de ces bornes ne compte pas.
      </p>

      <div className="table-large">
        <table className="registre">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="n">Présents</th>
              <th scope="col" className="n">Excusés</th>
              <th scope="col" className="n">Absents</th>
              <th scope="col">
                <span className="visuellement-cache">Gestes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((r) => (
              <tr key={r.id} aria-current={r.id === ouverte ? 'true' : undefined}>
                <td>
                  <Link href={`/espace/reunion?appel=${r.id}`}>
                    <time dateTime={r.tenue_le}>{dateEnLettres(r.tenue_le)}</time>
                  </Link>
                  {r.lieu && <small className="maigre"> · {r.lieu}</small>}
                </td>
                <td className="n">{r.presents}</td>
                <td className="n">{r.excuses}</td>
                <td className="n">{r.absents}</td>
                <td>
                  <span className="gestes">
                    <Link className="bouton bouton--petit" href={`/espace/reunion?appel=${r.id}`}>
                      Modifier
                    </Link>
                    {/* La confirmation est un `<dialog>` par ligne : sans
                        JavaScript le bouton reste un lien vers la page de
                        confirmation, avec lui il ouvre la fenêtre sur place. */}
                    <Link
                      className="bouton bouton--petit bouton--danger"
                      href={`/espace/reunion/${r.id}/retirer`}
                    >
                      Retirer
                    </Link>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
