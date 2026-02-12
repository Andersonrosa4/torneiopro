import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Modality } from "@/hooks/useModalities";

interface ModalityTabsProps {
  modalities: Modality[];
  selectedModality: Modality | null;
  onSelect: (modality: Modality) => void;
  isOwner?: boolean;
  onUpdateModality?: (id: string, updates: Partial<Pick<Modality, 'sport' | 'game_system'>>) => Promise<{ error: any }>;
}

const sportOptions = [
  { value: "beach_volleyball", label: "🏐 Vôlei de Praia" },
  { value: "futevolei", label: "⚽ Futevôlei" },
  { value: "beach_tennis", label: "🎾 Beach Tennis" },
];

const gameSystemOptions = [
  { value: "single_elimination", label: "Eliminação Simples" },
  { value: "double_elimination", label: "Dupla Eliminação" },
  { value: "groups", label: "Fase de Grupos" },
];

const ModalityTabs = ({ modalities, selectedModality, onSelect, isOwner, onUpdateModality }: ModalityTabsProps) => {
  if (modalities.length === 0) return null;

  const canDoubleElimination = (sport: string) => sport === "beach_volleyball";

  return (
    <div className="mb-4 flex items-center gap-3 flex-wrap">
      <Tabs
        value={selectedModality?.id || ""}
        onValueChange={(val) => {
          const mod = modalities.find(m => m.id === val);
          if (mod) onSelect(mod);
        }}
      >
        <TabsList>
          {modalities.map(mod => (
            <TabsTrigger key={mod.id} value={mod.id} className="gap-1">
              {mod.name === "Masculino" && "♂"}
              {mod.name === "Feminino" && "♀"}
              {mod.name === "Misto" && "⚥"}
              {mod.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isOwner && selectedModality && onUpdateModality && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Settings2 className="h-4 w-4" /> Config
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Configurar {selectedModality.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Esporte</Label>
                <Select
                  value={selectedModality.sport}
                  onValueChange={(v) => {
                    const updates: any = { sport: v };
                    // Reset game_system if double_elimination is not allowed
                    if (v !== "beach_volleyball" && selectedModality.game_system === "double_elimination") {
                      updates.game_system = "single_elimination";
                    }
                    onUpdateModality(selectedModality.id, updates);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sportOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sistema de Jogo</Label>
                <Select
                  value={selectedModality.game_system}
                  onValueChange={(v) => onUpdateModality(selectedModality.id, { game_system: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gameSystemOptions
                      .filter(o => o.value !== "double_elimination" || canDoubleElimination(selectedModality.sport))
                      .map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!canDoubleElimination(selectedModality.sport) && (
                  <p className="text-xs text-muted-foreground">Dupla eliminação disponível apenas para Vôlei de Praia</p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Badge variant="outline" className="text-xs">
                  {sportOptions.find(o => o.value === selectedModality.sport)?.label}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {gameSystemOptions.find(o => o.value === selectedModality.game_system)?.label}
                </Badge>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ModalityTabs;
