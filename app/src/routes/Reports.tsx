import { ReportsIcon } from '../components/icons';
import { UpcomingPage } from './UpcomingPage';

export function Reports() {
  return (
    <UpcomingPage
      title="Rapports"
      description="Les documents PDF que vous remettez à vos clients, reprenant les données du projet et les résultats de vos calculs."
      icon={<ReportsIcon />}
      emptyTitle="La génération de rapports arrive bientôt"
      emptyDescription="En un clic, vous obtiendrez un document mis en page, daté et prêt à être imprimé ou envoyé."
    />
  );
}
