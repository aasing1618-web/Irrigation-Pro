import { ProjectsIcon } from '../components/icons';
import { UpcomingPage } from './UpcomingPage';

export function Projects() {
  return (
    <UpcomingPage
      title="Projets"
      description="Chaque chantier, chaque périmètre irrigué a son projet : ses parcelles, ses calculs et ses rapports au même endroit."
      icon={<ProjectsIcon />}
      emptyTitle="La gestion des projets arrive bientôt"
      emptyDescription="Vous pourrez créer un projet, le nommer, y saisir les données de votre périmètre, puis y revenir à tout moment. Vos projets ne sont visibles que par vous."
    />
  );
}
