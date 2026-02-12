import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Play, Users, Trophy } from "lucide-react";

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
    useGroupStage: boolean;
    numGroups: number;
    teamsPerGroupAdvancing: number;
    byeTeamIds: string[];
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
  const [useGroupStage, setUseGroupStage] = useState(true);
  const [numGroups, setNumGroups] = useState("2");
  const [teamsPerGroupAdvancing, setTeamsPerGroupAdvancing] = useState("2");
  const [byeTeamIds, setByeTeamIds] = useState<string[]>([]);

  const isBeachTennis = sport === "beach_tennis";

  // Calculate knockout phase based on advancing teams
  const groups = Number(numGroups) || 2;
  const advancing = Number(teamsPerGroupAdvancing) || 2;
  const totalAdvancing = groups * advancing + byeTeamIds.length;

  const getKnockoutPhase = (count: number) => {
    if (count <= 2) return "Final";
    if (count <= 4) return "Semifinal";
    if (count <= 8) return "Quartas de Final";
    if (count <= 16) return "Oitavas de Final";
    return `Fase eliminatória (${count} times)`;
  };

  // Auto-detect for non-group stage
  const totalSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(teamCount, 2))));
  const maxRounds = Math.ceil(Math.log2(totalSlots));
  const getAutoStartRound = () => {
    if (teamCount <= 2) return maxRounds;
    if (teamCount <= 4) return maxRounds - 1;
    if (teamCount <= 8) return maxRounds - 2;
    if (teamCount <= 16) return maxRounds - 3;
    return 1;
  };

  const toggleSeedTeam = (teamId: string) => {
    setSelectedSeedIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  const toggleByeTeam = (teamId: string) => {
    setByeTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  const handleGenerate = () => {
    onGenerate({
      startRound: getAutoStartRound(),
      useSeeds: useSeeds === "true",
      numSets: Number(numSets),
      gamesPerSet: isBeachTennis ? Number(gamesPerSet) : undefined,
      seedTeamIds: useSeeds === "true" ? selectedSeedIds : undefined,
      useGroupStage,
      numGroups: groups,
      teamsPerGroupAdvancing: advancing,
      byeTeamIds,
    });
    setOpen(false);
  };

  const setOptions = isBeachTennis ? [2, 3, 4] : [1, 3, 5];
  const maxGroups = Math.min(Math.floor(teamCount / 2), 8);

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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Gerar Chaveamento
          </DialogTitle>
          <DialogDescription>Configure as fases do torneio</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Group Stage Toggle */}
          <div className="rounded-lg border border-border bg-secondary/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={useGroupStage}
                onCheckedChange={(v) => setUseGroupStage(!!v)}
                id="groupStage"
              />
              <Label htmlFor="groupStage" className="text-base font-semibold cursor-pointer">
                Usar Fase de Grupos
              </Label>
            </div>

            {useGroupStage && (
              <div className="space-y-4 pl-7">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Nº de Grupos</Label>
                    <Select value={numGroups} onValueChange={setNumGroups}>
                      <SelectTrigger className="bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: maxGroups }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>{n} grupo{n > 1 ? "s" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Avançam por grupo</Label>
                    <Select value={teamsPerGroupAdvancing} onValueChange={setTeamsPerGroupAdvancing}>
                      <SelectTrigger className="bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} dupla{n > 1 ? "s" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Bye teams */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Duplas que avançam por BYE (índice)</Label>
                  <p className="text-xs text-muted-foreground">Selecione duplas que avançam direto para a eliminatória</p>
                  <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-border p-2 bg-card/50">
                    {teams.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={byeTeamIds.includes(t.id)}
                          onCheckedChange={() => toggleByeTeam(t.id)}
                        />
                        <span className="text-foreground">{t.player1_name} / {t.player2_name}</span>
                      </label>
                    ))}
                  </div>
                  {byeTeamIds.length > 0 && (
                    <p className="text-xs text-primary">{byeTeamIds.length} dupla(s) com BYE</p>
                  )}
                </div>

                {/* Knockout phase detection */}
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground">Fase eliminatória detectada:</p>
                  <p className="text-sm font-bold text-primary">
                    {getKnockoutPhase(totalAdvancing)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {groups} grupo(s) × {advancing} avançando{byeTeamIds.length > 0 ? ` + ${byeTeamIds.length} BYE` : ""} = {totalAdvancing} duplas na eliminatória
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Phase info for non-group */}
          {!useGroupStage && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <p className="text-sm text-muted-foreground">Fase detectada automaticamente:</p>
              <p className="text-lg font-bold text-primary">{getKnockoutPhase(teamCount)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {teamCount} duplas → {totalSlots} posições
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base font-semibold">Número de Sets</Label>
            <Select value={numSets} onValueChange={setNumSets}>
              <SelectTrigger className="bg-card">
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
                <SelectTrigger className="bg-card">
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
            <Label className="text-base font-semibold">Cabeças de chave?</Label>
            <Select value={useSeeds} onValueChange={setUseSeeds}>
              <SelectTrigger className="bg-card">
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
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border p-2 bg-card/50">
                {teams.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedSeedIds.includes(t.id)}
                      onCheckedChange={() => toggleSeedTeam(t.id)}
                    />
                    <span className="text-foreground">{t.player1_name} / {t.player2_name}</span>
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
