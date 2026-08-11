/**
 * Le terrain, en trois images.
 *
 * ## Pourquoi cette section existe
 *
 * Le reste de la page explique des calculs. Or personne n'achète un logiciel de
 * calcul pour ses formules : on l'achète pour ce qu'il permet de faire sur une
 * parcelle. Ces trois photos remettent le métier sous les yeux avant la liste
 * des modules.
 *
 * ## Trois images, dans cet ordre, et il compte
 *
 * 1. **Le geste** — un asperseur qui tourne. L'objet du calcul.
 * 2. **L'homme** — un technicien qui relève ses données au bord du champ.
 *    C'est le client d'Irrigation Pro, et c'est la seule image du site où on le
 *    voit.
 * 3. **L'échelle** — une parcelle entière sous aspersion. Ce qui est en jeu.
 *
 * ## Ce que cette section n'est pas
 *
 * Ce ne sont **pas des captures d'écran du logiciel**, et il ne faut pas en
 * fabriquer (`CLAUDE.md`). Ce sont des photographies d'illustration, et la
 * légende le dit franchement plutôt que de laisser croire autre chose.
 */

import { Contenu } from '../components/Section';
import { ASPERSION_PARCELLE, INGENIEUR_PARCELLE, RAMPE_ASPERSION, type Photo } from '../photos';

/** Les trois vues, dans l'ordre voulu : le geste, l'homme, l'échelle. */
const VUES: readonly Photo[] = [RAMPE_ASPERSION, INGENIEUR_PARCELLE, ASPERSION_PARCELLE];

export function Terrain() {
  return (
    <section aria-labelledby="terrain-titre" className="border-t border-ink-100 py-20 sm:py-24">
      <Contenu>
        <h2
          id="terrain-titre"
          className="max-w-[24ch] text-3xl font-semibold tracking-[-0.02em] text-ink-900"
        >
          Ce que le logiciel dimensionne.
        </h2>

        <p className="mt-5 max-w-[58ch] text-lg text-ink-600">
          Un réseau qui arrose trop consomme une ressource rare. Un réseau qui arrose mal coûte
          une récolte. C’est cet écart qu’Irrigation Pro calcule, module par module.
        </p>

        <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
          {VUES.map((photo) => (
            <li key={photo.src} className="m-0">
              {/* Rapport imposé : les fichiers sources n'ont pas tous le même
                  format, et trois images de hauteurs différentes casseraient
                  l'alignement de la bande. `object-cover` recadre au centre. */}
              <img
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
                className="aspect-[3/4] w-full rounded-xl object-cover"
              />
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-ink-500">
          Photographies d’illustration. Le logiciel ne se montre pas ici : il se montre en
          conversation.
        </p>
      </Contenu>
    </section>
  );
}
