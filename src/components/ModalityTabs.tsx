import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Modality } from "@/hooks/useModalities";

interface ModalityTabsProps {
  modalities: Modality[];
  selectedModality: Modality | null;
  onSelect: (modality: Modality) => void;
  isOwner?: boolean;
  onUpdateModality?: (id: string, updates: Partial<Pick<Modality, 'sport' | 'game_system'>>) => Promise<{ error: any }>;
}

const ModalityTabs = ({ modalities, selectedModality, onSelect }: ModalityTabsProps) => {
  if (modalities.length === 0) return null;

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
    </div>
  );
};

export default ModalityTabs;
