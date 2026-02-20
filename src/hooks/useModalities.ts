import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";

export interface Modality {
  id: string;
  tournament_id: string;
  name: string;
  sport: string;
  game_system: string;
  created_at: string;
}

export function useModalities(tournamentId: string | undefined) {
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [selectedModality, setSelectedModality] = useState<Modality | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchModalities = useCallback(async () => {
    if (!tournamentId) {
      setLoading(false);
      return;
    }
    const { data, error } = await publicQuery<Modality[]>({
      table: "modalities",
      filters: { tournament_id: tournamentId },
      order: { column: "created_at", ascending: true },
    });

    if (!error && data && data.length > 0) {
      setModalities(data);
      if (!selectedModality || !data.find(m => m.id === selectedModality.id)) {
        setSelectedModality(data[0]);
      }
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    fetchModalities();
  }, [fetchModalities]);

  // Realtime
  useEffect(() => {
    if (!tournamentId) return;
    const channel = supabase
      .channel(`modalities-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "modalities", filter: `tournament_id=eq.${tournamentId}` }, () => fetchModalities())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, fetchModalities]);

  const updateModality = async (modalityId: string, updates: Partial<Pick<Modality, 'sport' | 'game_system'>>) => {
    const { error } = await organizerQuery({
      table: "modalities",
      operation: "update",
      data: updates,
      filters: { id: modalityId },
    });
    if (!error) fetchModalities();
    return { error };
  };

  return {
    modalities,
    selectedModality,
    setSelectedModality,
    loading,
    fetchModalities,
    updateModality,
  };
}
