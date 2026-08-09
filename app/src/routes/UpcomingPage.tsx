/**
 * Gabarit des écrans annoncés mais non encore livrés.
 *
 * Un écran vide reste un écran du produit : il garde l'en-tête, la mise en
 * page et le ton des autres. Il explique la fonction à venir plutôt que
 * d'afficher « page en construction ».
 */

import type { ReactNode } from 'react';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

export interface UpcomingPageProps {
  title: string;
  /** Phrase d'en-tête : à quoi sert cet écran. */
  description: string;
  icon: ReactNode;
  /** Titre de l'état vide. */
  emptyTitle: string;
  /** Deux phrases maximum, sans jargon. */
  emptyDescription: string;
}

export function UpcomingPage({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
}: UpcomingPageProps) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader title={title} description={description} />
      <Card flush>
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          note="Disponible prochainement"
          className="py-16"
        />
      </Card>
    </div>
  );
}
