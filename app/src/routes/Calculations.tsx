import { CalculationsIcon } from '../components/icons';
import { UpcomingPage } from './UpcomingPage';

export function Calculations() {
  return (
    <UpcomingPage
      title="Calculs"
      description="Les modules de dimensionnement : besoins en eau des cultures, hydraulique des canaux, conduites et pompage."
      icon={<CalculationsIcon />}
      emptyTitle="Les modules de calcul arrivent bientôt"
      emptyDescription="Vous saisirez vos paramètres et le serveur vous renverra des résultats détaillés, prêts à être repris dans un rapport."
    />
  );
}
