# STRESS_TESTS.md — Cenários Extremos de Validação

> **Referência:** `docs/SYSTEM_RULES.md`  
> **Objetivo:** Garantir que nenhum cenário limite viole as regras congeladas do sistema.  
> **Última atualização:** 25/02/2026

---

## 1. Dupla Eliminação com N Ímpar

| Item | Detalhe |
|------|---------|
| **Descrição** | Gerar chave DE com número ímpar de equipes (ex: 5, 7, 9). O excedente na Winners recebe chapéu (aguarda rodada seguinte). Na Losers, entrada ímpar recebe BYE real diferido. |
| **Resultado esperado** | Chave gerada com `(2×N)−3` partidas. Nenhum match fantasma. Equipes chapéu aguardam em `is_chapeu = true`. Losers nunca tem match vazio — excedente diferido via `pendingBye`. |
| **Regra protegida** | 1.4 (sem partidas fantasma), 4.2 (fórmula absoluta), 4.8 (BYE real na losers), 5.1 (ninguém avança sem jogar) |

---

## 2. Edição de Match Antigo (Re-declaração)

| Item | Detalhe |
|------|---------|
| **Descrição** | Alterar o resultado de um match `completed` em rodada anterior (ex: R1) quando rodadas posteriores (R2, R3) já possuem resultados lançados. |
| **Resultado esperado** | `computeAggressiveCascadeReset` reseta todos os matches downstream (mesmo bracket + mirror crossing se Winners). Repropagação sequencial reexecuta `processDoubleEliminationAdvance` para cada match `completed` anterior. Nenhum match é deletado — apenas resetado. `validateSystemRules` não encontra violações após repropagação. |
| **Regra protegida** | 1.5 (cascade reset obrigatório), 6.3 (cascade + repropagação), 3.3 (SE: reset parcial), 7.5 (linkagem imutável) |

---

## 3. Tentativa de Pular Rodada

| Item | Detalhe |
|------|---------|
| **Descrição** | Organizador tenta declarar vencedor em match da rodada N+1 enquanto rodada N (mesma `bracket_type` + `bracket_half` + `modality_id`) possui matches `pending` ou `in_progress`. |
| **Resultado esperado** | `isRoundLocked()` retorna `{ locked: true }`. Toast de erro exibido. Declaração bloqueada. Nenhuma alteração no banco. |
| **Regra protegida** | 6.1 (bloqueio de rodada), 7.9 (declaração fora de ordem proibida) |

---

## 4. Exclusão de Equipe Após Chave Gerada

| Item | Detalhe |
|------|---------|
| **Descrição** | Organizador tenta excluir uma equipe que já aparece como `team1_id` ou `team2_id` em qualquer match (grupo ou eliminatória). |
| **Resultado esperado** | `removeTeam()` detecta `matches.some(m => m.team1_id === tid \|\| m.team2_id === tid)` e bloqueia com toast. Nenhuma operação de delete executada. |
| **Regra protegida** | 6.2 (bloqueio de exclusão), 7.4 (exclusão após partida proibida) |

---

## 5. Chapéu em Winners

| Item | Detalhe |
|------|---------|
| **Descrição** | Torneio DE com N não-potência-de-2 (ex: 6 equipes). Equipes com melhor seed recebem chapéu na Winners — aguardam vencedores das preliminares em matches com `is_chapeu = true`. |
| **Resultado esperado** | Equipes chapéu aparecem como `team2_id` em matches `is_chapeu = true`. Não avançam automaticamente. Só jogam quando o vencedor da preliminar é propagado como `team1_id`. Nenhum match com apenas 1 equipe é auto-completado (exceto BYE explícito). |
| **Regra protegida** | 5.1 (ninguém avança sem jogar), 5.2 (chapéu como team2), 5.3 (chapéu na Winners) |

---

## 6. Chapéu em Losers

| Item | Detalhe |
|------|---------|
| **Descrição** | Na Losers bracket, entrada ímpar de perdedores vindos da Winners gera excedente que não tem adversário imediato. |
| **Resultado esperado** | Excedente diferido via `pendingBye` para próxima rodada. Nenhum match fantasma criado na Losers. Equipe diferida joga obrigatoriamente na rodada seguinte. |
| **Regra protegida** | 4.8 (BYE real na losers, sem match chapéu vazio), 5.4 (diferimento via pendingBye), 1.4 (sem partidas fantasma) |

---

## 7. Rematch Forçado (Anti-repetição)

| Item | Detalhe |
|------|---------|
| **Descrição** | Na Losers R1-R2, um perdedor da Winners é direcionado para match onde o adversário é a mesma equipe que o derrotou na Winners (rematch). Anti-repetição tenta `trySiblingSwap()`. |
| **Resultado esperado** | Se existe match irmão (mesmo round/bracket_type/bracket_half/bracket_number) sem criar novo rematch: swap executado com 3 updates atômicos. Se não há swap seguro: rematch aceito com log de warning. Em nenhum caso a equipe é movida para match com `next_win_match_id`/`next_lose_match_id` diferente. |
| **Regra protegida** | 6.4 (anti-repetição segura), 7.7 (nunca mover para match com destino diferente), 7.5 (linkagem imutável) |

---

## 8. Falha de Rede no Meio de Swap

| Item | Detalhe |
|------|---------|
| **Descrição** | Durante a execução de `trySiblingSwap()`, a rede falha após o primeiro update (loser colocado no target) mas antes dos updates subsequentes (swap do opponent e occupant). |
| **Resultado esperado** | Estado parcialmente inconsistente: um slot preenchido, outro não. O sistema **não** corrompe linkagem (`next_win_match_id`/`next_lose_match_id` permanecem intactos). Na próxima declaração de vencedor com re-declaração, o cascade reset limpa o estado inconsistente e a repropagação reconstrói corretamente. `validateSystemRules` detecta a inconsistência (equipe em dois matches ou slot null) e loga no console. |
| **Regra protegida** | 7.5 (linkagem imutável — preservada mesmo em falha), 6.3 (cascade reset como mecanismo de recuperação) |

---

## 9. Torneio Sem Fase de Grupos

| Item | Detalhe |
|------|---------|
| **Descrição** | Torneio configurado diretamente como eliminatória (SE ou DE) sem grupos. Todas as equipes entram diretamente na fase eliminatória. |
| **Resultado esperado** | Nenhum match com `round = 0` é criado. Seeds manuais (`team.seed`) determinam posições. `checkAutoAdvance()` nunca dispara (não há grupos para completar). Chaveamento gerado normalmente com validação de contagem mínima (≥2 equipes, ≥4 para DE). |
| **Regra protegida** | 3.4 (seeds manuais), 4.10 (mínimo 4 para DE), 2.6 (auto-avanço respeitado) |

---

## 10. Torneio com Apenas 3 Equipes

| Item | Detalhe |
|------|---------|
| **Descrição** | Torneio SE com 3 equipes. Uma equipe recebe chapéu (aguarda vencedor da preliminar). Em DE, 3 equipes são rejeitadas (mínimo 4). |
| **Resultado esperado** | **SE:** 1 match preliminar + 1 final. Equipe chapéu aguarda em `is_chapeu = true`. Total: 2 partidas. Nenhuma equipe avança sem jogar. **DE:** Geração bloqueada com toast de erro ("mínimo 4 equipes"). |
| **Regra protegida** | 4.10 (mínimo 4 para DE), 5.1 (ninguém avança sem jogar), 1.4 (sem partidas fantasma) |

---

## 11. Torneio Grande (64 Equipes)

| Item | Detalhe |
|------|---------|
| **Descrição** | Torneio DE com 64 equipes. Gera `(2×64)−3 = 125` partidas. Winners com 6 rodadas, Losers com mirror crossing completo. |
| **Resultado esperado** | Exatamente 125 partidas geradas. Mirror crossing validado: perdedores de Winners upper descem para Losers lower e vice-versa. Semifinais cruzadas: Semi1 = Campeão Winners A vs Campeão Losers B. Nenhum match fantasma. `validateSystemRules` retorna 0 violações no snapshot pós-geração. Performance: geração completa em < 5 segundos. |
| **Regra protegida** | 4.2 (fórmula 2N−3), 4.4 (mirror crossing), 4.5 (cruzamento de semifinais), 4.9 (validação pós-geração obrigatória), 1.4 (sem partidas fantasma) |

---

## Matriz de Cobertura

| Regra | Cenários que a testam |
|-------|-----------------------|
| 1.4 (sem partidas fantasma) | 1, 6, 10, 11 |
| 1.5 (cascade reset obrigatório) | 2 |
| 4.2 (fórmula 2N−3) | 1, 11 |
| 4.4 (mirror crossing) | 11 |
| 4.8 (BYE real na losers) | 1, 6 |
| 4.10 (mínimo 4 para DE) | 9, 10 |
| 5.1 (ninguém avança sem jogar) | 1, 5, 10 |
| 6.1 (bloqueio de rodada) | 3 |
| 6.2 (bloqueio de exclusão) | 4 |
| 6.3 (cascade + repropagação) | 2, 8 |
| 6.4 (anti-repetição segura) | 7 |
| 7.5 (linkagem imutável) | 2, 7, 8 |
| 7.7 (anti-repetição sem mover destino) | 7 |

---

> **Qualquer cenário listado acima que produza violação em `validateSystemRules()` é considerado bug crítico.**
