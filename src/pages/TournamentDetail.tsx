import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSportTheme } from "@/contexts/SportContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Trophy, Users, Shuffle, Copy, Pencil, Check, X, ArrowLeft, Undo2, Download, Upload, Settings2, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { scanPropagationConsistency, type PropagationConsistencyReport } from "@/lib/integrityScanner";
import * as XLSX from "xlsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";
import { GenerateBracketDialog } from "@/components/GenerateBracketDialog";
import { useLuanaAccess } from "@/hooks/useLuanaAccess";
import { rankTeamsInGroup, selectIndexTeams } from "@/lib/tiebreakLogic";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import { formatDateBR } from "@/lib/utils";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import ModalityTabs from "@/components/ModalityTabs";
import TournamentOrganizersManager from "@/components/TournamentOrganizersManager";
import { useModalities } from "@/hooks/useModalities";
import { generateDoubleEliminationBracket } from "@/lib/doubleEliminationLogic";
import { processDoubleEliminationAdvance, handleResetFinal } from "@/lib/doubleEliminationAdvance";
import { computeAggressiveCascadeReset, computePartialCascadeResetSE } from "@/lib/aggressiveCascadeReset";
import { distributeChapeus, getChapeuTeams, getRealTeams } from "@/lib/chapeuDistribution";
import { eighthsToQuartersPosition, quartersToSemisPosition } from "@/lib/bracketCrossings";
import { generateSeeds } from "@/engine/seedingEngine";
import { runBugCombatant, startBackgroundWatchdog } from "@/lib/bugCombatant";
import { checkAutoAdvance } from "@/engine/autoAdvanceEngine";
import { isRoundLocked } from "@/engine/roundLockGuard";
import { validateSystemRules, type TournamentSnapshot, type GuardMatch } from "@/engine/systemRulesGuard";
import { validatePostGeneration, type ValidationMatch, type RepairAction } from "@/engine/postGenerationValidator";
import { evaluateLateInsertion, type LateInsertionMatch } from "@/engine/lateTeamInsertion";

import BracketTreeView from "@/components/BracketTreeView";
import MatchSequenceViewer from "@/components/MatchSequenceViewer";
import { exportBracketPdf, exportSequencePdf, exportBracketAndSequencePdf } from "@/lib/exportBracket";
import { buildMatchNumberMap } from "@/lib/matchNumbering";
import { getEliminationRoundLabel } from "@/lib/roundLabels";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileDown } from "lucide-react";
import ClassificationTab from "@/components/ClassificationTab";
import RankingsTab from "@/components/RankingsTab";
import StageSelector from "@/components/StageSelector";
import BugCombatantLogPanel from "@/components/BugCombatantLogPanel";
import { generateFakeTeams, type FakeNameGender } from "@/lib/fakeNames";
import { VERANICO_EIGHTHS_MAP } from "@/lib/veranicoEighthsMap";
import { logVeranico } from "@/lib/veranicoAudit";

const sportLabels: Record<string, string> = {
  beach_volleyball: "🏐 Vôlei de Praia",
  futevolei: "⚽ Futevôlei",
  beach_tennis: "🎾 Beach Tennis",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  registration: "Inscrições",
  in_progress: "Em andamento",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

const sameMatchScope = (m: Match, ref: Match) =>
  m.modality_id === ref.modality_id && (m.stage_id ?? null) === (ref.stage_id ?? null);

const sameStageScope = (stageId: string | null | undefined, selectedStageId: string | null) =>
  (stageId ?? null) === (selectedStageId ?? null);

const matchScopeFilters = (match: Match, tournamentId: string) => {
  const filters: Record<string, any> = match.modality_id
    ? { modality_id: match.modality_id }
    : { tournament_id: tournamentId };
  if (match.stage_id !== undefined) filters.stage_id = match.stage_id ?? null;
  return filters;
};

const normalizeTeamName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

const teamPairKey = (player1Name: string, player2Name: string) =>
  [normalizeTeamName(player1Name), normalizeTeamName(player2Name)].sort().join("|");

interface Team {
  id: string;
  tournament_id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
  is_fictitious: boolean;
  payment_status: string;
  modality_id: string | null;
  stage_id?: string | null;
}

interface Match {
  id: string;
  tournament_id: string;
  round: number;
  position: number;
  participant1_id: string | null;
  participant2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  bracket_number: number;
  modality_id: string | null;
  bracket_type: string | null;
  bracket_half: string | null;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  is_chapeu?: boolean | null;
  live_score?: any;
  court_number?: number | null;
  stage_id?: string | null;
}

const TournamentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, organizerId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { setSelectedSport } = useSportTheme();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournamentRules, setTournamentRules] = useState<any>(null);
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editP1, setEditP1] = useState("");
  const [editP2, setEditP2] = useState("");
  const [fictitiousCount, setFictitiousCount] = useState("");
  const [fictitiousGender, setFictitiousGender] = useState<FakeNameGender>("male");
  const declareWinnerMutex = useRef(new Set<string>());
  const [fictitiousDialogOpen, setFictitiousDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [editTournamentOpen, setEditTournamentOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", location: "", event_date: "", category: "", status: "", registration_value: "" });
  const [savingTournament, setSavingTournament] = useState(false);
  const [isAssociatedOrganizer, setIsAssociatedOrganizer] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const bracketExportRef = useRef<HTMLDivElement>(null);
  const [exportingBracket, setExportingBracket] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("teams");
  const [consistencyReport, setConsistencyReport] = useState<PropagationConsistencyReport | null>(null);
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const [scanningConsistency, setScanningConsistency] = useState(false);

  const runConsistencyScan = useCallback(async () => {
    if (!id) return;
    setScanningConsistency(true);
    try {
      const report = await scanPropagationConsistency(id);
      setConsistencyReport(report);
      setConsistencyOpen(true);
      if (report.ok) {
        toast.success(`Consistência OK em ${report.modalities.length} modalidade(s).`);
      } else {
        toast.error(`${report.totalIssues} propagação(ões) inconsistente(s) detectada(s).`);
      }
    } catch (err: any) {
      toast.error("Falha na verificação: " + (err?.message ?? String(err)));
    } finally {
      setScanningConsistency(false);
    }
  }, [id]);

  const { modalities, selectedModality, setSelectedModality, updateModality, createModality, deleteModality, loading: modalitiesLoading } = useModalities(id);

  const isOwner = tournament?.created_by === organizerId || isAdmin || isAssociatedOrganizer;
  const hasLuanaAccess = useLuanaAccess(tournament?.created_by);
  const isTournamentCompleted = tournament?.status === 'completed' || tournament?.status === 'cancelled';
  const isFutevoleiTournament = tournament?.sport === 'futevolei';
  // Historical Lock: torneios finalizados ficam bloqueados, EXCETO em etapas novas (stage_id selecionado)
  const isOnNewStage = !!selectedStageId;
  const isWriteLocked = isTournamentCompleted && !isFutevoleiTournament && !isOnNewStage;
  const canEdit = isOwner && !isWriteLocked;

  // Helper: build snapshot and run system rules guard
  const runSystemRulesGuard = useCallback((matchList: Match[], label: string): boolean => {
    const snapshot: TournamentSnapshot = {
      matches: matchList.map(m => ({
        id: m.id,
        round: m.round,
        position: m.position,
        status: m.status,
        bracket_type: m.bracket_type,
        bracket_half: m.bracket_half,
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        winner_team_id: m.winner_team_id,
        is_chapeu: m.is_chapeu,
        modality_id: m.modality_id,
      })),
      format: tournament?.format || 'single_elimination',
    };
    const violations = validateSystemRules(snapshot);
    if (violations.length > 0) {
      console.error(`[SystemRulesGuard:${label}] ${violations.length} violação(ões):`);
      violations.forEach(v => console.error(`  → [${v.rule}] ${v.message}`));
      toast.error(`⛔ Violação de regra: ${violations[0].message}`);
      return false; // blocked
    }
    return true; // ok
  }, [tournament?.format]);

  // Filtered data by selected modality — STRICT isolation, no fallback (MEMOIZED)
  // While modalities are still loading, return empty to prevent unfiltered data flash
  const filteredTeams = useMemo(() => {
    if (modalitiesLoading) return [];
    let result = selectedModality ? teams.filter(t => t.modality_id === selectedModality.id) 
      : modalities.length > 0 ? [] : teams;
    result = result.filter((t: any) => sameStageScope(t.stage_id, selectedStageId));
    return result;
  }, [teams, selectedModality, modalities.length, modalitiesLoading, selectedStageId]);
  const filteredMatches = useMemo(() => {
    if (modalitiesLoading) return [];
    let result = selectedModality ? matches.filter(m => m.modality_id === selectedModality.id) 
      : modalities.length > 0 ? [] : matches;
    result = result.filter((m: any) => sameStageScope(m.stage_id, selectedStageId));
    return result;
  }, [matches, selectedModality, modalities.length, modalitiesLoading, selectedStageId]);

  // Detect if group stage exists for current modality (round=0 matches)
  const hasGroupStageGenerated = useMemo(() => 
    filteredMatches.some(m => m.round === 0),
    [filteredMatches]
  );

  // Reads use direct supabase (SELECT policies are true)
  const fetchData = useCallback(async () => {
    if (!id) return;
    const [tRes, teamsRes, mRes, rulesRes] = await Promise.all([
      publicQuery({ table: "tournaments", filters: { id }, single: true }),
      publicQuery({ table: "teams", filters: { tournament_id: id }, order: { column: "seed", ascending: true } }),
      publicQuery({ table: "matches", filters: { tournament_id: id }, order: [{ column: "round", ascending: true }, { column: "position", ascending: true }] }),
      publicQuery({ table: "tournament_rules", filters: { tournament_id: id }, maybeSingle: true }),
    ]);
    if (tRes.data) {
      setTournament(tRes.data);
      setSelectedSport(tRes.data.sport);
    }
    if (teamsRes.data) setTeams(teamsRes.data);
    if (mRes.data) setMatches(mRes.data);
    if (rulesRes.data) setTournamentRules(rulesRes.data);
    setLoading(false);
  }, [id, setSelectedSport]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 🛡️ Combatente de Bugs em background:
  //  - scan inicial 1.5s após carregar
  //  - re-scan automático a cada 30s
  //  - re-scan disparado por mudanças realtime (debounce 2.5s)
  // Corrige inconsistências estruturais sem ação manual e re-busca os dados.
  useEffect(() => {
    if (!id) return;
    const stop = startBackgroundWatchdog(id, (r) => {
      toast.success(
        `🛡️ ${r.fixed} inconsistência${r.fixed > 1 ? "s" : ""} corrigida${r.fixed > 1 ? "s" : ""} automaticamente`,
        { duration: 3000 }
      );
      fetchData();
    });
    return stop;
  }, [id, fetchData]);

  // Check if current organizer is associated with this tournament
  useEffect(() => {
    if (!id || !organizerId || isAdmin) return;
    organizerQuery<{ id: string }[]>({
      table: "tournament_organizers",
      operation: "select",
      select: "id",
      filters: { tournament_id: id, organizer_id: organizerId },
    }).then(({ data }) => {
      setIsAssociatedOrganizer(!!(data && data.length > 0));
    });
  }, [id, organizerId, isAdmin]);

  // Real-time subscriptions with debounce to avoid excessive re-fetches
  useEffect(() => {
    if (!id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      // 800ms gives time for cascade chains (declareWinner → multiple UPDATEs)
      // to settle into a single refetch instead of N refetches.
      debounceTimer = setTimeout(() => fetchData(), 800);
    };
    const channel = supabase
      .channel(`tournament-rt-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `tournament_id=eq.${id}` }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, (payload) => {
        if ((payload.new as any)?.id === id) debouncedFetch();
      })
      .subscribe();
    return () => { 
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel); 
    };
  }, [id, fetchData]);

  // All writes go through organizerQuery
  // Check if bracket exists for current modality (knockout matches with round > 0)
  const hasBracketGenerated = useMemo(() =>
    filteredMatches.some(m => m.round > 0),
    [filteredMatches]
  );
  const currentStageId = selectedStageId || null;

  // Check if late insertion is still allowed (no completed matches beyond R1 winners)
  const lateInsertionAllowed = useMemo(() => {
    if (!hasBracketGenerated) return false;
    const result = evaluateLateInsertion(
      filteredMatches as LateInsertionMatch[],
      selectedModality?.id || null,
      tournament?.format || 'single_elimination'
    );
    return result.allowed;
  }, [filteredMatches, selectedModality, tournament?.format, hasBracketGenerated]);

  const addTeam = async () => {
    if (isWriteLocked) { toast.error("🔒 Torneio finalizado. Alterações bloqueadas."); return; }
    if (!player1.trim() || !player2.trim() || !id) return;
    if (hasGroupStageGenerated) {
      toast.error("❌ Fase de grupos já gerada. Faça o reset completo para alterar equipes.");
      return;
    }

    // If bracket is already generated, attempt late insertion
    if (hasBracketGenerated) {
      await executeLateInsertion(player1.trim(), player2.trim());
      return;
    }

    const { error } = await organizerQuery({
      table: "teams",
      operation: "insert",
      data: {
        tournament_id: id,
        player1_name: player1.trim(),
        player2_name: player2.trim(),
        seed: filteredTeams.length + 1,
        modality_id: selectedModality?.id || null,
        stage_id: selectedStageId || null,
      },
    });
    if (error) { toast.error(error.message); return; }
    setPlayer1("");
    setPlayer2("");
    fetchData();
  };

  const executeLateInsertion = async (p1: string, p2: string) => {
    if (!id) return;
    const evaluation = evaluateLateInsertion(
      filteredMatches as LateInsertionMatch[],
      selectedModality?.id || null,
      tournament?.format || 'single_elimination'
    );

    if (!evaluation.allowed) {
      toast.error(`❌ ${evaluation.reason}`);
      return;
    }

    // Step 1: Create the new team
    const { data: newTeamData, error: teamErr } = await organizerQuery<{ id: string }[]>({
      table: "teams",
      operation: "insert",
      data: {
        tournament_id: id,
        player1_name: p1,
        player2_name: p2,
        seed: filteredTeams.length + 1,
        modality_id: selectedModality?.id || null,
        stage_id: selectedStageId || null,
      },
      select: "id",
    });
    if (teamErr || !newTeamData || newTeamData.length === 0) {
      toast.error(teamErr?.message || "Erro ao criar dupla.");
      return;
    }
    const newTeamId = newTeamData[0].id;

    if (evaluation.strategy === 'fill_chapeu') {
      // Simply fill the empty slot in the chapéu match
      const chapeuMatch = filteredMatches.find(m => m.id === evaluation.chapeuMatchId);
      if (!chapeuMatch) { toast.error("Erro: match chapéu não encontrado."); return; }
      const emptySlot = !chapeuMatch.team2_id ? 'team2_id' : 'team1_id';
      const { error } = await organizerQuery({
        table: "matches",
        operation: "update",
        data: { [emptySlot]: newTeamId },
        filters: { id: evaluation.chapeuMatchId },
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`✅ Dupla ${p1}/${p2} inserida no chapéu da chave B!`);

    } else if (evaluation.strategy === 'create_preliminary') {
      // Step 2: Remove displaced team from R2 match
      const { error: clearErr } = await organizerQuery({
        table: "matches",
        operation: "update",
        data: { [evaluation.targetSlot!]: null, is_chapeu: false },
        filters: { id: evaluation.targetMatchId },
      });
      if (clearErr) { toast.error(clearErr.message); return; }

      // Step 3: Create new R1 match with new team vs displaced team
      const isDE = tournament?.format === 'double_elimination';
      const { data: newMatchData, error: matchErr } = await organizerQuery<{ id: string }[]>({
        table: "matches",
        operation: "insert",
        data: {
          tournament_id: id,
          round: evaluation.newMatchRound,
          position: evaluation.newMatchPosition!,
          team1_id: newTeamId,
          team2_id: evaluation.displacedTeamId,
          status: "pending",
          bracket_type: isDE ? "winners" : null,
          bracket_half: isDE ? "lower" : null,
          bracket_number: 1,
          modality_id: selectedModality?.id || null,
          next_win_match_id: evaluation.targetMatchId,
          next_lose_match_id: null,
          is_chapeu: false,
        },
        select: "id",
      });
      if (matchErr || !newMatchData) { toast.error(matchErr?.message || "Erro ao criar partida."); return; }
      const newMatchId = newMatchData[0].id;

      // Step 4: For DE, find the corresponding losers match that the target R2 match feeds into
      // and create a losers entry for the new R1 match loser
      if (isDE) {
        // Find the losers match that the target R2 match feeds losers to
        const targetMatch = filteredMatches.find(m => m.id === evaluation.targetMatchId);
        if (targetMatch?.next_lose_match_id) {
          // Link the new R1 match loser to the same losers destination
          await organizerQuery({
            table: "matches",
            operation: "update",
            data: { next_lose_match_id: targetMatch.next_lose_match_id },
            filters: { id: newMatchId },
          });
        }
      }

      toast.success(`✅ Dupla ${p1}/${p2} inserida! Nova partida criada na chave B.`);
    }

    setPlayer1("");
    setPlayer2("");
    fetchData();
  };

  const openEditTournament = () => {
    setEditForm({
      name: tournament?.name || "",
      description: tournament?.description || "",
      location: tournament?.location || "",
      event_date: tournament?.event_date || "",
      category: tournament?.category || "",
      status: tournament?.status || "",
      registration_value: tournament?.registration_value != null ? String(tournament.registration_value) : "",
    });
    setEditTournamentOpen(true);
  };

  const saveTournament = async () => {
    if (!editForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSavingTournament(true);
    const { error } = await organizerQuery({
      table: "tournaments",
      operation: "update",
      data: {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        location: editForm.location.trim() || null,
        event_date: editForm.event_date || null,
        category: editForm.category.trim() || null,
        status: editForm.status,
        registration_value: editForm.registration_value ? Number(editForm.registration_value) : null,
      },
      filters: { id },
    });
    setSavingTournament(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Torneio atualizado com sucesso!");
    setEditTournamentOpen(false);
    fetchData();
  };

  const addFictitiousTeams = async () => {
    if (!id) return;
    if (hasGroupStageGenerated) {
      toast.error("❌ Fase de grupos já gerada. Faça o reset completo para alterar equipes.");
      return;
    }
    const count = parseInt(fictitiousCount, 10);
    if (!Number.isFinite(count) || count < 1 || count > 256) { toast.error("Quantidade inválida (1 a 256)"); return; }
    const fakeTeams = generateFakeTeams(count, fictitiousGender);
    const newTeams = fakeTeams.map((t, i) => {
      const num = filteredTeams.length + i + 1;
      return {
        tournament_id: id,
        player1_name: t.player1,
        player2_name: t.player2,
        seed: num,
        is_fictitious: true,
        modality_id: selectedModality?.id || null,
        stage_id: selectedStageId || null,
      };
    });
    const { error } = await organizerQuery({
      table: "teams",
      operation: "insert",
      data: newTeams,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${count} dupla(s) fictícia(s) criada(s)!`);
    setFictitiousDialogOpen(false);
    fetchData();
  };

  const removeTeam = async (tid: string) => {
    const teamInMatch = matches.some(m => m.team1_id === tid || m.team2_id === tid);
    if (teamInMatch) {
      toast.error("Não é possível excluir equipe após geração de partidas.");
      return;
    }
    await organizerQuery({ table: "teams", operation: "delete", filters: { id: tid } });
    fetchData();
  };

  const startEdit = (team: Team) => {
    setEditingTeamId(team.id);
    setEditP1(team.player1_name);
    setEditP2(team.player2_name);
  };

  const saveEdit = async () => {
    if (!editingTeamId || !editP1.trim() || !editP2.trim()) return;
    await organizerQuery({
      table: "teams",
      operation: "update",
      data: { player1_name: editP1.trim(), player2_name: editP2.trim() },
      filters: { id: editingTeamId },
    });
    setEditingTeamId(null);
    toast.success("Dupla atualizada!");
    fetchData();
  };

  const cancelEdit = () => { setEditingTeamId(null); };

  const shuffleTeams = async () => {
    if (!id) return;
    const shuffled = [...filteredTeams].sort(() => Math.random() - 0.5);
    // Batch all updates in parallel for speed
    await Promise.all(
      shuffled.map((team, i) =>
        organizerQuery({
          table: "teams",
          operation: "update",
          data: { seed: i + 1 },
          filters: { id: team.id },
        })
      )
    );
    toast.success("Duplas embaralhadas!");
    fetchData();
  };

  const generateBracket = async (config: {
    bracketMode: "normal" | "double_elimination" | "luana_repechage";
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
    luanaStartsAt?: "quarters" | "eighths";
    luanaGroupCount?: number;
  }) => {
    try {
      if (isWriteLocked) { toast.error("🔒 Torneio finalizado. Alterações bloqueadas."); return; }
      // ── SYSTEM RULES GUARD (pre-bracket generation) ──
      if (filteredMatches.length > 0 && !runSystemRulesGuard(filteredMatches, 'preBracketGeneration')) {
        return;
      }

      const currentModalityId = selectedModality?.id || null;
      const currentStageId = selectedStageId || null;

      if (!selectedModality && modalities.length > 0) {
        toast.error("⛔ Selecione uma modalidade antes de gerar o chaveamento.");
        return;
      }

      const teamFilters: Record<string, any> = {
        tournament_id: id,
        stage_id: currentStageId,
      };
      if (selectedModality) teamFilters.modality_id = selectedModality.id;

      const { data: freshScopedTeams, error: freshTeamsError } = await publicQuery<Team[]>({
        table: "teams",
        filters: teamFilters,
        order: { column: "seed", ascending: true },
      });

      if (freshTeamsError) {
        toast.error("Erro ao validar duplas: " + freshTeamsError.message);
        return;
      }

      const scopedTeams = freshScopedTeams || [];

      // VALIDATION: Check minimum team count using fresh database data only
      if (scopedTeams.length < 2) {
        toast.error("❌ Erro: Cadastre pelo menos 2 duplas antes de gerar o chaveamento.");
        return;
      }

      const uniqueTeamIds = new Set(scopedTeams.map((team) => team.id));
      if (uniqueTeamIds.size !== scopedTeams.length) {
        toast.error("⛔ Geração bloqueada: há duplas repetidas na lista atual.");
        return;
      }

      const uniquePairKeys = new Set(scopedTeams.map((team) => teamPairKey(team.player1_name, team.player2_name)));
      if (uniquePairKeys.size !== scopedTeams.length) {
        toast.error("⛔ Geração bloqueada: a mesma dupla aparece mais de uma vez nesta modalidade/etapa.");
        return;
      }

      // Delete only matches for the current modality — use bulk API
      if (selectedModality) {
        await organizerQuery({
          table: "matches",
          operation: "update",
          data: { next_win_match_id: null, next_lose_match_id: null },
          filters: { tournament_id: id, modality_id: selectedModality.id, ...(currentStageId ? { stage_id: currentStageId } : { stage_id: null }) },
        } as any);
        // Then delete matches for this modality
        await organizerQuery({
          table: "matches",
          operation: "undo_bracket",
          tournament_id: id,
          modality_id: selectedModality.id,
          stage_id: currentStageId,
        } as any);
      } else {
        await organizerQuery({
          table: "matches",
          operation: "update",
          data: { next_win_match_id: null, next_lose_match_id: null },
          filters: { tournament_id: id },
        } as any);
        await organizerQuery({ table: "matches", operation: "delete", filters: { tournament_id: id } });
      }

      await organizerQuery({
        table: "tournaments",
        operation: "update",
        data: { num_sets: config.numSets, games_per_set: config.gamesPerSet || null },
        filters: { id },
      });

    if (config.useGroupStage) {
      // === GROUP STAGE ===
      const totalTeams = scopedTeams.length;
      const numGroups = config.numGroups;

      // 1) Order teams: ELO-based seeds, manual seeds, or full shuffle
      let arranged = [...scopedTeams];
      if (config.useSeeds && config.seedTeamIds && config.seedTeamIds.length > 0) {
        const seeds = arranged.filter(t => config.seedTeamIds!.includes(t.id));
        const nonSeeds = arranged.filter(t => !config.seedTeamIds!.includes(t.id)).sort(() => Math.random() - 0.5);
        arranged = [...seeds, ...nonSeeds];
      } else if (config.useSeeds) {
        // Seed-based ordering via engine
        const seedResult = generateSeeds(arranged.map(t => ({ id: t.id, seed: t.seed ?? 0 })));
        const seedMap = new Map(seedResult.map(s => [s.id, s.seed]));
        arranged.sort((a, b) => (seedMap.get(a.id) ?? 999) - (seedMap.get(b.id) ?? 999));
      } else {
        arranged.sort(() => Math.random() - 0.5);
      }

      // 2) Snake (zig-zag) distribution into balanced groups
      const groupSlots: typeof arranged[] = Array.from({ length: numGroups }, () => []);
      arranged.forEach((team, i) => {
        const cycle = Math.floor(i / numGroups);
        const pos = i % numGroups;
        const groupIdx = cycle % 2 === 0 ? pos : (numGroups - 1 - pos);
        groupSlots[groupIdx].push(team);
      });

      const assignedTeamIds = groupSlots.flat().map((team) => team.id);
      if (assignedTeamIds.length !== totalTeams || new Set(assignedTeamIds).size !== totalTeams) {
        toast.error("⛔ Geração bloqueada: distribuição de grupos alteraria a quantidade de duplas cadastradas.");
        return;
      }

      // 3) Validate: no group with only 1 team
      if (groupSlots.some(g => g.length < 2)) {
        toast.error("❌ Erro: Configuração inválida — algum grupo ficaria com apenas 1 dupla.");
        return;
      }

      // 4) Validate max difference = 1
      const sizes = groupSlots.map(g => g.length);
      if (Math.max(...sizes) - Math.min(...sizes) > 1) {
        toast.error("❌ Erro: Grupos desbalanceados.");
        return;
      }

      // 5) Create group records in DB
      const groupRecords = groupSlots.map((_, g) => ({
        tournament_id: id!,
        name: `Grupo ${String.fromCharCode(65 + g)}`,
      }));
      const { data: createdGroups, error: groupError } = await organizerQuery({
        table: "groups",
        operation: "insert",
        data: groupRecords,
      });
      if (groupError) { toast.error(groupError.message); return; }

      // Fetch created groups to get IDs
      const { data: dbGroups } = await publicQuery({
        table: "groups",
        filters: { tournament_id: id },
        order: { column: "created_at", ascending: true },
      });
      if (!dbGroups || dbGroups.length < numGroups) {
        toast.error("❌ Erro ao buscar grupos criados.");
        return;
      }
      // Use the last N groups (in case there were old ones)
      const relevantGroups = dbGroups.slice(-numGroups);

      // 6) Create classificacao_grupos records
      const classificacaoRecords: any[] = [];
      for (let g = 0; g < numGroups; g++) {
        for (const team of groupSlots[g]) {
          classificacaoRecords.push({
            tournament_id: id!,
            group_id: relevantGroups[g].id,
            team_id: team.id,
            pontos: 0,
            jogos: 0,
            vitorias: 0,
            derrotas: 0,
            sets_pro: 0,
            sets_contra: 0,
            saldo_sets: 0,
          });
        }
      }
      const { error: classError } = await organizerQuery({
        table: "classificacao_grupos",
        operation: "insert",
        data: classificacaoRecords,
      });
      if (classError) { toast.error(classError.message); return; }

      // 7) Create group matches (round-robin within each group)
      const newMatches: any[] = [];
      for (let g = 0; g < groupSlots.length; g++) {
        const groupTeams = groupSlots[g];
        let pos = 1;
        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            newMatches.push({
              tournament_id: id,
              round: 0,
              position: pos++,
              team1_id: groupTeams[i].id,
              team2_id: groupTeams[j].id,
              status: "pending",
              bracket_number: g + 1,
              modality_id: currentModalityId,
              stage_id: currentStageId,
            });
          }
        }
      }

      const { error } = await organizerQuery({ table: "matches", operation: "insert", data: newMatches });
      if (error) { toast.error(error.message); return; }

      // === MODO VERANICO — Grupos + Repescagem CRUZADA (apenas Quartas) ===
      // Oitavas no Modo Veranico NÃO usa repescagem: 4 chaves × 4 vagas → 8 oitavas
      // com cruzamento Mirrored Extremes A↔D / B↔C (vide bloco de preenchimento).
      const isLuanaQuarters = config.bracketMode === "luana_repechage" && config.luanaStartsAt === "quarters";

      if (isLuanaQuarters) {
        // Estrutura fixa: 4 grupos → 4 repescagens (R1) → 4 quartas (R2) → 2 semis (R3) → final + 3º (R4)
        // Repescagem CRUZADA (A↔D e B↔C) — pareamento visual das Quartas:
        //   R1P1 (Jogo 25): 2A × 3D  → vencedor enfrenta 1B na Quartas Pos 2 (Jogo 31)
        //   R1P2 (Jogo 26): 2D × 3A  → vencedor enfrenta 1A na Quartas Pos 1 (Jogo 29)
        //   R1P3 (Jogo 27): 2B × 3C  → vencedor enfrenta 1D na Quartas Pos 4 (Jogo 30)
        //   R1P4 (Jogo 28): 2C × 3B  → vencedor enfrenta 1C na Quartas Pos 3 (Jogo 32)
        const repechageMeta = [
          { pos: 1, leftGroup: 0,             rightGroup: numGroups - 1, quarterPos: 2 },             // 2A×3D → Q2 (1B)
          { pos: 2, leftGroup: numGroups - 1, rightGroup: 0,             quarterPos: 1 },             // 2D×3A → Q1 (1A)
          { pos: 3, leftGroup: 1,             rightGroup: numGroups - 2, quarterPos: numGroups },     // 2B×3C → Q4 (1D)
          { pos: 4, leftGroup: numGroups - 2, rightGroup: 1,             quarterPos: numGroups - 1 }, // 2C×3B → Q3 (1C)
        ];


        const luanaShells: any[] = [];

        // Repescagens (round 1) — sem times ainda; serão preenchidos via auto-advance ao terminar grupos
        for (const meta of repechageMeta) {
          luanaShells.push({
            tournament_id: id,
            round: 1,
            position: meta.pos,
            team1_id: null,
            team2_id: null,
            status: "pending",
            bracket_number: 1,
            bracket_type: "repechage",
            modality_id: currentModalityId,
            stage_id: currentStageId,
          });
        }
        // Quartas (round 2) — 4 matches
        for (let p = 1; p <= 4; p++) {
          luanaShells.push({
            tournament_id: id,
            round: 2,
            position: p,
            team1_id: null,
            team2_id: null,
            status: "pending",
            bracket_number: 1,
            bracket_type: "winners",
            modality_id: currentModalityId,
            stage_id: currentStageId,
          });
        }
        // Semis (round 3) — 2 matches
        for (let p = 1; p <= 2; p++) {
          luanaShells.push({
            tournament_id: id,
            round: 3,
            position: p,
            team1_id: null,
            team2_id: null,
            status: "pending",
            bracket_number: 1,
            bracket_type: "winners",
            modality_id: currentModalityId,
            stage_id: currentStageId,
          });
        }
        // Final (round 4 pos 1)
        luanaShells.push({
          tournament_id: id,
          round: 4,
          position: 1,
          team1_id: null,
          team2_id: null,
          status: "pending",
          bracket_number: 1,
          bracket_type: "winners",
          modality_id: currentModalityId,
          stage_id: currentStageId,
        });
        // 3º lugar (round 4 pos 2)
        luanaShells.push({
          tournament_id: id,
          round: 4,
          position: 2,
          team1_id: null,
          team2_id: null,
          status: "pending",
          bracket_number: 1,
          bracket_type: "third_place",
          modality_id: currentModalityId,
          stage_id: currentStageId,
        });

        const { error: shellErr } = await organizerQuery({ table: "matches", operation: "insert", data: luanaShells });
        if (shellErr) {
          await logVeranico({
            tournament_id: id!, modality_id: currentModalityId, stage_id: currentStageId,
            action: "veranico.error",
            detail: { phase: "shells_insert", error: shellErr.message, shells_attempted: luanaShells.length },
          });
          toast.error(shellErr.message); return;
        }
        await logVeranico({
          tournament_id: id!, modality_id: currentModalityId, stage_id: currentStageId,
          action: "veranico.quarters.shells_created",
          detail: {
            shells_total: luanaShells.length,
            breakdown: {
              repechage_r1: 4, quarters_r2: 4, semis_r3: 2, final_r4: 1, third_place_r4: 1,
            },
          },
        });

        // Buscar shells inseridos para linkar
        const { data: inserted } = await organizerQuery({
          table: "matches",
          operation: "select",
          filters: { tournament_id: id, modality_id: currentModalityId },
          order: [{ column: "round" }, { column: "position" }],
        });
        const luanaMatches = (inserted as any[] || []).filter(m => m.round >= 1);
        const findM = (round: number, position: number, bracket_type: string = "winners") =>
          luanaMatches.find((m: any) => m.round === round && m.position === position && (m.bracket_type || "winners") === bracket_type);

        // Descritores de link (executados sequencialmente para evitar race condition
        // em escritas concorrentes contra a Edge Function organizer-api).
        type LinkDesc = { matchId: string; data: Record<string, string>; label: string };
        const linkDescs: LinkDesc[] = [];

        // Repescagem → Quartas
        for (const meta of repechageMeta) {
          const repMatch = findM(1, meta.pos, "repechage");
          const quarterMatch = findM(2, meta.quarterPos, "winners");
          if (repMatch && quarterMatch) {
            linkDescs.push({
              matchId: repMatch.id,
              data: { next_win_match_id: quarterMatch.id },
              label: `Rep R1P${meta.pos} → Q${meta.quarterPos}`,
            });
          }
        }

        // Quartas → Semis (Mirrored Extremes: Q1↔Q4 → S1, Q2↔Q3 → S2)
        const quarterToSemi: Record<number, number> = { 1: 1, 4: 1, 2: 2, 3: 2 };
        for (let qp = 1; qp <= 4; qp++) {
          const q = findM(2, qp, "winners");
          const s = findM(3, quarterToSemi[qp], "winners");
          if (q && s) {
            linkDescs.push({
              matchId: q.id,
              data: { next_win_match_id: s.id },
              label: `Q${qp} → S${quarterToSemi[qp]}`,
            });
          }
        }

        // Semis → Final (vencedor) + 3º lugar (perdedor)
        const finalM = findM(4, 1, "winners");
        const thirdM = findM(4, 2, "third_place");
        for (let sp = 1; sp <= 2; sp++) {
          const s = findM(3, sp, "winners");
          if (s && finalM) {
            const linkData: Record<string, string> = { next_win_match_id: finalM.id };
            if (thirdM) linkData.next_lose_match_id = thirdM.id;
            linkDescs.push({
              matchId: s.id,
              data: linkData,
              label: `S${sp} → Final + 3º`,
            });
          }
        }

        // Execução sequencial com retry (até 3 tentativas) — evita race condition
        // observada em Promise.all() contra a Edge Function organizer-api.
        const failed: LinkDesc[] = [];
        for (const desc of linkDescs) {
          let attempt = 0;
          let success = false;
          let lastErr: any = null;
          while (attempt < 3 && !success) {
            attempt++;
            const { error: linkErr } = await organizerQuery({
              table: "matches", operation: "update",
              data: desc.data,
              filters: { id: desc.matchId },
            });
            if (!linkErr) { success = true; break; }
            lastErr = linkErr;
            await new Promise((r) => setTimeout(r, 150 * attempt));
          }
          if (!success) {
            console.error(`[MODO VERANICO] Falha ao linkar ${desc.label} após 3 tentativas:`, lastErr);
            failed.push(desc);
          }
        }

        // Verificação pós-link: re-lê do banco e confirma cada next_win_match_id
        const { data: verifyRows } = await organizerQuery({
          table: "matches",
          operation: "select",
          filters: { tournament_id: id, modality_id: currentModalityId },
        });
        const byId = new Map<string, any>(((verifyRows as any[]) || []).map((m) => [m.id, m]));
        const missing: LinkDesc[] = [];
        for (const desc of linkDescs) {
          const row = byId.get(desc.matchId);
          for (const [field, expected] of Object.entries(desc.data)) {
            if (!row || row[field] !== expected) {
              missing.push(desc);
              break;
            }
          }
        }
        // Última tentativa de reparo (sequencial) para qualquer link ainda ausente
        if (missing.length > 0) {
          console.warn(`[MODO VERANICO] ${missing.length} link(s) ausente(s) após escrita; reaplicando…`, missing.map(m => m.label));
          for (const desc of missing) {
            await organizerQuery({
              table: "matches", operation: "update",
              data: desc.data,
              filters: { id: desc.matchId },
            });
          }
        }

        if (failed.length === 0 && missing.length === 0) {
          console.log(`[MODO VERANICO] Estrutura criada: ${luanaShells.length} shells, ${linkDescs.length} links OK`);
        } else {
          console.warn(`[MODO VERANICO] Estrutura criada com avisos: ${failed.length} falhas iniciais, ${missing.length} reaplicados`);
        }
        await logVeranico({
          tournament_id: id!, modality_id: currentModalityId, stage_id: currentStageId,
          action: "veranico.quarters.links_written",
          detail: {
            links_total: linkDescs.length,
            failed_initial: failed.length,
            failed_labels: failed.map(f => f.label),
            reapplied: missing.length,
            reapplied_labels: missing.map(m => m.label),
          },
        });
        await logVeranico({
          tournament_id: id!, modality_id: currentModalityId, stage_id: currentStageId,
          action: "veranico.quarters.links_verified",
          detail: {
            ok: failed.length === 0 && missing.length === 0,
            broken_after_repair: missing.filter(m => failed.some(f => f.matchId === m.matchId)).length,
          },
        });
      } else {
      // === PRE-GENERATE KNOCKOUT BRACKET STRUCTURE ===
      // Create empty match shells for all elimination rounds so they appear in the Sequence tab immediately
      const advancingCount = numGroups * config.teamsPerGroupAdvancing;
      if (advancingCount >= 2) {
        const nextPow = Math.pow(2, Math.ceil(Math.log2(advancingCount)));
        const totalKORounds = Math.ceil(Math.log2(nextPow));
        const koShells: any[] = [];
        
        for (let round = 1; round <= totalKORounds; round++) {
          const matchesInRound = nextPow / Math.pow(2, round);
          for (let pos = 1; pos <= matchesInRound; pos++) {
            koShells.push({
              tournament_id: id,
              round,
              position: pos,
              team1_id: null,
              team2_id: null,
              status: "pending",
              bracket_number: 1,
              modality_id: currentModalityId,
              stage_id: currentStageId,
            });
          }
        }
        
        // Also create a 3rd place match shell
        koShells.push({
          tournament_id: id,
          round: totalKORounds, // same round as the final
          position: 1,
          team1_id: null,
          team2_id: null,
          status: "pending",
          bracket_number: 1,
          bracket_type: "third_place",
          modality_id: currentModalityId,
          stage_id: currentStageId,
        });

        const { error: koErr } = await organizerQuery({ table: "matches", operation: "insert", data: koShells });
        if (!koErr) {
          // Fetch inserted to get IDs, then link next_win_match_id between rounds
          const { data: koInserted } = await organizerQuery({
            table: "matches",
            operation: "select",
            filters: { tournament_id: id },
            order: [{ column: "round" }, { column: "position" }],
          });
          if (koInserted) {
            const koOnly = (koInserted as any[]).filter(m => m.round >= 1 && m.modality_id === currentModalityId);
            type LinkDesc = { matchId: string; data: Record<string, string>; label: string };
            const linkDescs: LinkDesc[] = [];
            // Find the 3rd place match and final match
            const thirdPlaceMatch = koOnly.find((m: any) => m.bracket_type === 'third_place');
            const finalMatch = koOnly.find((m: any) => m.round === totalKORounds && m.bracket_type !== 'third_place');
            // Semi round = totalKORounds - 1
            const semiRound = totalKORounds - 1;
            
            // Quarter-final round for cup-style crossing (Q1 vs Q4, Q2 vs Q3)
            const quarterRound = totalKORounds - 2; // e.g. round 2 when totalKORounds=4
            const numQuarterMatches = nextPow / Math.pow(2, quarterRound);
            
            for (const m of koOnly) {
              if (m.bracket_type === 'third_place') continue; // skip 3rd place from normal linking
              if (m.round < totalKORounds) {
                let nextPos: number;
                const matchesInRound = nextPow / Math.pow(2, m.round);
                const nextRoundMatchCount = nextPow / Math.pow(2, m.round + 1);
                
                // Cup-style crossing: quartas → semis (Mirrored Extremes)
                if (m.round === quarterRound && numQuarterMatches === 4) {
                  nextPos = quartersToSemisPosition(m.position);
                } else if (matchesInRound === 8 && nextRoundMatchCount === 4) {
                  // Cruzamento Oitavas → Quartas (Modo Veranico Oitavas)
                  nextPos = eighthsToQuartersPosition(m.position);
                } else if (matchesInRound >= 8 && nextRoundMatchCount >= 4) {
                  // Extremity pairing for larger brackets
                  if (m.position <= matchesInRound / 2) {
                    nextPos = m.position;
                  } else {
                    nextPos = matchesInRound + 1 - m.position;
                  }
                } else {
                  nextPos = Math.ceil(m.position / 2);
                }
                const nextMatch = koOnly.find((nm: any) => nm.round === m.round + 1 && nm.position === nextPos && nm.bracket_type !== 'third_place');
                if (nextMatch) {
                  const linkData: Record<string, string> = { next_win_match_id: nextMatch.id };
                  if (m.round === semiRound && thirdPlaceMatch) {
                    linkData.next_lose_match_id = thirdPlaceMatch.id;
                  }
                  linkDescs.push({
                    matchId: m.id,
                    data: linkData,
                    label: `R${m.round}P${m.position} → R${m.round + 1}P${nextPos}`,
                  });
                }
              }
            }

            // Execução SEQUENCIAL com retry — evita race conditions observadas em
            // Promise.all() concorrente contra a Edge Function organizer-api,
            // que provocava perda de next_win_match_id em ~25% dos jogos.
            for (const desc of linkDescs) {
              let attempt = 0;
              let success = false;
              while (attempt < 3 && !success) {
                attempt++;
                const { error: linkErr } = await organizerQuery({
                  table: "matches", operation: "update",
                  data: desc.data,
                  filters: { id: desc.matchId },
                });
                if (!linkErr) { success = true; break; }
                await new Promise((r) => setTimeout(r, 150 * attempt));
              }
              if (!success) console.error(`[PreGen] Falha ao linkar ${desc.label}`);
            }

            // Verificação pós-link com reaplicação de qualquer link ausente
            const { data: verifyRows } = await organizerQuery({
              table: "matches", operation: "select",
              filters: { tournament_id: id, modality_id: currentModalityId },
            });
            const byId = new Map<string, any>(((verifyRows as any[]) || []).map((r) => [r.id, r]));
            for (const desc of linkDescs) {
              const row = byId.get(desc.matchId);
              for (const [field, expected] of Object.entries(desc.data)) {
                if (!row || row[field] !== expected) {
                  console.warn(`[PreGen] Reaplicando link ausente: ${desc.label} (${field})`);
                  await organizerQuery({
                    table: "matches", operation: "update",
                    data: desc.data,
                    filters: { id: desc.matchId },
                  });
                  break;
                }
              }
            }
          }
        }
        console.log(`[PreGen] Knockout shells created: ${koShells.length} matches for ${totalKORounds} rounds (${advancingCount} advancing → padded to ${nextPow})`);
      }
      } // end else (não-luana)

      await organizerQuery({
        table: "tournaments",
        operation: "update",
        data: { status: "in_progress" },
        filters: { id },
      });
      
      if (config.useIndex && config.numIndexTeams && config.numIndexTeams > 0) {
        await organizerQuery({
          table: "tournaments",
          operation: "update",
          data: { num_brackets: config.numIndexTeams },
          filters: { id },
        });
      }
      
      toast.success(`Fase de grupos gerada! ${numGroups} grupo(s) criado(s) com distribuição snake${config.useIndex ? ` + ${config.numIndexTeams} índice` : ""}.`);
      fetchData();
    } else if (config.bracketMode === "double_elimination") {
      // === DOUBLE ELIMINATION ===
      let result;
      try {
        result = generateDoubleEliminationBracket({
          tournamentId: id!,
          modalityId: currentModalityId || "",
          teams: scopedTeams.map(t => ({
            id: t.id, player1_name: t.player1_name, player2_name: t.player2_name, seed: t.seed ?? 0,
          })),
          useSeeds: config.useSeeds,
          seedTeamIds: config.seedTeamIds,
          sideATeamIds: (config as any).sideATeamIds,
          sideBTeamIds: (config as any).sideBTeamIds,
          allowThirdPlace: false,
        });
      } catch (bracketError: any) {
        throw new Error(`Erro ao gerar estrutura de dupla eliminação: ${bracketError.message}`);
      }

      // Add modality_id to all matches
      const matchesWithModality = result.matches.map(m => ({
        ...m,
        modality_id: currentModalityId,
        stage_id: currentStageId,
      }));

      const matchCount = matchesWithModality.length;

      const { error } = await organizerQuery({ table: "matches", operation: "insert", data: matchesWithModality });
      if (error) { throw new Error(`Erro ao salvar partidas: ${error.message}`); }

      // Re-fetch to get IDs then advance completed matches
      const { data: insertedMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: { tournament_id: id },
        order: [{ column: "round" }, { column: "position" }],
      });

      if (insertedMatches) {
        const winnersMatches = insertedMatches.filter((m: any) => m.bracket_type === "winners" && m.bracket_half);
        for (const m of winnersMatches) {
          if (m.winner_team_id && m.status === "completed") {
            const nextRound = m.round + 1;
            const nextPosition = Math.ceil(m.position / 2);
            const isTop = m.position % 2 === 1;
            const nextMatch = winnersMatches.find(
              (nm: any) => nm.round === nextRound && nm.position === nextPosition && nm.bracket_half === m.bracket_half
            );
            if (nextMatch) {
              const update = isTop ? { team1_id: m.winner_team_id } : { team2_id: m.winner_team_id };
              await organizerQuery({ table: "matches", operation: "update", data: update, filters: { id: nextMatch.id } });
            }
          }
        }
      }

      await organizerQuery({
        table: "tournaments",
        operation: "update",
        data: { status: "in_progress", format: "double_elimination" },
        filters: { id },
      });
      toast.success(`✅ Dupla Eliminação gerada! ${matchCount} partidas criadas.`);
      fetchData();
    } else {
      // === NORMAL KNOCKOUT — only create first round with REAL teams ===
      let arranged = [...scopedTeams];
      if (config.useSeeds && config.seedTeamIds && config.seedTeamIds.length > 0) {
        const seeds = arranged.filter(t => config.seedTeamIds!.includes(t.id));
        const nonSeeds = arranged.filter(t => !config.seedTeamIds!.includes(t.id)).sort(() => Math.random() - 0.5);
        arranged = [...seeds, ...nonSeeds];
      } else if (config.useSeeds) {
        // Seed-based ordering via engine
        const seedResult = generateSeeds(arranged.map(t => ({ id: t.id, seed: t.seed ?? 0 })));
        const seedMap = new Map(seedResult.map(s => [s.id, s.seed]));
        arranged.sort((a, b) => (seedMap.get(a.id) ?? 999) - (seedMap.get(b.id) ?? 999));
      } else {
        arranged.sort(() => Math.random() - 0.5);
      }

      const n = arranged.length;
      const newMatches: any[] = [];

      // Create ONLY the first round — all matches must have real teams
      // If odd number, last team waits (chapéu) for next round
      const pairCount = Math.floor(n / 2);
      for (let i = 0; i < pairCount; i++) {
        newMatches.push({
          tournament_id: id,
          round: 1,
          position: i + 1,
          team1_id: arranged[i * 2].id,
          team2_id: arranged[i * 2 + 1].id,
          status: "pending",
          modality_id: currentModalityId,
          stage_id: currentStageId,
        });
      }

      // If odd number of teams, create a chapéu slot for the last team
      if (n % 2 === 1) {
        newMatches.push({
          tournament_id: id,
          round: 1,
          position: pairCount + 1,
          team1_id: arranged[n - 1].id,
          team2_id: null,
          status: "pending",
          modality_id: currentModalityId,
          stage_id: currentStageId,
        });
      }

      // NO future rounds generated — they will be created dynamically by declareWinner

      const { error } = await organizerQuery({ table: "matches", operation: "insert", data: newMatches });
      if (error) { throw new Error(`Erro ao salvar partidas: ${error.message}`); }

      await organizerQuery({
        table: "tournaments",
        operation: "update",
        data: { status: "in_progress" },
        filters: { id },
      });
      toast.success(`✅ Chaveamento gerado! ${newMatches.length} partidas criadas.`);
      fetchData();
    }

      // ═══ POST-GENERATION INTEGRITY CHECK ═══
      // Re-fetch all matches for this modality and run full validation
      const { data: postGenMatches } = await publicQuery<ValidationMatch[]>({
        table: "matches",
        select: "id,round,position,status,bracket_type,bracket_half,team1_id,team2_id,winner_team_id,is_chapeu,modality_id,next_win_match_id,next_lose_match_id",
          filters: {
            tournament_id: id,
            ...(selectedModality ? { modality_id: selectedModality.id } : {}),
            ...(currentStageId ? { stage_id: currentStageId } : { stage_id: null }),
          },
      });

      if (postGenMatches && postGenMatches.length > 0) {
        const postFormat = config.bracketMode === 'double_elimination' ? 'double_elimination' : (tournament?.format || 'single_elimination');
        const postTeamCount = scopedTeams.length;
        const result = validatePostGeneration(postGenMatches, postFormat, postTeamCount);

        // ── AUTO-REPAIR: aplicar correções automaticamente ──
        if (result.repairs.length > 0) {
          console.warn(`[PostGenValidator:AutoRepair] 🔧 ${result.repairs.length} reparação(ões) detectada(s). Aplicando...`);
          
          // Consolidar repairs por matchId (merge updates)
          const repairsByMatch = new Map<string, Record<string, string | null>>();
          for (const repair of result.repairs) {
            console.warn(`  🔧 ${repair.reason}`);
            const existing = repairsByMatch.get(repair.matchId) || {};
            repairsByMatch.set(repair.matchId, { ...existing, ...repair.updates });
          }

          // Aplicar todas as reparações em paralelo
          const repairPromises = Array.from(repairsByMatch.entries()).map(([matchId, updates]) =>
            organizerQuery({
              table: "matches",
              operation: "update",
              data: updates,
              filters: { id: matchId },
            })
          );
          const repairResults = await Promise.all(repairPromises);
          const failedRepairs = repairResults.filter(r => r.error);

          if (failedRepairs.length > 0) {
            console.error(`[PostGenValidator:AutoRepair] ❌ ${failedRepairs.length} reparação(ões) falharam`);
            toast.error(`⚠️ ${failedRepairs.length} reparação(ões) automática(s) falharam. Verifique o chaveamento.`);
          } else {
            console.log(`[PostGenValidator:AutoRepair] ✅ ${result.repairs.length} reparação(ões) aplicada(s) com sucesso`);
            toast.success(`🔧 ${result.repairs.length} correção(ões) automática(s) aplicada(s) ao chaveamento.`);
          }

          // Re-validate after repairs
          const { data: revalidateMatches } = await publicQuery<ValidationMatch[]>({
            table: "matches",
            select: "id,round,position,status,bracket_type,bracket_half,team1_id,team2_id,winner_team_id,is_chapeu,modality_id,next_win_match_id,next_lose_match_id",
            filters: {
              tournament_id: id,
              ...(selectedModality ? { modality_id: selectedModality.id } : {}),
              ...(currentStageId ? { stage_id: currentStageId } : { stage_id: null }),
            },
          });

          if (revalidateMatches && revalidateMatches.length > 0) {
            const reResult = validatePostGeneration(revalidateMatches, postFormat, postTeamCount);
            if (reResult.errors.length > 0 && reResult.repairs.length === 0) {
              console.error(`[PostGenValidator:ReValidation] ❌ ${reResult.errors.length} erro(s) persistem após reparação:`);
              reResult.errors.forEach(e => console.error(`  → ${e}`));
              toast.error(`⛔ ${reResult.errors.length} problema(s) não reparável(is) detectado(s). Verifique o chaveamento.`);
            } else if (reResult.valid) {
              console.log(`[PostGenValidator:ReValidation] ✅ Chaveamento 100% íntegro após auto-reparo`);
            }
          }
        } else if (!result.valid) {
          // Errors with no possible repairs
          console.error(`[PostGenValidator] ❌ ${result.errors.length} erro(s) não reparável(is):`);
          result.errors.forEach(e => console.error(`  → ${e}`));
          toast.error(`⛔ Verificação pós-geração: ${result.errors[0]}`);
        } else {
          console.log(`[PostGenValidator] ✅ Chaveamento íntegro — ${result.stats.totalMatches} partidas, 0 erros`);
        }

        if (result.warnings.length > 0) {
          console.warn(`[PostGenValidator] ⚠️ ${result.warnings.length} aviso(s):`);
          result.warnings.forEach(w => console.warn(`  → ${w}`));
        }
      }

    } catch (error: any) {
      console.error("[generateBracket] Error:", error);
      toast.error(`❌ Erro ao gerar chaveamento: ${error?.message || "Erro desconhecido"}`);
    }
  };

  const undoBracket = async () => {
    if (isWriteLocked) { toast.error("🔒 Torneio finalizado. Alterações bloqueadas."); return; }
    if (!id) return;
    const { error } = await organizerQuery({
      table: "matches",
      operation: "undo_bracket",
      tournament_id: id,
      modality_id: selectedModality?.id || undefined,
    });
    if (error) {
      toast.error("Erro ao desfazer chaveamento: " + error.message);
      return;
    }
    toast.success("Chaveamento desfeito!");
    fetchData();
  };

  // Reset only match results (scores, winners, status) — keeps bracket structure intact
  const undoSequence = async () => {
    if (!id) return;
    const { error } = await organizerQuery({
      table: "matches",
      operation: "reset_results",
      tournament_id: id,
      modality_id: selectedModality?.id || undefined,
    });
    if (error) {
      toast.error("Erro ao resetar resultados: " + error.message);
      return;
    }
    toast.success("Resultados das partidas resetados! Estrutura do chaveamento mantida.");
    fetchData();
  };

  // ONLY for GROUPS_PLUS_ELIMINATION mode — never called in DOUBLE_ELIMINATION
  const generateKnockoutFromGroups = async () => {
    if (!id) return;

    // Fetch latest matches
    const { data: latestMatches } = await organizerQuery({
      table: "matches",
      operation: "select",
      filters: { tournament_id: id },
      order: [{ column: "round" }, { column: "position" }],
    });
    if (!latestMatches) return;

    // GUARD: Only matches for the current modality
    const modalityId = selectedModality?.id || null;
    const relevantMatches = modalityId
      ? latestMatches.filter((m: any) => m.modality_id === modalityId)
      : latestMatches;

    const groupMatches = relevantMatches.filter((m: any) => m.round === 0);

    // GUARD: ALL group matches must be completed
    const allGroupsDone = groupMatches.length > 0 && groupMatches.every((m: any) => m.status === "completed");
    if (!allGroupsDone) {
      toast.error("❌ Todos os jogos da fase de grupos devem estar finalizados antes de gerar a eliminatória.");
      return;
    }

    // GUARD: Check if knockout matches already have TEAMS assigned (not just shells)
    const existingKnockout = relevantMatches.filter((m: any) => m.round >= 1);
    const knockoutWithTeams = existingKnockout.filter((m: any) => m.team1_id || m.team2_id);
    if (knockoutWithTeams.length > 0) {
      console.log(`[generateKnockoutFromGroups] Knockout already has teams assigned (${knockoutWithTeams.length} matches), skipping.`);
      return;
    }

    const brackets = Array.from(new Set<number>(groupMatches.map((m: any) => (m.bracket_number || 1) as number))).sort((a, b) => a - b);

    // Index teams: NOT from num_brackets (that's the number of bracket halves).
    // Index repescagem is not currently configurable — always 0.
    const numIndexTeams = 0;

    // Build team names map
    const teamNames: Record<string, string> = {};
    filteredTeams.forEach((t) => { teamNames[t.id] = `${t.player1_name} / ${t.player2_name}`; });

    // Rank teams in each group
    const groupRankings: Record<string, { teamId: string; rank: number; pointDifferential: number }[]> = {};
    const advancingTeamIds: string[] = [];

    const advPerGroup = 2;

    for (const bracket of brackets) {
      const gMatches = groupMatches.filter((m: any) => (m.bracket_number || 1) === bracket);
      const gTeamIds = [...new Set(gMatches.flatMap((m: any) => [m.team1_id, m.team2_id].filter(Boolean)))] as string[];
      const ranking = rankTeamsInGroup(gTeamIds, teamNames, gMatches);
      groupRankings[String(bracket)] = ranking;

      ranking.slice(0, advPerGroup).forEach((r) => advancingTeamIds.push(r.teamId));
    }

    // Index teams (best non-advancing across groups)
    let indexTeamIds: string[] = [];
    if (numIndexTeams > 0) {
      indexTeamIds = selectIndexTeams(groupRankings, numIndexTeams, advPerGroup);
    }

    const allAdvancing = [...advancingTeamIds, ...indexTeamIds];

    // === MODO VERANICO — preencher repescagens (2º×3º CRUZADOS A↔D / B↔C) e quartas (1º colocados) ===
    const repechageShells = existingKnockout.filter((m: any) => m.bracket_type === "repechage");
    if (repechageShells.length === 4 && brackets.length === 4) {
      const g = (idx: number) => groupRankings[String(brackets[idx])] || [];
      const numG = brackets.length;
      // Repescagem CRUZADA: A↔D e B↔C; vencedor cruza com 1º colocado de chave diferente nas quartas
      // [pos, left (chave do 2º), right (chave do 3º), quarterPos (slot do 1º colocado), firstGroup (chave do 1º)]
      const repechageMap = [
        { pos: 1, left: 0,        right: numG - 1, quarterPos: numG - 1, firstGroup: numG - 2 }, // 2A×3D → Q3 vs 1C (Jogo 31)
        { pos: 2, left: numG - 1, right: 0,        quarterPos: 1,        firstGroup: 0 },        // 2D×3A → Q1 vs 1A (Jogo 29)
        { pos: 3, left: 1,        right: numG - 2, quarterPos: 2,        firstGroup: 1 },        // 2B×3C → Q2 vs 1B (Jogo 30)
        { pos: 4, left: numG - 2, right: 1,        quarterPos: numG,     firstGroup: numG - 1 }, // 2C×3B → Q4 vs 1D (Jogo 32)
      ];
      const findShell = (round: number, position: number, bt: string) =>
        existingKnockout.find((m: any) => m.round === round && m.position === position && (m.bracket_type || "winners") === bt);

      const veranicoUpdates: Promise<any>[] = [];
      for (const meta of repechageMap) {
        const second = g(meta.left)[1]?.teamId || null;
        const third = g(meta.right)[2]?.teamId || null;
        const repShell = findShell(1, meta.pos, "repechage");
        if (repShell) {
          veranicoUpdates.push(organizerQuery({
            table: "matches", operation: "update",
            data: { team1_id: second, team2_id: third },
            filters: { id: repShell.id },
          }));
        }
        const first = g(meta.firstGroup)[0]?.teamId || null;
        const quarterShell = findShell(2, meta.quarterPos, "winners");
        if (quarterShell) {
          veranicoUpdates.push(organizerQuery({
            table: "matches", operation: "update",
            data: { team1_id: first },
            filters: { id: quarterShell.id },
          }));
        }
      }
      await Promise.all(veranicoUpdates);
      await logVeranico({
        tournament_id: id!,
        modality_id: modalityId,
        stage_id: existingKnockout[0]?.stage_id ?? null,
        action: "veranico.quarters.fill_classification",
        detail: {
          repechages_filled: repechageMap.length,
          quarters_filled: repechageMap.length,
          group_rankings_summary: brackets.map((b, idx) => ({
            group: b,
            top4: (groupRankings[String(b)] || []).slice(0, 4).map((t: any) => ({
              teamId: t.teamId, pontos: t.pontos, saldo: t.saldoSets,
            })),
          })),
        },
      });
      toast.success(`MODO VERANICO: repescagens CRUZADAS (2º×3º A↔D, B↔C) e quartas (1º colocados) preenchidas.`);

      fetchData();
      return;
    }

    // === MODO VERANICO (Oitavas) — 4 chaves × 4 vagas → 8 oitavas (sem repescagem) ===
    // Detecção: 4 grupos, 8 partidas pré-criadas em round 1 (winners), cada grupo com ≥4 times.
    const r1WinnersShells = existingKnockout.filter(
      (m: any) => m.round === 1 && (m.bracket_type || "winners") === "winners"
    );
    const r2WinnersShells = existingKnockout.filter(
      (m: any) => m.round === 2 && (m.bracket_type || "winners") === "winners"
    );
    const allGroupsHave4 = brackets.every(
      (b) => (groupRankings[String(b)] || []).length >= 4
    );
    const isLuanaEighthsFill =
      brackets.length === 4 &&
      r1WinnersShells.length === 8 &&
      r2WinnersShells.length === 4 &&
      allGroupsHave4 &&
      repechageShells.length === 0;

    if (isLuanaEighthsFill) {
      const g = (idx: number) => groupRankings[String(brackets[idx])] || [];
      const teamAt = (grp: number, rankIdx: number) => g(grp)[rankIdx]?.teamId || null;

      // Pareamento das oitavas — fonte única em src/lib/veranicoEighthsMap.ts
      // (visual e engine compartilham este mesmo map para evitar divergência)
      const eighthsMap = VERANICO_EIGHTHS_MAP;

      const findShell = (round: number, position: number, bt: string = "winners") =>
        existingKnockout.find(
          (m: any) =>
            m.round === round &&
            m.position === position &&
            (m.bracket_type || "winners") === bt
        );

      const updates: Promise<any>[] = [];
      for (const meta of eighthsMap) {
        const shell = findShell(1, meta.pos, "winners");
        if (!shell) continue;
        const team1 = teamAt(meta.t1[0], meta.t1[1]);
        const team2 = teamAt(meta.t2[0], meta.t2[1]);
        updates.push(
          organizerQuery({
            table: "matches", operation: "update",
            data: { team1_id: team1, team2_id: team2 },
            filters: { id: shell.id },
          })
        );
      }

      await Promise.all(updates);
      await logVeranico({
        tournament_id: id!,
        modality_id: modalityId,
        stage_id: existingKnockout[0]?.stage_id ?? null,
        action: "veranico.eighths.fill_classification",
        detail: {
          eighths_filled: eighthsMap.length,
          map_used: eighthsMap.map(m => ({ pos: m.pos, t1: m.t1, t2: m.t2 })),
          group_rankings_summary: brackets.map((b) => ({
            group: b,
            top4: (groupRankings[String(b)] || []).slice(0, 4).map((t: any) => ({
              teamId: t.teamId, pontos: t.pontos, saldo: t.saldoSets,
            })),
          })),
        },
      });
      toast.success("MODO VERANICO (Oitavas): 8 partidas geradas (A×D, B×C).");
      fetchData();
      return;
    }

    if (allAdvancing.length < 2) {
      toast.error("Duplas insuficientes para fase eliminatória.");
      return;
    }

    // === DISTRIBUTE CHAPÉUS ===
    const chapeuDistribution = distributeChapeus(allAdvancing, groupRankings);
    const chapeuTeamSet = new Set(getChapeuTeams(chapeuDistribution));

    // Build cross-pairings: 1st of group A always vs 2nd of last group (Z)
    //                       2nd of group A always vs 1st of last group (Z)
    //                       Then 1st B vs 2nd (penultimate), etc.
    const numGroups = brackets.length;
    
    // First, collect raw intended matchups (before chapéu adjustments)
    // Oitavas na ordem lógica: 1A×2H, 2A×1H, 1B×2G, 2B×1G, 1C×2F, 2C×1F, 1D×2E, 2D×1E
    const rawPairings: { team1: string; team2: string }[] = [];

    for (let i = 0; i < Math.ceil(numGroups / 2); i++) {
      const rightIdx = numGroups - 1 - i;
      const groupI = groupRankings[String(brackets[i])];
      const groupRight = rightIdx !== i ? groupRankings[String(brackets[rightIdx])] : null;

      if (groupRight) {
        // 1st of group[i] vs 2nd of group[rightIdx]
        if (groupI[0] && groupRight[1]) {
          rawPairings.push({ team1: groupI[0].teamId, team2: groupRight[1].teamId });
        }
        // 2nd of group[i] vs 1st of group[rightIdx]
        if (groupI[1] && groupRight[0]) {
          rawPairings.push({ team1: groupI[1].teamId, team2: groupRight[0].teamId });
        }
      } else {
        // Odd number of groups: middle group plays within itself
        if (groupI[0] && groupI[1]) {
          rawPairings.push({ team1: groupI[0].teamId, team2: groupI[1].teamId });
        }
      }
    }

    // NOTE: Copa-style crossing is already handled by next_win_match_id links
    // in the pre-generated knockout shells. Do NOT reorder positions here —
    // just keep the natural mirrored crossover order (1A×2H, 2A×1H, 1B×2G, etc.).

    // Add index teams as raw pairings
    if (indexTeamIds.length > 0) {
      for (let i = 0; i < indexTeamIds.length - 1; i += 2) {
        rawPairings.push({ team1: indexTeamIds[i], team2: indexTeamIds[i + 1] });
      }
      if (indexTeamIds.length % 2 === 1) {
        rawPairings.push({ team1: indexTeamIds[indexTeamIds.length - 1], team2: '' });
      }
    }

    // Now convert raw pairings to final matches, handling chapéus
    // RULE: Chapéu team gets its own match (team + null), positioned BEFORE its paired real match
    // So: chapéu at position 1, real match at position 2 → winner of pos 2 fills chapéu pos 1
    const pairings: { team1Id: string; team2Id: string | null }[] = [];
    const usedInChapeu = new Set<string>();

    // Separate chapéu pairings from real pairings
    const chapeuPairings: typeof rawPairings = [];
    const realPairings: typeof rawPairings = [];

    for (const pair of rawPairings) {
      const t1Chapeu = chapeuTeamSet.has(pair.team1);
      const t2Chapeu = chapeuTeamSet.has(pair.team2);
      
      if (t1Chapeu || t2Chapeu) {
        chapeuPairings.push(pair);
      } else {
        realPairings.push(pair);
      }
    }

    // For each chapéu pairing: create chapéu match + real match as adjacent pair
    for (const pair of chapeuPairings) {
      const chapeuTeam = chapeuTeamSet.has(pair.team1) ? pair.team1 : pair.team2;
      const realTeam = chapeuTeam === pair.team1 ? pair.team2 : pair.team1;
      
      // Position: Chapéu first (odd position), then real match needs to be paired with remaining teams
      // The chapéu team waits; the real team from this pair needs a real opponent
      pairings.push({ team1Id: chapeuTeam, team2Id: null }); // Chapéu slot
      usedInChapeu.add(realTeam);
    }

    // The teams that were "freed" from chapéu pairings need to be paired together as real matches
    const freedTeams = Array.from(usedInChapeu);
    for (let i = 0; i < freedTeams.length - 1; i += 2) {
      pairings.push({ team1Id: freedTeams[i], team2Id: freedTeams[i + 1] });
    }
    if (freedTeams.length % 2 === 1) {
      // Odd freed team — becomes another chapéu
      pairings.push({ team1Id: freedTeams[freedTeams.length - 1], team2Id: null });
    }

    // Add all fully real pairings
    for (const pair of realPairings) {
      if (pair.team2 === '') {
        pairings.push({ team1Id: pair.team1, team2Id: null });
      } else {
        pairings.push({ team1Id: pair.team1, team2Id: pair.team2 });
      }
    }

    // Reorder so chapéu matches are at ODD positions (1, 3, 5...) 
    // and their paired real matches are at EVEN positions (2, 4, 6...)
    // This is crucial for the declareWinner adjacency logic
    const chapeuSlots = pairings.filter(p => p.team2Id === null);
    const realSlots = pairings.filter(p => p.team2Id !== null);
    const orderedPairings: typeof pairings = [];
    
    let chapIdx = 0;
    let realIdx = 0;
    
    // Interleave: for each chapéu, place chapéu then real match
    while (chapIdx < chapeuSlots.length && realIdx < realSlots.length) {
      orderedPairings.push(chapeuSlots[chapIdx]); // odd position
      orderedPairings.push(realSlots[realIdx]);    // even position
      chapIdx++;
      realIdx++;
    }
    // Add remaining (all chapéu or all real)
    while (chapIdx < chapeuSlots.length) {
      orderedPairings.push(chapeuSlots[chapIdx++]);
    }
    while (realIdx < realSlots.length) {
      orderedPairings.push(realSlots[realIdx++]);
    }

    // Find existing R1 match shells (pre-generated) and UPDATE them with classified teams
    const existingR1 = existingKnockout
      .filter((m: any) => m.round === 1)
      .sort((a: any, b: any) => a.position - b.position);

    if (existingR1.length >= orderedPairings.length) {
      // UPDATE existing shells with teams
      for (let i = 0; i < orderedPairings.length; i++) {
        const updates: any = {
          team1_id: orderedPairings[i].team1Id || null,
          team2_id: orderedPairings[i].team2Id || null,
        };
        if (!orderedPairings[i].team2Id) {
          updates.is_chapeu = true;
        }
        await organizerQuery({
          table: "matches",
          operation: "update",
          data: updates,
          filters: { id: existingR1[i].id },
        });
      }
      toast.success(`Fase de grupos concluída! Eliminatória preenchida com ${allAdvancing.length} duplas classificadas.`);
    } else {
      // Fallback: no pre-generated shells — insert new matches
      const newMatches: any[] = [];
      for (let i = 0; i < orderedPairings.length; i++) {
        newMatches.push({
          tournament_id: id,
          round: 1,
          position: i + 1,
          team1_id: orderedPairings[i].team1Id,
          team2_id: orderedPairings[i].team2Id,
          status: "pending",
          bracket_number: 1,
          modality_id: modalityId,
        });
      }
      const { error } = await organizerQuery({ table: "matches", operation: "insert", data: newMatches });
      if (error) { toast.error(error.message); return; }
      toast.success(`Fase de grupos concluída! Eliminatória gerada com ${allAdvancing.length} duplas classificadas (${orderedPairings.length} partidas).`);
    }
    fetchData();
  };

  const declareWinner = async (matchId: string, winnerId: string) => {
    if (isWriteLocked) { toast.error("🔒 Torneio finalizado. Alterações bloqueadas."); return; }
    // MUTEX: Per-match lock to allow concurrent declarations on different matches
    if (declareWinnerMutex.current.has(matchId)) {
      toast.info("Aguarde a operação anterior desta partida...");
      return;
    }
    declareWinnerMutex.current.add(matchId);
    
    try {
    const match = matches.find((m) => m.id === matchId);
    if (!match || !id) { declareWinnerMutex.current.delete(matchId); return; }

    // ── ROUND LOCK GUARD ──
    const modalityMatches = matches.filter(m => sameMatchScope(m, match));
    const lockCheck = isRoundLocked(
      { id: match.id, round: match.round, status: match.status, bracket_type: match.bracket_type, bracket_half: match.bracket_half, modality_id: match.modality_id, stage_id: match.stage_id, next_win_match_id: match.next_win_match_id, next_lose_match_id: match.next_lose_match_id },
      modalityMatches.map(m => ({ id: m.id, round: m.round, status: m.status, bracket_type: m.bracket_type, bracket_half: m.bracket_half, modality_id: m.modality_id, stage_id: m.stage_id, next_win_match_id: m.next_win_match_id, next_lose_match_id: m.next_lose_match_id })),
    );
    if (lockCheck.locked) {
      toast.error(lockCheck.reason);
      declareWinnerMutex.current.delete(matchId);
      return;
    }

    // ── SYSTEM RULES GUARD (pre-declaration) ──
    // Skip pre-check if this is a re-declaration (editing existing result)
    // because the state may already be in violation due to the bad result.
    // The post-cascade guard will validate the final state.
    const isPreReDeclaration = match.status === 'completed' && match.winner_team_id;
    if (!isPreReDeclaration && !runSystemRulesGuard(modalityMatches, 'preDeclareWinner')) {
      declareWinnerMutex.current.delete(matchId);
      return;
    }

    // ── AGGRESSIVE CASCADE RESET ──
     // If match was already completed, reset ALL downstream matches before re-declaring
     const isReDeclaration = match.status === 'completed' && match.winner_team_id;
     if (isReDeclaration) {
       // Determine if this is DE or SE
       const modalityMatchesForCheck = matches.filter(m => sameMatchScope(m, match));
       const isDE = modalityMatchesForCheck.some(m => m.bracket_type === 'losers');
       
       // Fetch fresh data for cascade
       const { data: freshForCascade } = await organizerQuery({
         table: "matches",
         operation: "select",
          filters: matchScopeFilters(match, id),
         order: [{ column: "round" }, { column: "position" }],
       });
       
       if (freshForCascade) {
          const cascadeMatches = freshForCascade as typeof matches;
         
         const freshMatch = cascadeMatches.find(m => m.id === matchId) || match;
         
         // Apply appropriate cascade based on format
         const cascadePlan = isDE
           ? computeAggressiveCascadeReset(freshMatch, cascadeMatches)
           : computePartialCascadeResetSE(freshMatch, cascadeMatches);
         
         // Log plan
         cascadePlan.log.forEach(msg => console.log(msg));
         
          // SAFETY: Never delete matches during cascade — only reset them
          // This preserves the bracket structure in all formats and modalities
          if (cascadePlan.toDelete.length > 0) {
            console.warn(`[CASCADE:BLOCKED] ${cascadePlan.toDelete.length} match deletions blocked — converting to resets`);
            for (const mid of cascadePlan.toDelete) {
              cascadePlan.toUpdate.push({
                matchId: mid,
                data: { team1_id: null, team2_id: null, winner_team_id: null, status: 'pending', score1: 0, score2: 0 },
              });
            }
            cascadePlan.toDelete = [];
          }
          
          // Execute resets
          if (cascadePlan.toUpdate.length > 0) {
            await Promise.all(
              cascadePlan.toUpdate.map(async (reset) => {
                const { error } = await organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: reset.data,
                  filters: { id: reset.matchId },
                });
                if (error) console.error(`[CASCADE:Error] Match ${reset.matchId}:`, error);
                else console.log(`[CASCADE:OK] Match ${reset.matchId} reset`);
              })
            );
             toast.info(`${cascadePlan.toUpdate.length} partida(s) resetada(s).`);
           }

           // ── RE-PROPAGATION: re-apply completed matches to fill cleared slots ──
           if (isDE) {
             // Snapshot original state for rollback
             const originalMatchState = {
               id: match.id,
               team1_id: match.team1_id,
               team2_id: match.team2_id,
               winner_team_id: match.winner_team_id,
               status: match.status,
               score1: match.score1,
               score2: match.score2,
             };

             try {
             const { data: postResetData } = await organizerQuery({
               table: "matches",
               operation: "select",
                filters: matchScopeFilters(match, id),
               order: [{ column: "round" }, { column: "position" }],
             });
             if (postResetData) {
                let postResetMatches = postResetData as typeof matches;

               // Get all completed matches (excluding the one being re-declared)
               const completedToReplay = postResetMatches
                 .filter(m => m.status === 'completed' && m.winner_team_id && m.id !== matchId)
                 .sort((a, b) => a.round - b.round || a.position - b.position);

               console.log(`[RE-PROPAGATION] ${completedToReplay.length} completed matches to replay`);

               for (const cm of completedToReplay) {
                 // Refresh match state before each replay (slots may have been filled by previous iterations)
                 const currentState = postResetMatches.find(m => m.id === cm.id);
                 if (!currentState || !currentState.winner_team_id) continue;

                 const cmLoserId = currentState.team1_id === currentState.winner_team_id
                   ? currentState.team2_id
                   : currentState.team1_id;

                 const advResult = processDoubleEliminationAdvance(
                   postResetMatches,
                   currentState,
                   currentState.winner_team_id,
                   cmLoserId,
                 );

                 const allUpdates = [...advResult.winnerUpdates, ...advResult.loserUpdates];
                 for (const upd of allUpdates) {
                   const { error: repropError } = await organizerQuery({
                     table: "matches",
                     operation: "update",
                     data: upd.data,
                     filters: { id: upd.matchId },
                   });
                   if (repropError) {
                     throw new Error(`Repropagation failed for match ${upd.matchId}: ${repropError.message}`);
                   }
                   // Update local snapshot so subsequent iterations see correct state
                   postResetMatches = postResetMatches.map(m =>
                     m.id === upd.matchId ? { ...m, ...upd.data } : m
                   );
                 }
                 if (allUpdates.length > 0) {
                   console.log(`[RE-PROPAGATION] Match ${cm.id} (R${cm.round}P${cm.position}) → ${allUpdates.length} slot(s) filled`);
                 }
                }

                // ── BYE RECHECK pós-cascade+repropagação ──
                {
                  let byeProcessed = true;
                  while (byeProcessed) {
                    byeProcessed = false;
                    for (const pm of postResetMatches) {
                      if (pm.status !== 'pending') continue;
                      const hasT1 = !!pm.team1_id;
                      const hasT2 = !!pm.team2_id;
                      if (hasT1 === hasT2) continue;
                      if (!pm.is_chapeu) continue; // DE: only chapéu matches

                      const pendingFeeders = postResetMatches.filter(
                        fm => fm.status !== 'completed' && fm.id !== pm.id &&
                          (fm.next_win_match_id === pm.id || fm.next_lose_match_id === pm.id)
                      );

                      if (pendingFeeders.length === 0) {
                        const byeWinner = pm.team1_id || pm.team2_id;
                        console.log(`[BYE:PostCascade] Auto-completing ${pm.id} (${pm.bracket_type} R${pm.round}P${pm.position}) → ${byeWinner}`);

                        const { error: byeErr } = await organizerQuery({
                          table: "matches",
                          operation: "update",
                          data: { winner_team_id: byeWinner, status: "completed", score1: 0, score2: 0 },
                          filters: { id: pm.id },
                        });
                        if (byeErr) throw new Error(`BYE completion failed: ${byeErr.message}`);

                        pm.status = 'completed' as any;
                        pm.winner_team_id = byeWinner;

                        const byeAdv = processDoubleEliminationAdvance(postResetMatches, pm, byeWinner!, null);
                        for (const upd of [...byeAdv.winnerUpdates, ...byeAdv.loserUpdates]) {
                          await organizerQuery({
                            table: "matches",
                            operation: "update",
                            data: upd.data,
                            filters: { id: upd.matchId },
                          });
                          const target = postResetMatches.find(m => m.id === upd.matchId);
                          if (target) Object.assign(target, upd.data);
                        }
                        byeProcessed = true;
                      }
                    }
                  }
                }

                // ── SYSTEM RULES GUARD (post-cascade+repropagation) ──
                const postCascadeOk = runSystemRulesGuard(
                  postResetMatches as Match[],
                  'postCascadeRepropagation'
                );
                if (!postCascadeOk) {
                  console.warn('[SystemRulesGuard] Violations detected after cascade+repropagation — continuing but state may be inconsistent');
                }
              }
             } catch (repropError: any) {
               // ── ROLLBACK: cascade reset on failure ──
               console.error("[RE-PROPAGATION:FAIL] Rolling back...", repropError);
               toast.error(`❌ Falha na repropagação: ${repropError.message}. Executando rollback...`);

               try {
                  const rollbackPlan = computeAggressiveCascadeReset(match, matches.filter(m => sameMatchScope(m, match)));
                 // Also restore the original match
                 rollbackPlan.toUpdate.push({
                   matchId: match.id,
                   data: {
                     team1_id: originalMatchState.team1_id,
                     team2_id: originalMatchState.team2_id,
                     winner_team_id: originalMatchState.winner_team_id,
                     status: originalMatchState.status,
                     score1: originalMatchState.score1 ?? 0,
                     score2: originalMatchState.score2 ?? 0,
                   },
                 });
                 await Promise.all(
                   rollbackPlan.toUpdate.map(reset =>
                     organizerQuery({
                       table: "matches",
                       operation: "update",
                       data: reset.data,
                       filters: { id: reset.matchId },
                     })
                   )
                 );
                 toast.info("🔄 Rollback executado. Estado anterior restaurado.");
               } catch (rollbackError) {
                 console.error("[ROLLBACK:FAIL]", rollbackError);
                 toast.error("❌ Rollback falhou. Use Desfazer Chaveamento para corrigir.");
               }
               fetchData();
               declareWinnerMutex.current.delete(matchId);
               return;
             }
          } else {
            // ── SE: BYE RECHECK pós-cascade ──
            const { data: postSEData } = await organizerQuery({
              table: "matches",
              operation: "select",
              filters: matchScopeFilters(match, id),
              order: [{ column: "round" }, { column: "position" }],
            });
            if (postSEData) {
              let seMatches = postSEData as typeof matches;

              let byeProcessed = true;
              while (byeProcessed) {
                byeProcessed = false;
                for (const pm of seMatches) {
                  if (pm.status !== 'pending') continue;
                  const hasT1 = !!pm.team1_id;
                  const hasT2 = !!pm.team2_id;
                  if (hasT1 === hasT2) continue; // both filled or both empty

                  const pendingFeeders = seMatches.filter(
                    fm => fm.status !== 'completed' && fm.id !== pm.id &&
                      (fm.next_win_match_id === pm.id || fm.next_lose_match_id === pm.id)
                  );

                  if (pendingFeeders.length === 0) {
                    const byeWinner = pm.team1_id || pm.team2_id;
                    console.log(`[BYE:PostCascade:SE] Auto-completing ${pm.id} R${pm.round}P${pm.position} → ${byeWinner}`);

                    const { error: byeErr } = await organizerQuery({
                      table: "matches",
                      operation: "update",
                      data: { winner_team_id: byeWinner, status: "completed", score1: 0, score2: 0 },
                      filters: { id: pm.id },
                    });
                    if (byeErr) {
                      console.error(`[BYE:SE:FAIL] ${byeErr.message}`);
                      continue;
                    }

                    pm.status = 'completed' as any;
                    pm.winner_team_id = byeWinner;

                    // SE propagation via next_win_match_id
                    if (pm.next_win_match_id && byeWinner) {
                      const nextMatch = seMatches.find(m => m.id === pm.next_win_match_id);
                      if (nextMatch) {
                        const slot = !nextMatch.team1_id ? 'team1_id' : 'team2_id';
                        await organizerQuery({
                          table: "matches",
                          operation: "update",
                          data: { [slot]: byeWinner },
                          filters: { id: nextMatch.id },
                        });
                        (nextMatch as any)[slot] = byeWinner;
                        console.log(`[BYE:SE] Propagated ${byeWinner} → ${nextMatch.id} slot ${slot}`);
                      }
                    }
                    byeProcessed = true;
                  }
                }
              }
            }
          }
         }
       }

    // Round order validation removed — organizer can declare winners freely

    // Get loser ID
    const loserId = match.team1_id === winnerId ? match.team2_id : match.team1_id;

    // Rule 26: Only set winner + status here; scores are saved separately by updateScore/handleAutoResult
    // Optimistic UI update FIRST for instant feedback
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, winner_team_id: winnerId, status: 'completed' as any } : m));

    // AWAIT the winner save — critical to avoid race condition on fresh fetch
    const { error: winnerError } = await organizerQuery({
      table: "matches",
      operation: "update",
      data: {
        winner_team_id: winnerId,
        status: "completed",
      },
      filters: { id: matchId },
    });
    if (winnerError) {
      toast.error("Erro ao salvar vencedor: " + winnerError.message);
      // Revert optimistic update
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, winner_team_id: match.winner_team_id, status: match.status } : m));
      declareWinnerMutex.current.delete(matchId);
      return;
    }

    // Determine if this is a double elimination bracket — filter by SAME modality
    const modalityMatchesForDE = match.modality_id
      ? matches.filter(m => sameMatchScope(m, match))
      : matches.filter(m => sameMatchScope(m, match));
    const isDoubleElimination = modalityMatchesForDE.some(m => m.bracket_type === 'losers' || m.bracket_type === 'final' || m.bracket_type === 'semi_final');

    // ── GROUP PHASE GUARD ──
    // Group-stage matches (round === 0) are round-robin and MUST NOT propagate.
    // They never feed any other match, regardless of tournament format.
    const isGroupStageMatch = match.round === 0;

    if (isDoubleElimination && !isGroupStageMatch) {
      // ══════════════════════════════════════════════════════════════════════
      // IRON RULE: Buscar partidas SOMENTE da mesma modalidade.
      // Nunca buscar por tournament_id pois mistura modalidades diferentes
      // e causa falsos positivos nos guards anti-colisão do advanceLogic.
      // Esta foi a causa raiz do bug de não propagação na chave de perdedores.
      // ══════════════════════════════════════════════════════════════════════
      const freshFilters = matchScopeFilters(match, id);

      const { data: freshMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: freshFilters,
        order: [{ column: "round" }, { column: "position" }],
      });
      const freshMatchList = (freshMatches || (match.modality_id
        ? matches.filter(m => sameMatchScope(m, match))
        : matches.filter(m => sameMatchScope(m, match)))) as typeof matches;

      // Use the updated match data (winner already set)
      const freshMatch = freshMatchList.find(m => m.id === matchId) || { ...match, winner_team_id: winnerId, status: 'completed' };
      
      // Use new advancement logic with fresh data (scoped to same modality)
      const advancement = processDoubleEliminationAdvance(freshMatchList, freshMatch, winnerId, loserId);
      
      // ── VALIDATION LOG ──
      const modalityMatchesDE = matches.filter(m => sameMatchScope(m, match) && m.round > 0);
      
      // Count teams (N) from unique team IDs in the bracket
      const teamIdsDE = new Set<string>();
      modalityMatchesDE.forEach(m => {
        if (m.team1_id) teamIdsDE.add(m.team1_id);
        if (m.team2_id) teamIdsDE.add(m.team2_id);
      });
      const N = teamIdsDE.size;
      const expectedTotal = (2 * N) - 3;
      const completedCount = modalityMatchesDE.filter(m => m.status === 'completed').length + 1; // +1 for current match
      
      console.log(`[DE:MatchComplete] MatchID=${matchId}, Round=${match.round}, Type=${match.bracket_type}`);
      console.log(`[DE:MatchComplete] Winner=${winnerId}, Loser=${loserId}`);
      console.log(`[DE:MatchComplete] WinnerTargets=${advancement.winnerUpdates.map(u => u.matchId).join(',')}`);
      console.log(`[DE:MatchComplete] LoserTargets=${advancement.loserUpdates.map(u => u.matchId).join(',')}`);
      console.log(`[DE:MatchComplete] CompletedMatches=${completedCount}/${expectedTotal} (2×${N}-3)`);

      // ── FEEDER PROPAGATION WITH VALIDATION (PARALLEL) ──
      let feederFailed = false;

      const allUpdates = [
        ...advancement.winnerUpdates.map(u => ({ ...u, type: 'winner' as const })),
        ...advancement.loserUpdates.map(u => ({ ...u, type: 'loser' as const })),
      ];

      const results = await Promise.all(
        allUpdates.map(async (update) => {
          const { error } = await organizerQuery({
            table: "matches",
            operation: "update",
            data: update.data,
            filters: { id: update.matchId },
          });
          if (error) {
            console.error(`[DE:FeederFail] ${update.type} injection failed for match ${update.matchId}:`, error);
            return false;
          }
          console.log(`[DE:FeederOK] ${update.type === 'winner' ? 'Winner' : 'Loser'} ${update.type === 'winner' ? winnerId : loserId} → Match ${update.matchId} (${JSON.stringify(update.data)})`);
          return true;
        })
      );
      feederFailed = results.some(r => !r);

      // ── LOG FEEDER FAILURE — do NOT block, still try BYE completion ──
      if (feederFailed) {
        console.error("[DE:FeederFail] Some feeder updates failed — continuing to attempt BYE completion and UI refresh");
        toast.warning("⚠️ Alguma propagação falhou. Verifique o chaveamento e use o Override se necessário.");
      }

      // ── LOG: If match has outgoing feeders but no update was generated (warn only, don't block) ──
      if (freshMatch.next_win_match_id && advancement.winnerUpdates.length === 0) {
        console.warn(`[DE:FeederMissing] Match ${matchId} has next_win_match_id=${freshMatch.next_win_match_id} but no winner update generated — may be final or slot already correct`);
      }
      if (freshMatch.next_lose_match_id && loserId && advancement.loserUpdates.length === 0) {
        // Check if this is semi_final/final where losers are eliminated (no next_lose expected to have updates)
        const isElimination = freshMatch.bracket_type === 'semi_final' || freshMatch.bracket_type === 'final';
        if (!isElimination) {
          console.warn(`[DE:FeederMissing] Match ${matchId} has next_lose_match_id=${freshMatch.next_lose_match_id} but no loser update generated`);
        }
      }

      // ── BYE AUTO-COMPLETION ──
      // After propagation, check if any pending matches now have exactly 1 team
      // and no more feeders will fill the empty slot (= BYE match)
      const { data: postPropMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: matchScopeFilters(match, id),
        order: [{ column: "round" }, { column: "position" }],
      });
      
      if (postPropMatches) {
        const modalityMatches = postPropMatches as typeof matches;
        
        let byeProcessed = true;
        while (byeProcessed) {
          byeProcessed = false;
          for (const pm of modalityMatches) {
            if (pm.status !== 'pending') continue;
            const hasTeam1 = !!pm.team1_id;
            const hasTeam2 = !!pm.team2_id;
            if (hasTeam1 === hasTeam2) continue; // Both filled or both empty — skip
            
            // GUARD: In DE, only auto-complete matches explicitly marked as chapéu
            // Losers bracket matches with 1 team are NOT BYEs — they're waiting for losers to drop
            if (isDoubleElimination && !pm.is_chapeu) {
              console.log(`[BYE:Skip] Match ${pm.id} (${pm.bracket_type} ${pm.bracket_half} R${pm.round}P${pm.position}) has 1 team but is NOT chapéu — skipping BYE auto-completion`);
              continue;
            }
            
            // Check if any incomplete match feeds into this one
            const pendingFeeders = modalityMatches.filter(
              fm => fm.status !== 'completed' && fm.id !== pm.id &&
                (fm.next_win_match_id === pm.id || fm.next_lose_match_id === pm.id)
            );
            
            if (pendingFeeders.length === 0) {
              // No more feeders → this is a BYE, auto-complete
              const byeWinner = pm.team1_id || pm.team2_id;
              console.log(`[BYE] Auto-completing match ${pm.id} (${pm.bracket_type} ${pm.bracket_half} R${pm.round}P${pm.position}) → winner=${byeWinner}`);
              
              await organizerQuery({
                table: "matches",
                operation: "update",
                data: { winner_team_id: byeWinner, status: "completed", score1: 0, score2: 0 },
                filters: { id: pm.id },
              });
              pm.status = 'completed' as any;
              pm.winner_team_id = byeWinner;
              
              // Propagate BYE winner forward
              const byeAdvancement = processDoubleEliminationAdvance(modalityMatches, pm, byeWinner!, null);
              for (const upd of [...byeAdvancement.winnerUpdates, ...byeAdvancement.loserUpdates]) {
                await organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: upd.data,
                  filters: { id: upd.matchId },
                });
                // Update in-memory
                const targetMatch = modalityMatches.find(m => m.id === upd.matchId);
                if (targetMatch) Object.assign(targetMatch, upd.data);
                console.log(`[BYE:Propagate] → Match ${upd.matchId} (${JSON.stringify(upd.data)})`);
              }
              
              byeProcessed = true; // Loop again to catch cascading BYEs
            }
          }
        }
      }

      // ══════════════════════════════════════════════════════════════
      // POST-PROPAGATION AUTO-REPAIR — Safety net that guarantees
      // NO pending propagations exist after any result declaration.
      // Scans all completed matches and fills any slots that the
      // primary propagation missed (e.g. due to guard failures,
      // race conditions, or stale frontend data).
      // ══════════════════════════════════════════════════════════════
      try {
        const { data: repairMatches } = await organizerQuery({
          table: "matches",
          operation: "select",
          filters: matchScopeFilters(match, id),
          order: [{ column: "round" }, { column: "position" }],
        });

        if (repairMatches) {
          const repairList = repairMatches as typeof matches;
          let repairCount = 0;

          for (const cm of repairList) {
            if (cm.status !== 'completed' || !cm.winner_team_id) continue;
            const cmLoserId = cm.team1_id === cm.winner_team_id ? cm.team2_id : cm.team1_id;
            const isSemiOrFinal = cm.bracket_type === 'semi_final' || cm.bracket_type === 'final';

            // ── Check winner propagation ──
            if (cm.next_win_match_id) {
              const dest = repairList.find(m => m.id === cm.next_win_match_id);
              if (dest && dest.status !== 'completed' &&
                  dest.team1_id !== cm.winner_team_id && dest.team2_id !== cm.winner_team_id) {
                const slot = !dest.team1_id ? 'team1_id' : (!dest.team2_id ? 'team2_id' : null);
                if (slot) {
                  console.log(`[AUTO-REPAIR] Winner ${cm.winner_team_id} → ${dest.bracket_type} R${dest.round}P${dest.position} ${slot}`);
                  const { error: repErr } = await organizerQuery({
                    table: "matches",
                    operation: "update",
                    data: { [slot]: cm.winner_team_id },
                    filters: { id: dest.id },
                  });
                  if (!repErr) {
                    (dest as any)[slot] = cm.winner_team_id;
                    repairCount++;
                  } else {
                    console.error(`[AUTO-REPAIR:FAIL] ${repErr.message}`);
                  }
                }
              }
            }

            // ── Check loser propagation ──
            if (!isSemiOrFinal && cm.next_lose_match_id && cmLoserId) {
              const dest = repairList.find(m => m.id === cm.next_lose_match_id);
              if (dest && dest.status !== 'completed' &&
                  dest.team1_id !== cmLoserId && dest.team2_id !== cmLoserId) {
                const slot = !dest.team1_id ? 'team1_id' : (!dest.team2_id ? 'team2_id' : null);
                if (slot) {
                  console.log(`[AUTO-REPAIR] Loser ${cmLoserId} → ${dest.bracket_type} R${dest.round}P${dest.position} ${slot}`);
                  const { error: repErr } = await organizerQuery({
                    table: "matches",
                    operation: "update",
                    data: { [slot]: cmLoserId },
                    filters: { id: dest.id },
                  });
                  if (!repErr) {
                    (dest as any)[slot] = cmLoserId;
                    repairCount++;
                  } else {
                    console.error(`[AUTO-REPAIR:FAIL] ${repErr.message}`);
                  }
                }
              }
            }
          }

          if (repairCount > 0) {
            console.log(`[AUTO-REPAIR] Corrigidos ${repairCount} avanço(s) pendente(s)`);
            toast.info(`🔧 ${repairCount} avanço(s) corrigido(s) automaticamente`);
          }
        }
      } catch (repairError) {
        console.error("[AUTO-REPAIR:ERROR]", repairError);
        // Non-blocking — don't prevent the rest of the flow
      }

      // UI refresh handled by finally block — no duplicate fetchData() here
      toast.success("Avanço automático realizado!");
    } else {
      // Normal bracket: IMMEDIATE propagation via next_win_match_id
      // GUARD: Group-stage matches (round 0) NEVER propagate — round-robin only.
      if (!isGroupStageMatch && match.next_win_match_id) {
        const isTopSlot = match.position % 2 === 1;
        const slotField = isTopSlot ? 'team1_id' : 'team2_id';
        await organizerQuery({
          table: "matches",
          operation: "update",
          data: { [slotField]: winnerId },
          filters: { id: match.next_win_match_id },
        });
        console.log(`[SE:Propagate] Winner ${winnerId} → Match ${match.next_win_match_id} (${slotField})`);
      }

      // Normal bracket: propagate LOSER to 3rd place match via next_lose_match_id
      if (!isGroupStageMatch && match.next_lose_match_id && loserId) {
        const isTopSlot = match.position % 2 === 1;
        const slotField = isTopSlot ? 'team1_id' : 'team2_id';
        await organizerQuery({
          table: "matches",
          operation: "update",
          data: { [slotField]: loserId },
          filters: { id: match.next_lose_match_id },
        });
        console.log(`[SE:3rdPlace] Loser ${loserId} → Match ${match.next_lose_match_id} (${slotField})`);
      }

      // Re-fetch fresh state to check round completion
      const { data: currentMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: matchScopeFilters(match, id),
        order: [{ column: "round" }, { column: "position" }],
      });

      if (currentMatches) {
        const modalityId = match.modality_id;
        const relevantMatches = currentMatches;

        const currentRound = match.round;
        const roundMatches = relevantMatches.filter((m: any) => m.round === currentRound);

        // === CHAPÉU INJECTION ===
        // When a real match completes, check if any Chapéu in the same round needs the winner
        // A Chapéu is a match with exactly one team (team1_id set, team2_id null)
        const chapeuMatches = roundMatches.filter((m: any) =>
          m.status === 'pending' &&
          ((m.team1_id && !m.team2_id) || (!m.team1_id && m.team2_id))
        );

        if (chapeuMatches.length > 0) {
          // For each completed real match in this round, inject its winner
          // into the paired Chapéu match
          // Pairing logic: matches are paired by position adjacency
          // i.e., position 1+2 → next round pos 1, position 3+4 → next round pos 2
          const completedRealMatches = roundMatches.filter((m: any) =>
            m.status === 'completed' && m.team1_id && m.team2_id && m.winner_team_id
          );

          for (const chapeu of chapeuMatches) {
            // Find the paired real match:
            // Positions are paired: (1,2), (3,4), etc.
            // The chapéu and its paired match share the same next-round destination
            const chapeuPos = chapeu.position;
            const pairedPos = chapeuPos % 2 === 1 ? chapeuPos + 1 : chapeuPos - 1;
            
            const pairedMatch = completedRealMatches.find((m: any) => m.position === pairedPos);
            
            if (pairedMatch && pairedMatch.winner_team_id) {
              // Inject the winner from the paired real match into the chapéu's empty slot
              const emptySlot = !chapeu.team2_id ? 'team2_id' : 'team1_id';
              await organizerQuery({
                table: "matches",
                operation: "update",
                data: { [emptySlot]: pairedMatch.winner_team_id },
                filters: { id: chapeu.id },
              });
              // Update in-memory
              chapeu[emptySlot] = pairedMatch.winner_team_id;
              console.log(`[Chapéu:Fill] Injected ${pairedMatch.winner_team_id} into chapéu match ${chapeu.id} slot ${emptySlot}`);
            }
          }
        }

        // Re-check: now that chapéus may have been filled, are ALL matches done?
        // Refetch to get latest state
        const { data: postChapeuMatches } = await organizerQuery({
          table: "matches",
          operation: "select",
          filters: matchScopeFilters(match, id),
          order: [{ column: "round" }, { column: "position" }],
        });

        if (postChapeuMatches) {
          const postRelevant = postChapeuMatches;
          const postRoundMatches = (postRelevant as any[]).filter((m: any) => m.round === currentRound);
          const allRoundDone = postRoundMatches.every((m: any) => m.status === "completed");

          if (allRoundDone) {
            if (currentRound === 0) {
              // GROUP STAGE completed → check auto-advance engine
              const autoAdvanceEnabled = tournamentRules?.auto_advance_knockout !== false;
              const advanceCheck = checkAutoAdvance(
                (postRelevant as any[]).map((m: any) => ({ id: m.id, round: m.round, status: m.status, modality_id: m.modality_id, team1_id: m.team1_id, team2_id: m.team2_id })),
                autoAdvanceEnabled
              );
              if (advanceCheck.shouldAdvance) {
                console.log(`[AutoAdvance] ${advanceCheck.reason} — gerando eliminatórias`);
                await generateKnockoutFromGroups();
              } else {
                console.log(`[AutoAdvance:Skip] ${advanceCheck.reason}`);
              }
            } else {
              // KNOCKOUT round completed → generate next round
              const nextRound = currentRound + 1;
              
              // FRESH CHECK: Query DB right before insert to prevent race-condition duplicates
              const existingNextRound = (postRelevant as any[]).filter((m: any) => m.round === nextRound);
              
              if (existingNextRound.length > 0) {
                console.log(`[NextRound] Round ${nextRound} already exists (${existingNextRound.length} matches), skipping generation.`);
              } else {
                const freshRoundMatches = postRoundMatches;
                const winners = freshRoundMatches
                  .filter((m: any) => m.winner_team_id)
                  .map((m: any) => m.winner_team_id as string);

                if (winners.length >= 2) {
                  const nextMatches: any[] = [];
                  const pairCount = Math.floor(winners.length / 2);

                  for (let i = 0; i < pairCount; i++) {
                    nextMatches.push({
                      tournament_id: id,
                      round: nextRound,
                      position: i + 1,
                      team1_id: winners[i * 2],
                      team2_id: winners[i * 2 + 1],
                      status: "pending",
                      bracket_number: match.bracket_number || 1,
                      modality_id: modalityId,
                      stage_id: match.stage_id ?? null,
                    });
                  }

                  // If this is a semifinal (exactly 2 matches, generating 1 final),
                  // also create a 3rd place match with the losers
                  if (pairCount === 1 && freshRoundMatches.length === 2) {
                    const losers = freshRoundMatches
                      .filter((m: any) => m.winner_team_id && m.team1_id && m.team2_id)
                      .map((m: any) => ({
                        loserId: m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id,
                        position: m.position,
                      }));

                    if (losers.length === 2) {
                      nextMatches.push({
                        tournament_id: id,
                        round: nextRound,
                        position: 1,
                        team1_id: losers.find((l: any) => l.position % 2 === 1)?.loserId || losers[0].loserId,
                        team2_id: losers.find((l: any) => l.position % 2 === 0)?.loserId || losers[1].loserId,
                        status: "pending",
                        bracket_number: match.bracket_number || 1,
                        bracket_type: "third_place",
                        modality_id: modalityId,
                        stage_id: match.stage_id ?? null,
                      });
                    }
                  }

                  await organizerQuery({ table: "matches", operation: "insert", data: nextMatches });
                  
                  // After insert, link semifinal matches to 3rd place match via next_lose_match_id
                  if (pairCount === 1 && freshRoundMatches.length === 2) {
                    const { data: justInserted } = await organizerQuery({
                      table: "matches",
                      operation: "select",
                      filters: matchScopeFilters(match, id),
                      order: [{ column: "round" }, { column: "position" }],
                    });
                    if (justInserted) {
                      const modalityInserted = justInserted as any[];
                      const thirdPlaceMatch = modalityInserted.find((m: any) => m.bracket_type === 'third_place' && m.round === nextRound);
                      const finalMatch = modalityInserted.find((m: any) => m.bracket_type !== 'third_place' && m.round === nextRound);
                      if (thirdPlaceMatch) {
                        // Link each semifinal match: winner → final, loser → 3rd place
                        const semiLinkUpdates = freshRoundMatches.map((sm: any) =>
                          organizerQuery({
                            table: "matches",
                            operation: "update",
                            data: {
                              next_win_match_id: finalMatch?.id || null,
                              next_lose_match_id: thirdPlaceMatch.id,
                            },
                            filters: { id: sm.id },
                          })
                        );
                        await Promise.all(semiLinkUpdates);
                        console.log(`[SE:3rdPlace] Linked ${freshRoundMatches.length} semifinal matches to 3rd place match ${thirdPlaceMatch.id}`);
                      }
                    }
                  }
                  
                  toast.success(`Próxima fase gerada! ${nextMatches.length} partida(s) criada(s).`);
                } else if (winners.length === 1) {
                  toast.success("🏆 Torneio finalizado! Campeão definido!");
                }
              }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // SE/VERANICO POST-DECLARATION AUTO-REPAIR
    // Garante que NENHUMA propagação fique pendente quando jogos
    // são marcados fora de ordem (ex: R3 antes de R2). Varre todos
    // os jogos completos e:
    //   1) Preenche slots nulos no next_win_match_id usando regra
    //      de paridade de posição (pos ímpar → team1, par → team2).
    //   2) Reprocessa repetidamente até convergir (cascade).
    //   3) Auto-completa "BYE virtual" quando o destino tem 1 time
    //      e nenhum feeder pendente.
    // ══════════════════════════════════════════════════════════════
    if (!isDoubleElimination) {
      try {
        let sweepIterations = 0;
        let sweepRepaired = true;
        while (sweepRepaired && sweepIterations < 5) {
          sweepRepaired = false;
          sweepIterations++;

          const { data: sweepMatches } = await organizerQuery({
            table: "matches",
            operation: "select",
            filters: matchScopeFilters(match, id),
            order: [{ column: "round" }, { column: "position" }],
          });
          if (!sweepMatches) break;
          const sweepList = sweepMatches as typeof matches;

          // Pass 1: propagate winners of completed matches
          for (const cm of sweepList) {
            if (cm.status !== 'completed' || !cm.winner_team_id) continue;

            // Winner → next_win_match_id
            if (cm.next_win_match_id) {
              const dest = sweepList.find(m => m.id === cm.next_win_match_id);
              if (dest && dest.status !== 'completed' &&
                  dest.team1_id !== cm.winner_team_id && dest.team2_id !== cm.winner_team_id) {
                const isTopSlot = cm.position % 2 === 1;
                const slot = isTopSlot ? 'team1_id' : 'team2_id';
                // Fallback: if preferred slot is taken by something else, use any free slot
                const targetSlot = !dest[slot] ? slot : (!dest.team1_id ? 'team1_id' : (!dest.team2_id ? 'team2_id' : null));
                if (targetSlot) {
                  console.log(`[SE-AUTO-REPAIR] Winner ${cm.winner_team_id} (R${cm.round}P${cm.position}) → R${dest.round}P${dest.position} ${targetSlot}`);
                  const { error: repErr } = await organizerQuery({
                    table: "matches",
                    operation: "update",
                    data: { [targetSlot]: cm.winner_team_id },
                    filters: { id: dest.id },
                  });
                  if (!repErr) {
                    (dest as any)[targetSlot] = cm.winner_team_id;
                    sweepRepaired = true;
                  }
                }
              }
            }

            // Loser → next_lose_match_id (3rd place)
            const cmLoserId = cm.team1_id === cm.winner_team_id ? cm.team2_id : cm.team1_id;
            if (cm.next_lose_match_id && cmLoserId) {
              const dest = sweepList.find(m => m.id === cm.next_lose_match_id);
              if (dest && dest.status !== 'completed' &&
                  dest.team1_id !== cmLoserId && dest.team2_id !== cmLoserId) {
                const isTopSlot = cm.position % 2 === 1;
                const slot = isTopSlot ? 'team1_id' : 'team2_id';
                const targetSlot = !dest[slot] ? slot : (!dest.team1_id ? 'team1_id' : (!dest.team2_id ? 'team2_id' : null));
                if (targetSlot) {
                  console.log(`[SE-AUTO-REPAIR] Loser ${cmLoserId} (R${cm.round}P${cm.position}) → R${dest.round}P${dest.position} ${targetSlot}`);
                  const { error: repErr } = await organizerQuery({
                    table: "matches",
                    operation: "update",
                    data: { [targetSlot]: cmLoserId },
                    filters: { id: dest.id },
                  });
                  if (!repErr) {
                    (dest as any)[targetSlot] = cmLoserId;
                    sweepRepaired = true;
                  }
                }
              }
            }
          }
        }
        if (sweepIterations > 1) {
          toast.info(`🔧 Chaveamento sincronizado (${sweepIterations} passes).`);
        }
      } catch (sweepError) {
        console.error("[SE-AUTO-REPAIR:ERROR]", sweepError);
        // Non-blocking
      }
    }
    }

    // Re-fetch matches from DB to get fresh state after feeder propagation
    const { data: freshMatches } = await organizerQuery({
      table: "matches",
      operation: "select",
      filters: { tournament_id: id },
      order: [{ column: "round" }, { column: "position" }],
    });

    if (freshMatches) {
      // ── AUTO-FINALIZATION: Only finalize when ALL modalities are done ──
      // Group matches by modality to check each one independently
      const matchesByModality = new Map<string, any[]>();
      freshMatches.forEach((m: any) => {
        const modId = m.modality_id || '__none__';
        if (!matchesByModality.has(modId)) matchesByModality.set(modId, []);
        matchesByModality.get(modId)!.push(m);
      });

      // Check if current modality is done (for toast feedback)
      const currentModalityId = selectedModality?.id || '__none__';
      const currentModalityMatches = matchesByModality.get(currentModalityId) || [];
      const currentKnockout = currentModalityMatches.filter((m: any) => m.round > 0);
      const isCurrentDE = currentKnockout.some((m: any) => m.bracket_type === 'final');
      
      let currentModalityDone = false;
      if (isCurrentDE) {
        const finalMatch = currentKnockout.find((m: any) => m.bracket_type === 'final');
        currentModalityDone = finalMatch?.status === 'completed';
      } else {
        currentModalityDone = currentModalityMatches.length > 0 
          && currentKnockout.length > 0
          && currentModalityMatches.every((m: any) => m.status === 'completed');
      }

      if (currentModalityDone) {
        // Check if ALL modalities have brackets AND are done before finalizing
        // First, fetch all modalities for this tournament to know the total count
        const allModalities = modalities || [];
        const modalitiesWithBrackets = new Set<string>();
        for (const [modId] of matchesByModality) {
          const knockout = (matchesByModality.get(modId) || []).filter((m: any) => m.round > 0);
          if (knockout.length > 0) modalitiesWithBrackets.add(modId);
        }

        // Only auto-finalize if EVERY modality WITH TEAMS has a bracket generated AND all are completed
        // Skip modalities with 0 teams — they don't need brackets
        const modalitiesWithTeams = allModalities.filter((mod: any) => {
          const modTeams = teams.filter(t => t.modality_id === mod.id);
          return modTeams.length > 0;
        });
        const allModalitiesHaveBrackets = modalitiesWithTeams.length > 0 
          && modalitiesWithTeams.every((mod: any) => modalitiesWithBrackets.has(mod.id));

        let allModalitiesDone = false;
        if (allModalitiesHaveBrackets) {
          allModalitiesDone = true;
          for (const [modId, modMatches] of matchesByModality) {
            const knockout = modMatches.filter((m: any) => m.round > 0);
            if (knockout.length === 0) { allModalitiesDone = false; break; }
            
            const hasDE = knockout.some((m: any) => m.bracket_type === 'final');
            if (hasDE) {
              const finalM = knockout.find((m: any) => m.bracket_type === 'final');
              if (!finalM || finalM.status !== 'completed') { allModalitiesDone = false; break; }
            } else {
              if (!modMatches.every((m: any) => m.status === 'completed')) { allModalitiesDone = false; break; }
            }
          }
        }

        if (allModalitiesDone) {
          await organizerQuery({
            table: "tournaments",
            operation: "update",
            data: { status: "completed" },
            filters: { id },
          });
          toast.success("🏆 Torneio finalizado! Todas as modalidades concluídas!");
        } else {
          toast.success("🏅 Modalidade concluída! Continue com as demais categorias.");
          console.log(`[AutoFinalize] Modalidade ${currentModalityId} concluída, mas ainda há modalidades pendentes. Brackets gerados: ${modalitiesWithBrackets.size}/${allModalities.length}`);
        }
      }
    }

    // Always refresh UI state — ensures consistency regardless of realtime subscription status
    } finally {
      declareWinnerMutex.current.delete(matchId);
      fetchData();
    }
  };

  // Combined handler: save score + declare winner in one action
  const handleAutoResult = async (matchId: string, score1: number, score2: number, winnerId: string) => {
    if (isWriteLocked) { toast.error("🔒 Torneio finalizado. Alterações bloqueadas."); return; }
    // Update local state BEFORE calling declareWinner so it reads the correct scores
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, score1, score2 } : m));
    await organizerQuery({
      table: "matches",
      operation: "update",
      data: { score1, score2 },
      filters: { id: matchId },
    });
    await declareWinner(matchId, winnerId);
  };

  const updateScore = async (matchId: string, score1: number, score2: number) => {
    if (isWriteLocked) { toast.error("🔒 Torneio finalizado. Alterações bloqueadas."); return; }
    const { error } = await organizerQuery({
      table: "matches",
      operation: "update",
      data: { score1, score2 },
      filters: { id: matchId },
    });
    if (error) {
      toast.error("Erro ao salvar placar: " + error.message);
    }
  };

  const deleteTournament = async () => {
    if (!id) return;
    await organizerQuery({ table: "rankings", operation: "delete", filters: { tournament_id: id } });
    await organizerQuery({
      table: "matches",
      operation: "undo_bracket",
      tournament_id: id,
    });
    await organizerQuery({ table: "teams", operation: "delete", filters: { tournament_id: id } });
    await organizerQuery({ table: "tournaments", operation: "delete", filters: { id } });
    toast.success("Torneio excluído com sucesso!");
    navigate("/dashboard");
  };

  const copyCode = () => {
    if (tournament?.tournament_code) {
      navigator.clipboard.writeText(tournament.tournament_code);
      toast.success("Código copiado!");
    }
  };

  const participants = useMemo(() => filteredTeams.map((t) => ({
    id: t.id,
    name: `${t.player1_name} / ${t.player2_name}`,
    seed: t.seed,
  })), [filteredTeams]);

  if (loading) {
    return (
      <ThemedBackground>
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ThemedBackground>
    );
  }

  if (!tournament) {
    return (
      <ThemedBackground>
        <AppHeader />
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Torneio não encontrado.</p>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mt-4">Voltar ao Painel</Button>
        </div>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <AppHeader />
      <main className="container py-4 sm:py-8 px-3 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-3 sm:mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar</span>
        </Button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
           <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <div className="flex items-center gap-3">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-9 text-lg font-bold w-64"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newName.trim()) {
                            organizerQuery({
                              table: "tournaments",
                              operation: "update",
                              data: { name: newName.trim() },
                              filters: { id },
                            }).then(() => {
                              toast.success("Nome atualizado!");
                              setEditingName(false);
                              fetchData();
                            });
                          }
                        }
                        if (e.key === "Escape") setEditingName(false);
                      }}
                    />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                      if (newName.trim()) {
                        organizerQuery({
                          table: "tournaments",
                          operation: "update",
                          data: { name: newName.trim() },
                          filters: { id },
                        }).then(() => {
                          toast.success("Nome atualizado!");
                          setEditingName(false);
                          fetchData();
                        });
                      }
                    }}>
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingName(false)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-xl sm:text-3xl font-bold tracking-tight break-words">{tournament.name}</h1>
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setNewName(tournament.name); setEditingName(true); }}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </>
                )}
                {!(tournament.status === "completed" && isOnNewStage) && (
                  <Badge className={statusColors[tournament.status] || ""}>
                    {statusLabels[tournament.status] || tournament.status}
                  </Badge>
                )}
              </div>
              {tournament.description && (
                <p className="mt-2 text-muted-foreground">{tournament.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>{sportLabels[tournament.sport] || tournament.sport}</span>
                {tournament.category && <span>• {tournament.category}</span>}
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {filteredTeams.length} duplas {selectedModality ? `(${selectedModality.name})` : ""}
                </span>
              </div>
            </div>
            {isTournamentCompleted && isOwner && !isOnNewStage && (
              <div className="w-full rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success flex items-center gap-2">
                🔒 1ª Etapa finalizada — alterações bloqueadas apenas na 1ª Etapa. Crie uma nova etapa para continuar editando.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2 self-start">
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" className="gap-1" onClick={openEditTournament}>
                    <Settings2 className="h-4 w-4" /> Editar Torneio
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-1">
                        <Trash2 className="h-4 w-4" /> Excluir Torneio
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Tem certeza que deseja excluir este torneio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Todos os dados relacionados (duplas, chaveamento, partidas, classificação e ranking) serão removidos permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteTournament} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              {tournament.tournament_code && (
                <button
                  onClick={copyCode}
                  className="rounded-lg bg-card border border-border px-4 py-2 text-center hover:border-primary/40 transition-colors"
                >
                  <p className="text-xs text-muted-foreground">Código</p>
                  <p className="text-xl font-mono font-bold tracking-[0.3em] text-primary">{tournament.tournament_code}</p>
                </button>
              )}
            </div>

            {/* Edit Tournament Dialog */}
            <Dialog open={editTournamentOpen} onOpenChange={setEditTournamentOpen}>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-primary" />
                    Editar Dados do Torneio
                  </DialogTitle>
                  <DialogDescription>Corrija as informações do torneio conforme necessário.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Nome *</label>
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do torneio" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Descrição</label>
                    <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Data do Evento</label>
                      <Input type="date" value={editForm.event_date} onChange={e => setEditForm(f => ({ ...f, event_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Categoria</label>
                      <Input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex: Masculino A" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Local</label>
                    <Input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder="Ex: Arena Central, São Paulo" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Valor de Inscrição (R$)</label>
                      <Input type="number" min="0" step="0.01" value={editForm.registration_value} onChange={e => setEditForm(f => ({ ...f, registration_value: e.target.value }))} placeholder="0,00" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Status</label>
                      <select
                        value={editForm.status}
                        onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="draft">Rascunho</option>
                        <option value="registration">Inscrições</option>
                        <option value="in_progress">Em andamento</option>
                        <option value="completed">Finalizado</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setEditTournamentOpen(false)}>Cancelar</Button>
                  <Button onClick={saveTournament} disabled={savingTournament} className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90">
                    {savingTournament ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Check className="h-4 w-4" />}
                    Salvar Alterações
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Organizers Manager - admin only */}
          {isAdmin && tournament && (
            <div className="mb-4">
              <TournamentOrganizersManager
                tournamentId={tournament.id}
                createdBy={tournament.created_by}
              />
            </div>
          )}

          {/* Stage Selector */}
          <StageSelector
            tournamentId={tournament.id}
            isOwner={isOwner}
            selectedStageId={selectedStageId}
            onSelectStage={setSelectedStageId}
          />

          {/* Modality Tabs */}
          <ModalityTabs
            modalities={modalities}
            selectedModality={selectedModality}
            onSelect={setSelectedModality}
            isOwner={canEdit}
            onAddModality={async (name: string) => {
              if (!id || !tournament?.sport) return { error: { message: "Torneio inválido" } };
              const { error } = await createModality(name, id, tournament.sport);
              return { error };
            }}
            onRenameModality={async (modalityId: string, name: string) => {
              return updateModality(modalityId, { name });
            }}
            onDeleteModality={async (modalityId: string) => {
              return deleteModality(modalityId);
            }}
          />

          {/* All tabs always visible */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-5 h-auto bg-transparent p-0 w-full">
              <TabsTrigger value="teams" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Duplas</TabsTrigger>
              <TabsTrigger value="bracket" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Chave</TabsTrigger>
              <TabsTrigger value="sequence" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Sequência</TabsTrigger>
              <TabsTrigger value="classification" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Class.</TabsTrigger>
              <TabsTrigger value="rankings" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Ranking</TabsTrigger>
              {canEdit && (
                <TabsTrigger value="audit" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Auditoria</TabsTrigger>
              )}
            </TabsList>

            {/* Duplas Tab */}
            <TabsContent value="teams">
              {canEdit && (
                <section className="rounded-xl border border-border bg-card p-3 sm:p-6 shadow-card">
                  <h2 className="mb-3 sm:mb-4 text-lg sm:text-xl font-semibold">
                    {hasBracketGenerated && lateInsertionAllowed
                      ? "Inserção Tardia de Dupla"
                      : "Cadastrar Dupla"}
                  </h2>
                  {hasBracketGenerated && lateInsertionAllowed && (
                    <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      ⚠️ Chaveamento já gerado. A nova dupla será inserida na <strong>Chave B dos Vencedores</strong>.
                      {' '}Permitido até o fim da 1ª rodada.
                    </div>
                  )}
                  {hasBracketGenerated && !lateInsertionAllowed && (
                    <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      🔒 Inserção tardia bloqueada — já existem partidas concluídas além da 1ª rodada.
                    </div>
                  )}
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={player1}
                      onChange={(e) => setPlayer1(e.target.value)}
                      placeholder="Nome do Jogador 1"
                      disabled={hasBracketGenerated && !lateInsertionAllowed}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeam())}
                    />
                    <Input
                      value={player2}
                      onChange={(e) => setPlayer2(e.target.value)}
                      placeholder="Nome do Jogador 2"
                      disabled={hasBracketGenerated && !lateInsertionAllowed}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeam())}
                    />
                    <Button
                      onClick={addTeam}
                      size="sm"
                      className="gap-1 shrink-0"
                      disabled={hasBracketGenerated && !lateInsertionAllowed}
                    >
                      <Plus className="h-4 w-4" />
                      {hasBracketGenerated ? "Inserir na Chave" : "Adicionar"}
                    </Button>
                  </div>
                  <div className="flex gap-2 mb-4">
                    <Dialog open={fictitiousDialogOpen} onOpenChange={(open) => { setFictitiousDialogOpen(open); if (!open) setFictitiousCount(""); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Plus className="h-4 w-4" /> Duplas Fictícias
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Criar Duplas Fictícias</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Quantas duplas fictícias?</label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={256}
                              placeholder="Ex: 38"
                              value={fictitiousCount}
                              onChange={(e) => setFictitiousCount(e.target.value.replace(/[^0-9]/g, ""))}
                              autoFocus
                            />
                            <p className="text-xs text-muted-foreground">Digite de 1 a 256 duplas.</p>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Gênero dos nomes</label>
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                { value: "male", label: "Masculino" },
                                { value: "female", label: "Feminino" },
                                { value: "mixed", label: "Misto" },
                              ] as { value: FakeNameGender; label: string }[]).map((opt) => (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  variant={fictitiousGender === opt.value ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setFictitiousGender(opt.value)}
                                  className={fictitiousGender === opt.value ? "bg-gradient-primary text-primary-foreground" : ""}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Os nomes serão gerados a partir de pessoas reais brasileiras.
                            </p>
                          </div>
                          <Button
                            onClick={addFictitiousTeams}
                            disabled={!fictitiousCount || parseInt(fictitiousCount, 10) < 1}
                            className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
                          >
                            {fictitiousCount && parseInt(fictitiousCount, 10) >= 1
                              ? `Criar ${parseInt(fictitiousCount, 10)} dupla(s)`
                              : "Digite a quantidade"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    {filteredTeams.length >= 2 && (
                      <Button variant="outline" size="sm" onClick={shuffleTeams} className="gap-1">
                        <Shuffle className="h-4 w-4" /> Embaralhar
                      </Button>
                    )}
                  </div>
                  {/* Excel import/export */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        const ws = XLSX.utils.aoa_to_sheet([
                          ["Jogador 1", "Jogador 2"],
                          ["João Silva", "Maria Santos"],
                        ]);
                        ws["!cols"] = [{ wch: 25 }, { wch: 25 }];
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Duplas");
                        XLSX.writeFile(wb, `modelo_duplas_${tournament?.name || "torneio"}.xlsx`);
                        toast.success("Modelo Excel exportado!");
                      }}
                    >
                      <Download className="h-4 w-4" /> Exportar Modelo
                    </Button>
                    <label>
                      <Button variant="outline" size="sm" className="gap-1 cursor-pointer" asChild>
                        <span>
                          <Upload className="h-4 w-4" /> Importar Excel
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !id) return;
                              e.target.value = "";
                              try {
                                const data = await file.arrayBuffer();
                                const wb = XLSX.read(data, { type: "array", raw: false, cellText: true });
                                const ws = wb.Sheets[wb.SheetNames[0]];
                                const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
                                // Skip header row (first row), filter rows that have at least 2 non-empty values
                                const pairs = rows.slice(1).filter(r => {
                                  const p1 = r[0]?.toString().trim();
                                  const p2 = r[1]?.toString().trim();
                                  return p1 && p2;
                                });
                                if (pairs.length === 0) {
                                  toast.error("Nenhuma dupla encontrada na planilha.");
                                  return;
                                }
                                if (hasGroupStageGenerated) {
                                  toast.error("❌ Fase de grupos já gerada. Faça o reset para alterar equipes.");
                                  return;
                                }
                                let added = 0;
                                const baseIndex = filteredTeams.length;
                                // Process in batches of 4 to avoid concurrent auth issues
                                const BATCH_SIZE = 4;
                                for (let batch = 0; batch < pairs.length; batch += BATCH_SIZE) {
                                  const batchPairs = pairs.slice(batch, batch + BATCH_SIZE);
                                  const results = await Promise.all(
                                    batchPairs.map((pair, j) =>
                                      organizerQuery({
                                        table: "teams",
                                        operation: "insert",
                                        data: {
                                          tournament_id: id,
                                          player1_name: pair[0].toString().trim(),
                                          player2_name: pair[1].toString().trim(),
                                          seed: baseIndex + batch + j + 1,
                                          modality_id: selectedModality?.id || null,
                                          stage_id: selectedStageId || null,
                                        },
                                      })
                                    )
                                  );
                                  added += results.filter(r => !r.error).length;
                                }
                                fetchData();
                                toast.success(`✅ ${added} dupla(s) importada(s) com sucesso!`);
                              } catch {
                                toast.error("Erro ao ler o arquivo.");
                              }
                            }}
                          />
                        </span>
                      </Button>
                    </label>
                  </div>
                </section>
              )}

              {/* Team list always visible */}
              {filteredTeams.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">Nenhuma dupla cadastrada nesta modalidade.</p>
              ) : (
                <section className="mt-4 rounded-xl border border-border bg-card p-6 shadow-card">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Duplas ({filteredTeams.length})</h2>
                    {canEdit && filteredTeams.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" /> Excluir Todas
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir todas as duplas?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação removerá todas as {filteredTeams.length} dupla(s) da modalidade <strong>{selectedModality?.name}</strong>. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                const count = filteredTeams.length;
                                const filters: Record<string, any> = { tournament_id: id };
                                if (selectedModality?.id) filters.modality_id = selectedModality.id;
                                if (selectedStageId) filters.stage_id = selectedStageId;

                                // 1) Apaga primeiro as partidas (evita guard de "completed sem times")
                                const { error: matchErr } = await organizerQuery({
                                  table: "matches",
                                  operation: "delete",
                                  filters,
                                });
                                if (matchErr) { toast.error(`Falha ao remover partidas: ${matchErr.message}`); return; }

                                // 2) Em seguida apaga as duplas
                                const { error } = await organizerQuery({
                                  table: "teams",
                                  operation: "delete",
                                  filters,
                                });
                                if (error) { toast.error(error.message); return; }
                                fetchData();
                                toast.success(`${count} dupla(s) excluída(s) com sucesso!`);
                              }}
                            >
                              Excluir Todas
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  <div className="space-y-2">
                    {filteredTeams.map((t, i) => (
                      <div key={t.id} className="flex items-start sm:items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-2.5 gap-2">
                        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                            {i + 1}
                          </span>
                          {editingTeamId === t.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input value={editP1} onChange={(e) => setEditP1(e.target.value)} className="h-8 text-sm" placeholder="Jogador 1" />
                              <Input value={editP2} onChange={(e) => setEditP2(e.target.value)} className="h-8 text-sm" placeholder="Jogador 2" />
                              <Button variant="ghost" size="sm" onClick={saveEdit} className="h-7 w-7 p-0">
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0">
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                              <span className="team-name text-sm leading-snug break-words">
                                <span className="font-semibold">{t.player1_name}</span>
                                <span className="text-muted-foreground mx-1">/</span>
                                <span className="font-semibold">{t.player2_name}</span>
                              </span>
                              {t.is_fictitious && <span className="text-xs text-muted-foreground">(fictícia)</span>}
                            </div>
                          )}
                        </div>
                        {canEdit && editingTeamId !== t.id && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(t)} className="h-7 w-7 p-0">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => removeTeam(t.id)} className="h-7 w-7 p-0">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            {/* Chaveamento Tab - Structural view only (no scores/results) */}
            <TabsContent value="bracket">
              {canEdit && filteredMatches.length === 0 && filteredTeams.length >= 2 && (
                <div className="mb-4">
                  <GenerateBracketDialog
                    onGenerate={generateBracket}
                    teamCount={filteredTeams.length}
                    teams={filteredTeams}
                    isDisabled={false}
                    sport={selectedModality?.sport || tournament.sport}
                    showLuanaMode={hasLuanaAccess}
                  />
                </div>
              )}

              {canEdit && filteredMatches.length > 0 && (
                <div className="mb-4 flex justify-end gap-2">
                  {(() => {
                    const groupMatches = filteredMatches.filter((m: any) => m.round === 0);
                    const knockoutMatches = filteredMatches.filter((m: any) => m.round > 0);
                    const allGroupsDone = groupMatches.length > 0 && groupMatches.every((m: any) => m.status === "completed");
                    if (allGroupsDone && knockoutMatches.length === 0) {
                      return (
                        <Button size="sm" className="gap-1 bg-gradient-primary text-primary-foreground" onClick={generateKnockoutFromGroups}>
                          <Trophy className="h-4 w-4" /> Gerar Mata-Mata
                        </Button>
                      );
                    }
                    return null;
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={runConsistencyScan}
                    disabled={scanningConsistency}
                    title="Valida se vencedores e perdedores foram propagados corretamente para o slot da próxima partida"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {scanningConsistency ? "Verificando..." : "Verificar Consistência"}
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1" onClick={undoBracket}>
                    <Undo2 className="h-4 w-4" /> Desfazer Chaveamento
                  </Button>
                </div>
              )}

              {filteredMatches.length > 0 ? (
                <section>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <Trophy className="h-5 w-5" /> Chaveamento
                    </h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={exportingBracket}>
                          <FileDown className="h-4 w-4" />
                          {exportingBracket ? "Exportando..." : "Exportar PDF"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem
                          onClick={async () => {
                            if (!bracketExportRef.current) return;
                            setExportingBracket(true);
                            try {
                              const meta = {
                                tournamentName: tournament?.name || "Torneio",
                                sport: sportLabels[tournament?.sport] || tournament?.sport || "",
                                date: tournament?.event_date ? formatDateBR(tournament.event_date) : undefined,
                                modalityName: selectedModality?.name,
                              };
                              await exportBracketPdf(bracketExportRef.current, meta);
                              toast.success("Chave exportada em PDF!");
                            } catch (err: any) {
                              toast.error("Erro ao exportar chave: " + (err?.message || ""));
                            } finally {
                              setExportingBracket(false);
                            }
                          }}
                        >
                          🌳 Exportar Chave (árvore)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            try {
                              const fmt = tournament?.format === 'double_elimination' ? 'double_elimination' : 'single_elimination';
                              const numMap = buildMatchNumberMap(filteredMatches as any, fmt);
                              const teamName = (tid: string | null) => {
                                if (!tid) return "A definir";
                                const t = filteredTeams.find((x: any) => x.id === tid);
                                if (!t) return "A definir";
                                return `${t.player1_name}${t.player2_name ? " / " + t.player2_name : ""}`;
                              };
                              const matchCountByRound = new Map<number, number>();
                              for (const m of filteredMatches) {
                                matchCountByRound.set(m.round, (matchCountByRound.get(m.round) || 0) + 1);
                              }
                              const rows = [...filteredMatches]
                                .map((m) => ({
                                  order: numMap.get(m.id) ?? 0,
                                  round: m.round === 0 ? "Fase de Grupos" : getEliminationRoundLabel(m.round, matchCountByRound.get(m.round) || 0),
                                  group: m.bracket_number ? `Chave ${String.fromCharCode(64 + (m.bracket_number || 1))}` : "-",
                                  team1: teamName(m.team1_id),
                                  team2: teamName(m.team2_id),
                                  score: m.status === "completed" ? `${m.score1 ?? 0} × ${m.score2 ?? 0}` : "-",
                                  winner: m.winner_team_id ? teamName(m.winner_team_id) : "-",
                                  status: m.status === "completed" ? "Finalizado" : "Pendente",
                                }))
                                .sort((a, b) => a.order - b.order);
                              const meta = {
                                tournamentName: tournament?.name || "Torneio",
                                sport: sportLabels[tournament?.sport] || tournament?.sport || "",
                                date: tournament?.event_date ? formatDateBR(tournament.event_date) : undefined,
                                modalityName: selectedModality?.name,
                              };
                              exportSequencePdf(rows, meta);
                              toast.success("Sequência exportada em PDF!");
                            } catch (err: any) {
                              toast.error("Erro ao exportar sequência: " + (err?.message || ""));
                            }
                          }}
                        >
                          📋 Exportar Sequência
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            if (!bracketExportRef.current) return;
                            setExportingBracket(true);
                            try {
                              const fmt = tournament?.format === 'double_elimination' ? 'double_elimination' : 'single_elimination';
                              const numMap = buildMatchNumberMap(filteredMatches as any, fmt);
                              const teamName = (tid: string | null) => {
                                if (!tid) return "A definir";
                                const t = filteredTeams.find((x: any) => x.id === tid);
                                if (!t) return "A definir";
                                return `${t.player1_name}${t.player2_name ? " / " + t.player2_name : ""}`;
                              };
                              const matchCountByRound = new Map<number, number>();
                              for (const m of filteredMatches) {
                                matchCountByRound.set(m.round, (matchCountByRound.get(m.round) || 0) + 1);
                              }
                              const rows = [...filteredMatches]
                                .map((m) => ({
                                  order: numMap.get(m.id) ?? 0,
                                  round: m.round === 0 ? "Fase de Grupos" : getEliminationRoundLabel(m.round, matchCountByRound.get(m.round) || 0),
                                  group: m.bracket_number ? `Chave ${String.fromCharCode(64 + (m.bracket_number || 1))}` : "-",
                                  team1: teamName(m.team1_id),
                                  team2: teamName(m.team2_id),
                                  score: m.status === "completed" ? `${m.score1 ?? 0} × ${m.score2 ?? 0}` : "-",
                                  winner: m.winner_team_id ? teamName(m.winner_team_id) : "-",
                                  status: m.status === "completed" ? "Finalizado" : "Pendente",
                                }))
                                .sort((a, b) => a.order - b.order);
                              const meta = {
                                tournamentName: tournament?.name || "Torneio",
                                sport: sportLabels[tournament?.sport] || tournament?.sport || "",
                                date: tournament?.event_date ? formatDateBR(tournament.event_date) : undefined,
                                modalityName: selectedModality?.name,
                              };
                              await exportBracketAndSequencePdf(bracketExportRef.current, rows, meta);
                              toast.success("PDF completo exportado!");
                            } catch (err: any) {
                              toast.error("Erro ao exportar: " + (err?.message || ""));
                            } finally {
                              setExportingBracket(false);
                            }
                          }}
                        >
                          📦 Exportar Chave + Sequência
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div ref={bracketExportRef} className="bg-background p-2 rounded-lg">
                    <BracketTreeView
                        matches={filteredMatches}
                        participants={participants}
                        isOwner={false}
                        onDeclareWinner={() => {}}
                        onUpdateScore={() => {}}
                        structuralOnly
                        tournamentFormat={tournament?.format === 'double_elimination' ? 'double_elimination' : (selectedModality?.game_system || tournament?.format)}
                      />
                  </div>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">
                    {filteredTeams.length < 2
                      ? "Adicione pelo menos 2 duplas para gerar o chaveamento."
                      : "Clique em \"Gerar Chaveamento\" para começar."}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Sequência Tab - Match sequence with group identification */}
            <TabsContent value="sequence">
              {canEdit && filteredMatches.length > 0 && (
                <div className="mb-4 flex justify-end gap-2">
                  {/* Show "Generate Knockout" button when all groups are done but no knockout exists */}
                  {(() => {
                    const groupMatches = filteredMatches.filter((m: any) => m.round === 0);
                    const knockoutMatches = filteredMatches.filter((m: any) => m.round > 0);
                    const allGroupsDone = groupMatches.length > 0 && groupMatches.every((m: any) => m.status === "completed");
                    if (allGroupsDone && knockoutMatches.length === 0) {
                      return (
                        <Button size="sm" className="gap-1 bg-gradient-primary text-primary-foreground" onClick={generateKnockoutFromGroups}>
                          <Trophy className="h-4 w-4" /> Gerar Mata-Mata
                        </Button>
                      );
                    }
                    return null;
                  })()}
                  <Button variant="outline" size="sm" className="gap-1" onClick={undoSequence}>
                    <Undo2 className="h-4 w-4" /> Resetar Resultados
                  </Button>
                </div>
              )}
              {filteredMatches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Sequência de Partidas
                  </h2>
                  <MatchSequenceViewer
                      matches={filteredMatches}
                      teams={filteredTeams}
                      isOwner={canEdit}
                      numSets={tournament?.num_sets || 3}
                      tournamentName={tournament?.name || ""}
                      sport={tournament?.sport || ""}
                      eventDate={tournament?.event_date ? formatDateBR(tournament.event_date) : undefined}
                      onUpdateScore={updateScore}
                      onDeclareWinner={declareWinner}
                      tournamentFormat={tournament?.format === 'double_elimination' ? 'double_elimination' : (selectedModality?.game_system || tournament?.format)}
                      onAutoResult={handleAutoResult}
                      onOverrideSaved={fetchData}
                      tournamentRules={tournamentRules}
                      tournamentId={id || ""}
                    />
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Gere o chaveamento primeiro para ver a sequência de partidas.</p>
                </div>
              )}
            </TabsContent>

            {/* Classificação Tab - Read-only standings */}
            <TabsContent value="classification">
              {filteredMatches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Classificação
                  </h2>
                  <ClassificationTab matches={filteredMatches} teams={filteredTeams} rankingCriteriaOrder={tournamentRules?.ranking_criteria_order} />
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Gere o chaveamento primeiro.</p>
                </div>
              )}
            </TabsContent>

            {/* Ranking Tab */}
            <TabsContent value="rankings">
              <RankingsTab
                  tournamentId={id || ""}
                  isOwner={isOwner}
                  sport={tournament.sport}
                  tournamentName={tournament.name}
                  eventDate={tournament.event_date ? formatDateBR(tournament.event_date) : undefined}
                  modalityId={selectedModality?.id || null}
                  modalityName={selectedModality?.name}
                  stageId={selectedStageId}
                />
            </TabsContent>

            {/* Auditoria Tab — log do Combatedor de Bugs */}
            {canEdit && (
              <TabsContent value="audit">
                <BugCombatantLogPanel
                  tournamentId={id || ""}
                  isAdmin={!!isAdmin}
                  onOpenMatch={(shortId) => {
                    const target = matches.find((m: any) =>
                      typeof m.id === "string" && m.id.toLowerCase().startsWith(shortId.toLowerCase()),
                    );
                    if (!target) {
                      toast.error(`Partida ${shortId} não encontrada (pode ter sido removida).`);
                      return;
                    }
                    if (target.modality_id && target.modality_id !== selectedModality?.id) {
                      const mod = modalities.find((m: any) => m.id === target.modality_id);
                      if (mod) setSelectedModality(mod);
                    }
                    setActiveTab("bracket");
                    toast.success(`Abrindo chave — partida ${shortId}`, {
                      description: "Card destacado em amarelo por alguns segundos.",
                    });
                    // Aguarda render do bracket e destaca via DOM
                    setTimeout(() => {
                      const el = document.querySelector(`[data-match-id="${target.id}"]`) as HTMLElement | null;
                      if (!el) return;
                      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                      el.classList.add("ring-4", "ring-amber-400", "ring-offset-2", "ring-offset-background", "rounded-lg", "transition-all");
                      window.setTimeout(() => {
                        el.classList.remove("ring-4", "ring-amber-400", "ring-offset-2", "ring-offset-background");
                      }, 4000);
                    }, 350);
                  }}
                />
              </TabsContent>
            )}
          </Tabs>
          <FlowAppsBranding variant="tournament-cta" />
        </motion.div>
      </main>
      <Dialog open={consistencyOpen} onOpenChange={setConsistencyOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {consistencyReport?.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Verificação de Consistência
            </DialogTitle>
            <DialogDescription>
              {consistencyReport
                ? consistencyReport.ok
                  ? `Todas as propagações estão corretas (${consistencyReport.modalities.length} modalidade(s) verificada(s)).`
                  : `${consistencyReport.totalIssues} propagação(ões) inconsistente(s) detectada(s).`
                : "Aguardando varredura..."}
            </DialogDescription>
          </DialogHeader>

          {consistencyReport && (
            <div className="space-y-3">
              {consistencyReport.modalities.map((m) => (
                <div
                  key={m.modalityId}
                  className={`rounded-lg border p-3 ${m.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-semibold">{m.modalityName}</h4>
                    <Badge variant={m.ok ? "secondary" : "destructive"}>
                      {m.ok ? "OK" : `${m.brokenPropagations} erro(s)`}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>Total: <strong className="text-foreground">{m.totalMatches}</strong></div>
                    <div>Concluídas: <strong className="text-foreground">{m.completedMatches}</strong></div>
                    <div>Propagações OK: <strong className="text-emerald-500">{m.successfulPropagations}/{m.expectedPropagations}</strong></div>
                    <div>Quebradas: <strong className={m.brokenPropagations > 0 ? "text-destructive" : "text-foreground"}>{m.brokenPropagations}</strong></div>
                  </div>
                  {m.issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs max-h-40 overflow-y-auto">
                      {m.issues.slice(0, 20).map((iss, idx) => (
                        <li key={idx} className="text-muted-foreground">
                          <span className="font-mono text-amber-500">[{iss.kind}]</span> {iss.detail}
                        </li>
                      ))}
                      {m.issues.length > 20 && (
                        <li className="text-muted-foreground italic">+{m.issues.length - 20} adicional(is)...</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
              {consistencyReport.modalities.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma modalidade encontrada para este torneio.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConsistencyOpen(false)}>Fechar</Button>
            <Button onClick={runConsistencyScan} disabled={scanningConsistency} className="gap-1">
              <ShieldCheck className="h-4 w-4" />
              {scanningConsistency ? "Verificando..." : "Re-verificar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FlowAppsBranding variant="internal-footer" />
    </ThemedBackground>
  );
};

export default TournamentDetail;
