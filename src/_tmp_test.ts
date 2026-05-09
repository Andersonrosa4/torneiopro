import { generateDoubleEliminationBracket } from "./lib/doubleEliminationLogic";

function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i+1}`, name: `T${i+1}`, seed: i+1,
    player1_name: `P${i+1}A`, player2_name: `P${i+1}B`,
  }));
}

for (const N of [4, 8, 16]) {
  const result = generateDoubleEliminationBracket({
    tournamentId: "x", modalityId: "y",
    teams: makeTeams(N) as any, useSeeds: false,
  } as any);
  const losers = result.matches.filter((m: any) => m.bracket_type === 'losers');
  const expected = 2*N - 3;
  console.log(`\n═══ N=${N}, total=${result.matches.length}, esperado=${expected}, OK=${result.matches.length === expected} ═══`);
  for (const half of ['upper','lower']) {
    const side = losers.filter((m: any) => m.bracket_half === half).sort((a:any,b:any)=> a.round-b.round || a.position-b.position);
    console.log(`Losers ${half}:`);
    for (const m of side) console.log(`  R${m.round}P${m.position} bn=${m.bracket_number}  nw→${m.next_win_match_id?.slice(0,6) ?? '—'}`);
  }
  // verify no L R winner skips a round
  const wMatches = result.matches.filter((m:any)=>m.bracket_type==='winners');
  for (const wm of wMatches) {
    if (wm.next_lose_match_id) {
      const target = result.matches.find((mm:any)=>mm._temp_id === wm.next_lose_match_id);
      if (target) console.log(`  W R${wm.round}P${wm.position}/${wm.bracket_half} → Loser cai em L R${target.round}P${target.position}/${target.bracket_half}`);
    }
  }
}
