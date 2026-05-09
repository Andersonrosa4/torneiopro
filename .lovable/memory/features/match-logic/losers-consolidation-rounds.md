---
name: Losers Bracket Consolidation Rounds
description: Algoritmo da chave dos perdedores deve inserir rodada de consolidação (minor round) sempre que sobreviventes > novos derrotados, evitando byes injustos
type: feature
---
# Rodada de Consolidação na Chave dos Perdedores

## Regra
Em `buildLosersBracketWithFeeders` (src/lib/doubleEliminationLogic.ts), antes de cada major round (que recebe novos derrotados da Winners), executar rodadas minor (consolidação entre sobreviventes) ENQUANTO `survivorEntries.length > newLosers.length && survivorEntries.length > 1`.

## Por quê
Sem consolidação, sobreviventes em excesso recebem bye e pulam rodada inteira; derrotados das semis dos vencedores entram cedo demais. Bug histórico: jogo #26 do torneio CONVIDADOS — ADER/BIRINHA pulou L R3 e WIL/NEGUEBINHA (perdedor da semi W) entrou em L R3 ao invés de L R4.

## Estrutura correta (ex: 8 times W upper)
- L R1: 4 droppers da W R1 (2 jogos)
- L R2: 2 sobreviventes + 2 droppers W R2 (2 jogos) — major
- L R3: 2 sobreviventes entre si (1 jogo) — minor (consolidação)
- L R4: 1 sobrevivente + 1 dropper W R3 (1 jogo) — major

Total: 2N-3 partidas é preservado.

## Teste de regressão
src/test/losersBracketStructure.test.ts valida N=4, 8, 16 e garante que perdedor da semi W cai em rodada >= 4.
