/**
 * L'entrée « Rapports » de la navigation.
 *
 * Un rapport n'existe **que** dans un projet : il reprend ses informations, ses
 * hypothèses et ses résultats, et il porte une référence rattachée à lui. Il n'y
 * a donc pas de liste globale à afficher ici — le serveur n'en expose d'ailleurs
 * aucune (contrat, § 1 : les rapports se listent projet par projet).
 *
 * Cet écran ne promet donc rien « pour bientôt » : il dit où se trouve la
 * fonction et y conduit en un clic.
 */

import { useNavigate } from 'react-router';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { ProjectsIcon, ReportsIcon } from '../components/icons';

export function Reports() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title="Rapports"
        description="Les documents PDF que vous remettez à vos clients, reprenant les informations du projet, les hypothèses retenues et les résultats de vos calculs."
      />
      <Card flush>
        <EmptyState
          icon={<ReportsIcon />}
          title="Les rapports se génèrent depuis un projet"
          description="Ouvrez le projet concerné : son panneau « Rapports » produit le document, le référence et vous le remet en PDF, prêt à être imprimé ou envoyé."
          className="py-16"
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<ProjectsIcon />}
              onClick={() => void navigate('/projets')}
            >
              Ouvrir mes projets
            </Button>
          }
        />
      </Card>
    </div>
  );
}
