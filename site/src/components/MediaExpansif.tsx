/**
 * Une image qui s'ouvre à mesure qu'on descend la page.
 *
 * Adapté du composant `scroll-expansion-hero` fourni par le propriétaire, avec
 * **un changement de fond** qu'il faut assumer et expliquer.
 *
 * ## Ce que faisait l'original, et pourquoi on ne l'a pas gardé
 *
 * L'original capturait la molette (`wheel` + `preventDefault`) et remettait la
 * page en haut à chaque défilement tant que l'image n'était pas ouverte. C'est
 * le procédé qu'on appelle « détournement de défilement ». Il donne un bel
 * effet, et il a trois défauts qui coûtent plus cher qu'il ne rapporte :
 *
 * - la molette ne répond plus comme partout ailleurs, et le visiteur croit que
 *   la page est cassée avant de comprendre que c'est voulu ;
 * - la barre de défilement ment sur la position réelle ;
 * - au clavier, `Page suivante` ne fait plus ce qu'elle annonce.
 *
 * ## Ce qu'on fait à la place
 *
 * Le même geste visuel — l'image s'ouvre, le titre s'écarte — piloté par la
 * **position naturelle de la section dans le viewport**, via les animations CSS
 * liées au défilement (`animation-timeline: view()`). La molette n'est jamais
 * interceptée. On descend normalement, et l'image s'ouvre pendant qu'on
 * descend.
 *
 * ## Trois raisons de le faire en CSS plutôt qu'en JavaScript
 *
 * 1. Aucun écouteur de défilement : rien ne s'exécute à chaque image affichée.
 * 2. L'animation tourne sur le fil de composition, donc elle ne saccade pas
 *    même quand le fil principal travaille.
 * 3. Le repli est gratuit : sur un navigateur qui ne connaît pas encore
 *    `animation-timeline`, l'image s'affiche simplement grande ouverte. Rien à
 *    détecter, rien à charger.
 *
 * Le mouvement réduit est respecté dans la feuille de style : voir
 * `styles/index.css`, bloc `prefers-reduced-motion`.
 */

import type { ReactNode } from 'react';

import type { Photo } from '../photos';

export interface MediaExpansifProps {
  photo: Photo;
  /** Premier mot du titre : il glisse vers la gauche pendant l'ouverture. */
  titreGauche: string;
  /** Suite du titre : elle glisse vers la droite. */
  titreDroite: string;
  /** Texte qui suit l'image, une fois celle-ci ouverte. */
  children: ReactNode;
}

export function MediaExpansif({
  photo,
  titreGauche,
  titreDroite,
  children,
}: MediaExpansifProps) {
  return (
    <section
      aria-labelledby="media-expansif-titre"
      data-surface="dark"
      className="expansif relative overflow-hidden bg-brand-950 py-24 sm:py-28 lg:py-32"
    >
      <div className="relative">
        {/* Les deux moitiés du titre s'écartent pendant que l'image s'ouvre.
            Le titre reste au-dessus de l'image, jamais par-dessus : du texte
            posé sur une photographie ne tient son contraste que par chance, et
            la chance n'est pas une méthode. */}
        <h2
          id="media-expansif-titre"
          className="m-0 flex flex-col items-center gap-1 px-6 text-center text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl"
        >
          <span className="expansif-mot-gauche block">{titreGauche}</span>
          <span className="expansif-mot-droite block text-brand-300">{titreDroite}</span>
        </h2>

        {/* L'image. Sa taille au repos est sa taille finale : si le navigateur
            ne sait pas animer au défilement, on la voit simplement ouverte. */}
        <div className="expansif-cadre relative mx-auto mt-12 overflow-hidden rounded-2xl">
          <img
            src={photo.src}
            alt={photo.alt}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          {/* Voile constant : le titre passe par-dessus, il lui faut un fond
              suffisamment sombre pour rester lisible partout. */}
          <div aria-hidden="true" className="absolute inset-0 bg-brand-950/35" />
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-14 max-w-3xl px-6 text-center sm:px-8">
        {children}
      </div>
    </section>
  );
}
