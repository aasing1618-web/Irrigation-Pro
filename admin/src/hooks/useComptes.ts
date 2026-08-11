/**
 * Accès aux comptes via React Query.
 *
 * Un seul endroit déclare les clés de cache et ce qu'une action invalide. Sans
 * cela, une suspension réussie laisserait la liste afficher « Actif » jusqu'au
 * prochain rechargement — et le propriétaire douterait de son propre outil.
 *
 * Règle appliquée partout ici : **après une action, on invalide tout ce qui
 * parle de comptes**. Les volumes sont ceux d'un carnet de clients, pas d'un
 * réseau social ; économiser une requête ne vaut pas le risque d'afficher un
 * statut faux.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { ApiError } from '../lib/api';
import {
  activiteDuCompte,
  activiteRecente,
  creerCompte,
  listerComptes,
  reactiverCompte,
  reinitialiserMotDePasse,
  suspendreCompte,
  type BrouillonCompte,
  type FiltresComptes,
  type ReponseAction,
  type ReponseActiviteCompte,
  type ReponseActiviteRecente,
  type ReponseCreation,
  type ReponseListeComptes,
  type ReponseReinitialisation,
} from '../lib/comptes';

/** Racine de toutes les clés de cache du dashboard. */
export const cleComptes = {
  tout: ['comptes'] as const,
  liste: (filtres: FiltresComptes) => ['comptes', 'liste', filtres] as const,
  activiteCompte: (id: string) => ['comptes', 'activite', id] as const,
  activiteRecente: () => ['comptes', 'activite-recente'] as const,
};

export function useListeComptes(
  filtres: FiltresComptes,
): UseQueryResult<ReponseListeComptes, ApiError> {
  return useQuery<ReponseListeComptes, ApiError>({
    queryKey: cleComptes.liste(filtres),
    queryFn: ({ signal }) => listerComptes(filtres, signal),
    // La pagination doit rester lisible : sans cela, passer à la page suivante
    // vide la liste le temps de la requête et l'écran « saute ».
    placeholderData: (precedent) => precedent,
  });
}

export function useActiviteCompte(
  id: string | undefined,
): UseQueryResult<ReponseActiviteCompte, ApiError> {
  return useQuery<ReponseActiviteCompte, ApiError>({
    queryKey: cleComptes.activiteCompte(id ?? ''),
    queryFn: ({ signal }) => activiteDuCompte(id as string, {}, signal),
    enabled: Boolean(id),
  });
}

export function useActiviteRecente(): UseQueryResult<ReponseActiviteRecente, ApiError> {
  return useQuery<ReponseActiviteRecente, ApiError>({
    queryKey: cleComptes.activiteRecente(),
    queryFn: ({ signal }) => activiteRecente({ limite: 40 }, signal),
  });
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Invalide tout ce qui décrit des comptes.
 *
 * Volontairement large : une suspension touche la liste, la fiche du compte, et
 * les compteurs de la page d'accueil. Les énumérer une par une, c'est en
 * oublier une le jour où un écran s'ajoute.
 */
function useInvalidationComptes(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: cleComptes.tout });
  };
}

export function useCreerCompte(): UseMutationResult<
  ReponseCreation,
  ApiError,
  BrouillonCompte
> {
  const invalider = useInvalidationComptes();
  return useMutation<ReponseCreation, ApiError, BrouillonCompte>({
    mutationFn: creerCompte,
    onSuccess: invalider,
  });
}

export function useSuspendreCompte(
  id: string,
): UseMutationResult<ReponseAction, ApiError, string> {
  const invalider = useInvalidationComptes();
  return useMutation<ReponseAction, ApiError, string>({
    mutationFn: (motif: string) => suspendreCompte(id, motif),
    onSuccess: invalider,
  });
}

export function useReactiverCompte(
  id: string,
): UseMutationResult<ReponseAction, ApiError, string> {
  const invalider = useInvalidationComptes();
  return useMutation<ReponseAction, ApiError, string>({
    mutationFn: (motif: string) => reactiverCompte(id, motif),
    onSuccess: invalider,
  });
}

export function useReinitialiserMotDePasse(
  id: string,
): UseMutationResult<ReponseReinitialisation, ApiError, void> {
  const invalider = useInvalidationComptes();
  return useMutation<ReponseReinitialisation, ApiError, void>({
    mutationFn: () => reinitialiserMotDePasse(id),
    onSuccess: invalider,
  });
}
