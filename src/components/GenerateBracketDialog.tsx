import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Play, Users, Trophy, Swords, ShieldCheck } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
}

export type BracketMode = "normal" | "double_elimination";

interface GenerateBracketDialogProps {
  onGenerate: (config: {
    bracketMode: BracketMode;
    startRound: number;
    useSeeds: boolean;
    numSets: number;
    gamesPerSet?: number;
    seedTeamIds?: string[];
    useGroupStage: boolean;
    groupMode: "by_count" | "by_size";
    numGroups: number;
    groupSize: number;
    teamsPerGroupAdvancing: number;
    byeTeamIds: string[];
    useIndex: boolean;
    numIndexTeams?: number;
  }) => void;
  teamCount: number;
  teams: Team[];
  isDisabled: boolean;
  sport: string;
}

export const GenerateBracketDialog = ({ onGenerate, teamCount, teams, isDisabled, sport }: GenerateBracketDialogProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"mode" | "config">("mode");
  const [bracketMode, setBracketMode] = useState<BracketMode>("normal");
  const [useSeeds, setUseSeeds] = useState("false");
  const [numSets, setNumSets] = useState("3");
  const [gamesPerSet, setGamesPerSet] = useState("6");
  const [selectedSeedIds, setSelectedSeedIds] = useState<string[]>([]);
  const [sideATeamIds, setSideATeamIds] = useState<string[]>([]);
  const [sideBTeamIds, setSideBTeamIds] = useState<string[]>([]);
  const [useGroupStage, setUseGroupStage] = useState(true);
  const [groupMode, setGroupMode] = useState<"by_count" | "by_size">("by_count");
  const [numGroups, setNumGroups] = useState("2");
  const [groupSize, setGroupSize] = useState("4");
  const [teamsPerGroupAdvancing, setTeamsPerGroupAdvancing] = useState("2");
  const [byeTeamIds, setByeTeamIds] = useState<string[]>([]);
  const [useIndex, setUseIndex] = useState(false);
  const [numIndexTeams, setNumIndexTeams] = useState("1");

  const isBeachTennis = sport === "beach_tennis";
  const supportsIndex = sport === "beach_volleyball" || sport === "futevolei";

  // Calculate effective groups based on mode
  const effectiveGroups = groupMode === "by_count"
    ? (Number(numGroups) || 2)
    : Math.ceil(teamCount / (Number(groupSize) || 4));
  const advancing = Number(teamsPerGroupAdvancing) || 2;
  const totalAdvancing = effectiveGroups * advancing;

  // Validate: would any group have only 1 team?
  const wouldHaveSingleTeamGroup = (() => {
    if (!useGroupStage) return false;
    const ng = effectiveGroups;
    if (ng < 1) return true;
    const baseSize = Math.floor(teamCount / ng);
    // If baseSize is 0, some groups will be empty or have 1
    return baseSize < 2 && (teamCount % ng) > 0 && baseSize < 1 || (baseSize === 1 && teamCount % ng === 0);
  })();

  const getKnockoutPhase = (count: number) => {
    if (count <= 2) return "Final";
    if (count <= 4) return "Semifinal";
    if (count <= 8) return "Quartas de Final";
    if (count <= 16) return "Oitavas de Final";
    return `Fase eliminatória`;
  };

  // No power-of-2 calculations needed
  const maxRounds = Math.ceil(Math.log2(Math.max(teamCount, 2)));
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
      bracketMode,
      startRound: getAutoStartRound(),
      useSeeds: useSeeds === "true",
      numSets: Number(numSets),
      gamesPerSet: isBeachTennis ? Number(gamesPerSet) : undefined,
      seedTeamIds: useSeeds === "true" ? selectedSeedIds : undefined,
      useGroupStage: bracketMode === "normal" ? useGroupStage : false,
      groupMode,
      numGroups: effectiveGroups,
      groupSize: Number(groupSize) || 4,
      teamsPerGroupAdvancing: advancing,
      byeTeamIds: [], // BYEs disabled
      useIndex: supportsIndex && useIndex,
      numIndexTeams: supportsIndex && useIndex ? Number(numIndexTeams) : 0,
      ...(bracketMode === "double_elimination" && useSeeds === "true" ? {
        sideATeamIds,
        sideBTeamIds,
      } : {}),
    } as any);
    setOpen(false);
    setStep("mode");
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setStep("mode");
  };

  const setOptions = isBeachTennis ? [2, 3, 4] : [1, 3, 5];
  const maxGroups = Math.min(Math.floor(teamCount / 2), 16);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
        {step === "mode" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Tipo de Chaveamento
              </DialogTitle>
              <DialogDescription>Escolha o sistema de competição</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <button
                onClick={() => { setBracketMode("normal"); setStep("config"); }}
                className="w-full rounded-xl border-2 border-border bg-card p-5 text-left hover:border-primary/60 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                    <Swords className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground">Chaveamento Normal</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Eliminatória simples com fases estruturadas (Oitavas → Quartas → Semi → Final).
                      Pode incluir fase de grupos antes da eliminatória.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Fase de Grupos</span>
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Eliminatória Direta</span>
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Cabeças de Chave</span>
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => { setBracketMode("double_elimination"); setStep("config"); }}
                className="w-full rounded-xl border-2 border-border bg-card p-5 text-left hover:border-primary/60 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground">Dupla Eliminação</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Duplas divididas em metade superior e inferior. Perdedores vão para o lado
                      oposto. Semifinais cruzadas e final única.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Vencedores (Sup/Inf)</span>
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Perdedores (Sup/Inf)</span>
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Semifinais Cruzadas</span>
                      <span className="text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Final</span>
                    </div>
                  </div>
                </div>
              </button>

              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                <p className="text-xs text-muted-foreground">
                  {teamCount} duplas inscritas
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {bracketMode === "normal" ? (
                  <Swords className="h-5 w-5 text-primary" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-primary" />
                )}
                {bracketMode === "normal" ? "Chaveamento Normal" : "Dupla Eliminação"}
              </DialogTitle>
              <DialogDescription>Configure as opções do torneio</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Group Stage Toggle - only for normal mode */}
              {bracketMode === "normal" && (
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
                      {/* Mode toggle: by count or by size */}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Definir grupos por:</Label>
                        <RadioGroup value={groupMode} onValueChange={(v) => setGroupMode(v as "by_count" | "by_size")} className="flex gap-4">
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="by_count" id="byCount" />
                            <Label htmlFor="byCount" className="text-sm cursor-pointer">Quantidade de grupos</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="by_size" id="bySize" />
                            <Label htmlFor="bySize" className="text-sm cursor-pointer">Tamanho do grupo</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {groupMode === "by_count" ? (
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
                            <p className="text-xs text-muted-foreground">
                              ~{Math.floor(teamCount / effectiveGroups)} duplas por grupo
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Label className="text-sm">Duplas por Grupo</Label>
                            <Select value={groupSize} onValueChange={setGroupSize}>
                              <SelectTrigger className="bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: Math.max(teamCount - 1, 1) }, (_, i) => i + 2).map(n => (
                                  <SelectItem key={n} value={String(n)}>{n} duplas</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              = {effectiveGroups} grupo(s)
                            </p>
                          </div>
                        )}
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

                      {wouldHaveSingleTeamGroup && (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                          <p className="text-xs text-destructive font-semibold">
                            ⚠️ Configuração inválida: algum grupo ficaria com apenas 1 dupla.
                          </p>
                        </div>
                      )}

                      {/* Index advancement (Volleyball/Futevolei only) */}
                      {supportsIndex && (
                        <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={useIndex}
                              onCheckedChange={(v) => setUseIndex(!!v)}
                              id="indexAdvance"
                            />
                            <Label htmlFor="indexAdvance" className="text-base font-semibold cursor-pointer text-primary">
                              Duplas avançam por Índice?
                            </Label>
                          </div>
                          {useIndex && (
                            <div className="pl-7">
                              <div className="space-y-2">
                                <Label className="text-sm">Quantas duplas avançam por índice?</Label>
                                <Select value={numIndexTeams} onValueChange={setNumIndexTeams}>
                                  <SelectTrigger className="bg-card">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 9 }, (_, i) => i).map(n => (
                                      <SelectItem key={n} value={String(n)}>{n} dupla{n !== 1 ? "s" : ""}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Máximo 8 duplas. Serão selecionadas automaticamente conforme melhor desempenho nos grupos.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

              {/* Phase info */}
                      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                        <p className="text-sm font-bold text-primary">Fase de Grupos</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {effectiveGroups} grupo(s) × {advancing} avançando = {totalAdvancing} duplas na eliminatória
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Phase info for non-group normal mode */}
              {bracketMode === "normal" && !useGroupStage && (
                <div className="rounded-lg border border-border bg-secondary/50 p-3">
                  <p className="text-sm font-bold text-primary">Eliminatória Direta</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {teamCount} duplas inscritas — sem fase de grupos
                  </p>
                </div>
              )}

              {/* Double elimination info */}
              {bracketMode === "double_elimination" && (
                <div className="rounded-lg border border-border bg-secondary/50 p-4 space-y-3">
                  <h4 className="font-semibold text-foreground">Estrutura da Dupla Eliminação</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      <span><strong className="text-foreground">Vencedores (Superior + Inferior):</strong> Duplas jogam apenas dentro de sua metade</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                      <span><strong className="text-foreground">Perdedores (Superior + Inferior):</strong> Recebem perdedores do lado oposto (cruzamento invertido)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                      <span><strong className="text-foreground">Semifinais Cruzadas:</strong> Campeão Perdedores vs Campeão Vencedores do lado oposto</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
                      <span><strong className="text-foreground">Final:</strong> Vencedores das semifinais cruzadas</span>
                    </div>
                    <p className="text-xs mt-2 border-t border-border pt-2">
                      Qualquer derrota na Chave dos Perdedores elimina definitivamente. Nunca há mistura de metades antes das semifinais.
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                    <p className="text-sm font-bold text-primary">Chave dos Vencedores</p>
                    <p className="text-xs text-muted-foreground mt-1">{teamCount} duplas cadastradas — início direto no chaveamento</p>
                  </div>
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

              {useSeeds === "true" && bracketMode !== "double_elimination" && (
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

              {useSeeds === "true" && bracketMode === "double_elimination" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Duplas no Lado A (Vencedores Superior):</Label>
                    <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-blue-500/30 p-2 bg-blue-500/5">
                      {teams.filter(t => !sideBTeamIds.includes(t.id)).map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={sideATeamIds.includes(t.id)}
                            onCheckedChange={() => {
                              setSideATeamIds(prev =>
                                prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                              );
                            }}
                          />
                          <span className="text-foreground">{t.player1_name} / {t.player2_name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-blue-400">{sideATeamIds.length} dupla(s) no Lado A</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Duplas no Lado B (Vencedores Inferior):</Label>
                    <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-cyan-500/30 p-2 bg-cyan-500/5">
                      {teams.filter(t => !sideATeamIds.includes(t.id)).map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={sideBTeamIds.includes(t.id)}
                            onCheckedChange={() => {
                              setSideBTeamIds(prev =>
                                prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                              );
                            }}
                          />
                          <span className="text-foreground">{t.player1_name} / {t.player2_name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-cyan-400">{sideBTeamIds.length} dupla(s) no Lado B</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Duplas não atribuídas serão distribuídas aleatoriamente nos espaços restantes.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setStep("mode")}>
                Voltar
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={bracketMode === "normal" && useGroupStage && wouldHaveSingleTeamGroup}
                className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90"
              >
                Gerar {bracketMode === "normal" ? "Chaveamento" : "Dupla Eliminação"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
