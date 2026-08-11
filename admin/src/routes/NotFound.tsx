/**
 * Adresse inconnue à l'intérieur du dashboard.
 *
 * Cas rare : le dashboard n'a que trois écrans et aucun lien externe. On y
 * arrive par un signet devenu obsolète ou une URL retapée à la main. L'écran ne
 * s'excuse pas longuement — il ramène là où il y a quelque chose à faire.
 */

import { useNavigate } from 'react-router';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { UsersIcon } from '../components/icons';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <Card flush>
        <EmptyState
          icon={<UsersIcon />}
          title="Cette page n’existe pas"
          description="L’adresse demandée ne correspond à aucun écran du dashboard."
          className="py-16"
          action={
            <Button variant="primary" onClick={() => void navigate('/')}>
              Revenir à l’accueil
            </Button>
          }
        />
      </Card>
    </div>
  );
}
