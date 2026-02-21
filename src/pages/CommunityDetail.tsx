import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Trophy, Swords, Camera, ArrowLeft, UserPlus, Settings, Medal, Check, X, Clock, ChevronRight } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";

const sportLabels: Record<string, string> = {
  beach_tennis: "Beach Tennis", beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei", tennis: "Tênis", padel: "Padel", futsal: "Futsal",
};

interface Member {
  id: string; community_id: string; user_id: string; athlete_name: string;
  cpf: string | null; phone: string | null; photo_url: string | null;
  points: number; position: number; wins: number; losses: number;
}

interface Community {
  id: string; name: string; sport: string; challenge_range: number;
  scoring_mode: string; created_by: string;
}

interface Challenge {
  id: string; community_id: string; challenger_id: string; challenged_id: string;
  status: string; score_data: any; sets_won_challenger: number; sets_won_challenged: number;
  submitted_by: string | null; confirmed_by: string | null; winner_member_id: string | null;
  created_at: string; challenger: Member; challenged: Member;
}

const CommunityDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [user, setUser] = useState<any>(null);
  const [myMember, setMyMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"ranking" | "challenges" | "config">("ranking");

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [newAthleteCpf, setNewAthleteCpf] = useState("");
  const [newAthletePhone, setNewAthletePhone] = useState("");

  // Challenge dialog
  const [challengeTarget, setChallengeTarget] = useState<Member | null>(null);

  // Score dialog
  const [scoreChallenge, setScoreChallenge] = useState<Challenge | null>(null);
  const [sets, setSets] = useState([{ s1: "", s2: "" }, { s1: "", s2: "" }, { s1: "", s2: "" }]);

  // Config
  const [editRange, setEditRange] = useState("");
  const [editMode, setEditMode] = useState("");

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  useEffect(() => {
    if (user && members.length > 0) {
      const me = members.find(m => m.user_id === user.id);
      setMyMember(me || null);
    }
  }, [user, members]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("challenge-api", {
      body: { action: "get_community", community_id: id },
    });
    if (data && !data.error) {
      setCommunity(data.community);
      setMembers(data.members || []);
      setEditRange(String(data.community.challenge_range));
      setEditMode(data.community.scoring_mode);
    }

    const { data: chData } = await supabase.functions.invoke("challenge-api", {
      body: { action: "list_challenges", community_id: id },
    });
    if (chData && !chData.error) setChallenges(chData);
    setLoading(false);
  };

  const isOwner = user && community && community.created_by === user.id;

  const handleAddMember = async () => {
    if (!newAthleteName.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const { data, error } = await supabase.functions.invoke("challenge-api", {
      body: { action: "add_member", community_id: id, athlete_name: newAthleteName, cpf: newAthleteCpf || null, phone: newAthletePhone || null },
    });
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); return; }
    toast({ title: "Atleta adicionado!" });
    setShowAddMember(false);
    setNewAthleteName(""); setNewAthleteCpf(""); setNewAthletePhone("");
    loadData();
  };

  const handleChallenge = async (target: Member) => {
    if (!myMember) { toast({ title: "Você precisa estar na comunidade", variant: "destructive" }); return; }
    const { data } = await supabase.functions.invoke("challenge-api", {
      body: { action: "create_challenge", community_id: id, challenger_id: myMember.id, challenged_id: target.id },
    });
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); return; }
    toast({ title: "Desafio enviado!" });
    setChallengeTarget(null);
    loadData();
  };

  const handleRespondChallenge = async (challengeId: string, accept: boolean) => {
    const { data } = await supabase.functions.invoke("challenge-api", {
      body: { action: "respond_challenge", challenge_id: challengeId, accept },
    });
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); return; }
    toast({ title: accept ? "Desafio aceito!" : "Desafio recusado" });
    loadData();
  };

  const handleSubmitScore = async () => {
    if (!scoreChallenge) return;
    const validSets = sets.filter(s => s.s1 !== "" && s.s2 !== "");
    if (validSets.length === 0) { toast({ title: "Preencha pelo menos um set", variant: "destructive" }); return; }
    const setsWon1 = validSets.filter(s => parseInt(s.s1) > parseInt(s.s2)).length;
    const setsWon2 = validSets.filter(s => parseInt(s.s2) > parseInt(s.s1)).length;
    if (setsWon1 === setsWon2) { toast({ title: "Empate em sets não é permitido", variant: "destructive" }); return; }

    const { data } = await supabase.functions.invoke("challenge-api", {
      body: {
        action: "submit_score", challenge_id: scoreChallenge.id,
        score_data: validSets, sets_won_challenger: setsWon1, sets_won_challenged: setsWon2,
      },
    });
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); return; }
    toast({ title: data.status === "confirmed" ? "Placar confirmado!" : "Placar enviado! Aguarde confirmação." });
    setScoreChallenge(null);
    setSets([{ s1: "", s2: "" }, { s1: "", s2: "" }, { s1: "", s2: "" }]);
    loadData();
  };

  const handleSaveConfig = async () => {
    const { data } = await supabase.functions.invoke("challenge-api", {
      body: { action: "update_community", community_id: id, challenge_range: parseInt(editRange), scoring_mode: editMode },
    });
    if (data?.error) { toast({ title: "Erro", description: data.error, variant: "destructive" }); return; }
    toast({ title: "Configurações salvas!" });
    loadData();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !myMember) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("athlete-photos").upload(path, file);
    if (uploadError) { toast({ title: "Erro no upload", variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("athlete-photos").getPublicUrl(path);
    await supabase.functions.invoke("challenge-api", {
      body: { action: "update_member_photo", member_id: myMember.id, photo_url: urlData.publicUrl },
    });
    toast({ title: "Foto atualizada!" });
    loadData();
  };

  const canChallenge = (target: Member) => {
    if (!myMember || !community || myMember.id === target.id) return false;
    return Math.abs(myMember.position - target.position) <= community.challenge_range;
  };

  const statusLabel: Record<string, string> = {
    pending: "Pendente", accepted: "Aceito", score_submitted: "Aguardando Confirmação",
    confirmed: "Finalizado", cancelled: "Cancelado",
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220_25%_4%)]">
      <p className="text-muted-foreground">Carregando...</p>
    </div>
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />

      <header className="sticky top-0 z-50 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.9)] backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/comunidades" className="flex items-center gap-2">
            <ArrowLeft className="h-5 w-5 text-foreground" />
            <span className="font-bold text-foreground truncate max-w-[200px]">{community?.name}</span>
          </Link>
          {myMember && (
            <button onClick={() => fileInputRef.current?.click()} className="relative">
              <Avatar className="h-8 w-8 border border-amber-500/30">
                <AvatarImage src={myMember.photo_url || undefined} />
                <AvatarFallback className="bg-amber-500/20 text-amber-400 text-xs">{myMember.athlete_name[0]}</AvatarFallback>
              </Avatar>
              <Camera className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-400" />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="sticky top-14 z-40 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.85)] backdrop-blur-md">
        <div className="container flex gap-0 px-4">
          {(["ranking", "challenges", ...(isOwner ? ["config"] as const : [])] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${tab === t ? "border-amber-400 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t === "ranking" ? "Ranking" : t === "challenges" ? "Desafios" : "Config"}
            </button>
          ))}
        </div>
      </div>

      <main className="relative z-10 container max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* ─── RANKING TAB ─── */}
        {tab === "ranking" && (
          <>
            {isOwner && (
              <Button size="sm" onClick={() => setShowAddMember(!showAddMember)} className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                <UserPlus className="h-4 w-4 mr-1" /> Adicionar Atleta
              </Button>
            )}

            {showAddMember && (
              <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)]">
                <CardContent className="p-4 space-y-3">
                  <Input value={newAthleteName} onChange={(e) => setNewAthleteName(e.target.value)} placeholder="Nome completo" className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={newAthleteCpf} onChange={(e) => setNewAthleteCpf(e.target.value)} placeholder="CPF" className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                    <Input value={newAthletePhone} onChange={(e) => setNewAthletePhone(e.target.value)} placeholder="Telefone" className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                  </div>
                  <Button onClick={handleAddMember} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">Adicionar</Button>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {members.map((m, i) => (
                <motion.div key={m.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)]">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? "bg-amber-500/20 text-amber-400" : i === 1 ? "bg-gray-400/20 text-gray-300" : i === 2 ? "bg-orange-700/20 text-orange-400" : "bg-[hsl(220_15%_15%)] text-muted-foreground"}`}>
                        {m.position || i + 1}
                      </div>
                      <Avatar className="h-10 w-10 border border-[hsl(0_0%_100%/0.1)]">
                        <AvatarImage src={m.photo_url || undefined} />
                        <AvatarFallback className="bg-[hsl(220_15%_15%)] text-foreground text-sm">{m.athlete_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{m.athlete_name}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>{m.points} pts</span>
                          <span>{m.wins}V {m.losses}D</span>
                        </div>
                      </div>
                      {myMember && canChallenge(m) && (
                        <Button size="sm" variant="outline" onClick={() => setChallengeTarget(m)} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                          <Swords className="h-3 w-3" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Challenge confirmation dialog */}
            {challengeTarget && (
              <Dialog open={!!challengeTarget} onOpenChange={() => setChallengeTarget(null)}>
                <DialogContent className="bg-[hsl(220_15%_10%)] border-[hsl(0_0%_100%/0.1)]">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Desafiar {challengeTarget.athlete_name}?</DialogTitle>
                  </DialogHeader>
                  <div className="text-center py-4 space-y-3">
                    <div className="flex items-center justify-center gap-4">
                      <div className="text-center">
                        <Avatar className="h-16 w-16 mx-auto border border-amber-500/30">
                          <AvatarImage src={myMember?.photo_url || undefined} />
                          <AvatarFallback className="bg-amber-500/20 text-amber-400">{myMember?.athlete_name[0]}</AvatarFallback>
                        </Avatar>
                        <p className="text-sm text-foreground mt-1">{myMember?.athlete_name}</p>
                        <Badge variant="secondary" className="text-xs">#{myMember?.position}</Badge>
                      </div>
                      <Swords className="h-8 w-8 text-red-400" />
                      <div className="text-center">
                        <Avatar className="h-16 w-16 mx-auto border border-red-500/30">
                          <AvatarImage src={challengeTarget.photo_url || undefined} />
                          <AvatarFallback className="bg-red-500/20 text-red-400">{challengeTarget.athlete_name[0]}</AvatarFallback>
                        </Avatar>
                        <p className="text-sm text-foreground mt-1">{challengeTarget.athlete_name}</p>
                        <Badge variant="secondary" className="text-xs">#{challengeTarget.position}</Badge>
                      </div>
                    </div>
                    <Button onClick={() => handleChallenge(challengeTarget)} className="bg-gradient-to-r from-red-500 to-rose-600 text-white">
                      <Swords className="h-4 w-4 mr-2" /> Confirmar Desafio
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}

        {/* ─── CHALLENGES TAB ─── */}
        {tab === "challenges" && (
          <div className="space-y-3">
            {challenges.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhum desafio ainda.</p>}
            {challenges.map((ch) => {
              const isPending = ch.status === "pending" && ch.challenged && (ch.challenged as any).user_id === user?.id;
              const canScore = (ch.status === "accepted" || ch.status === "score_submitted") && user &&
                ((ch.challenger as any)?.user_id === user.id || (ch.challenged as any)?.user_id === user.id);
              const isScoreSubmitted = ch.status === "score_submitted" && ch.submitted_by !== user?.id;

              return (
                <Card key={ch.id} className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)]">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={(ch.challenger as any)?.photo_url} />
                          <AvatarFallback className="text-xs bg-amber-500/20 text-amber-400">{(ch.challenger as any)?.athlete_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-foreground font-medium">{(ch.challenger as any)?.athlete_name}</span>
                      </div>
                      <Swords className="h-4 w-4 text-muted-foreground" />
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground font-medium">{(ch.challenged as any)?.athlete_name}</span>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={(ch.challenged as any)?.photo_url} />
                          <AvatarFallback className="text-xs bg-red-500/20 text-red-400">{(ch.challenged as any)?.athlete_name?.[0]}</AvatarFallback>
                        </Avatar>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge variant={ch.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                        {statusLabel[ch.status] || ch.status}
                      </Badge>
                      {ch.status === "confirmed" && (
                        <span className="text-sm font-bold text-foreground">{ch.sets_won_challenger} x {ch.sets_won_challenged}</span>
                      )}
                    </div>

                    {isPending && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleRespondChallenge(ch.id, true)} className="flex-1 bg-emerald-600 text-white">
                          <Check className="h-3 w-3 mr-1" /> Aceitar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRespondChallenge(ch.id, false)} className="flex-1 border-red-500/30 text-red-400">
                          <X className="h-3 w-3 mr-1" /> Recusar
                        </Button>
                      </div>
                    )}

                    {canScore && (
                      <Button size="sm" onClick={() => setScoreChallenge(ch)} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                        {isScoreSubmitted ? "Confirmar Placar" : "Registrar Placar"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Score dialog */}
            {scoreChallenge && (
              <Dialog open={!!scoreChallenge} onOpenChange={() => setScoreChallenge(null)}>
                <DialogContent className="bg-[hsl(220_15%_10%)] border-[hsl(0_0%_100%/0.1)]">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      {scoreChallenge.status === "score_submitted" && scoreChallenge.submitted_by !== user?.id
                        ? "Confirmar Placar" : "Registrar Placar"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-center text-sm text-muted-foreground">
                      {(scoreChallenge.challenger as any)?.athlete_name} vs {(scoreChallenge.challenged as any)?.athlete_name}
                    </div>
                    {scoreChallenge.status === "score_submitted" && scoreChallenge.submitted_by !== user?.id ? (
                      // Show existing score for confirmation
                      <div className="text-center space-y-2">
                        <p className="text-lg font-bold text-foreground">{scoreChallenge.sets_won_challenger} x {scoreChallenge.sets_won_challenged}</p>
                        <p className="text-sm text-muted-foreground">O outro atleta registrou este placar. Confirma?</p>
                        <Button onClick={handleSubmitScore} className="w-full bg-emerald-600 text-white">
                          <Check className="h-4 w-4 mr-2" /> Confirmar Placar
                        </Button>
                      </div>
                    ) : (
                      <>
                        {sets.map((set, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-12">Set {i + 1}</span>
                            <Input
                              type="number" min="0" value={set.s1}
                              onChange={(e) => { const n = [...sets]; n[i].s1 = e.target.value; setSets(n); }}
                              className="w-16 text-center bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"
                              placeholder="0"
                            />
                            <span className="text-muted-foreground">x</span>
                            <Input
                              type="number" min="0" value={set.s2}
                              onChange={(e) => { const n = [...sets]; n[i].s2 = e.target.value; setSets(n); }}
                              className="w-16 text-center bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"
                              placeholder="0"
                            />
                          </div>
                        ))}
                        <Button onClick={handleSubmitScore} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                          Enviar Placar
                        </Button>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}

        {/* ─── CONFIG TAB (owner only) ─── */}
        {tab === "config" && isOwner && (
          <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)]">
            <CardHeader>
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <Settings className="h-4 w-4" /> Configurações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-foreground text-sm">Alcance de Desafio</Label>
                <Select value={editRange} onValueChange={setEditRange}>
                  <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 5, 6, 8, 10, 15, 20].map((n) => (
                      <SelectItem key={n} value={String(n)}>±{n} posições</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Quantas posições acima ou abaixo um atleta pode desafiar</p>
              </div>
              <div className="space-y-1">
                <Label className="text-foreground text-sm">Modo de Pontuação</Label>
                <Select value={editMode} onValueChange={setEditMode}>
                  <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="athlete">Atleta marca (com confirmação mútua)</SelectItem>
                    <SelectItem value="organizer">Organizador marca tudo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveConfig} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default CommunityDetail;
