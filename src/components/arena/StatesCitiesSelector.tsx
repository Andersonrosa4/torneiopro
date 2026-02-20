import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  onSelect: (stateId: string, cityId: string) => void;
}

export default function StatesCitiesSelector({ onSelect }: Props) {
  const [states, setStates] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [stateId, setStateId] = useState("");
  const [cityId, setCityId] = useState("");

  useEffect(() => {
    supabase.from("states").select("*").order("name").then(({ data }) => {
      setStates(data || []);
    });
  }, []);

  useEffect(() => {
    if (!stateId) { setCities([]); setCityId(""); return; }
    supabase.from("cities").select("*").eq("state_id", stateId).order("name").then(({ data }) => {
      setCities(data || []);
      setCityId("");
    });
  }, [stateId]);

  useEffect(() => {
    if (stateId && cityId) onSelect(stateId, cityId);
  }, [stateId, cityId, onSelect]);

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Select value={stateId} onValueChange={setStateId}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Selecione o Estado" />
        </SelectTrigger>
        <SelectContent>
          {states.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name} ({s.uf})</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={cityId} onValueChange={setCityId} disabled={!stateId}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Selecione a Cidade" />
        </SelectTrigger>
        <SelectContent>
          {cities.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
