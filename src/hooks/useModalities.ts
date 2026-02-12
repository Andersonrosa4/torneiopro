import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery } from "@/lib/organizerApi";

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
    if (!tournamentId) return;
    const { data, error } = await supabase
      .from("modalities")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at");

    if (!error && data && data.length > 0) {
      const mods = data as unknown as Modality[];
      setModalities(mods);
      if (!selectedModality || !mods.find(m => m.id === selectedModality.id)) {
        setSelectedModality(mods[0]);
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
