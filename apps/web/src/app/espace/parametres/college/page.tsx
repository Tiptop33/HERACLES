import Link from "next/link";
import { listerCollege } from "@/lib/college-serveur";
import { RUBRIQUES } from "@/lib/parametres";
import ListeCollege from "./ListeCollege";

export const metadata = { title: "Collège — Paramètres — HERACLES" };

/** Ce que les routes renvoient, dit à qui a cliqué. */
const REFUS: Record<string, string> = {
  vide: "Un titre ne peut pas être vide.",
  doublon: "Ce titre est déjà dans la liste.",
  droit: "Seul un administrateur peut tenir cette liste.",
  absent: "Ce titre n’existe plus.",
  session: "Votre session a expiré. Reconnectez-vous.",
  formulaire: "Ce geste n’a pas été compris.",
  echec: "La liste n’a pas pu être modifiée.",
};

function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

export default async function College({
  searchParams,
}: {
  searchParams: Promise<{
    erreur?: string | string[];
    supprimer?: string | string[];
  }>;
}) {
  const parametres = await searchParams;
  const titres = await listerCollege();

  const refus = REFUS[premier(parametres.erreur)] ?? null;
  const aRetirer =
    titres.find((t) => t.id === premier(parametres.supprimer)) ?? null;
  const propos = RUBRIQUES.find((r) => r.libelle === "Collège")?.propos ?? "";

  return (
    <>
      <h2>Collège</h2>
      <p className="aide">{propos}</p>

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      {/* Le formulaire d'ajout et la liste dans un même bloc, large comme le
          plus large des deux : le bouton « Ajouter » tombe ainsi exactement au
          bord droit des cadres, sans qu'aucune largeur ne soit écrite en dur.
          Le jour où une colonne change, les deux suivent ensemble. */}
      <div className="college">
        {/* Ajouter d'abord : c'est le geste le plus fréquent sur une liste
            qu'on est en train de constituer. */}
        <form
          className="college-ajout"
          method="post"
          action="/api/parametres/college"
        >
          <input
            name="nom"
            maxLength={120}
            required
            placeholder="Ajouter un titre…"
            aria-label="Nouveau titre"
          />
          <button className="bouton bouton--fort college-ajouter" type="submit">
            Ajouter
          </button>
        </form>

        <ListeCollege titres={titres} />
      </div>

      {aRetirer && (
        <div className="fenetre-fond">
          <Link
            href="/espace/parametres/college"
            className="fenetre-voile"
            aria-label="Fermer sans rien retirer"
          />

          <div
            className="fenetre"
            role="dialog"
            aria-modal="true"
            aria-labelledby="retrait-titre"
          >
            <h2 id="retrait-titre">
              Retirer « {aRetirer.nom} » de la liste&nbsp;?
            </h2>

            <p>
              Le titre ne sera plus proposé sur les fiches. Celles qui le
              portent
              {aRetirer.utilisations > 0 ? (
                <>
                  {" "}
                  — il y en a <strong>{aRetirer.utilisations}</strong> — le
                  gardent&nbsp;: rien n&apos;est effacé sur une fiche.
                </>
              ) : (
                <> le garderaient, mais aucune ne le porte.</>
              )}
            </p>

            <div className="fenetre-gestes">
              <Link href="/espace/parametres/college" className="bouton">
                Annuler
              </Link>
              <form
                method="post"
                action={`/api/parametres/college/${aRetirer.id}`}
              >
                <input type="hidden" name="action" value="supprimer" />
                <button className="bouton bouton--danger" type="submit">
                  Retirer le titre
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
