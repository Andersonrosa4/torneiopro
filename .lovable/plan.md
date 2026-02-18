
## Diagnóstico

O problema tem duas camadas:

**Camada 1 — Visual (isUnlocked do bloco mesclado)**
No `MatchSequenceViewer.tsx` (linhas 791-798), os blocos `WA_R2` e `WB_R2` são mesclados num único bloco visual `W_R2`. O `isUnlocked` do bloco mesclado é definido apenas pelo primeiro sub-bloco encontrado, e nunca atualizado quando o segundo sub-bloco é adicionado via `existing.matches.push(...)`. Resultado: o bloco pode aparecer "desbloqueado" mesmo estando parcialmente bloqueado — ou o contrário.

**Camada 2 — Validação no servidor (`validateMatchStart`)**
A mensagem "Violação de ordem de rodada detectada. Bloco pendente: Vencedores A — Rodada 1" indica que o `roundScheduler.ts` ainda está calculando que `WA_R2` depende de algo que não foi completado. O scheduler atual (após as últimas alterações) criou dependências circulares ou incorretas.

**Causa raiz:**
A lógica em `tempBlocks` para `WA`/`WB` rounds ≥ 3 adiciona dependência em `LS_R${r-2}` e `LI_R${r-2}`. Para `WA_R2`, o código ainda verifica `LS_R0` e `LI_R0` (que não existem, mas podem gerar erros lógicos). Para Rodada 1 (`R1`), o código de dependências da primeira rodada está funcionando, mas o `validateMatchStart` usa o scheduler para verificar e pode encontrar a dependência incorreta.

**O que precisa ser corrigido:**

### 1. `src/lib/roundScheduler.ts` — Lógica de dependências simplificada e correta

A regra que o usuário quer é simples:
- `WA_R1` e `WB_R1`: sem dependências (rodada inicial)
- `WA_R2` e `WB_R2`: dependem apenas de `WA_R1` + `WB_R1`
- `LS_R1` e `LI_R1`: dependem de `WA_R1` + `WB_R1` + `WA_R2` + `WB_R2`
- `WA_R3` e `WB_R3`: dependem de `WA_R2` + `WB_R2` + `LS_R1` + `LI_R1`
- E assim por diante: `LS_Rn` depende de `WA_R${n+1}` + `WB_R${n+1}`

A lógica atual no `tempBlocks` (bloco de construção mais recente) está correta no papel, mas a parte antiga no início da função `buildSchedulerBlocks` (antes do `tempBlocks`) ainda está sendo usada para o `createBlock` que está duplicando blocos. Será necessário remover o código de `createBlock` (que é o primeiro loop) e usar apenas o `tempBlocks` + topological sort.

**A correção real:** Remover completamente a função `createBlock` e o primeiro loop que a invoca, que está causando blocos duplicados e dependências erradas. O código correto já existe nos `tempBlocks` mais abaixo — mas a função `createBlock` ainda está adicionando blocos ao array `blocks` ANTES do loop `tempBlocks`.

### 2. `src/components/MatchSequenceViewer.tsx` — Correção do `isUnlocked` ao mesclar blocos

Quando dois scheduler blocks (`WA_R2`, `WB_R2`) são mesclados em `W_R2`, o `isUnlocked` do grupo mesclado deve ser `true` **apenas se AMBOS os sub-blocos estiverem desbloqueados**. Atualmente, quando um bloco existente é encontrado e expandido (`existing.matches.push(...)`), o `isUnlocked` não é atualizado.

**Correção:** Ao mesclar, fazer `existing.isUnlocked = existing.isUnlocked && sb.isUnlocked`.

## Arquivos a serem alterados

### `src/lib/roundScheduler.ts`

- Remover a função auxiliar `createBlock` e o loop `for (const r of sortedRounds)` que a invoca (linhas ~175–220 da versão atual). Esse código está duplicando a lógica e adicionando blocos ao array `blocks` antes do algoritmo correto dos `tempBlocks`.
- Manter apenas o pipeline: construção de `tempBlocks` → topological sort → push para `blocks`.
- Simplificar a lógica de dependências de `WA`/`WB` para **não** incluir `LS/LI` de rounds `r-2` quando `r=2` (pois `LS_R0` não existe).

### `src/components/MatchSequenceViewer.tsx`

- Na linha onde blocos são mesclados (`existing.isCompleted = false`), adicionar também: `if (!sb.isUnlocked) existing.isUnlocked = false;`

## Resumo das mudanças

```text
roundScheduler.ts
  - Remove createBlock() function (dead code, causes double-building)
  - Keeps only the tempBlocks → topo-sort → blocks pipeline
  - Dependency for LS_Rn: only depends on WA_R(n+1) + WB_R(n+1)
  - No circular deps, no phantom LS_R0 references

MatchSequenceViewer.tsx
  - Fix isUnlocked merge: existing.isUnlocked &&= sb.isUnlocked
```
