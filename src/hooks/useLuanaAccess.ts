/**
 * Hook de acesso ao Modo Luana — Grupos + Repescagem Cruzada (Vôlei de Praia).
 *
 * Retorna `true` quando o organizador logado é:
 *   1. A própria LUANA (organizers.username case-insensitive === 'LUANA'), OU
 *   2. Um organizador vinculado a um torneio criado pela LUANA
 *      (via tournament_organizers ou organizers.created_by), OU
 *   3. Admin global do sistema.
 *
 * Quando `tournamentCreatedBy` é informado, valida especificamente o dono
 * daquele torneio. Caso contrário, valida acesso geral ao modo.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const LUANA_USERNAME = "LUANA";

export function useLuanaAccess(tournamentCreatedBy?: string | null) {
  const { user, isAdmin, organizerId } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user || !organizerId) {
        if (!cancelled) setHasAccess(false);
        return;
      }
      if (isAdmin) {
        if (!cancelled) setHasAccess(true);
        return;
      }

      // 1. Organizador atual é LUANA?
      const { data: me } = await supabase
        .from("organizers")
        .select("username")
        .eq("id", organizerId)
        .maybeSingle();
      if (cancelled) return;
      if (me?.username?.toUpperCase() === LUANA_USERNAME) {
        setHasAccess(true);
        return;
      }

      // 2. Existe alguma LUANA cadastrada?
      const { data: luana } = await supabase
        .from("organizers")
        .select("id")
        .ilike("username", LUANA_USERNAME)
        .maybeSingle();
      if (cancelled) return;
      if (!luana?.id) {
        setHasAccess(false);
        return;
      }

      // 3. Se um torneio específico foi informado, valida o dono
      if (tournamentCreatedBy) {
        setHasAccess(tournamentCreatedBy === luana.id);
        return;
      }

      // 4. Verifica vínculo via tournament_organizers
      const { data: link } = await supabase
        .from("tournament_organizers")
        .select("tournament_id, tournaments!inner(created_by)")
        .eq("organizer_id", organizerId)
        .eq("tournaments.created_by", luana.id)
        .limit(1);
      if (cancelled) return;
      setHasAccess((link?.length ?? 0) > 0);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user, organizerId, isAdmin, tournamentCreatedBy]);

  return hasAccess;
}
