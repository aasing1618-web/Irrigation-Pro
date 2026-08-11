/**
 * « Pour qui ».
 *
 * Trois métiers, une phrase chacun. Pas d'icône, pas de carte : trois colonnes
 * séparées par un filet, comme les colonnes d'un mémoire technique.
 */

import { Section } from '../components/Section';
import { PUBLICS } from '../contenu';

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
            <dt className="text-lg font-semibold text-ink-900">{groupe.qui}</dt>
            <dd className="mt-2.5 text-ink-600">{groupe.usage}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
