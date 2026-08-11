/**
 * « Pour qui ».
 *
 * Trois métiers, une phrase chacun. Pas d'icône, pas de carte : trois colonnes
 * séparées par un filet, comme les colonnes d'un mémoire technique.
 */

import { Section } from '../components/Section';
import { PUBLICS } from '../contenu';
import { INGENIEUR_PARCELLE, RESEAU_PLANCHES, TRACTEUR_PARCELLE, type Photo } from '../photos';

/**
 * Une vue par métier, dans l'ordre de `PUBLICS`.
 *
 * Elles illustrent le contexte de travail, elles ne prétendent pas représenter
 * une personne en particulier. Si un métier était ajouté à `contenu.ts` sans
 * photo correspondante, la colonne s'afficherait simplement sans image : mieux
 * vaut une colonne sobre qu'une photo prise au hasard dans la liste.
 */
const VUES: readonly Photo[] = [INGENIEUR_PARCELLE, RESEAU_PLANCHES, TRACTEUR_PARCELLE];

export function PourQui() {
  return (
    <Section
      id="pour-qui"
      titre="Pour qui"
      chapeau="Trois métiers qui font les mêmes calculs, avec les mêmes exigences de traçabilité."
    >
      <dl className="grid gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-ink-200">
        {PUBLICS.map((groupe, index) => (
          <div
            key={groupe.qui}
            className={
              index === 0
                ? 'sm:pr-8 lg:pr-10'
                : index === PUBLICS.length - 1
                  ? 'sm:pl-8 lg:pl-10'
                  : 'sm:px-8 lg:px-10'
            }
          >
            {VUES[index] && (
              <img
                src={VUES[index].src}
                alt={VUES[index].alt}
                width={VUES[index].width}
                height={VUES[index].height}
                loading="lazy"
                decoding="async"
                className="mb-6 aspect-[4/3] w-full rounded-xl object-cover"
              />
            )}
            <dt className="text-lg font-semibold text-ink-900">{groupe.qui}</dt>
            <dd className="mt-2.5 text-ink-600">{groupe.usage}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
