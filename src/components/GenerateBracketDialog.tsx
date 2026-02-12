import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play } from "lucide-react";

interface GenerateBracketDialogProps {
  onGenerate: (startRound: number, useSeeds: boolean) => void;
  teamCount: number;
  isDisabled: boolean;
}

export const GenerateBracketDialog = ({ onGenerate, teamCount, isDisabled }: GenerateBracketDialogProps) => {
  const [open, setOpen] = useState(false);
  const [startRound, setStartRound] = useState("1");
  const [useSeeds, setUseSeeds] = useState("true");

  const maxTeams = 64;
  const minTeams = teamCount;
  const totalSlots = Math.pow(2, Math.ceil(Math.log2(minTeams)));
  const maxRounds = Math.ceil(Math.log2(totalSlots));

  const getRoundLabel = (round: number) => {
    if (round === maxRounds) return "Final";
    if (round === maxRounds - 1) return "Semifinal";
    if (round === maxRounds - 2) return "Quartas";
    return `Oitavas (${Math.pow(2, maxRounds - round)} times)`;
  };

  const handleGenerate = () => {
    onGenerate(Number(startRound), useSeeds === "true");
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

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Início da Chave</Label>
            <Select value={startRound} onValueChange={setStartRound}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxRounds }).map((_, i) => {
                  const round = i + 1;
                  return (
                    <SelectItem key={round} value={String(round)}>
                      {getRoundLabel(round)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Seu torneio tem {minTeams} duplas = {totalSlots} posições totais
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Usar Seeds</Label>
            <Select value={useSeeds} onValueChange={setUseSeeds}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sim, usar order das duplas como seed</SelectItem>
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
