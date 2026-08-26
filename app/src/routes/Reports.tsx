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
import { ProjectsIcon, ReportsIcon } from '../components/icons';

export function Reports() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-8 py-4 sm:py-7">
      {/* En-tête illustré Rapports */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-ink-200/80 bg-brand-950 p-6 shadow-raised">
        <img
          src="/photos/nature-apaisante.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/90 to-transparent" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-brand-300 backdrop-blur-md border border-brand-400/20">
            Dossiers d'Ingénierie PDF
          </span>
          <h1 className="mt-2 text-2xl font-bold text-white">Rapports & Documents PDF</h1>
          <p className="mt-1 max-w-[64ch] text-sm text-brand-200/90">
            Notes de calcul officielles et estampillées. Présentez des dossiers irréprochables à vos clients finaux et aux bailleurs de fonds.
          </p>
        </div>
      </div>

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
