import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Download, FileText, Sheet, Pencil, Check, X, Zap, Users, User, Star, Heart, Award, History, ChevronDown, ChevronUp, Layers, Globe } from "lucide-react";
import { motion } from "framer-motion";

import { exportRankings } from "@/lib/exportUtils";

/** Points table based on classification position */
const getPointsForPosition = (position: number): number => {
  if (position === 1) return 20;
  if (position === 2) return 18;
  if (position === 3) return 16;
  if (position === 4) return 14;
  if (position >= 5 && position <= 8) return 10;
  if (position >= 9 && position <= 16) return 8;
  if (position >= 17 && position <= 24) return 6;
  if (position >= 25 && position <= 32) return 4;
  return 2;
};
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface RankingEntry {
  id: string;
  athlete_name: string;
  points: number;
  sport: string;
  tournament_id: string;
  created_by: string;
  entry_type: string;
  badge: string | null;
  stage_id?: string | null;
  manual_bonus?: number | null;
}


interface PointsHistoryEntry {
  id: string;
  ranking_id: string;
  athlete_name: string;
  points_added: number;
  badge: string | null;
  reason: string | null;
  created_at: string;
  stage_id: string | null;
}

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface Stage {
  id: string;
  name: string;
  stage_number: number;
  event_date: string | null;
}

interface RankingsTabProps {
  tournamentId: string;
  isOwner: boolean;
  sport: string;
  tournamentName?: string;
  eventDate?: string;
  modalityId?: string | null;
  modalityName?: string;
  stageId?: string | null;
}

const RankingsTab = ({ tournamentId, isOwner, sport, tournamentName = "", eventDate, modalityId, modalityName, stageId }: RankingsTabProps) => {
  const { user, organizerId } = useAuth();
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  // null = "Geral" (somatório de todas as etapas); string = id da etapa específica
  const [viewStageId, setViewStageId] = useState<string | null>(stageId ?? null);
  const [loading, setLoading] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [points, setPoints] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");
  const [editBadge, setEditBadge] = useState<string | null>(null);

  const isGeneralView = viewStageId === null && stages.length > 0;

  const BADGE_OPTIONS = [
    { value: "", label: "Nenhum", icon: null },
    { value: "destaque", label: "Destaque", icon: <Star className="h-4 w-4 text-amber-400" /> },
    { value: "doacao", label: "Doação de Alimentos", icon: <Heart className="h-4 w-4 text-rose-400" /> },
    { value: "mvp", label: "MVP", icon: <Award className="h-4 w-4 text-sky-400" /> },
  ];

  const getBadgeIcon = (badge: string | null) => {
    if (!badge) return null;
    if (badge === "destaque") return <Star className="h-4 w-4 text-amber-400 shrink-0" />;
    if (badge === "doacao") return <Heart className="h-4 w-4 text-rose-400 shrink-0" />;
    if (badge === "mvp") return <Award className="h-4 w-4 text-sky-400 shrink-0" />;
    return null;
  };

  const getBadgeLabel = (badge: string | null) => {
    if (!badge) return null;
    if (badge === "destaque") return "Destaque";
    if (badge === "doacao") return "Doação de Alimentos";
    if (badge === "mvp") return "MVP";
    return null;
  };
  const [viewFilter, setViewFilter] = useState<"all" | "individual" | "pair" | "male" | "female">("individual");
  const [pointsHistory, setPointsHistory] = useState<PointsHistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchRankings = async () => {
    const filters: Record<string, any> = { tournament_id: tournamentId };
    if (modalityId) filters.modality_id = modalityId;
    // Em modo Geral (viewStageId === null) buscamos TODAS as etapas
    // e agregamos no cliente. Em modo de etapa específica, filtramos.
    if (viewStageId) filters.stage_id = viewStageId;

    const { data, error } = await publicQuery<RankingEntry[]>({
      table: "rankings",
      filters,
      order: { column: "points", ascending: false },
    });

    if (error) {
      toast.error("Erro ao carregar rankings");
      return;
    }
    setRankings(data || []);
    setLoading(false);
  };

  const fetchTeams = async () => {
    const filters: Record<string, any> = { tournament_id: tournamentId };
    if (modalityId) {
      filters.modality_id = modalityId;
    }
    const { data } = await publicQuery<Team[]>({
      table: "teams",
      filters,
      order: { column: "seed", ascending: true },
    });
    if (data) setTeams(data);
  };

  const fetchStages = async () => {
    const { data } = await publicQuery<Stage[]>({
      table: "tournament_stages",
      filters: { tournament_id: tournamentId },
      order: { column: "stage_number", ascending: true },
    });
    setStages(data || []);
  };

  const fetchHistory = async () => {
    const histFilters: Record<string, any> = { tournament_id: tournamentId };
    if (modalityId) histFilters.modality_id = modalityId;
    if (viewStageId) histFilters.stage_id = viewStageId;
    const { data } = await publicQuery<PointsHistoryEntry[]>({
      table: "ranking_points_history",
      filters: histFilters,
      order: { column: "created_at", ascending: false },
    });
    setPointsHistory(data || []);
  };

  // Sync com a etapa selecionada no nível da página, sem travar o seletor interno
  useEffect(() => {
    setViewStageId(stageId ?? null);
  }, [stageId]);

  useEffect(() => {
    fetchStages();
  }, [tournamentId]);

  useEffect(() => {
    setViewFilter("individual");
    fetchRankings();
    fetchTeams();
    fetchHistory();

    const channel = supabase
      .channel(`rankings-${tournamentId}-${viewStageId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rankings", filter: `tournament_id=eq.${tournamentId}` }, () => { fetchRankings(); fetchHistory(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, modalityId, viewStageId]);

  // Build athlete options from teams (individual player names)
  const athleteOptions = useMemo(() => {
    const names = new Set<string>();
    for (const t of teams) {
      names.add(t.player1_name);
      names.add(t.player2_name);
    }
    // Also add team pair names
    for (const t of teams) {
      names.add(`${t.player1_name} / ${t.player2_name}`);
    }
    return [...names].sort();
  }, [teams]);

  // Already added athletes
  const addedAthletes = useMemo(() => new Set(rankings.map((r) => r.athlete_name)), [rankings]);

  // Filter out already-added athletes
  const availableAthletes = useMemo(
    () => athleteOptions.filter((name) => !addedAthletes.has(name)),
    [athleteOptions, addedAthletes]
  );

  const addAthletePoints = async () => {
    if (isGeneralView) {
      toast.warning("Selecione uma etapa específica para lançar pontos. O Geral é somatório.");
      return;
    }
    if (!selectedAthlete || !points || Number(points) < 0) {
      toast.error("Selecione o atleta e insira os pontos (≥ 0)");
      return;
    }

    const createdBy = organizerId || user?.id || "";
    if (!createdBy) {
      toast.error("Você precisa estar logado");
      return;
    }

    const { error } = await organizerQuery({
      table: "rankings",
      operation: "insert",
      data: {
        athlete_name: selectedAthlete,
        points: Number(points),
        manual_bonus: Number(points),
        sport: sport as "beach_volleyball" | "futevolei" | "beach_tennis",
        tournament_id: tournamentId,
        created_by: createdBy,
        entry_type: selectedAthlete.includes(" / ") ? "pair" : "individual",
        ...(modalityId ? { modality_id: modalityId } : {}),
        ...(viewStageId ? { stage_id: viewStageId } : {}),
      },
    });

    if (error) {
      toast.error(error.message || "Erro ao adicionar pontos");
      return;
    }

    toast.success("Pontos adicionados!");
    setSelectedAthlete("");
    setPoints("");
    fetchRankings();
  };

  const updatePoints = async (id: string, newPoints: number, badge: string | null) => {
    if (newPoints < 0) {
      toast.error("Pontos não podem ser negativos");
      return;
    }

    const currentRanking = rankings.find((r) => r.id === id);
    const oldPoints = currentRanking?.points || 0;
    const oldBonus = Number((currentRanking as any)?.manual_bonus ?? 0);
    const pointsDiff = newPoints - oldPoints;
    const newBonus = Math.max(0, oldBonus + pointsDiff);

    const { error } = await organizerQuery({ table: "rankings", operation: "update", data: { points: newPoints, manual_bonus: newBonus, badge: badge || null }, filters: { id } });

    if (error) {
      toast.error("Erro ao atualizar pontos");
    } else {
      // Log history entry if points changed
      if (pointsDiff !== 0 && currentRanking) {
        const createdBy = organizerId || user?.id || "";
        await organizerQuery({
          table: "ranking_points_history",
          operation: "insert",
          data: {
            ranking_id: id,
            athlete_name: currentRanking.athlete_name,
            points_added: pointsDiff,
            badge: badge || null,
            tournament_id: tournamentId,
            ...(modalityId ? { modality_id: modalityId } : {}),
            ...(viewStageId ? { stage_id: viewStageId } : {}),
            created_by: createdBy,
          },
        });
      }
      setEditingId(null);
      fetchRankings();
      fetchHistory();
    }
  };

  const deleteRanking = async (id: string) => {
    const { error } = await organizerQuery({ table: "rankings", operation: "delete", filters: { id } });

    if (error) {
      toast.error("Erro ao remover ranking");
      return;
    }
    toast.success("Ranking removido!");
    fetchRankings();
  };

  const [generating, setGenerating] = useState(false);

  /** Auto-generate ranking from classification positions */
  const generateAutoRanking = async () => {
    if (isGeneralView) {
      toast.warning("Selecione uma etapa específica para gerar o ranking. O Geral é somatório das etapas.");
      return;
    }
    const createdBy = organizerId || user?.id || "";
    if (!createdBy) {
      toast.error("Você precisa estar logado");
      return;
    }

    setGenerating(true);
    try {
      // Fetch matches for this tournament/modality (+ stage when applicable)
      const matchFilters: Record<string, any> = { tournament_id: tournamentId };
      if (modalityId) matchFilters.modality_id = modalityId;
      if (viewStageId) matchFilters.stage_id = viewStageId;

      const { data: matchesData } = await publicQuery<any[]>({
        table: "matches",
        filters: matchFilters,
        order: { column: "round", ascending: true },
      });

      if (!matchesData || matchesData.length === 0) {
        toast.error("Nenhuma partida encontrada para gerar o ranking");
        setGenerating(false);
        return;
      }

      // Build elimination ranking (same logic as ClassificationTab)
      // Inclui winners, semi_final e final na progressão principal — o gerador antigo
      // filtrava só "winners" e ignorava as partidas marcadas como semi/final, fazendo
      // com que as quartas fossem tratadas como final e premiando vários times com 20pts.
      const knockoutTypes = new Set(["winners", "semi_final", "final"]);
      const winnersMatches = matchesData.filter((m: any) => m.round >= 1 && knockoutTypes.has(m.bracket_type));
      const thirdPlaceMatches = matchesData.filter((m: any) => m.round >= 1 && m.bracket_type === "third_place");
      const groupMatches = matchesData.filter((m: any) => m.round === 0);

      if (winnersMatches.length === 0) {
        toast.error("Nenhuma fase eliminatória encontrada");
        setGenerating(false);
        return;
      }

      const maxRound = Math.max(...winnersMatches.map((m: any) => m.round));
      const ranked: { teamId: string; position: number }[] = [];
      const placedTeams = new Set<string>();

      // Final — 1st and 2nd
      const finalMatches = winnersMatches.filter((m: any) => m.round === maxRound && m.status === "completed");
      finalMatches.forEach((f: any) => {
        if (f.winner_team_id && !placedTeams.has(f.winner_team_id)) {
          ranked.push({ teamId: f.winner_team_id, position: 1 });
          placedTeams.add(f.winner_team_id);
        }
        const loserId = f.team1_id === f.winner_team_id ? f.team2_id : f.team1_id;
        if (loserId && !placedTeams.has(loserId)) {
          ranked.push({ teamId: loserId, position: 2 });
          placedTeams.add(loserId);
        }
      });

      // 3rd place match — use actual result if completed
      const completedThirdPlace = thirdPlaceMatches.filter((m: any) => m.status === "completed" && m.winner_team_id);
      if (completedThirdPlace.length > 0) {
        completedThirdPlace.forEach((m: any) => {
          if (m.winner_team_id && !placedTeams.has(m.winner_team_id)) {
            ranked.push({ teamId: m.winner_team_id, position: ranked.length + 1 });
            placedTeams.add(m.winner_team_id);
          }
          const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
          if (loserId && !placedTeams.has(loserId)) {
            ranked.push({ teamId: loserId, position: ranked.length + 1 });
            placedTeams.add(loserId);
          }
        });
      }

      // Walk backward through remaining rounds for unplaced losers
      for (let round = maxRound - 1; round >= 1; round--) {
        const roundMatches = winnersMatches.filter((m: any) => m.round === round && m.status === "completed");
        const startPos = ranked.length + 1;
        const losers: { teamId: string; pointDiff: number }[] = [];

        roundMatches.forEach((m: any) => {
          if (m.winner_team_id) {
            const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
            if (loserId && !placedTeams.has(loserId)) {
              const s1 = m.score1 ?? 0;
              const s2 = m.score2 ?? 0;
              const diff = m.team1_id === loserId ? s1 - s2 : s2 - s1;
              losers.push({ teamId: loserId, pointDiff: diff });
            }
          }
        });

        losers.sort((a, b) => b.pointDiff - a.pointDiff);
        losers.forEach((l, idx) => {
          ranked.push({ teamId: l.teamId, position: startPos + idx });
          placedTeams.add(l.teamId);
        });
      }

      // Group stage unplaced teams
      const groupTeamIds = new Set<string>();
      groupMatches.forEach((m: any) => {
        if (m.team1_id) groupTeamIds.add(m.team1_id);
        if (m.team2_id) groupTeamIds.add(m.team2_id);
      });

      const unplaced: { teamId: string; wins: number; diff: number }[] = [];
      groupTeamIds.forEach((tid) => {
        if (placedTeams.has(tid)) return;
        let wins = 0, pf = 0, pa = 0;
        groupMatches.filter((m: any) => m.status === "completed" && (m.team1_id === tid || m.team2_id === tid))
          .forEach((m: any) => {
            if (m.winner_team_id === tid) wins++;
            if (m.team1_id === tid) { pf += m.score1 ?? 0; pa += m.score2 ?? 0; }
            else { pf += m.score2 ?? 0; pa += m.score1 ?? 0; }
          });
        unplaced.push({ teamId: tid, wins, diff: pf - pa });
      });
      unplaced.sort((a, b) => b.wins - a.wins || b.diff - a.diff);
      const gStart = ranked.length + 1;
      unplaced.forEach((t, idx) => {
        ranked.push({ teamId: t.teamId, position: gStart + idx });
        placedTeams.add(t.teamId);
      });

      // ============================================================
      // VERIFICADOR AUTOMÁTICO DE INTEGRIDADE DO RANKING
      // Garante para sempre que nenhuma versão futura volte a premiar
      // perdedores de quartas como campeões, ou perdedores da disputa
      // de 3º como 3º lugar. Se detectar qualquer inconsistência,
      // ABORTA a gravação e mostra erro detalhado no toast + console.
      // ============================================================
      const violations: string[] = [];
      const posCount = new Map<number, number>();
      ranked.forEach((r) => posCount.set(r.position, (posCount.get(r.position) || 0) + 1));

      if (finalMatches.length > 0) {
        if ((posCount.get(1) || 0) !== 1) violations.push(`Esperado 1 campeão, encontrado ${posCount.get(1) || 0}`);
        if ((posCount.get(2) || 0) !== 1) violations.push(`Esperado 1 vice, encontrado ${posCount.get(2) || 0}`);
        const finalM = finalMatches[0];
        const champion = ranked.find((r) => r.position === 1)?.teamId;
        const runnerUp = ranked.find((r) => r.position === 2)?.teamId;
        if (champion && champion !== finalM.winner_team_id) {
          violations.push("Campeão (pos 1) não bate com o vencedor da final");
        }
        const expectedRunner = finalM.team1_id === finalM.winner_team_id ? finalM.team2_id : finalM.team1_id;
        if (runnerUp && expectedRunner && runnerUp !== expectedRunner) {
          violations.push("Vice (pos 2) não bate com o perdedor da final");
        }
      }

      if (completedThirdPlace.length > 0) {
        const tpm = completedThirdPlace[0];
        const third = ranked.find((r) => r.position === 3)?.teamId;
        const fourth = ranked.find((r) => r.position === 4)?.teamId;
        const expectedFourth = tpm.team1_id === tpm.winner_team_id ? tpm.team2_id : tpm.team1_id;
        if (third && tpm.winner_team_id && third !== tpm.winner_team_id) {
          violations.push("3º lugar não bate com o vencedor da disputa de 3º");
        }
        if (fourth && expectedFourth && fourth !== expectedFourth) {
          violations.push("4º lugar não bate com o perdedor da disputa de 3º");
        }
      }

      const seenTeams = new Set<string>();
      for (const r of ranked) {
        if (seenTeams.has(r.teamId)) {
          violations.push(`Time ${r.teamId} aparece em mais de uma posição`);
          break;
        }
        seenTeams.add(r.teamId);
      }

      const teamPos = new Map<string, number>();
      ranked.forEach((r) => teamPos.set(r.teamId, r.position));
      for (const m of winnersMatches) {
        if (m.status !== "completed" || !m.winner_team_id) continue;
        const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
        if (!loserId) continue;
        const wp = teamPos.get(m.winner_team_id);
        const lp = teamPos.get(loserId);
        if (wp != null && lp != null && wp > lp) {
          violations.push(`Vencedor está em posição pior (${wp}) que o perdedor (${lp}) — partida ${m.id}`);
          break;
        }
      }

      if (violations.length > 0) {
        console.error("[RANKING VALIDATOR] Inconsistências detectadas:", violations);
        toast.error(
          `Ranking bloqueado pelo verificador: ${violations[0]}${violations.length > 1 ? ` (+${violations.length - 1} outras)` : ""}`,
          { duration: 8000 }
        );
        setGenerating(false);
        return;
      }

      // Snapshot dos pontos manuais e badges atuais ANTES de apagar — preserva bônus/destaques.
      const snapFilters: Record<string, any> = { tournament_id: tournamentId };
      if (modalityId) snapFilters.modality_id = modalityId;
      if (viewStageId) snapFilters.stage_id = viewStageId;

      const { data: existingRankings } = await publicQuery<any[]>({
        table: "rankings",
        filters: snapFilters,
      });

      // Em modo "sem etapa" (viewStageId null), apaga apenas linhas com stage_id NULL
      const scoped = viewStageId
        ? (existingRankings || [])
        : (existingRankings || []).filter((r: any) => !r.stage_id);

      // Mapa: chave (entry_type::athlete_name) → { manual_bonus, badge }
      const manualMap = new Map<string, { manual_bonus: number; badge: string | null }>();
      for (const r of scoped) {
        const key = `${r.entry_type}::${r.athlete_name}`;
        manualMap.set(key, {
          manual_bonus: Number(r.manual_bonus ?? 0),
          badge: r.badge ?? null,
        });
      }

      // Apaga as linhas da etapa para recriar com pontos automáticos atualizados
      for (const r of scoped) {
        await organizerQuery({ table: "rankings", operation: "delete", filters: { id: r.id } });
      }

      // Build team map
      const teamMap = new Map<string, Team>();
      teams.forEach((t) => teamMap.set(t.id, t));

      // Marca quais chaves já receberão linha automática (para não duplicar manuais soltos)
      const insertedKeys = new Set<string>();

      // Insert individual player rankings
      let inserted = 0;
      for (const entry of ranked) {
        const team = teamMap.get(entry.teamId);
        if (!team) continue;
        const pts = getPointsForPosition(entry.position);

        // Insert for each player AND for the pair
        const isMisto = modalityName?.toLowerCase().includes("misto");
        
        // For Misto: detect gender independently for each player using comprehensive dictionaries.
        const MALE_NAMES = new Set<string>([
          "simeão","simeao","davi","guilherme","kairã","kaira","silmar","timóteo","timoteo","pietro","edu","eduardo","juliano","vitor","victor","lucas","renan","joão","joao","luis","luiz","oswaldo","osvaldo","felipe","fernando","gilberto","junior","júnior","leonardo","rogério","rogerio","wallace","pedro","nilmar","charles","ian","rafael","dilamar","vinicius","vinícius","daniel","anderson","tayson","gabriel","allyson","mário","mario","márcio","marcio","eydrian","halan","carlos","dirceu","arthur","artur","tiago","thiago","ricardo","roberto","marcos","marcelo","bruno","matheus","mateus","gustavo","henrique","rodrigo","diego","alexandre","andré","andre","antonio","antônio","paulo","jorge","leandro","tarcísio","tarcisio","douglas","everton","cesar","césar","fábio","fabio","alex","alan","adriano","cristiano","emanuel","alexandre","jonas","jonathan","jefferson","kleber","márcio","murilo","nathan","nicolas","otávio","otavio","raul","renato","samuel","sérgio","sergio","valter","walter"
        ]);
        const FEMALE_NAMES = new Set<string>([
          "claudia","cláudia","stefany","elisandra","raquel","veronilce","aline","laura","carina","camila","samira","tauane","andreia","andréia","paola","ane","dejanira","joana","luana","thaís","thais","helena","sabrina","bianca","josieli","sheila","scheila","ana","michele","kethelin","isadora","eduarda","taicline","juliana","rafaela","julia","júlia","deisi","vitória","vitoria","veronica","verônica","andressa","natália","natalia","helen","adriane","barbara","bárbara","danielly","francieli","gabrielle","gabrielly","jaqueline","jessica","jéssica","keyla","lillian","luiza","manoella","maria","mariana","nicole","nicoly","olga","patrícia","patricia","roshane","vanessa","amanda","ana","aparecida","beatriz","bruna","carla","carolina","catarina","cecília","cecilia","cíntia","cintia","clara","cristina","daniela","débora","debora","edna","eliane","elaine","elisa","eloá","eloa","emanuela","fabiana","fátima","fatima","fernanda","flávia","flavia","gabriela","geovana","giovana","giulia","graziela","heloísa","heloisa","inês","ines","ingrid","irene","jacqueline","janaína","janaina","kelly","larissa","letícia","leticia","lívia","livia","lorena","lucia","lúcia","luciana","luiza","mara","marcela","márcia","marcia","margarida","mariane","marília","marilia","marina","marlene","marta","melissa","michelle","milena","mônica","monica","monique","nádia","nadia","natasha","nayara","nina","núbia","nubia","olívia","olivia","patrícia","paula","priscila","rafaela","raissa","rebeca","regina","renata","roberta","rosa","rosana","sandra","silvia","sílvia","simone","sonia","sônia","sueli","suzana","tainá","taina","tamires","tatiane","teresa","valentina","valéria","valeria","vânia","vania","verônica","viviane","yara","yasmin"
        ]);

        const normalize = (s: string) =>
          s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

        const detectGenderRaw = (name: string): "male" | "female" | "unknown" => {
          const first = name.trim().split(/\s+/)[0];
          if (!first) return "unknown";
          const lower = first.toLowerCase();
          const noAccent = normalize(first);
          if (MALE_NAMES.has(lower) || MALE_NAMES.has(noAccent)) return "male";
          if (FEMALE_NAMES.has(lower) || FEMALE_NAMES.has(noAccent)) return "female";
          // Last-resort heuristic: ends in 'a' / 'ã' → likely female; ends in 'o'/consonant → likely male.
          if (/[aã]$/i.test(first)) return "female";
          if (/[ozrlnms]$/i.test(first)) return "male";
          return "unknown";
        };

        let p1Gender: any = "individual";
        let p2Gender: any = "individual";
        if (isMisto) {
          const g1 = detectGenderRaw(team.player1_name);
          const g2 = detectGenderRaw(team.player2_name);
          if (g1 !== "unknown" && g2 !== "unknown" && g1 !== g2) {
            p1Gender = g1; p2Gender = g2;
          } else if (g1 !== "unknown") {
            p1Gender = g1; p2Gender = g1 === "male" ? "female" : "male";
          } else if (g2 !== "unknown") {
            p2Gender = g2; p1Gender = g2 === "male" ? "female" : "male";
          } else {
            // Não foi possível detectar — não atribui categoria errada; deixa como dupla apenas.
            p1Gender = null; p2Gender = null;
          }
        }


        const entries = [
          { name: team.player1_name, type: isMisto ? p1Gender : "individual" },
          { name: team.player2_name, type: isMisto ? p2Gender : "individual" },
          { name: `${team.player1_name} / ${team.player2_name}`, type: "pair" },
        ];
        for (const e of entries) {
          const key = `${e.type}::${e.name}`;
          const manual = manualMap.get(key);
          let bonus = manual?.manual_bonus ?? 0;
          let badge = manual?.badge ?? null;

          // Regra: DUPLA só herda destaque/bônus se AMBOS os atletas tiverem o mesmo destaque individual.
          if (e.type === "pair") {
            const t1 = isMisto ? p1Gender : "individual";
            const t2 = isMisto ? p2Gender : "individual";
            const m1 = manualMap.get(`${t1}::${team.player1_name}`);
            const m2 = manualMap.get(`${t2}::${team.player2_name}`);
            const b1 = m1?.badge ?? null;
            const b2 = m2?.badge ?? null;
            if (b1 && b1 === b2) {
              badge = b1;
              bonus = Math.min(Number(m1?.manual_bonus ?? 0), Number(m2?.manual_bonus ?? 0));
            } else {
              badge = null;
              bonus = 0;
            }
          }

          insertedKeys.add(key);

          await organizerQuery({
            table: "rankings",
            operation: "insert",
            data: {
              athlete_name: e.name,
              points: pts + bonus,
              manual_bonus: bonus,
              badge,
              sport: sport as any,
              tournament_id: tournamentId,
              created_by: createdBy,
              entry_type: e.type,
              ...(modalityId ? { modality_id: modalityId } : {}),
              ...(viewStageId ? { stage_id: viewStageId } : {}),
            },
          });
          inserted++;
        }
      }

      // Recria linhas dos atletas que tinham bônus/badge manual mas não apareceram no ranking automático
      for (const [key, manual] of manualMap.entries()) {
        if (insertedKeys.has(key)) continue;
        if (manual.manual_bonus <= 0 && !manual.badge) continue;
        const sepIdx = key.indexOf("::");
        const entry_type = key.slice(0, sepIdx);
        const athlete_name = key.slice(sepIdx + 2);
        await organizerQuery({
          table: "rankings",
          operation: "insert",
          data: {
            athlete_name,
            points: manual.manual_bonus,
            manual_bonus: manual.manual_bonus,
            badge: manual.badge,
            sport: sport as any,
            tournament_id: tournamentId,
            created_by: createdBy,
            entry_type,
            ...(modalityId ? { modality_id: modalityId } : {}),
            ...(viewStageId ? { stage_id: viewStageId } : {}),
          },
        });
        inserted++;
      }

      toast.success(`Ranking gerado! ${inserted} entradas (bônus e destaques preservados).`);
      fetchRankings();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar ranking");
    } finally {
      setGenerating(false);
    }
  };

  const isMisto = modalityName?.toLowerCase().includes("misto");

  // Em modo Geral: agrega por athlete_name (+ entry_type) somando pontos das etapas.
  // Mantém estrutura visual igual a um RankingEntry.
  const displayRankings = useMemo<(RankingEntry & { stageIds?: string[] })[]>(() => {
    if (!isGeneralView) return rankings;
    // Normaliza entry_type para agregação: male/female/individual contam como "single"
    // (etapas diferentes podem ter classificado a mesma pessoa com tipos distintos).
    const bucket = (t: string) => (t === "pair" ? "pair" : "single");
    const map = new Map<string, RankingEntry & { stageIds: string[]; _stageSet: Set<string> }>();
    for (const r of rankings) {
      const key = `${bucket(r.entry_type)}::${r.athlete_name.trim().toLowerCase()}`;
      const prev = map.get(key);
      if (prev) {
        prev.points += r.points;
        prev.manual_bonus = Number(prev.manual_bonus ?? 0) + Number(r.manual_bonus ?? 0);
        if (!prev.badge && r.badge) prev.badge = r.badge;
        if (r.stage_id) prev._stageSet.add(r.stage_id);
      } else {
        const set = new Set<string>();
        if (r.stage_id) set.add(r.stage_id);
        map.set(key, { ...r, id: `agg-${key}`, manual_bonus: Number(r.manual_bonus ?? 0), _stageSet: set, stageIds: [] });
      }
    }
    return Array.from(map.values()).map((r) => ({ ...r, stageIds: Array.from(r._stageSet) }));
  }, [rankings, isGeneralView]);

  // Mapa: nome do atleta → id do time (para agrupar parceiros)
  const teamKeyByAthlete = useMemo(() => {
    const m = new Map<string, string>();
    teams.forEach((t) => {
      m.set(t.player1_name, t.id);
      m.set(t.player2_name, t.id);
    });
    return m;
  }, [teams]);

  const sortedRankings = useMemo(() => {
    let filtered = [...displayRankings];
    if (viewFilter === "individual") {
      filtered = filtered.filter((r) => r.entry_type !== "pair");
    } else if (viewFilter === "pair") {
      filtered = filtered.filter((r) => r.entry_type === "pair");
    } else if (viewFilter === "male") {
      filtered = filtered.filter((r) => r.entry_type === "male");
    } else if (viewFilter === "female") {
      filtered = filtered.filter((r) => r.entry_type === "female");
    }
    const sorted = filtered.sort((a, b) => {
      // 1) pontos decrescente — se houver bônus, separa naturalmente
      if (b.points !== a.points) return b.points - a.points;
      // 2) com pontos iguais, mantém parceiros do mesmo time juntos
      const ka = teamKeyByAthlete.get(a.athlete_name) ?? `~${a.athlete_name}`;
      const kb = teamKeyByAthlete.get(b.athlete_name) ?? `~${b.athlete_name}`;
      if (ka !== kb) return ka.localeCompare(kb);
      // 3) dentro do mesmo time, ordem alfabética estável
      return a.athlete_name.localeCompare(b.athlete_name);
    });

    // 4) Reagrupamento: se um atleta com bônus foi separado do parceiro,
    //    mas o parceiro está empatado com outros logo abaixo, puxa o parceiro
    //    para ficar imediatamente ao lado (não rebaixa ninguém — apenas
    //    move dentro do bloco de empate).
    const result = [...sorted];
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const tk = teamKeyByAthlete.get(cur.athlete_name);
      if (!tk) continue;
      // já está colado no parceiro?
      const nextIsPartner = i + 1 < result.length && teamKeyByAthlete.get(result[i + 1].athlete_name) === tk && result[i + 1].id !== cur.id;
      if (nextIsPartner) continue;
      // procura parceiro abaixo dentro do mesmo entry_type
      let partnerIdx = -1;
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].entry_type !== cur.entry_type) continue;
        if (result[j].id === cur.id) continue;
        if (teamKeyByAthlete.get(result[j].athlete_name) === tk) {
          partnerIdx = j;
          break;
        }
      }
      if (partnerIdx === -1) continue;
      const partner = result[partnerIdx];
      // só pode subir até a posição i+1 se todos entre (i+1..partnerIdx-1)
      // tiverem pontos == partner.points (bloco de empate contínuo do parceiro)
      let canMove = true;
      for (let k = i + 1; k < partnerIdx; k++) {
        if (result[k].entry_type !== partner.entry_type) continue;
        if (result[k].points !== partner.points) { canMove = false; break; }
      }
      if (!canMove) continue;
      result.splice(partnerIdx, 1);
      result.splice(i + 1, 0, partner);
    }
    return result;
  }, [displayRankings, viewFilter, teamKeyByAthlete]);



  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stages.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-4 shadow-card"
        >
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">Ranking por Etapa</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={viewStageId === null ? "default" : "outline"}
              onClick={() => setViewStageId(null)}
              className="h-8 text-xs rounded-lg gap-1.5"
            >
              <Globe className="h-3.5 w-3.5" /> Geral
            </Button>
            <Button
              size="sm"
              variant={viewStageId === "__none__" ? "default" : "outline"}
              onClick={() => setViewStageId(null)}
              className="hidden"
            />
            {stages.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={viewStageId === s.id ? "default" : "outline"}
                onClick={() => setViewStageId(s.id)}
                className="h-8 text-xs rounded-lg"
              >
                {s.name}
              </Button>
            ))}
          </div>
          {isGeneralView && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Visualização consolidada: soma dos pontos de todas as etapas. Para lançar ou editar, selecione uma etapa.
            </p>
          )}
        </motion.section>
      )}

      {isOwner && !isGeneralView && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-6 shadow-card"
        >
          <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Atribuir Pontos
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione o atleta/dupla" />
              </SelectTrigger>
              <SelectContent>
                {availableAthletes.length === 0 ? (
                  <SelectItem value="__none" disabled>Todos os atletas já foram adicionados</SelectItem>
                ) : (
                  availableAthletes.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Pontos"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              min="0"
              onKeyDown={(e) => e.key === "Enter" && addAthletePoints()}
              className="w-24"
            />
            <Button onClick={addAthletePoints} className="gap-1 shrink-0">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <Button
              onClick={generateAutoRanking}
              disabled={generating}
              variant="outline"
              className="w-full gap-2"
            >
              <Zap className="h-4 w-4" />
              {generating ? "Gerando..." : "Gerar Ranking Automático pela Classificação"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              1º=20pts · 2º=18pts · 3º=16pts · 4º=14pts · 5º–8º=10pts · 9º–16º=8pts · 17º–24º=6pts · 25º–32º=4pts
            </p>
          </div>
        </motion.section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border bg-card p-6 shadow-card"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {isGeneralView ? "Ranking Geral" : (stages.find((s) => s.id === viewStageId)?.name ? `Ranking — ${stages.find((s) => s.id === viewStageId)?.name}` : "Classificação Geral")}{modalityName ? ` · ${modalityName}` : ""}
          </h2>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1 bg-secondary/30">
            {isMisto ? (
              <>
                <Button
                  size="sm"
                  variant={viewFilter === "male" ? "default" : "ghost"}
                  onClick={() => setViewFilter("male")}
                  className="h-8 text-xs px-4 gap-1.5 rounded-md"
                >
                  <User className="h-3.5 w-3.5" /> Masculino
                </Button>
                <Button
                  size="sm"
                  variant={viewFilter === "female" ? "default" : "ghost"}
                  onClick={() => setViewFilter("female")}
                  className="h-8 text-xs px-4 gap-1.5 rounded-md"
                >
                  <User className="h-3.5 w-3.5" /> Feminino
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={viewFilter === "individual" ? "default" : "ghost"}
                onClick={() => setViewFilter("individual")}
                className="h-8 text-xs px-4 gap-1.5 rounded-md"
              >
                <User className="h-3.5 w-3.5" /> Individual
              </Button>
            )}
            <Button
              size="sm"
              variant={viewFilter === "pair" ? "default" : "ghost"}
              onClick={() => setViewFilter("pair")}
              className="h-8 text-xs px-4 gap-1.5 rounded-md"
            >
              <Users className="h-3.5 w-3.5" /> Dupla
            </Button>
          </div>
        </div>

        {/* Removed "Todos" split view - now using Individual/Dupla filters only */}

        {sortedRankings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum atleta no ranking ainda.
          </p>
        ) : (
          <>
            <div className="flex justify-end mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Download className="h-4 w-4" /> Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(() => {
                    const stageName = viewStageId
                      ? stages.find((s) => s.id === viewStageId)?.name
                      : (stages.length > 0 ? "Geral (todas as etapas)" : undefined);
                    const buildRows = () => sortedRankings.map((r, i) => ({
                      position: i + 1,
                      athlete_name: r.athlete_name,
                      points: r.points,
                      badge: r.badge,
                      category: r.entry_type,
                    }));
                    const meta = { tournamentName, sport, date: eventDate, stageName, modalityName };
                    return (
                      <>
                        <DropdownMenuItem onClick={() => exportRankings("pdf", buildRows(), meta)}>
                          <FileText className="h-4 w-4 mr-2" /> PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportRankings("xlsx", buildRows(), meta)}>
                          <Sheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportRankings("csv", buildRows(), meta)}>
                          <FileText className="h-4 w-4 mr-2" /> CSV
                        </DropdownMenuItem>
                      </>
                    );
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-2">
              {sortedRankings.map((ranking, idx) => (
                <motion.div
                  key={ranking.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                  className="rounded-xl border border-border bg-secondary/50 px-4 py-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-black leading-snug break-words" style={{ color: '#F5F7FA', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                          {ranking.athlete_name}
                        </p>
                        {getBadgeIcon(ranking.badge)}
                        {Number(ranking.manual_bonus ?? 0) > 0 && (
                          <span
                            title={`Pontos extras adicionados: +${ranking.manual_bonus}`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                          >
                            <Zap className="h-3 w-3" />
                            +{ranking.manual_bonus}
                          </span>
                        )}
                        {isGeneralView && (ranking as any).stageIds?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {((ranking as any).stageIds as string[])
                              .map((sid) => stages.find((s) => s.id === sid))
                              .filter(Boolean)
                              .sort((a: any, b: any) => a.stage_number - b.stage_number)
                              .map((s: any) => (
                                <span
                                  key={s.id}
                                  title={`Pontuou em ${s.name}`}
                                  className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 border border-primary/40 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                                >
                                  <Layers className="h-3 w-3" />
                                  {s.name}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      {ranking.badge && (
                        <span className="text-[10px] text-muted-foreground">{getBadgeLabel(ranking.badge)}</span>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <Badge variant="secondary" className="text-xs font-bold tabular-nums whitespace-nowrap">
                          {ranking.points} pts
                        </Badge>

                        {isOwner && !isGeneralView ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(ranking.id); setEditPoints(String(ranking.points)); setEditBadge(ranking.badge || null); }} className="h-7 w-7 p-0">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteRanking(ranking.id)} className="h-7 w-7 p-0">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      {/* History toggle */}
                      {(() => {
                        const athleteHistory = isGeneralView
                          ? pointsHistory.filter((h) => h.athlete_name === ranking.athlete_name)
                          : pointsHistory.filter((h) => h.ranking_id === ranking.id);
                        if (athleteHistory.length === 0) return null;

                        const isExpanded = expandedHistoryId === ranking.id;
                        return (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpandedHistoryId(isExpanded ? null : ranking.id)}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <History className="h-3 w-3" />
                              Histórico ({athleteHistory.length})
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {isExpanded && (
                              <div className="mt-1.5 space-y-1 pl-1 border-l-2 border-border ml-1">
                                {athleteHistory.map((h) => (
                                  <div key={h.id} className="flex items-center gap-2 text-[11px] py-0.5 pl-2">
                                    {getBadgeIcon(h.badge)}
                                    <span className={h.points_added >= 0 ? "text-emerald-400 font-bold" : "text-destructive font-bold"}>
                                      {h.points_added >= 0 ? `+${h.points_added}` : h.points_added} pts
                                    </span>
                                    {h.badge && (
                                      <span className="text-muted-foreground">
                                        — {getBadgeLabel(h.badge)}
                                      </span>
                                    )}
                                    {!h.badge && (
                                      <span className="text-muted-foreground">— Classificação</span>
                                    )}
                                    <span className="text-muted-foreground/60 ml-auto text-[10px]">
                                      {new Date(h.created_at).toLocaleDateString("pt-BR")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.section>

      {/* Modal de edição de pontuação/badge */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar pontuação</DialogTitle>
            <DialogDescription>
              {(() => {
                const r = rankings.find((x) => x.id === editingId);
                return r ? r.athlete_name : "";
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-points">Pontos</Label>
              <Input
                id="edit-points"
                type="number"
                inputMode="numeric"
                value={editPoints}
                onChange={(e) => setEditPoints(e.target.value)}
                min="0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editingId) {
                    updatePoints(editingId, Number(editPoints) || 0, editBadge);
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Destaque (opcional)</Label>
              <Select value={editBadge || "__none"} onValueChange={(v) => setEditBadge(v === "__none" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um ícone" />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value || "__none"}>
                      <span className="flex items-center gap-2">
                        {opt.icon} {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editingId && updatePoints(editingId, Number(editPoints) || 0, editBadge)}
              className="bg-gradient-primary"
            >
              <Check className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default RankingsTab;
