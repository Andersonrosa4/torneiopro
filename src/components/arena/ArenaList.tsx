import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Clock } from "lucide-react";
import StatesCitiesSelector from "./StatesCitiesSelector";

interface Props {
  onSelectArena: (arenaId: string, arenaName: string) => void;
}

export default function ArenaList({ onSelectArena }: Props) {
  const [arenas, setArenas] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ stateId: string; cityId: string } | null>(null);

  const handleLocationSelect = useCallback((stateId: string, cityId: string) => {
    setSelectedLocation({ stateId, cityId });
  }, []);

  useEffect(() => {
    if (!selectedLocation) return;
    supabase
      .from("arenas")
      .select("*")
      .eq("state_id", selectedLocation.stateId)
      .eq("city_id", selectedLocation.cityId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setArenas(data || []));
  }, [selectedLocation]);

  return (
    <div className="space-y-4">
      <StatesCitiesSelector onSelect={handleLocationSelect} />

      {arenas.length === 0 && selectedLocation && (
        <p className="text-muted-foreground text-sm text-center py-8">Nenhuma arena encontrada nesta cidade.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {arenas.map((arena) => (
          <Card key={arena.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => onSelectArena(arena.id, arena.name)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                {arena.logo_url && <img src={arena.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
                {arena.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {arena.address && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{arena.address}</p>}
              {arena.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{arena.phone}</p>}
              <p className="flex items-center gap-1"><Clock className="h-3 w-3" />{arena.opening_time?.slice(0, 5)} - {arena.closing_time?.slice(0, 5)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
