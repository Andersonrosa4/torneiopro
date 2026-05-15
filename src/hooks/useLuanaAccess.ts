/**
 * Hook de acesso ao Modo Veranico (Grupos + Repescagem Intra-chave).
 * Liberado para todos os organizadores autenticados.
 */
import { useAuth } from "@/contexts/AuthContext";

export function useLuanaAccess(_tournamentCreatedBy?: string | null) {
  const { user, organizerId, isAdmin } = useAuth();
  return Boolean(user && (organizerId || isAdmin));
}
