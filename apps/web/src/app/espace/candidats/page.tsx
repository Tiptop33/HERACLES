import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  VUES,
  chercher,
  estVue,
  filtrerParVue,
  lireDesignation,
  lireFiche,
  listerCandidatsDeLaLoge,
  lireLaDateDeCloture,
  nomDeFamilleDabord,
  puisJeCloturerDesDossiers,
  resumeDeLaVue,
  sousTitreDuRang,
  vueDOuverture,
  type LigneCandidat,
  type Vue,
} from '@/lib/poste';
import { initiales, nomComplet } from '@/lib/format';
import { Corbeille } from '@/components/Icones';
// Les libellés des quatre familles vivent avec les pastilles de l'accueil : un
// seul endroit où lire « Changement d'emploi », et donc une seule façon de
// l'écrire.
import { FAMILLES } from '@/components/VueAccueil';
import { jeSuisReferent, lireJournal, lireRetirees } from '@/lib/journal';
import { MOTIFS_DE_CLOTURE } from '@/lib/candidats-refermes';
import { estArchive, estCloture, estFerme, raisonDeFermeture } from '@/lib/suivi';
import { jourEntier } from '@/lib/documents/formats';
import { listerAnnuaire } from '@/lib/annuaire';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import OuvrirNouveauCandidat from '@/components/OuvrirNouveauCandidat';
import PanneauFiche, { estOnglet, type Collegue, type Onglet } from './PanneauFiche';

export const metadata = { title: 'Candidats — HERACLES' };

type Parametres = {
  q?: string | string[];
  vue?: string | string[];
  fiche?: string | string[];
  onglet?: string | string[];
  /** La note du journal ouverte en correction. */
  note?: string | string[];
  /** Ce que la route d'écriture du journal a répondu, quand elle a refusé. */
  erreur?: string | string[];
  /** Ce que la route de prise en charge a répondu, quand elle a refusé. */
  prise?: string | string[];
  /** Le dossier dont on demande la suppression : la fenêtre s'ouvre dessus. */
  supprimer?: string | string[];
  /** Ce que la route de suppression a répondu, quand elle a refusé. */
  suppression?: string | string[];
  /** « 1 » : la fenêtre de clôture s'ouvre sur la fiche (0071). */
  cloturer?: string | string[];
  /** Ce que la route de clôture a répondu, quand elle a refusé. */
  cloture?: string | string[];
  /** « 1 » : la fenêtre de réouverture s'ouvre sur la fiche (0072). */
  rouvrir?: string | string[];
  /** Ce que la route de réouverture a répondu, quand elle a refusé. */
  reouverture?: string | string[];
};

/**
 * Ce que la route de suppression renvoie, dit à qui a cliqué. Un code dans
 * l'adresse, jamais un message : un lien fabriqué ne peut faire afficher que
 * l'une de ces phrases-ci.
 */
/** Ce que la route de clôture renvoie quand elle refuse (0071). */
const REFUS_DE_CLOTURE: Record<string, string> = {
  droit: 'Seuls l’administration, le Vénérable Maître et le Secrétaire clôturent un dossier.',
  introuvable: 'Ce dossier n’existe plus, ou il n’est pas de votre loge.',
  deja: 'Ce dossier est déjà clôturé ou archivé.',
  motif: 'Dites qui a refermé le dossier : lui-même, Heraclés ou autre.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'Le dossier n’a pas pu être clôturé.',
};

/** Ce que la route de réouverture renvoie quand elle refuse (0072). */
const REFUS_DE_REOUVERTURE: Record<string, string> = {
  droit: 'Seuls l’administration, le Vénérable Maître et le Secrétaire rouvrent un dossier.',
  introuvable: 'Ce dossier n’existe plus, ou il n’est pas de votre loge.',
  'pas-cloture': 'Seul un dossier clôturé, et pas archivé, se rouvre.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'Le dossier n’a pas pu être rouvert.',
};

const REFUS_DE_SUPPRESSION: Record<string, string> = {
  droit: 'Seuls l’administration, le Vénérable Maître et le Secrétaire suppriment un dossier.',
  introuvable: 'Ce dossier n’existe plus.',
  bubble: 'Ce dossier vient de Bubble : il ne se supprime pas, la reprise finale le ferait revenir.',
  compte: 'Ce candidat a un compte de connexion : son dossier ne peut pas être supprimé ici.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'Le dossier n’a pas pu être supprimé.',
};

/**
 * Un nom qui ne se coupe pas : espaces et tirets insécables. Un menu
 * déroulant natif ne se règle pas en CSS, mais il ne coupe pas une ligne là
 * où rien ne l'autorise à le faire.
 */
function surUneLigne(texte: string): string {
  return texte.trim().replace(/\s+/g, '\u00a0').replace(/-/g, '\u2011');
}

/** Le premier des paramètres d'adresse, quand il y en a plusieurs. */
function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

/**
 * Le poste de travail (maquette 1c) : la liste ne disparaît jamais, la fiche
 * s'ouvre à côté. On enchaîne dix candidats sans revenir en arrière.
 *
 * Tout l'état de l'écran — la vue, la recherche, la fiche ouverte, l'onglet —
 * tient dans l'adresse. Trois conséquences, et les trois comptent : l'écran
 * fonctionne sans une ligne de script ; une adresse se met en favori et
 * s'envoie à un collègue ; et le bouton « retour » du navigateur revient au
 * candidat précédent, ce qu'aucun panneau ouvert en JavaScript ne sait faire.
 */
export default async function PosteDeTravail({
  searchParams,
}: {
  searchParams: Promise<Parametres>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const recherche = premier(parametres.q);
  const demandee = premier(parametres.vue);
  const demande = premier(parametres.fiche);
  const demandeOnglet = premier(parametres.onglet);
  const onglet: Onglet = estOnglet(demandeOnglet) ? demandeOnglet : 'profil';
  // La note ouverte en correction. Elle vit dans l'adresse comme le reste :
  // un rafraîchissement ne referme pas ce qu'on était en train d'écrire.
  const corrige = premier(parametres.note) || null;

  const tous = await listerCandidatsDeLaLoge();

  // La fenêtre de suppression ne s'ouvre que sur un dossier que la base dit
  // supprimable : une adresse fabriquée ne fait pas paraître de bouton rouge
  // sur le dossier d'un autre, ou sur un dossier repris de Bubble.
  const aSupprimer =
    tous.find((l) => l.id === premier(parametres.supprimer) && l.supprimable) ?? null;
  const refusDeSuppression =
    REFUS_DE_SUPPRESSION[premier(parametres.suppression)] ??
    REFUS_DE_CLOTURE[premier(parametres.cloture)] ??
    REFUS_DE_REOUVERTURE[premier(parametres.reouverture)] ??
    null;
  // La place de la corbeille se réserve sur tous les rangs dès qu'un seul en
  // porte une — comme le point des « urgents » : sinon les numéros de droite
  // se décaleraient d'un rang à l'autre. Calculée sur toute la liste, et non
  // sur la vue : changer de vue ne doit pas faire bouger la colonne.
  const avecCorbeille = tous.some((l) => l.supprimable);

  // L'adresse nue ouvre sur « Mes candidats » — ou sur la loge quand on n'en
  // accompagne aucun. C'est la seule chose de cet écran qui dépende des
  // données plutôt que de l'adresse, et c'est voulu : la première seconde
  // décide de ce qu'on croit que l'application contient.
  const ouverture = vueDOuverture(tous);
  const vue: Vue = estVue(demandee) ? demandee : ouverture;

  const deLaVue = filtrerParVue(tous, vue);
  const lignes = chercher(deLaVue, recherche);

  // La fiche se demande à la base, jamais à la liste : on ne se sert pas de ce
  // qu'un écran a déjà chargé pour décider de ce qu'un autre a le droit de
  // montrer.
  const fiche = demande ? await lireFiche(demande) : null;
  const rang = lignes.find((l) => l.id === demande) ?? null;

  // Le journal ne se charge que si on le regarde. Un onglet fermé ne doit rien
  // coûter — ni au serveur, ni au réseau : ce sont des notes sur des personnes.
  const journal = fiche && onglet === 'suivi' ? await lireJournal(fiche.id) : [];
  // Ce qui a été écarté du journal. Chargé avec lui, et pour la même raison :
  // un onglet fermé ne doit rien coûter.
  const retirees = fiche && onglet === 'suivi' ? await lireRetirees(fiche.id) : [];
  // Écrire dans le journal ne demande plus d'accompagner le candidat, mais
  // seulement d'avoir une fiche de référent (0027). `fiche.modifiable`, lui,
  // garde son sens : corriger la fiche elle-même reste au référent.
  const jePeuxNoter = fiche && onglet === 'suivi' ? await jeSuisReferent() : false;

  // Le bouton « Clôturer le dossier » (0071) : un dossier en cours, et le
  // droit de le faire. La base revérifie l'un et l'autre en clôturant.
  // Rouvrir (0072) : le même droit, sur un dossier clôturé et pas archivé.
  const jePeuxCloturer = fiche ? await puisJeCloturerDesDossiers() : false;
  const cloturable = Boolean(fiche && jePeuxCloturer && !estFerme(fiche));
  const rouvrable = Boolean(fiche && jePeuxCloturer && estCloture(fiche) && !estArchive(fiche));
  const aCloturer = cloturable && premier(parametres.cloturer) === '1' ? fiche : null;
  const aRouvrir = rouvrable && premier(parametres.rouvrir) === '1' ? fiche : null;
  const clotureARouvrir = aRouvrir ? await lireLaDateDeCloture(aRouvrir.id) : null;

  // Le menu « Référent » (0057, élargi en 0063). La base dit si la session
  // peut choisir un référent pour ce candidat — un dossier sans référent pour
  // tout référent de la loge, le sien pour son référent, tous ceux de la loge
  // pour l'administration, le Vénérable Maître et le Secrétaire. On ne charge
  // l'annuaire que dans ce cas, et seulement les référents de la loge du
  // candidat : c'est parmi eux que la base acceptera de choisir.
  let collegues: Collegue[] | null = null;
  let referentActuel: string | null = null;
  if (fiche && fiche.loge_id) {
    const designation = await lireDesignation(fiche.id);
    if (designation?.je_peux_choisir) {
      referentActuel = designation.referent_id;
      const annuaire = await listerAnnuaire();
      // « NOM Prénom », dans l'ordre alphabétique de ce qui s'affiche — comme
      // la liste des candidats. Le tri se refait ici, en français, plutôt que
      // de se fier à l'ordre de la base : la base trie selon sa collation, et
      // la liste doit se lire dans l'ordre où l'œil la parcourt.
      const ordre = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
      collegues = annuaire
        .filter((r) => r.loge_id === fiche.loge_id)
        .map((r) => ({
          id: r.id,
          nom: nomDeFamilleDabord(r.nom, r.prenom),
          c_est_moi: r.c_est_moi,
        }))
        .sort((a, b) => ordre.compare(a.nom, b.nom))
        // Un nom = une ligne dans la liste ouverte. Le menu natif de l'iPad
        // coupe un nom long à ses espaces et à ses tirets : des espaces et un
        // tiret insécables l'en empêchent. Les espaces doublés et les retours
        // à la ligne venus de la reprise Bubble disparaissent au passage.
        .map((c) => ({ ...c, nom: surUneLigne(c.nom) }));
    }
  }

  /** L'adresse de ce même écran, avec un paramètre en plus ou en moins. */
  const adresse = (ajout: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (recherche) p.set('q', recherche);
    if (vue !== ouverture) p.set('vue', vue);
    if (demande) p.set('fiche', demande);
    if (onglet !== 'profil') p.set('onglet', onglet);
    if (corrige) p.set('note', corrige);
    // `erreur` n'est pas repris : il vaut pour l'envoi qui vient d'échouer, et
    // le traîner d'un clic à l'autre ferait porter le refus à un autre geste.

    for (const [cle, valeur] of Object.entries(ajout)) {
      if (valeur === null) p.delete(cle);
      else p.set(cle, valeur);
    }

    const suite = p.toString();
    return suite ? `/espace/candidats?${suite}` : '/espace/candidats';
  };

  return (
    <main className="poste">
      <aside className="poste-volet" aria-label="Liste des candidats">
        <div className="poste-volet-tete">
          <div className="poste-volet-entete">
            <p className="poste-volet-titre">
              Candidats <span aria-hidden="true">·</span>{' '}
              <span className="maigre">{resumeDeLaVue(deLaVue, vue)}</span>
            </p>
            {/* Ouvrir un dossier, comme chez Bubble : on invite le parrain,
                qui présente le candidat. Réservé aux référents — c'est leur
                loge qui recevra le dossier. */}
            {profil.role === 'referent' && (
              <OuvrirNouveauCandidat className="bouton bouton--fort bouton--petit">
                Nouveau candidat
              </OuvrirNouveauCandidat>
            )}
          </div>

          {refusDeSuppression && (
            <p className="erreur" role="alert">
              {refusDeSuppression}
            </p>
          )}

          {/* Un formulaire en `get` : la recherche part avec la vue et la fiche
              ouverte, et l'adresse obtenue reste partageable. */}
          <form className="poste-chercher" method="get" action="/espace/candidats">
            {vue !== ouverture && <input type="hidden" name="vue" value={vue} />}
            {demande && <input type="hidden" name="fiche" value={demande} />}
            {onglet !== 'profil' && <input type="hidden" name="onglet" value={onglet} />}
            <input
              className="recherche"
              type="search"
              name="q"
              defaultValue={recherche}
              placeholder="Chercher…"
              aria-label="Chercher un candidat"
            />
          </form>

          {/* Quatre pastilles : deux portées de travail, puis ce qui est
              refermé. Deux sur deux plutôt qu'à la suite — « Mes candidats »
              ne tient pas sur un quart de volet, et une rangée qui déborde au
              hasard se lit comme un accident. */}
          <div className="poste-vues">
            {VUES.map(({ valeur, libelle }) => (
              <Link
                key={valeur}
                href={adresse({ vue: valeur === ouverture ? null : valeur })}
                className="filtre filtre--menu"
                aria-current={vue === valeur}
              >
                {libelle}
              </Link>
            ))}
          </div>
        </div>

        {tous.length === 0 ? (
          <p className="poste-volet-vide">
            {profil.role === 'admin'
              ? 'Aucun candidat dans la base.'
              : 'Votre compte n’est rattaché à aucune loge. Une personne de l’administration doit faire le lien avant que les candidats apparaissent ici.'}
          </p>
        ) : lignes.length === 0 ? (
          <p className="poste-volet-vide">
            {recherche
              ? 'Personne ne correspond.'
              : vue === 'mes'
                ? 'Vous n’accompagnez aucun candidat. « En cours » montre ceux de vos collègues.'
                : 'Aucun dossier dans cette vue.'}
          </p>
        ) : (
          <ul className={`poste-rangs${avecCorbeille ? ' poste-rangs--corbeille' : ''}`}>
            {lignes.map((ligne) => (
              <li key={ligne.id}>
                <Rang
                  ligne={ligne}
                  vers={adresse({ fiche: ligne.id })}
                  ouverte={ligne.id === demande}
                />
                {/* La corbeille est un lien voisin du rang, et non un bouton
                    dedans : un lien dans un lien n'est pas du HTML, et un
                    clic dessus ouvrirait la fiche en même temps. Elle ouvre
                    la fenêtre de confirmation — rien ne part sans elle. */}
                {ligne.supprimable && (
                  <Link
                    href={adresse({ supprimer: ligne.id })}
                    className="geste geste--retirer poste-rang-corbeille"
                    aria-label={`Supprimer le dossier de ${nomDeFamilleDabord(ligne.nom, ligne.prenom)}`}
                    title="Supprimer ce dossier"
                  >
                    <Corbeille />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="poste-fiche" aria-label="Fiche du candidat">
        {fiche ? (
          <PanneauFiche
            fiche={fiche}
            rang={rang}
            onglet={onglet}
            journal={journal}
            refus={premier(parametres.erreur) || null}
            corrige={corrige}
            retirees={retirees}
            jePeuxNoter={jePeuxNoter}
            adresse={adresse}
            collegues={collegues}
            referentActuel={referentActuel}
            prise={premier(parametres.prise) || null}
            cloturable={cloturable}
            rouvrable={rouvrable}
          />
        ) : demande ? (
          // Ni « introuvable », ni « interdit ». La base n'a rien rendu, et
          // c'est la seule chose que l'on sache : distinguer les deux
          // apprendrait déjà quelque chose à qui tâtonne.
          <p className="poste-fiche-vide">
            Cette fiche n’est pas dans vos loges&nbsp;— ou n’existe plus.
          </p>
        ) : (
          <p className="poste-fiche-vide">
            Choisissez quelqu’un dans la liste&nbsp;: sa fiche s’ouvre ici, et la liste reste.
          </p>
        )}
      </section>

      {aCloturer && (
        <FenetreDeCloture
          id={aCloturer.id}
          nom={nomComplet(aCloturer.prenom, aCloturer.nom)}
          fermer={adresse({ cloturer: null })}
        />
      )}

      {aRouvrir && (
        <FenetreDeReouverture
          id={aRouvrir.id}
          nom={nomComplet(aRouvrir.prenom, aRouvrir.nom)}
          motif={raisonDeFermeture(aRouvrir)}
          le={clotureARouvrir?.clos_le ?? null}
          estime={clotureARouvrir?.clos_estime ?? false}
          fermer={adresse({ rouvrir: null })}
        />
      )}

      {aSupprimer && (
        <FenetreDeSuppression
          ligne={aSupprimer}
          fermer={adresse({})}
          // Après la suppression, la liste revient telle qu'on l'avait
          // laissée — sauf la fiche, si c'était celle qu'on vient d'effacer.
          retour={
            aSupprimer.id === demande
              ? adresse({ fiche: null, onglet: null, note: null })
              : adresse({})
          }
        />
      )}
    </main>
  );
}

/**
 * La fenêtre de clôture d'un dossier (0071) : qui l'a refermé — les mots de
 * Bubble —, puis « Clôturer le dossier ». La date est celle du jour. Deux mois
 * plus tard, l'accueil du Vénérable Maître et du Secrétaire proposera de
 * l'archiver.
 */
function FenetreDeCloture({ id, nom, fermer }: { id: string; nom: string; fermer: string }) {
  return (
    <div className="fenetre-fond">
      <Link href={fermer} scroll={false} className="fenetre-voile" aria-label="Fermer sans rien clôturer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="cloture-titre">
        <h2 id="cloture-titre">Clôturer le dossier de {nom}&nbsp;?</h2>

        <form method="post" action={`/api/candidats/${id}/cloturer`}>
          <input type="hidden" name="retour" value={fermer} />
          <fieldset className="cloture-motifs">
            <legend>Qui a refermé le dossier&nbsp;?</legend>
            {MOTIFS_DE_CLOTURE.map((motif, i) => (
              <label key={motif}>
                <input type="radio" name="par" value={motif} required defaultChecked={i === 0} />{' '}
                {motif}
              </label>
            ))}
          </fieldset>

          <p className="aide">
            Le dossier passe dans les clôturés, daté d’aujourd’hui. Son archivage sera proposé
            au Vénérable Maître et au Secrétaire dans deux mois.
          </p>

          <div className="fenetre-gestes">
            <Link href={fermer} scroll={false} className="bouton">
              Annuler
            </Link>
            <button className="bouton bouton--fort" type="submit">
              Clôturer le dossier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * La fenêtre de confirmation avant de rouvrir un dossier clôturé (0072). Elle
 * dit ce que la réouverture efface : qui avait refermé le dossier, et quand.
 */
function FenetreDeReouverture({
  id,
  nom,
  motif,
  le,
  estime,
  fermer,
}: {
  id: string;
  nom: string;
  motif: string | null;
  le: string | null;
  estime: boolean;
  fermer: string;
}) {
  const quand = le ? `le ${estime ? '≈ ' : ''}${jourEntier(le)}` : null;
  const detail = [motif?.replace(/[\s,]+$/, ''), quand].filter(Boolean).join(', ');

  return (
    <div className="fenetre-fond">
      <Link href={fermer} scroll={false} className="fenetre-voile" aria-label="Fermer sans rien rouvrir" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="reouverture-titre">
        <h2 id="reouverture-titre">Rouvrir le dossier de {nom}&nbsp;?</h2>

        <p>
          Il revient dans les dossiers en cours ; la clôture{detail ? ` (${detail})` : ''} est
          effacée.
        </p>

        <div className="fenetre-gestes">
          <Link href={fermer} scroll={false} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/candidats/${id}/rouvrir`}>
            <input type="hidden" name="retour" value={fermer} />
            <button className="bouton bouton--fort" type="submit">
              Rouvrir le dossier
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * La fenêtre de confirmation avant de supprimer un dossier.
 *
 * Elle dit **ce qu'on perd**, plutôt que « êtes-vous sûr ? » — une question à
 * laquelle on répond oui sans lire. Rendue par le serveur, sur la seule foi de
 * l'adresse : elle s'ouvre sans une ligne de script, et le bouton « retour »
 * du navigateur la referme, comme un clic à côté ou « Annuler ».
 */
function FenetreDeSuppression({
  ligne,
  fermer,
  retour,
}: {
  ligne: LigneCandidat;
  /** L'adresse de la liste, fenêtre fermée. */
  fermer: string;
  /** Où revenir une fois le dossier supprimé. */
  retour: string;
}) {
  const nom = nomComplet(ligne.prenom, ligne.nom);

  return (
    <div className="fenetre-fond">
      <Link href={fermer} className="fenetre-voile" aria-label="Fermer sans rien supprimer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="suppression-titre">
        <h2 id="suppression-titre">Supprimer le dossier de {nom}&nbsp;?</h2>

        <p>
          Le dossier{ligne.numero !== null ? ` n° ${ligne.numero}` : ''} disparaîtra de
          HERACLES, avec <strong>son journal de suivi</strong>,{' '}
          <strong>son CV, sa lettre et sa photo</strong>, ses affichettes archivées, et
          l’invitation envoyée à son parrain.
        </p>

        <p className="aide">Cela ne se défait pas.</p>

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/candidats/${ligne.id}/supprimer`}>
            <input type="hidden" name="retour" value={retour} />
            <button className="bouton bouton--danger" type="submit">
              Supprimer le dossier
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Un rang de la liste : la photo, le nom, et une seconde ligne qui dit le
 * métier et la ville. Deux lignes, comme sur la maquette — un volet de deux
 * cents pixels n'en tient pas trois.
 */
function Rang({
  ligne,
  vers,
  ouverte,
}: {
  ligne: LigneCandidat;
  vers: string;
  ouverte: boolean;
}) {
  const nom = nomDeFamilleDabord(ligne.nom, ligne.prenom);
  const sous = sousTitreDuRang(ligne);
  const famille = FAMILLES.find((f) => f.cle === ligne.famille);

  return (
    <Link
      className={`poste-rang${famille ? ` poste-rang--${famille.cle}` : ''}`}
      href={vers}
      aria-current={ouverte ? 'true' : undefined}
    >
      {/* Le liseré de gauche dit la famille par sa couleur ; ce mot la dit aux
          lecteurs d'écran, et à qui ne distingue pas ces quatre teintes. Une
          couleur seule ne renseigne personne — c'est la règle du point des
          « urgents », et elle vaut ici aussi. */}
      {famille && <span className="visuellement-cache">{famille.libelle}. </span>}

      {ligne.a_une_photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="poste-rang-portrait"
          src={`/espace/candidats/${ligne.id}/photo`}
          alt=""
          width={28}
          height={28}
          loading="lazy"
        />
      ) : (
        <span className="poste-rang-portrait poste-rang-initiales" aria-hidden="true">
          {initiales(ligne.prenom, ligne.nom)}
        </span>
      )}

      <span className="poste-rang-textes">
        <strong>{nom}</strong>
        <small>{sous || 'métier non renseigné'}</small>
      </span>

      {/* Le numéro se voit parce que c'est lui qui ordonne la liste : une liste
          triée sur une clé invisible se lit comme une liste en désordre. À
          droite, où il ne prend rien au métier. */}
      {ligne.numero !== null && (
        <span className="poste-rang-numero">
          <span className="visuellement-cache">Fiche n° </span>
          {ligne.numero}
        </span>
      )}

      {/* Le point orange des « urgents » : personne ne l'accompagne. Le titre
          le dit en toutes lettres, la couleur seule ne suffirait pas.

          Il occupe sa place sur tous les rangs, même quand il ne se montre
          pas : sinon les numéros de droite se décaleraient d'un rang à
          l'autre, et une colonne de chiffres qui ondule ne se lit plus. */}
      {ligne.sans_referent ? (
        <span className="poste-rang-alerte" title="Personne ne l’accompagne">
          <span className="visuellement-cache">Sans référent</span>
        </span>
      ) : (
        <span className="poste-rang-alerte poste-rang-alerte--vide" />
      )}
    </Link>
  );
}
