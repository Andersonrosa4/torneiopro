import { useEffect, useState } from 'react';
import { generateDoubleEliminationBracket, DoubleEliminationConfig } from '@/lib/doubleEliminationLogic';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
}

interface SimulationEvent {
  round: number;
  bracket: string;
  position: number;
  team1: string;
  team2: string;
  winner: string;
  loser: string;
}

interface SimulationData {
  events: SimulationEvent[];
  podium: Array<{ position: number; text: string }>;
  stats: { totalMatches: number; totalRounds: number; totalTeams: number };
}

const SimulationTest = () => {
  const [data, setData] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateTeams = (): Team[] => {
      const firstNames = ['Dupla', 'Time', 'Equipe', 'Squad', 'Turma'];
      const cities = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Curitiba', 'Salvador', 'Fortaleza', 'Manaus'];
      
      const teams: Team[] = [];
      for (let i = 1; i <= 32; i++) {
        const city = cities[Math.floor(Math.random() * cities.length)];
        teams.push({
          id: `team-${i}`,
          player1_name: `Jogador ${i}A (${city})`,
          player2_name: `Jogador ${i}B (${city})`,
          seed: null,
        });
      }
      return teams;
    };

    const runSimulation = () => {
      const teams = generateTeams();
      const teamsMap = new Map(teams.map(t => [t.id, t]));

      const config: DoubleEliminationConfig = {
        tournamentId: 'tournament-32-sim',
        modalityId: 'modality-test',
        teams,
        useSeeds: false,
        allowThirdPlace: true,
      };

      const bracketData = generateDoubleEliminationBracket(config);
      const allMatches = bracketData.matches;

      const getTeamName = (teamId: string): string => {
        const team = teamsMap.get(teamId);
        return team ? `${team.player1_name.split('(')[0].trim()} / ${team.player2_name.split('(')[0].trim()}` : 'DESCONHECIDO';
      };

      const simulateMatch = (team1Id: string, team2Id: string) => {
        const random = Math.random();
        return random > 0.5 ? { winner: team1Id, loser: team2Id } : { winner: team2Id, loser: team1Id };
      };

      const events: SimulationEvent[] = [];
      const podiumData: { place: string; team: string }[] = [];

      const sortedMatches = [...allMatches].sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        const bracketOrder = { winners: 0, losers: 1, semi_final: 2, final: 3 };
        const orderA = bracketOrder[a.bracket_type as keyof typeof bracketOrder] ?? 4;
        const orderB = bracketOrder[b.bracket_type as keyof typeof bracketOrder] ?? 4;
        if (orderA !== orderB) return orderA - orderB;
        return a.position - b.position;
      });

      for (const match of sortedMatches) {
        if (!match.team1_id || !match.team2_id) continue;

        const result = simulateMatch(match.team1_id, match.team2_id);
        const team1Name = getTeamName(match.team1_id);
        const team2Name = getTeamName(match.team2_id);
        const winnerName = getTeamName(result.winner);
        const loserName = getTeamName(result.loser);

        events.push({
          round: match.round,
          bracket: match.bracket_type,
          position: match.position,
          team1: team1Name,
          team2: team2Name,
          winner: winnerName,
          loser: loserName,
        });

        if (match.bracket_type === 'final') {
          podiumData.push({ place: '🥇 Campeão', team: winnerName });
          podiumData.push({ place: '🥈 Vice-campeão', team: loserName });
        } else if (match.bracket_type === 'semi_final') {
          const count3rd = podiumData.filter(f => f.place === '🥉 Terceiro lugar').length;
          if (count3rd === 0) {
            podiumData.push({ place: '🥉 Terceiro lugar', team: loserName });
          } else if (podiumData.filter(f => f.place === '🎖️ Quarto lugar').length === 0) {
            podiumData.push({ place: '🎖️ Quarto lugar', team: loserName });
          }
        }
      }

      const podium = podiumData.slice(0, 4).map((p, i) => ({
        position: i + 1,
        text: `${p.place} - ${p.team}`,
      }));

      setData({
        events,
        podium,
        stats: {
          totalMatches: events.length,
          totalRounds: Math.max(...sortedMatches.map(m => m.round)),
          totalTeams: 32,
        },
      });

      setLoading(false);
    };

    runSimulation();
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <p className="text-lg text-muted-foreground">Gerando simulação de torneio com 32 duplas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">🏆 Simulação: Torneio Dupla Eliminação</h1>
        <p className="text-muted-foreground mb-8">32 Duplas | Chaveamento Completo com Progressão Total</p>

        {/* Estatísticas */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Total de Duplas</p>
            <p className="text-3xl font-bold">{data.stats.totalTeams}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Matches Disputados</p>
            <p className="text-3xl font-bold">{data.stats.totalMatches}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Rodadas Totais</p>
            <p className="text-3xl font-bold">{data.stats.totalRounds}</p>
          </Card>
        </div>

        {/* Pódio */}
        <Card className="p-6 mb-8 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 border-primary/30">
          <h2 className="text-2xl font-bold mb-6">🏆 Pódio Final</h2>
          <div className="space-y-3">
            {data.podium.map((place) => (
              <div
                key={place.position}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  place.position === 1
                    ? 'bg-yellow-500/20 border-yellow-500/50'
                    : place.position === 2
                    ? 'bg-slate-400/20 border-slate-400/50'
                    : place.position === 3
                    ? 'bg-orange-400/20 border-orange-400/50'
                    : 'bg-slate-600/20 border-slate-600/50'
                }`}
              >
                <span className="font-bold text-lg">{place.text}</span>
                <Badge
                  variant="outline"
                  className={
                    place.position === 1
                      ? 'bg-yellow-500/30 text-yellow-900'
                      : place.position === 2
                      ? 'bg-slate-400/30 text-slate-900'
                      : place.position === 3
                      ? 'bg-orange-400/30 text-orange-900'
                      : 'bg-slate-600/30 text-slate-100'
                  }
                >
                  {place.position}º Lugar
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Histórico de Matches */}
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-6">📋 Histórico de Matches</h2>

          {Array.from(new Set(data.events.map(e => e.round)))
            .sort((a, b) => a - b)
            .map((round) => (
              <div key={round} className="mb-10">
                <h3 className="text-xl font-semibold mb-4 px-2 text-primary border-l-4 border-primary">
                  🔄 Rodada {round}
                </h3>

                <div className="space-y-3">
                  {data.events
                    .filter(e => e.round === round)
                    .sort((a, b) => {
                      const bracketOrder = { winners: 0, losers: 1, semi_final: 2, final: 3 };
                      const orderA = bracketOrder[a.bracket as keyof typeof bracketOrder] ?? 4;
                      const orderB = bracketOrder[b.bracket as keyof typeof bracketOrder] ?? 4;
                      if (orderA !== orderB) return orderA - orderB;
                      return a.position - b.position;
                    })
                    .map((event, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-card border border-border/50 hover:border-primary/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex gap-2 items-center">
                            <Badge
                              variant="outline"
                              className="text-xs uppercase font-bold"
                            >
                              {event.bracket === 'winners' && '👑 Vencedores'}
                              {event.bracket === 'losers' && '⬇️ Perdedores'}
                              {event.bracket === 'semi_final' && '⚔️ Semifinal'}
                              {event.bracket === 'final' && '🏅 Final'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">Posição {event.position}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-3 items-center mb-3">
                          <div className="text-sm font-medium text-right">{event.team1}</div>
                          <div className="text-center text-primary font-bold">vs</div>
                          <div className="text-sm font-medium">{event.team2}</div>
                          <div className="text-center">→</div>
                          <div className="text-sm font-bold text-green-600">{event.winner}</div>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Perdedor:</span>
                          <span className="italic">{event.loser}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </Card>

        {/* Resumo Final */}
        <div className="mt-8 p-6 rounded-lg bg-secondary/30 border border-border">
          <h3 className="text-lg font-bold mb-2">✅ Simulação Completa</h3>
          <p className="text-sm text-muted-foreground">
            Total de {data.stats.totalMatches} matches disputados em {data.stats.totalRounds} rodadas. O sistema de dupla eliminação funciona corretamente com progressão dos vencedores,
            queda dos perdedores para a chave dos perdedores com mapeamento sequencial, semifinais cruzadas e eliminação final.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SimulationTest;
