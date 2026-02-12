import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Play, Trophy, Users } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BracketView from "@/components/BracketView";

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  status: string;
  format: string;
  max_participants: number;
  created_by: string;
}

interface Participant {
  id: string;
  name: string;
  seed: number | null;
  tournament_id: string;
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
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

const TournamentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  const [loading, setLoading] = useState(true);

  const isOwner = tournament?.created_by === user?.id;

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [tRes, pRes, mRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("participants").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("position"),
    ]);
    if (tRes.data) setTournament(tRes.data);
    if (pRes.data) setParticipants(pRes.data);
    if (mRes.data) setMatches(mRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime match updates
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`matches-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  const addParticipant = async () => {
    if (!newParticipant.trim() || !id) return;
    if (participants.length >= (tournament?.max_participants || 0)) {
      toast.error("Maximum participants reached");
      return;
    }
    const { error } = await supabase.from("participants").insert({
      tournament_id: id,
      name: newParticipant.trim(),
      seed: participants.length + 1,
    });
    if (error) { toast.error(error.message); return; }
    setNewParticipant("");
    fetchData();
  };

  const removeParticipant = async (pid: string) => {
    await supabase.from("participants").delete().eq("id", pid);
    fetchData();
  };

  const generateBracket = async () => {
    if (!id || !tournament) return;
    const count = participants.length;
    if (count < 2) { toast.error("Need at least 2 participants"); return; }

    // Delete existing matches
    await supabase.from("matches").delete().eq("tournament_id", id);

    // Calculate rounds needed
    const totalSlots = Math.pow(2, Math.ceil(Math.log2(count)));
    const rounds = Math.ceil(Math.log2(totalSlots));

    // Seed participants into first round
    const seeded = [...participants].sort((a, b) => (a.seed || 0) - (b.seed || 0));
    const matchesPerRound1 = totalSlots / 2;

    const newMatches: { tournament_id: string; round: number; position: number; participant1_id: string | null; participant2_id: string | null; status: "pending" | "in_progress" | "completed" }[] = [];

    // First round
    for (let i = 0; i < matchesPerRound1; i++) {
      const p1 = seeded[i] || null;
      const p2 = seeded[totalSlots - 1 - i] || null;
      newMatches.push({
        tournament_id: id,
        round: 1,
        position: i + 1,
        participant1_id: p1?.id || null,
        participant2_id: p2?.id || null,
        status: "pending" as const,
      });
    }

    // Subsequent rounds (empty)
    for (let r = 2; r <= rounds; r++) {
      const matchCount = totalSlots / Math.pow(2, r);
      for (let p = 0; p < matchCount; p++) {
        newMatches.push({
          tournament_id: id,
          round: r,
          position: p + 1,
          participant1_id: null,
          participant2_id: null,
          status: "pending" as const,
        });
      }
    }

    const { error } = await supabase.from("matches").insert(newMatches);
    if (error) { toast.error(error.message); return; }

    // Auto-advance byes in first round
    const firstRoundByes = newMatches.filter(
      (m) => m.round === 1 && ((m.participant1_id && !m.participant2_id) || (!m.participant1_id && m.participant2_id))
    );

    // Update tournament status
    await supabase.from("tournaments").update({ status: "in_progress" as const }).eq("id", id);

    toast.success("Bracket generated!");
    fetchData();
  };

  const updateScore = async (matchId: string, score1: number, score2: number) => {
    await supabase.from("matches").update({ score1, score2 }).eq("id", matchId);
  };

  const declareWinner = async (matchId: string, winnerId: string) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match || !id) return;

    await supabase.from("matches").update({ winner_id: winnerId, status: "completed" as const }).eq("id", matchId);

    // Advance winner to next round
    const nextRound = match.round + 1;
    const nextPosition = Math.ceil(match.position / 2);
    const isTop = match.position % 2 === 1;

    const nextMatch = matches.find((m) => m.round === nextRound && m.position === nextPosition);
    if (nextMatch) {
      const update = isTop ? { participant1_id: winnerId } : { participant2_id: winnerId };
      await supabase.from("matches").update(update).eq("id", nextMatch.id);
    } else {
      // This was the final - tournament complete
      await supabase.from("tournaments").update({ status: "completed" as const }).eq("id", id);
      toast.success("Tournament complete! 🏆");
    }

    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Tournament not found.</p>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mt-4">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
                <Badge className={statusColors[tournament.status] || ""}>
                  {tournament.status.replace("_", " ")}
                </Badge>
              </div>
              {tournament.description && (
                <p className="mt-2 text-muted-foreground">{tournament.description}</p>
              )}
              <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {participants.length} / {tournament.max_participants} players
                </span>
                <span>Single Elimination</span>
              </div>
            </div>
            {isOwner && tournament.status === "draft" && participants.length >= 2 && (
              <Button onClick={generateBracket} className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90">
                <Play className="h-4 w-4" />
                Generate Bracket
              </Button>
            )}
          </div>

          {/* Participants section (visible in draft/registration) */}
          {isOwner && (tournament.status === "draft" || tournament.status === "registration") && (
            <section className="mb-8 rounded-xl border border-border bg-card p-6 shadow-card">
              <h2 className="mb-4 text-xl font-semibold">Participants</h2>
              <div className="mb-4 flex gap-2">
                <Input
                  value={newParticipant}
                  onChange={(e) => setNewParticipant(e.target.value)}
                  placeholder="Participant name"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())}
                />
                <Button onClick={addParticipant} size="sm" className="gap-1 shrink-0">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              {participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No participants yet. Add players above.</p>
              ) : (
                <div className="space-y-2">
                  {participants.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="font-medium">{p.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeParticipant(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Bracket */}
          {matches.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-semibold">Bracket</h2>
              <BracketView
                matches={matches}
                participants={participants}
                isOwner={isOwner}
                onDeclareWinner={declareWinner}
                onUpdateScore={updateScore}
              />
            </section>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default TournamentDetail;
