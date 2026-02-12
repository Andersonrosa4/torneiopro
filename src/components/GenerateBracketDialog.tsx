import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play } from "lucide-react";

interface GenerateBracketDialogProps {
  onGenerate: (config: {
    startRound: number;
    useSeeds: boolean;
    numSets: number;
    gamesPerSet?: number;
  }) => void;
  teamCount: number;
  isDisabled: boolean;
  sport: string;
}

export const GenerateBracketDialog = ({ onGenerate, teamCount, isDisabled, sport }: GenerateBracketDialogProps) => {
  const [open, setOpen] = useState(false);
  const [startRound, setStartRound] = useState("1");
  const [useSeeds, setUseSeeds] = useState("false");
  const [numSets, setNumSets] = useState("3");
  const [gamesPerSet, setGamesPerSet] = useState("21");

  const totalSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(teamCount, 2))));
  const maxRounds = Math.ceil(Math.log2(totalSlots));

  const isBeachTennis = sport === "beach_tennis";

  const getRoundLabel = (round: number) => {
    if (round === maxRounds) return "Final";
    if (round === maxRounds - 1) return "Semifinal";
    if (round === maxRounds - 2) return "Quartas de Final";
    return `Rodada ${round}`;
  };

  // Only allow starting from Quartas, Semi, or Final
  const availableStartRounds = [];
  for (let r = 1; r <= maxRounds; r++) {
    const label = getRoundLabel(r);
    if (label.includes("Quartas") || label.includes("Semi") || label.includes("Final") || r === 1) {
      availableStartRounds.push({ value: String(r), label });
    }
  }

  const handleGenerate = () => {
    onGenerate({
      startRound: Number(startRound),
      useSeeds: useSeeds === "true",
      numSets: Number(numSets),
      gamesPerSet: isBeachTennis ? Number(gamesPerSet) : undefined,
    });
    setOpen(false);
  };

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar Chaveamento</DialogTitle>
          <DialogDescription>Configure as opções do torneio</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Número de Sets</Label>
            <Select value={numSets} onValueChange={setNumSets}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 3, 5].map((n) => (
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
            <Label className="text-base font-semibold">Início da Chave</Label>
            <Select value={startRound} onValueChange={setStartRound}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableStartRounds.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {teamCount} duplas = {totalSlots} posições totais
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Deseja selecionar times cabeça de chave?</Label>
            <Select value={useSeeds} onValueChange={setUseSeeds}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sim, usar seeds das duplas</SelectItem>
                <SelectItem value="false">Não, embaralhar aleatoriamente</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Seeds colocam as melhores duplas em posições opostas
            </p>
          </div>
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
