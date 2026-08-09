import { SettingsIcon } from '../components/icons';
import { UpcomingPage } from './UpcomingPage';

export function Settings() {
  return (
    <UpcomingPage
      title="Paramètres"
      description="Vos informations, vos préférences d’affichage et les réglages appliqués par défaut à vos nouveaux projets."
      icon={<SettingsIcon />}
      emptyTitle="Les réglages arrivent bientôt"
      emptyDescription="Vous y retrouverez notamment vos coordonnées telles qu’elles apparaissent en en-tête de vos rapports."
    />
  );
}
