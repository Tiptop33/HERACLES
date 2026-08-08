import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  VUES,
  chercher,
  estVue,
  filtrerParVue,
  lireFiche,
  listerCandidatsDeLaLoge,
  nomDeFamilleDabord,
  resumeDeLaVue,
  sousTitreDuRang,
  vueDOuverture,
  type LigneCandidat,
  type Vue,
} from '@/lib/poste';
import { initiales } from '@/lib/format';
import { lireJournal, lireRetirees } from '@/lib/journal';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import PanneauFiche, { estOnglet, type Onglet } from './PanneauFiche';

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
};

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
          <p className="poste-volet-titre">
            Candidats <span aria-hidden="true">·</span>{' '}
            <span className="maigre">{resumeDeLaVue(deLaVue, vue)}</span>
          </p>

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
          <ul className="poste-rangs">
            {lignes.map((ligne) => (
              <li key={ligne.id}>
                <Rang
                  ligne={ligne}
                  vers={adresse({ fiche: ligne.id })}
                  ouverte={ligne.id === demande}
                />
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
            adresse={adresse}
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
    </main>
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

  return (
    <Link className="poste-rang" href={vers} aria-current={ouverte ? 'true' : undefined}>
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
