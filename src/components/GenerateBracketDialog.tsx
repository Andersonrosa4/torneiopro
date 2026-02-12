import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Play } from "lucide-react";

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
}

interface GenerateBracketDialogProps {
  onGenerate: (config: {
    startRound: number;
    useSeeds: boolean;
    numSets: number;
    gamesPerSet?: number;
    seedTeamIds?: string[];
  }) => void;
  teamCount: number;
  teams: Team[];
  isDisabled: boolean;
  sport: string;
}

export const GenerateBracketDialog = ({ onGenerate, teamCount, teams, isDisabled, sport }: GenerateBracketDialogProps) => {
  const [open, setOpen] = useState(false);
  const [useSeeds, setUseSeeds] = useState("false");
  const [numSets, setNumSets] = useState("3");
  const [gamesPerSet, setGamesPerSet] = useState("6");
  const [selectedSeedIds, setSelectedSeedIds] = useState<string[]>([]);

  const isBeachTennis = sport === "beach_tennis";

  // Auto-detect phase based on team count
  const totalSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(teamCount, 2))));
  const maxRounds = Math.ceil(Math.log2(totalSlots));

  const getAutoStartRound = () => {
    // Auto-detect: system determines start round from team count
    if (teamCount <= 2) return maxRounds; // Final
    if (teamCount <= 4) return maxRounds - 1; // Semifinal
    if (teamCount <= 8) return maxRounds - 2; // Quartas
    if (teamCount <= 16) return maxRounds - 3; // Oitavas
    return 1;
  };

  const autoStartRound = getAutoStartRound();

  const getPhaseLabel = () => {
    const r = autoStartRound;
    if (r === maxRounds) return "Final";
    if (r === maxRounds - 1) return "Semifinal";
    if (r === maxRounds - 2) return "Quartas de Final";
    if (r === maxRounds - 3) return "Oitavas de Final";
    return `Rodada ${r}`;
  };

  const toggleSeedTeam = (teamId: string) => {
    setSelectedSeedIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  const handleGenerate = () => {
    onGenerate({
      startRound: autoStartRound,
      useSeeds: useSeeds === "true",
      numSets: Number(numSets),
      gamesPerSet: isBeachTennis ? Number(gamesPerSet) : undefined,
      seedTeamIds: useSeeds === "true" ? selectedSeedIds : undefined,
    });
    setOpen(false);
  };

  // Beach Tennis set options: 2, 3, 4
  const setOptions = isBeachTennis ? [2, 3, 4] : [1, 3, 5];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90"
          disabled={isDisabled}
        >
          <Play className="h-4 w-4" />
          Gerar Chaveamento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Chaveamento</DialogTitle>
          <DialogDescription>Configure as opções do torneio</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Auto-detected phase */}
          <div className="rounded-lg border border-border bg-secondary/50 p-3">
            <p className="text-sm text-muted-foreground">Fase detectada automaticamente:</p>
            <p className="text-lg font-bold text-primary">{getPhaseLabel()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {teamCount} duplas → {totalSlots} posições
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Número de Sets</Label>
            <Select value={numSets} onValueChange={setNumSets}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {setOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} set{n > 1 ? "s" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isBeachTennis && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">Games por Set</Label>
              <Select value={gamesPerSet} onValueChange={setGamesPerSet}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 6, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} games</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base font-semibold">Deseja selecionar times cabeça de chave?</Label>
            <Select value={useSeeds} onValueChange={setUseSeeds}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sim, selecionar cabeças de chave</SelectItem>
                <SelectItem value="false">Não, embaralhar aleatoriamente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {useSeeds === "true" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Selecione as duplas cabeça de chave:</Label>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2 bg-secondary/30">
                {teams.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedSeedIds.includes(t.id)}
                      onCheckedChange={() => toggleSeedTeam(t.id)}
                    />
                    <span>{t.player1_name} / {t.player2_name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedSeedIds.length} cabeça(s) de chave selecionada(s)
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            Gerar Chaveamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
