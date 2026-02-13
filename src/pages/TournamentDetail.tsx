import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSportTheme } from "@/contexts/SportContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Trophy, Users, Shuffle, Copy, Pencil, Check, X, ArrowLeft, Undo2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";
import { GenerateBracketDialog } from "@/components/GenerateBracketDialog";
import { rankTeamsInGroup, selectIndexTeams } from "@/lib/tiebreakLogic";
import { organizerQuery } from "@/lib/organizerApi";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import ModalityTabs from "@/components/ModalityTabs";
import { useModalities } from "@/hooks/useModalities";
import { generateDoubleEliminationBracket } from "@/lib/doubleEliminationLogic";
import { processDoubleEliminationAdvance, handleResetFinal } from "@/lib/doubleEliminationAdvance";
import { computeCascadeResets } from "@/lib/cascadeReset";

// Lazy load heavy visualization components
const BracketTreeView = lazy(() => import("@/components/BracketTreeView"));
const MatchSequenceViewer = lazy(() => import("@/components/MatchSequenceViewer"));
const ClassificationTab = lazy(() => import("@/components/ClassificationTab"));
const RankingsTab = lazy(() => import("@/components/RankingsTab"));

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

interface Team {
  id: string;
  tournament_id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
  is_fictitious: boolean;
  payment_status: string;
  modality_id: string | null;
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
}

const TournamentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, organizerId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { setSelectedSport } = useSportTheme();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editP1, setEditP1] = useState("");
  const [editP2, setEditP2] = useState("");
  const [fictitiousCount, setFictitiousCount] = useState("4");
  const declareWinnerMutex = useRef(false);
  const [fictitiousDialogOpen, setFictitiousDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const { modalities, selectedModality, setSelectedModality, updateModality } = useModalities(id);

  const isOwner = tournament?.created_by === organizerId || isAdmin;

  // Filtered data by selected modality — STRICT isolation, no fallback (MEMOIZED)
  const filteredTeams = useMemo(() => 
    selectedModality ? teams.filter(t => t.modality_id === selectedModality.id) : teams,
    [teams, selectedModality]
  );
  const filteredMatches = useMemo(() => 
    selectedModality ? matches.filter(m => m.modality_id === selectedModality.id) : matches,
    [matches, selectedModality]
  );

  // Reads use direct supabase (SELECT policies are true)
  const fetchData = useCallback(async () => {
    if (!id) return;
    const [tRes, teamsRes, mRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("teams").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("position"),
    ]);
    if (tRes.data) {
      setTournament(tRes.data);
      setSelectedSport(tRes.data.sport);
    }
    if (teamsRes.data) setTeams(teamsRes.data);
    if (mRes.data) setMatches(mRes.data);
    setLoading(false);
  }, [id, setSelectedSport]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscriptions with debounce to avoid excessive re-fetches
  useEffect(() => {
    if (!id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchData(), 300);
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
  const addTeam = async () => {
    if (!player1.trim() || !player2.trim() || !id) return;
    const { error } = await organizerQuery({
      table: "teams",
      operation: "insert",
      data: {
        tournament_id: id,
        player1_name: player1.trim(),
        player2_name: player2.trim(),
        seed: filteredTeams.length + 1,
        modality_id: selectedModality?.id || null,
      },
    });
    if (error) { toast.error(error.message); return; }
    setPlayer1("");
    setPlayer2("");
    fetchData();
  };

  const addFictitiousTeams = async () => {
    if (!id) return;
    const count = Number(fictitiousCount);
    if (count < 1 || count > 64) { toast.error("Quantidade inválida"); return; }
    const newTeams = [];
    for (let i = 0; i < count; i++) {
      const num = filteredTeams.length + i + 1;
      newTeams.push({
        tournament_id: id,
        player1_name: `Jogador ${num}A`,
        player2_name: `Jogador ${num}B`,
        seed: num,
        is_fictitious: true,
        modality_id: selectedModality?.id || null,
      });
    }
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
    bracketMode: "normal" | "double_elimination";
    startRound: number;
    useSeeds: boolean;
    numSets: number;
    gamesPerSet?: number;
    seedTeamIds?: string[];
    useGroupStage: boolean;
    numGroups: number;
    teamsPerGroupAdvancing: number;
    byeTeamIds: string[];
    useIndex: boolean;
    numIndexTeams?: number;
  }) => {
    try {
      // VALIDATION: Check minimum team count
      if (filteredTeams.length < 2) {
        toast.error("❌ Erro: Cadastre pelo menos 2 duplas antes de gerar o chaveamento.");
        return;
      }

      // Delete only matches for the current modality — use bulk API
      if (selectedModality) {
        await organizerQuery({
          table: "matches",
          operation: "update",
          data: { next_win_match_id: null, next_lose_match_id: null },
          filters: { tournament_id: id, modality_id: selectedModality.id },
        } as any);
        // Then delete via edge function bulk op
        const token = sessionStorage.getItem("organizer_token");
        const orgId = sessionStorage.getItem("organizer_id");
        if (token && orgId) {
          await supabase.functions.invoke("organizer-api", {
            body: { token, organizerId: orgId, operation: "undo_bracket", tournament_id: id, modality_id: selectedModality.id },
          });
        }
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

    const currentModalityId = selectedModality?.id || null;

    if (config.useGroupStage) {
      // === GROUP STAGE ===
      let arranged = [...filteredTeams];
      if (config.useSeeds && config.seedTeamIds && config.seedTeamIds.length > 0) {
        const seeds = arranged.filter(t => config.seedTeamIds!.includes(t.id));
        const nonSeeds = arranged.filter(t => !config.seedTeamIds!.includes(t.id)).sort(() => Math.random() - 0.5);
        arranged = [...seeds, ...nonSeeds];
      } else {
        arranged.sort(() => Math.random() - 0.5);
      }

      const groups: typeof arranged[] = Array.from({ length: config.numGroups }, () => []);
      arranged.forEach((team, i) => {
        groups[i % config.numGroups].push(team);
      });

      const newMatches: any[] = [];
      for (let g = 0; g < groups.length; g++) {
        const groupTeams = groups[g];
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
            });
          }
        }
      }

      const { error } = await organizerQuery({ table: "matches", operation: "insert", data: newMatches });
      if (error) { toast.error(error.message); return; }

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
      
      toast.success(`Fase de grupos gerada! ${config.numGroups} grupo(s) criado(s)${config.useIndex ? ` + ${config.numIndexTeams} índice` : ""}.`);
      fetchData();
    } else if (config.bracketMode === "double_elimination") {
      // === DOUBLE ELIMINATION ===
      let result;
      try {
        result = generateDoubleEliminationBracket({
          tournamentId: id!,
          modalityId: currentModalityId || "",
          teams: filteredTeams.map(t => ({ id: t.id, player1_name: t.player1_name, player2_name: t.player2_name, seed: t.seed })),
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
        data: { status: "in_progress" },
        filters: { id },
      });
      toast.success(`✅ Dupla Eliminação gerada! ${matchCount} partidas criadas.`);
      fetchData();
    } else {
      // === NORMAL KNOCKOUT — only create first round with REAL teams ===
      let arranged = [...filteredTeams];
      if (config.useSeeds && config.seedTeamIds && config.seedTeamIds.length > 0) {
        const seeds = arranged.filter(t => config.seedTeamIds!.includes(t.id));
        const nonSeeds = arranged.filter(t => !config.seedTeamIds!.includes(t.id)).sort(() => Math.random() - 0.5);
        arranged = [...seeds, ...nonSeeds];
      } else if (config.useSeeds) {
        arranged.sort((a, b) => (a.seed || 0) - (b.seed || 0));
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
    } catch (error: any) {
      console.error("[generateBracket] Error:", error);
      toast.error(`❌ Erro ao gerar chaveamento: ${error?.message || "Erro desconhecido"}`);
    }
  };

  const undoBracket = async () => {
    if (!id) return;
    const token = sessionStorage.getItem("organizer_token");
    const organizerId = sessionStorage.getItem("organizer_id");
    if (!token || !organizerId) { toast.error("Não autenticado"); return; }
    const { data: result, error: invokeErr } = await supabase.functions.invoke("organizer-api", {
      body: { token, organizerId, operation: "undo_bracket", tournament_id: id, modality_id: selectedModality?.id || null },
    });
    const error = invokeErr || (result?.error ? { message: result.error } : null);
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
    const token = sessionStorage.getItem("organizer_token");
    const organizerId = sessionStorage.getItem("organizer_id");
    if (!token || !organizerId) { toast.error("Não autenticado"); return; }
    const { data: result, error: invokeErr } = await supabase.functions.invoke("organizer-api", {
      body: { token, organizerId, operation: "reset_results", tournament_id: id, modality_id: selectedModality?.id || null },
    });
    const error = invokeErr || (result?.error ? { message: result.error } : null);
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

    // GUARD: Check if knockout matches already exist (prevent duplicate generation)
    const existingKnockout = relevantMatches.filter((m: any) => m.round >= 1);
    if (existingKnockout.length > 0) {
      console.log(`[generateKnockoutFromGroups] Knockout already exists (${existingKnockout.length} matches), skipping.`);
      return;
    }

    const brackets = Array.from(new Set<number>(groupMatches.map((m: any) => (m.bracket_number || 1) as number))).sort((a, b) => a - b);

    // Get tournament config for index
    const numIndexTeams = tournament?.num_brackets || 0;

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

    if (allAdvancing.length < 2) {
      toast.error("Duplas insuficientes para fase eliminatória.");
      return;
    }

    // Build cross-pairings: 1st of group A always vs 2nd of last group (Z)
    //                       2nd of group A always vs 1st of last group (Z)
    //                       Then 1st B vs 2nd (penultimate), etc.
    const numGroups = brackets.length;
    const pairings: { team1Id: string; team2Id: string }[] = [];

    for (let i = 0; i < Math.ceil(numGroups / 2); i++) {
      const rightIdx = numGroups - 1 - i;
      const groupI = groupRankings[String(brackets[i])];
      const groupRight = rightIdx !== i ? groupRankings[String(brackets[rightIdx])] : null;

      if (groupRight) {
        // 1st of group[i] vs 2nd of group[rightIdx]
        if (groupI[0] && groupRight[1]) {
          pairings.push({ team1Id: groupI[0].teamId, team2Id: groupRight[1].teamId });
        }
        // 2nd of group[i] vs 1st of group[rightIdx]
        if (groupI[1] && groupRight[0]) {
          pairings.push({ team1Id: groupI[1].teamId, team2Id: groupRight[0].teamId });
        }
      } else {
        // Odd number of groups: middle group plays within itself
        if (groupI[0] && groupI[1]) {
          pairings.push({ team1Id: groupI[0].teamId, team2Id: groupI[1].teamId });
        }
      }
    }

    // Add any index teams as extra pairings if needed
    if (indexTeamIds.length > 0) {
      // Index teams fill remaining spots — pair them sequentially
      for (let i = 0; i < indexTeamIds.length - 1; i += 2) {
        pairings.push({ team1Id: indexTeamIds[i], team2Id: indexTeamIds[i + 1] });
      }
    }

    const newMatches: any[] = [];

    for (let i = 0; i < pairings.length; i++) {
      newMatches.push({
        tournament_id: id,
        round: 1,
        position: i + 1,
        team1_id: pairings[i].team1Id,
        team2_id: pairings[i].team2Id,
        status: "pending",
        bracket_number: 1,
        modality_id: modalityId,
      });
    }

    // NO future rounds — they are created dynamically by declareWinner

    const { error } = await organizerQuery({ table: "matches", operation: "insert", data: newMatches });
    if (error) { toast.error(error.message); return; }

    toast.success(`Fase de grupos concluída! Eliminatória gerada com ${allAdvancing.length} duplas classificadas (${pairings.length} partidas).`);
    fetchData();
  };

  const declareWinner = async (matchId: string, winnerId: string) => {
    // MUTEX: Prevent concurrent executions that cause duplicate rounds
    if (declareWinnerMutex.current) {
      toast.info("Aguarde a operação anterior ser concluída...");
      return;
    }
    declareWinnerMutex.current = true;
    
    try {
    const match = matches.find((m) => m.id === matchId);
    if (!match || !id) { declareWinnerMutex.current = false; return; }

    // ── CASCADE RESET: If match was already completed, clear downstream first ──
    const isReDeclaration = match.status === 'completed' && match.winner_team_id;
    if (isReDeclaration) {
      const modalityMatchesForCascade = match.modality_id
        ? matches.filter(m => m.modality_id === match.modality_id)
        : matches;
      
      // Fetch fresh data for cascade
      const { data: freshForCascade } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: { tournament_id: id },
        order: [{ column: "round" }, { column: "position" }],
      });
      
      if (freshForCascade) {
        const cascadeMatches = match.modality_id
          ? (freshForCascade as typeof matches).filter(m => m.modality_id === match.modality_id)
          : (freshForCascade as typeof matches);
        
        const freshMatch = cascadeMatches.find(m => m.id === matchId) || match;
        const oldWinner = freshMatch.winner_team_id;
        const oldLoser = freshMatch.team1_id === oldWinner ? freshMatch.team2_id : freshMatch.team1_id;
        
        const cascadeResets = computeCascadeResets(freshMatch, cascadeMatches, oldWinner, oldLoser);
        
        if (cascadeResets.length > 0) {
          console.log(`[CASCADE] Resetting ${cascadeResets.length} downstream matches`);
          await Promise.all(
            cascadeResets.map(async (reset) => {
              const { error } = await organizerQuery({
                table: "matches",
                operation: "update",
                data: reset.data,
                filters: { id: reset.matchId },
              });
              if (error) console.error(`[CASCADE:Error] Match ${reset.matchId}:`, error);
              else console.log(`[CASCADE:OK] Match ${reset.matchId} reset: ${JSON.stringify(reset.data)}`);
            })
          );
          toast.info(`${cascadeResets.length} partida(s) dependente(s) resetada(s) para recálculo.`);
        }
      }
    }

    // Validate round order for double elimination — use FRESH data from DB
    // IMPORTANT: Only check matches from the SAME modality to avoid cross-modality false positives
    const modalityMatches = match.modality_id
      ? matches.filter(m => m.modality_id === match.modality_id)
      : matches;
    const isDE = modalityMatches.some(m => m.bracket_type === 'losers' || m.bracket_type === 'final' || m.bracket_type === 'semi_final');
    if (isDE && !isReDeclaration) {
      // Fetch latest match statuses to avoid stale-state blocking
      const { data: freshMatches } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", id);
      
      if (freshMatches && freshMatches.length > 0) {
        const { validateMatchStart } = await import("@/lib/roundScheduler");
        const violation = validateMatchStart(matchId, freshMatches as any);
        if (violation) {
          toast.error(`⚠️ ${violation}`);
          fetchData(); // Sync UI with fresh data
          return;
        }
      }
    }

    // Get loser ID
    const loserId = match.team1_id === winnerId ? match.team2_id : match.team1_id;

    // Rule 26: Declarar vencedor sem placar salva 0x0
    await organizerQuery({
      table: "matches",
      operation: "update",
      data: {
        winner_team_id: winnerId,
        status: "completed",
        score1: match.score1 ?? 0,
        score2: match.score2 ?? 0,
      },
      filters: { id: matchId },
    });

    // Determine if this is a double elimination bracket — filter by SAME modality
    const modalityMatchesForDE = match.modality_id
      ? matches.filter(m => m.modality_id === match.modality_id)
      : matches;
    const isDoubleElimination = modalityMatchesForDE.some(m => m.bracket_type === 'losers' || m.bracket_type === 'final' || m.bracket_type === 'semi_final');

    if (isDoubleElimination) {
      // CRITICAL: Fetch fresh matches from DB to avoid stale state issues
      // (e.g., when multiple matches in same round are completed quickly)
      const { data: freshMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: { tournament_id: id },
        order: [{ column: "round" }, { column: "position" }],
      });
      const freshMatchList = (freshMatches || matches) as typeof matches;
      const freshMatch = freshMatchList.find(m => m.id === matchId) || match;
      
      // Use new advancement logic with fresh data
      const advancement = processDoubleEliminationAdvance(freshMatchList, freshMatch, winnerId, loserId);
      
      // ── VALIDATION LOG ──
      const modalityMatchesDE = selectedModality
        ? matches.filter(m => m.modality_id === selectedModality.id && m.round > 0)
        : matches.filter(m => m.round > 0);
      
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

      // ── HARD BLOCK IF FEEDER FAILS ──
      if (feederFailed) {
        toast.error("❌ Falha na propagação de feeders. Progressão bloqueada.");
        fetchData();
        return;
      }

      // ── VALIDATE: If match has outgoing feeders, they must have been injected ──
      if (match.next_win_match_id && advancement.winnerUpdates.length === 0) {
        console.error(`[DE:FeederMissing] Match ${matchId} has next_win_match_id=${match.next_win_match_id} but no winner update was generated`);
        toast.error("❌ Falha na propagação de feeders. Vencedor não injetado no destino.");
        fetchData();
        return;
      }
      if (match.next_lose_match_id && loserId && advancement.loserUpdates.length === 0) {
        console.error(`[DE:FeederMissing] Match ${matchId} has next_lose_match_id=${match.next_lose_match_id} but no loser update was generated`);
        toast.error("❌ Falha na propagação de feeders. Perdedor não injetado no destino.");
        fetchData();
        return;
      }

      // ── BYE AUTO-COMPLETION ──
      // After propagation, check if any pending matches now have exactly 1 team
      // and no more feeders will fill the empty slot (= BYE match)
      const { data: postPropMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: { tournament_id: id },
        order: [{ column: "round" }, { column: "position" }],
      });
      
      if (postPropMatches) {
        const modalityMatches = match.modality_id
          ? (postPropMatches as typeof matches).filter(m => m.modality_id === match.modality_id)
          : (postPropMatches as typeof matches);
        
        let byeProcessed = true;
        while (byeProcessed) {
          byeProcessed = false;
          for (const pm of modalityMatches) {
            if (pm.status !== 'pending') continue;
            const hasTeam1 = !!pm.team1_id;
            const hasTeam2 = !!pm.team2_id;
            if (hasTeam1 === hasTeam2) continue; // Both filled or both empty — skip
            
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

      toast.success("Avanço automático realizado!");
    } else {
      // Normal bracket: dynamic next-round generation
      // Re-fetch fresh state to check if all matches in this round are done
      const { data: currentMatches } = await organizerQuery({
        table: "matches",
        operation: "select",
        filters: { tournament_id: id },
        order: [{ column: "round" }, { column: "position" }],
      });

      if (currentMatches) {
        const modalityId = match.modality_id;
        const relevantMatches = modalityId
          ? currentMatches.filter((m: any) => m.modality_id === modalityId)
          : currentMatches;

        const currentRound = match.round;
        const roundMatches = relevantMatches.filter((m: any) => m.round === currentRound);
        const allRoundDone = roundMatches.every((m: any) => m.status === "completed");

        if (allRoundDone) {
          if (currentRound === 0) {
            // GROUP STAGE completed → auto-generate knockout
            await generateKnockoutFromGroups();
          } else {
            // KNOCKOUT round completed → generate next round
            const nextRound = currentRound + 1;
            
            // FRESH CHECK: Query DB right before insert to prevent race-condition duplicates
            const { data: freshCheckMatches } = await organizerQuery({
              table: "matches",
              operation: "select",
              filters: { tournament_id: id },
              order: [{ column: "round" }, { column: "position" }],
            });
            
            const freshRelevant = freshCheckMatches
              ? (modalityId ? freshCheckMatches.filter((m: any) => m.modality_id === modalityId) : freshCheckMatches)
              : [];
            const existingNextRound = (freshRelevant as any[]).filter((m: any) => m.round === nextRound);
            
            if (existingNextRound.length > 0) {
              console.log(`[NextRound] Round ${nextRound} already exists (${existingNextRound.length} matches), skipping generation.`);
            } else {
              const freshRoundMatches = (freshRelevant as any[]).filter((m: any) => m.round === currentRound);
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
                  });
                }

                await organizerQuery({ table: "matches", operation: "insert", data: nextMatches });
                toast.success(`Próxima fase gerada! ${nextMatches.length} partida(s) criada(s).`);
              } else if (winners.length === 1) {
                toast.success("🏆 Torneio finalizado! Campeão definido!");
              }
            }
          }
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
      // ── STRICT TOURNAMENT END RULE (Double Elimination) ──
      const isDE_final = freshMatches.some((m: any) => m.bracket_type === 'final');
      
      if (isDE_final) {
        // Double Elimination: Only complete when FINAL match is done + 2N-3 validation
        const modalityFreshMatches = selectedModality
          ? freshMatches.filter((m: any) => m.modality_id === selectedModality.id && m.round > 0)
          : freshMatches.filter((m: any) => m.round > 0);
        
        const finalMatch = modalityFreshMatches.find((m: any) => m.bracket_type === 'final');
        const isFinalCompleted = finalMatch?.status === 'completed';
        
        // Count teams for 2N-3 formula
        const allTeamIds = new Set<string>();
        modalityFreshMatches.forEach((m: any) => {
          if (m.team1_id) allTeamIds.add(m.team1_id);
          if (m.team2_id) allTeamIds.add(m.team2_id);
        });
        const totalTeams = allTeamIds.size;
        const expectedTotalMatches = (2 * totalTeams) - 3;
        const completedMatches = modalityFreshMatches.filter((m: any) => m.status === 'completed').length;

        console.log(`[DE:EndCheck] Final completed=${isFinalCompleted}, Completed=${completedMatches}/${expectedTotalMatches}`);

        if (isFinalCompleted && completedMatches >= expectedTotalMatches) {
          // All conditions met - tournament is complete
          await organizerQuery({
            table: "tournaments",
            operation: "update",
            data: { status: "completed" },
            filters: { id },
          });
          toast.success("🏆 Torneio finalizado! Campeão definido na Grande Final!");
        } else if (completedMatches < expectedTotalMatches) {
          // NOT all matches done - do NOT finalize
          console.log(`[DE:EndBlock] Finalization blocked: ${completedMatches}/${expectedTotalMatches} matches completed`);
        }
      } else {
        // Non-DE: Original logic for groups + normal knockout
        const groupMatches = freshMatches.filter((m: any) => m.round === 0);
        
        const groupBrackets = new Map<number, any[]>();
        groupMatches.forEach((m: any) => {
          const bracket = m.bracket_number || 1;
          if (!groupBrackets.has(bracket)) groupBrackets.set(bracket, []);
          groupBrackets.get(bracket)!.push(m);
        });

        const allDone = freshMatches.every((m: any) => m.status === "completed");
        if (allDone && freshMatches.some((m: any) => m.round > 0)) {
          await organizerQuery({
            table: "tournaments",
            operation: "update",
            data: { status: "completed" },
            filters: { id },
          });
        }
      }
    }

    fetchData();
    } finally {
      declareWinnerMutex.current = false;
    }
  };

  // Combined handler: save score + declare winner in one action
  const handleAutoResult = async (matchId: string, score1: number, score2: number, winnerId: string) => {
    await organizerQuery({
      table: "matches",
      operation: "update",
      data: { score1, score2 },
      filters: { id: matchId },
    });
    await declareWinner(matchId, winnerId);
  };

  const updateScore = async (matchId: string, score1: number, score2: number) => {
    await organizerQuery({
      table: "matches",
      operation: "update",
      data: { score1, score2 },
      filters: { id: matchId },
    });
  };

  const deleteTournament = async () => {
    if (!id) return;
    // Use bulk operations for speed
    const token = sessionStorage.getItem("organizer_token");
    const orgId = sessionStorage.getItem("organizer_id");
    await organizerQuery({ table: "rankings", operation: "delete", filters: { tournament_id: id } });
    if (token && orgId) {
      await supabase.functions.invoke("organizer-api", {
        body: { token, organizerId: orgId, operation: "undo_bracket", tournament_id: id },
      });
    }
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
      <main className="container py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
           <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
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
                    <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
                    {isOwner && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setNewName(tournament.name); setEditingName(true); }}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </>
                )}
                <Badge className={statusColors[tournament.status] || ""}>
                  {statusLabels[tournament.status] || tournament.status}
                </Badge>
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
            <div className="flex items-center gap-2">
              {isOwner && (
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
          </div>

          {/* Modality Tabs */}
          <ModalityTabs
            modalities={modalities}
            selectedModality={selectedModality}
            onSelect={setSelectedModality}
            isOwner={isOwner}
            onUpdateModality={updateModality}
          />

          {/* All tabs always visible */}
          <Tabs defaultValue="teams" className="w-full">
            <TabsList className="flex flex-wrap gap-2 mb-5 h-auto bg-transparent p-0 w-full">
              <TabsTrigger value="teams" className="flex-1 min-w-[80px] text-center text-sm font-medium h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Duplas</TabsTrigger>
              <TabsTrigger value="bracket" className="flex-1 min-w-[80px] text-center text-sm font-medium h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Chaveamento</TabsTrigger>
              <TabsTrigger value="sequence" className="flex-1 min-w-[80px] text-center text-sm font-medium h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Sequência</TabsTrigger>
              <TabsTrigger value="classification" className="flex-1 min-w-[80px] text-center text-sm font-medium h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Classificação</TabsTrigger>
              <TabsTrigger value="rankings" className="flex-1 min-w-[80px] text-center text-sm font-medium h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground">Ranking</TabsTrigger>
            </TabsList>

            {/* Duplas Tab */}
            <TabsContent value="teams">
              {isOwner && (
                <section className="rounded-xl border border-border bg-card p-6 shadow-card">
                  <h2 className="mb-4 text-xl font-semibold">Cadastrar Dupla</h2>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={player1}
                      onChange={(e) => setPlayer1(e.target.value)}
                      placeholder="Nome do Jogador 1"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeam())}
                    />
                    <Input
                      value={player2}
                      onChange={(e) => setPlayer2(e.target.value)}
                      placeholder="Nome do Jogador 2"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeam())}
                    />
                    <Button onClick={addTeam} size="sm" className="gap-1 shrink-0">
                      <Plus className="h-4 w-4" /> Adicionar
                    </Button>
                  </div>
                  <div className="flex gap-2 mb-4">
                    <Dialog open={fictitiousDialogOpen} onOpenChange={setFictitiousDialogOpen}>
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
                              min={1}
                              max={64}
                              value={fictitiousCount}
                              onChange={(e) => setFictitiousCount(e.target.value)}
                            />
                          </div>
                          <Button onClick={addFictitiousTeams} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
                            Criar {fictitiousCount} dupla(s)
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
                </section>
              )}

              {/* Team list always visible */}
              {filteredTeams.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">Nenhuma dupla cadastrada nesta modalidade.</p>
              ) : (
                <section className="mt-4 rounded-xl border border-border bg-card p-6 shadow-card">
                  <h2 className="mb-4 text-xl font-semibold">Duplas ({filteredTeams.length})</h2>
                  <div className="space-y-2">
                    {filteredTeams.map((t, i) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
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
                            <span className="truncate team-name">
                              {t.player1_name} / {t.player2_name}
                              {t.is_fictitious && <span className="ml-2 text-xs text-muted-foreground">(fictícia)</span>}
                            </span>
                          )}
                        </div>
                        {isOwner && editingTeamId !== t.id && (
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
              {isOwner && filteredMatches.length === 0 && filteredTeams.length >= 2 && (
                <div className="mb-4">
                  <GenerateBracketDialog
                    onGenerate={generateBracket}
                    teamCount={filteredTeams.length}
                    teams={filteredTeams}
                    isDisabled={false}
                    sport={selectedModality?.sport || tournament.sport}
                  />
                </div>
              )}

              {isOwner && filteredMatches.length > 0 && (
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
                  <Button variant="destructive" size="sm" className="gap-1" onClick={undoBracket}>
                    <Undo2 className="h-4 w-4" /> Desfazer Chaveamento
                  </Button>
                </div>
              )}

              {filteredMatches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Chaveamento
                  </h2>
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <BracketTreeView
                      matches={filteredMatches}
                      participants={participants}
                      isOwner={false}
                      onDeclareWinner={() => {}}
                      onUpdateScore={() => {}}
                      structuralOnly
                      tournamentFormat={selectedModality?.game_system || tournament?.format}
                    />
                  </Suspense>
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
              {isOwner && filteredMatches.length > 0 && (
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
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <MatchSequenceViewer
                      matches={filteredMatches}
                      teams={filteredTeams}
                      isOwner={isOwner}
                      numSets={tournament?.num_sets || 3}
                      tournamentName={tournament?.name || ""}
                      sport={sportLabels[tournament?.sport] || tournament?.sport || ""}
                      eventDate={tournament?.event_date ? new Date(tournament.event_date).toLocaleDateString("pt-BR") : undefined}
                      onUpdateScore={updateScore}
                      onDeclareWinner={declareWinner}
                      tournamentFormat={selectedModality?.game_system || tournament?.format}
                      onAutoResult={handleAutoResult}
                    />
                  </Suspense>
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
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <ClassificationTab matches={filteredMatches} teams={filteredTeams} />
                  </Suspense>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Gere o chaveamento primeiro.</p>
                </div>
              )}
            </TabsContent>

            {/* Ranking Tab */}
            <TabsContent value="rankings">
              <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                <RankingsTab
                  tournamentId={id || ""}
                  isOwner={isOwner}
                  sport={tournament.sport}
                  tournamentName={tournament.name}
                  eventDate={tournament.event_date ? new Date(tournament.event_date).toLocaleDateString("pt-BR") : undefined}
                  modalityId={selectedModality?.id || null}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
          <FlowAppsBranding variant="tournament-cta" />
        </motion.div>
      </main>
      <FlowAppsBranding variant="internal-footer" />
    </ThemedBackground>
  );
};

export default TournamentDetail;
