import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { AlertIcon } from '../components/icons';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <Card flush>
        <EmptyState
          icon={<AlertIcon />}
          title="Cet écran n’existe pas"
          description="Le lien que vous avez suivi ne correspond à aucun écran d’Irrigation Pro."
          className="py-16"
          action={
            <Button variant="primary" size="sm" onClick={() => void navigate('/')}>
              Revenir au tableau de bord
            </Button>
          }
        />
      </Card>
    </div>
  );
}
