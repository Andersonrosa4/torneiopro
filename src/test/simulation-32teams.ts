import { generateDoubleEliminationBracket, DoubleEliminationConfig } from '@/lib/doubleEliminationLogic';

/**
 * Simulação de Torneio Dupla Eliminação com 32 Duplas
 * Gera bracket completo e simula progressão através de todos os rounds
 */

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
}

interface Match {
  tournament_id: string;
  modality_id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  status: string;
  bracket_type: string;
  bracket_half: string | null;
  bracket_number: number;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
  winner_team_id?: string | null;
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

// Gera 32 duplas fictícias
function generateTeams(): Team[] {
  const firstNames = ['Dupla', 'Time', 'Equipe', 'Squad', 'Turma'];
  const cities = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Curitiba', 'Salvador', 'Fortaleza', 'Manaus'];
  
  const teams: Team[] = [];
  for (let i = 1; i <= 32; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    teams.push({
      id: `team-${i}`,
      player1_name: `Jogador ${i}A (${city})`,
      player2_name: `Jogador ${i}B (${city})`,
      seed: null,
    });
  }
  return teams;
}

// Simula um resultado de match com um vencedor aleatório
function simulateMatch(match: Match, teams: Map<string, Team>): { winner: string; loser: string } {
  if (!match.team1_id || !match.team2_id) {
    throw new Error(`Match ${match.round}/${match.position} tem equipe nula`);
  }

  const random = Math.random();
  const winner = random > 0.5 ? match.team1_id : match.team2_id;
  const loser = winner === match.team1_id ? match.team2_id : match.team1_id;

  return { winner, loser };
}

// Formata nome da dupla
function getTeamName(teamId: string, teams: Map<string, Team>): string {
  const team = teams.get(teamId);
  return team ? `${team.player1_name.split('(')[0].trim()} / ${team.player2_name.split('(')[0].trim()}` : 'DESCONHECIDO';
}

export function simulateTournament32Teams(): {
  totalMatches: number;
  totalRounds: number;
  bracketStructure: Record<string, any>;
  events: SimulationEvent[];
  finalStandings: { position: number; team: string }[];
} {
  // Gera 32 duplas
  const teams = generateTeams();
  const teamsMap = new Map(teams.map(t => [t.id, t]));

  const tournamentId = 'tournament-32-simulation';
  const modalityId = 'modality-test';

  // Configuração do bracket
  const config: DoubleEliminationConfig = {
    tournamentId,
    modalityId,
    teams,
    useSeeds: false,
    allowThirdPlace: true,
  };

  // Gera bracket de dupla eliminação
  const bracketData = generateDoubleEliminationBracket(config);
  const allMatches = bracketData.matches;

  console.log(`\n🏆 SIMULAÇÃO DE TORNEIO DUPLA ELIMINAÇÃO - 32 DUPLAS`);
  console.log(`=${'='.repeat(80)}`);
  console.log(`Total de Matches Gerados: ${allMatches.length}`);

  // Agrupa matches por tipo de chave
  const matchesByBracket = new Map<string, Match[]>();
  const matchesById = new Map<string, Match>();

  for (const match of allMatches) {
    const key = `${match.bracket_type}-${match.bracket_half || 'center'}`;
    if (!matchesByBracket.has(key)) {
      matchesByBracket.set(key, []);
    }
    matchesByBracket.get(key)!.push(match);
    matchesById.set(`${match.round}-${match.position}-${match.bracket_type}`, match);
  }

  // Estrutura do bracket
  const bracketStructure: Record<string, any> = {};
  for (const [key, matches] of matchesByBracket) {
    const maxRound = Math.max(...matches.map(m => m.round));
    bracketStructure[key] = {
      matchCount: matches.length,
      maxRound,
      matchesByRound: {},
    };
    for (const match of matches) {
      if (!bracketStructure[key].matchesByRound[match.round]) {
        bracketStructure[key].matchesByRound[match.round] = 0;
      }
      bracketStructure[key].matchesByRound[match.round]++;
    }
  }

  console.log(`\n📊 ESTRUTURA DO BRACKET:`);
  console.log(`-----`);
  for (const [key, structure] of Object.entries(bracketStructure)) {
    console.log(`${key}: ${structure.matchCount} matches (até rodada ${structure.maxRound})`);
    for (const [round, count] of Object.entries(structure.matchesByRound)) {
      console.log(`  Rodada ${round}: ${count} matches`);
    }
  }

  // Simula matches round by round
  const events: SimulationEvent[] = [];
  const matchResults = new Map<string, { winner: string; loser: string }>();
  const roundWinners = new Map<string, Set<string>>();
  const roundLosers = new Map<string, Set<string>>();
  const finalists: { place: string; team: string }[] = [];

  // Ordena matches por round e bracket_type para simular na sequência correta
  const sortedMatches = [...allMatches].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    // Vencedores primeiro, depois Perdedores, depois Semifinais Cruzadas, depois Final
    const bracketOrder = { winners: 0, losers: 1, cross_semi: 2, final: 3 };
    const orderA = bracketOrder[a.bracket_type as keyof typeof bracketOrder] ?? 4;
    const orderB = bracketOrder[b.bracket_type as keyof typeof bracketOrder] ?? 4;
    if (orderA !== orderB) return orderA - orderB;
    return a.position - b.position;
  });

  let currentRound = 0;

  for (const match of sortedMatches) {
    // Pula se não tem ambas as equipes
    if (!match.team1_id || !match.team2_id) {
      continue;
    }

    if (match.round > currentRound) {
      currentRound = match.round;
      console.log(`\n🔄 RODADA ${currentRound}`);
      console.log(`${'─'.repeat(80)}`);
    }

    const result = simulateMatch(match, teamsMap);
    const team1Name = getTeamName(match.team1_id, teamsMap);
    const team2Name = getTeamName(match.team2_id, teamsMap);
    const winnerName = getTeamName(result.winner, teamsMap);

    console.log(
      `[${match.bracket_type.toUpperCase()}] ${team1Name} vs ${team2Name} → Vencedor: ${winnerName}`
    );

    matchResults.set(`${match.round}-${match.position}-${match.bracket_type}`, result);

    events.push({
      round: match.round,
      bracket: match.bracket_type,
      position: match.position,
      team1: team1Name,
      team2: team2Name,
      winner: winnerName,
      loser: getTeamName(result.loser, teamsMap),
    });

    // Rastreia finais para classificação
    if (match.bracket_type === 'final') {
      finalists.push({ place: '🥇 Campeão', team: winnerName });
      finalists.push({ place: '🥈 Vice-campeão', team: getTeamName(result.loser, teamsMap) });
    }
  }

  // Calcula perdedores das semifinais como 3º e 4º lugar
  const crossSemiMatches = sortedMatches.filter(m => m.bracket_type === 'cross_semi');
  for (const match of crossSemiMatches) {
    if (!match.team1_id || !match.team2_id) continue;
    const result = matchResults.get(`${match.round}-${match.position}-cross_semi`);
    if (result) {
      finalists.push({ place: '🥉 Terceiro lugar', team: getTeamName(result.loser, teamsMap) });
    }
  }

  const finalStandings: { position: number; team: string }[] = finalists.slice(0, 4).map((f, i) => ({
    position: i + 1,
    team: `${f.place} - ${f.team}`,
  }));

  // Estatísticas finais
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📈 ESTATÍSTICAS FINAIS:`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Total de Matches Disputados: ${events.length}`);
  console.log(`Total de Rodadas: ${Math.max(...sortedMatches.map(m => m.round))}`);
  console.log(`\nPódio Final:`);
  for (const standing of finalStandings) {
    console.log(`  ${standing.team}`);
  }

  return {
    totalMatches: events.length,
    totalRounds: Math.max(...sortedMatches.map(m => m.round)),
    bracketStructure,
    events,
    finalStandings,
  };
}

// Executa simulação
const result = simulateTournament32Teams();
console.log(`\n✅ Simulação Completa!\n`);

export default result;
