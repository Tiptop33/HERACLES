'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PARAMETRES, estCourante, famillesDuRole } from '@/lib/navigation';
import { SIGNAL_MENU, SIGNAL_OUVRIR_L_AIDE } from '@/lib/aide/signaux';
import { nomAffichable } from '@/lib/format';
import type { Connecte } from '@/lib/presence';
import type { MaPhoto, Profil } from '@/lib/profil';
import Connectes from './Connectes';
import OuvrirNouveauCandidat, { ADRESSE_NOUVEAU_CANDIDAT } from './OuvrirNouveauCandidat';
import { OngletCandidats, OngletDocuments, OngletPlus, OngletReferents, Roue } from './Icones';

/**
 * La colonne de gauche de la maquette `1a` : la marque, qui l'on est, puis les
 * cinq familles.
 *
 * Composant client, parce qu'il lui faut l'adresse courante pour savoir quoi
 * mettre en surbrillance. Le logo lui est passé plutôt qu'importé : le
 * composant `Logo` lit le disque, ce qu'un composant client ne peut pas faire.
 *
 * Les entrées dont l'écran n'existe pas encore sont éteintes plutôt
 * qu'absentes — voir `lib/navigation.ts` pour la raison.
 */
export default function Colonne({
  profil,
  logo,
  connectes = [],
  photo = null,
}: {
  profil: Profil;
  logo: string | null;
  /** Les collègues de la loge dont la session est ouverte (migration 0042). */
  connectes?: Connecte[];
  /**
   * Ma fiche de référent, et si elle porte un visage (migration 0047). `null`
   * pour qui n'a pas de fiche.
   */
  photo?: MaPhoto | null;
}) {
  const chemin = usePathname() ?? '';
  const familles = famillesDuRole(profil.role);
  // Toutes les entrées visibles : la plus précise l'emporte pour la surbrillance.
  const visibles = familles.flatMap((f) => f.entrees);
  const nom = nomAffichable(profil.prenom, profil.nom, profil.email);

  // Sur un téléphone, les entrées se replient : étalées, elles prenaient la
  // moitié de l'écran avant le premier candidat. C'est l'onglet « Plus » de la
  // barre du bas qui les déploie, en panneau plein écran.
  // On retient l'adresse sur laquelle le menu a été ouvert plutôt qu'un simple
  // oui/non : changer d'écran le referme de lui-même, sans effet à déclencher.
  // Au-dessus de la largeur d'un téléphone, le bouton n'existe pas et cette
  // classe ne change rien.
  const [ouvertSur, setOuvertSur] = useState<string | null>(null);
  // L'aide le déploie aussi, le temps de désigner une de ses entrées : replié,
  // l'entrée n'est pas à l'écran et le personnage n'aurait rien à montrer.
  const [pourLAide, setPourLAide] = useState(false);
  useEffect(() => {
    const entendre = (e: Event) => setPourLAide((e as CustomEvent<boolean>).detail === true);
    window.addEventListener(SIGNAL_MENU, entendre);
    return () => window.removeEventListener(SIGNAL_MENU, entendre);
  }, []);
  const menuOuvert = ouvertSur === chemin || pourLAide;

  const basculer = () => {
    setPourLAide(false);
    setOuvertSur(menuOuvert ? null : chemin);
  };

  /** Referme le panneau : un onglet touché sur l'écran où l'on est déjà ne change pas l'adresse. */
  const replier = () => {
    setPourLAide(false);
    setOuvertSur(null);
  };

  // Les trois écrans de la barre du téléphone. Tout le reste est sous « Plus »,
  // qui s'allume donc aussi quand on est sur l'un de ces autres écrans.
  const ONGLETS = [
    { libelle: 'Référents', vers: '/espace/referents', racines: ['/espace/referents'], Icone: OngletReferents },
    {
      libelle: 'Candidats',
      vers: '/espace/candidats',
      // La correction d'une fiche vit sous `/espace/referent/` : c'est encore « Candidats ».
      racines: ['/espace/candidats', '/espace/referent'],
      Icone: OngletCandidats,
    },
    { libelle: 'Documents', vers: '/espace/documents', racines: ['/espace/documents'], Icone: OngletDocuments },
  ];
  const sous = (racine: string) => chemin === racine || chemin.startsWith(`${racine}/`);
  const ongletCourant = menuOuvert
    ? null
    : (ONGLETS.find((o) => o.racines.some(sous))?.vers ?? null);
  const plusCourant = menuOuvert || ongletCourant === null;

  return (
    <>
    <nav
      className={`colonne${menuOuvert ? ' colonne--ouverte' : ''}`}
      aria-label="Navigation principale"
    >
      <div className="colonne-marque">
        <span className={logo ? 'logo' : 'logo logo--absent'} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" /> : 'H'}
        </span>
        <span className="colonne-titre">HERACLES</span>
        {nom && <span className="colonne-qui">{nom}</span>}

        {/* Votre visage, sous votre nom — ou sous votre adresse, faute de nom.
            `alt` vide à dessein : le nom est juste au-dessus, et le faire
            relire par un lecteur d'écran ne dirait rien de plus.

            Rien du tout quand la fiche ne porte pas de photo rapatriée. Un
            cadre vide, ou une silhouette, laisserait croire à une image qui ne
            charge pas — alors qu'il n'y a simplement rien à montrer. */}
        {photo?.a_une_photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="colonne-portrait"
            src={`/espace/referents/${photo.referent_id}/photo`}
            alt=""
            width={44}
            height={44}
          />
        )}
      </div>

      {/* Sous son propre nom : les autres. Le premier rendu vient du serveur,
          la suite d'un rafraîchissement toutes les trente secondes. */}
      <Connectes initiaux={connectes} />

      <Link
        href="/espace/accueil"
        data-aide="menu:/espace/accueil"
        aria-current={chemin === '/espace/accueil' ? 'page' : undefined}
        className={`colonne-entree${chemin === '/espace/accueil' ? ' colonne-entree--courante' : ''}`}
      >
        Accueil
      </Link>

      {familles.map((famille) => (
        <div key={famille.nom} className="colonne-famille">
          <p className="colonne-famille-nom">{famille.nom}</p>

          {famille.entrees.map((entree) =>
            // « Nouveau candidat » ouvre la fenêtre flottante au lieu de
            // quitter l'écran — un lien quand même, vers la page, sans script.
            entree.vers === ADRESSE_NOUVEAU_CANDIDAT ? (
              <OuvrirNouveauCandidat
                key={entree.libelle}
                data-aide={`menu:${entree.vers}`}
                aria-current={estCourante(entree, chemin, visibles) ? 'page' : undefined}
                className={`colonne-entree${estCourante(entree, chemin, visibles) ? ' colonne-entree--courante' : ''}`}
              >
                {entree.libelle}
              </OuvrirNouveauCandidat>
            ) : entree.vers ? (
              <Link
                key={entree.libelle}
                href={entree.vers}
                data-aide={`menu:${entree.vers}`}
                aria-current={estCourante(entree, chemin, visibles) ? 'page' : undefined}
                className={`colonne-entree${estCourante(entree, chemin, visibles) ? ' colonne-entree--courante' : ''}`}
              >
                {entree.libelle}
              </Link>
            ) : (
              <span
                key={entree.libelle}
                className="colonne-entree colonne-entree--eteinte"
                data-aide={`eteint:${entree.libelle}`}
                title={`À venir — ${entree.lot ?? 'plus tard'}`}
              >
                {entree.libelle}
              </span>
            ),
          )}
        </div>
      ))}

      {/* En bas de la colonne, et à part : on ne cherche pas ses réglages en
          parcourant les familles, on les cherche là où ils sont toujours. */}
      <Link
        href={PARAMETRES.vers}
        data-aide={`menu:${PARAMETRES.vers}`}
        aria-current={estCourante(PARAMETRES, chemin) ? 'page' : undefined}
        className={`colonne-entree colonne-parametres${
          estCourante(PARAMETRES, chemin) ? ' colonne-entree--courante' : ''
        }`}
      >
        <Roue />
        {PARAMETRES.libelle}
      </Link>

      {/* L'aide, sur un téléphone seulement : son bouton flottant y recouvrait
          la fiche, elle devient une entrée du menu. Ailleurs cette entrée
          n'est pas affichée, et le bouton flottant reste à sa place. */}
      <button
        type="button"
        className="colonne-entree colonne-aide"
        onClick={() => {
          setPourLAide(false);
          setOuvertSur(null);
          window.dispatchEvent(new Event(SIGNAL_OUVRIR_L_AIDE));
        }}
      >
        Aide
      </button>
    </nav>

    {/* La barre du téléphone, comme dans une application : trois écrans sous le
        pouce, et « Plus » pour le reste. Elle n'existe que sous la largeur d'un
        téléphone ; ailleurs la colonne est là, et cette barre n'est pas
        affichée. */}
    <nav className="barre-onglets" aria-label="Navigation du téléphone">
      {ONGLETS.map(({ libelle, vers, Icone }) => (
        <Link
          key={vers}
          href={vers}
          className="barre-onglet"
          aria-current={ongletCourant === vers ? 'page' : undefined}
          onClick={replier}
        >
          <Icone />
          <span>{libelle}</span>
        </Link>
      ))}
      <button
        type="button"
        className="barre-onglet"
        aria-expanded={menuOuvert}
        aria-current={plusCourant ? 'true' : undefined}
        onClick={basculer}
      >
        <OngletPlus />
        <span>Plus</span>
      </button>
    </nav>
    </>
  );
}
