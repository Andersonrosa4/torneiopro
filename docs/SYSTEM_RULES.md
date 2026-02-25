# SYSTEM_RULES.md — Regras Imutáveis do Sistema

> **Última atualização:** 25/02/2026  
> **Versão:** 1.0  
> **Status:** CONGELADO — alterações apenas via Processo de Alteração (Seção 8)

---

## 1. Princípios Gerais

| # | Regra | Justificativa |
|---|-------|---------------|
| 1.1 | Nenhum módulo de engine (`src/engine/`) pode ter dependências de UI, banco ou React. | Testabilidade e portabilidade. |
| 1.2 | Toda decisão de avanço de equipe deve passar por um engine puro antes de tocar o banco. | Separação de responsabilidades. |
| 1.3 | Nenhuma operação destrutiva (delete de match, delete de equipe) pode ocorrer sem guard explícito. | Integridade de dados. |
| 1.4 | O sistema nunca gera partidas fantasma (matches sem dois feeders reais ou sem possibilidade de preenchimento). | Fórmula (2N-3) e UX. |
| 1.5 | Toda alteração de resultado em match `completed` deve disparar cascade reset + repropagação. | Consistência da chave. |

---

## 2. Regras Congeladas de Fase de Grupos

| # | Regra |
|---|-------|
| 2.1 | Partidas de grupo usam `round = 0`. |
| 2.2 | Classificação de grupo usa desempate configurável via `tiebreakEngine.resolveTie()` com critérios: `wins`, `point_diff`, `head_to_head`. |
| 2.3 | A ordem dos critérios de desempate é lida dinamicamente de `tournament_rules.ranking_criteria_order`. |
| 2.4 | Fallback de critérios: `["wins", "point_diff", "head_to_head"]`. |
| 2.5 | ELO **não é** critério de desempate. Removido permanentemente. |
| 2.6 | Transição automática grupos → eliminatórias é controlada por `autoAdvanceEngine.checkAutoAdvance()` e respeita flag opt-out `tournament_rules.auto_advance_knockout`. |
| 2.7 | O auto-avanço só dispara quando **todas** as partidas de grupo da modalidade estão `completed` E não existem matches eliminatórios com equipes já atribuídas. |

---

## 3. Regras Congeladas de Eliminação Simples

| # | Regra |
|---|-------|
| 3.1 | Vencedor avança para o match seguinte via `next_win_match_id`. |
| 3.2 | Perdedor é eliminado (sem chave de perdedores). |
| 3.3 | Cascade reset em SE usa `computePartialCascadeResetSE`: reseta apenas semifinal e final, nunca rodadas anteriores. |
| 3.4 | Seeds são baseados em `team.seed` (campo manual). Sem ELO. |

---

## 4. Regras Congeladas de Dupla Eliminação

| # | Regra |
|---|-------|
| 4.1 | **Todas as equipes começam na Winners bracket.** Nenhuma equipe é inserida diretamente na Losers. |
| 4.2 | Fórmula absoluta: total de partidas = `(2 × N) − 3` para final única. |
| 4.3 | **Sem final com reset.** Sem `if_necessary`. Sem `grand_final_reset`. A final é uma partida única. |
| 4.4 | **Mirror crossing obrigatório:** perdedores da Winners A (upper) descem para Losers B (lower) e vice-versa. Jamais para o mesmo lado. |
| 4.5 | **Cruzamento de semifinais:** Semi 1 = Campeão Winners A vs Campeão Losers B. Semi 2 = Campeão Winners B vs Campeão Losers A. Equipes do mesmo lado original nunca se enfrentam antes da final. |
| 4.6 | Perdedor de semifinal ou final é **eliminado imediatamente**. Nunca desce para losers. |
| 4.7 | Sem partidas placeholder. Sem rodada 999. Sem `cross_semi`. |
| 4.8 | Losers bracket com entrada ímpar: o excedente recebe BYE real (diferido para próxima rodada). Nunca criar match chapéu vazio na losers. |
| 4.9 | Validação pós-geração é obrigatória: mirror crossing, integridade de feeders, contagem total. Falha em qualquer validação = geração abortada. |
| 4.10 | Mínimo de 4 equipes para gerar dupla eliminação. |

---

## 5. Regras de Chapéu / BYE

| # | Regra |
|---|-------|
| 5.1 | **Ninguém avança sem jogar.** BYE = chapéu (equipe aguarda rodada seguinte para jogo obrigatório), nunca vitória automática. |
| 5.2 | Equipes chapéu são inseridas como `team2_id` em matches com `is_chapeu = true`, aguardando o vencedor da rodada preliminar. |
| 5.3 | Chapéu na Winners: equipes diretas (sem preliminar) aguardam vencedores das preliminares. |
| 5.4 | Chapéu na Losers: diferimento via `pendingBye` — equipe é adicionada à próxima rodada, nunca gera match fantasma. |
| 5.5 | Distribuição de chapéus na transição grupos → eliminatórias prioriza 1º colocados por saldo de pontos (`distributeChapeus()`). |

---

## 6. Regras de Bloqueio e Segurança

| # | Regra | Implementação |
|---|-------|---------------|
| 6.1 | **Bloqueio de rodada:** um match só pode receber resultado se todos os matches da rodada anterior (mesma `bracket_type` + `bracket_half` + `modality_id`) estiverem `completed`. | `roundLockGuard.isRoundLocked()` chamado em `declareWinner()`. |
| 6.2 | **Bloqueio de exclusão de equipe:** se existir qualquer match com `team1_id === team.id OR team2_id === team.id`, a exclusão é bloqueada. Independe de fase de grupos. | `removeTeam()` em `TournamentDetail.tsx`. |
| 6.3 | **Cascade reset com repropagação:** ao editar resultado de match `completed` em DE, o sistema (1) executa `computeAggressiveCascadeReset`, (2) busca dados frescos, (3) reexecuta `processDoubleEliminationAdvance` para todos os matches `completed` anteriores, ordenados por round/position. | Bloco pós-cascade em `declareWinner()`. |
| 6.4 | **Anti-repetição segura:** anti-repetição na losers R1-R2 **nunca** move equipe para match com destino (`next_win_match_id`/`next_lose_match_id`) diferente. Apenas troca adversários entre matches irmãos do mesmo round/bracket via `trySiblingSwap()`. Se não houver swap seguro, aceita rematch. | `doubleEliminationAdvance.ts`. |
| 6.5 | **Mutex por match:** `declareWinner()` usa mutex per-match para impedir declarações concorrentes no mesmo match. | `declareWinnerMutex` em `TournamentDetail.tsx`. |
| 6.6 | **Guard anti-auto-confronto:** nunca colocar o mesmo time nos dois slots do mesmo match. | `processDoubleEliminationAdvance()` — guards em winner e loser placement. |

---

## 7. Regras Proibidas

As seguintes funcionalidades **NUNCA** devem existir no sistema:

| # | Proibição | Motivo |
|---|-----------|--------|
| 7.1 | Final com reset / `grand_final_reset` / `if_necessary` | Complexidade sem valor; modelo usa final única. |
| 7.2 | Rodada 999 ou matches placeholder | Gera partidas fantasma que nunca serão jogadas. |
| 7.3 | ELO como critério de desempate ou seeding | Removido por decisão de projeto. Seeds são manuais. |
| 7.4 | Exclusão de equipe após geração de qualquer partida | Corrompe referências em matches existentes. |
| 7.5 | Alteração de `next_win_match_id` ou `next_lose_match_id` em runtime | Quebra a cadeia de avanço. Linkagem é definida na geração e imutável. |
| 7.6 | Inserção direta de equipe na Losers bracket | Todas começam na Winners. Losers recebe apenas perdedores. |
| 7.7 | Anti-repetição que move equipe para match com destino diferente | Quebra linkagem. Apenas swap entre irmãos ou aceitar rematch. |
| 7.8 | Auto-confirm de email signup | Usuários devem verificar email antes de acessar o sistema. |
| 7.9 | Declaração de resultado fora de ordem (rodada N+1 antes de N estar completa) | Gera inconsistência nos feeders. Bloqueado por `isRoundLocked()`. |

---

## 8. Processo de Alteração de Regra

1. Qualquer alteração a este documento requer **justificativa técnica escrita** com cenário de teste.
2. A alteração deve ser aprovada explicitamente antes de implementação.
3. O código existente que depende da regra alterada deve ser auditado e atualizado **antes** da mudança entrar em produção.
4. Toda regra alterada deve manter histórico: regra original, data da alteração, motivo.
5. Regras da Seção 7 (Proibidas) requerem **dupla confirmação** para remoção.

---

## Declaração Final

> **Este documento é a fonte suprema de verdade do sistema.**  
> **Qualquer código que viole estas regras deve ser considerado bug.**
