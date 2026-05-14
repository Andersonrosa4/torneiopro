## Modo Luana — Formato com Repescagem Cruzada (Vôlei de Praia)

Nova opção de formato de chaveamento, ao lado de **Eliminação Simples** e **Dupla Eliminação**, chamada **"Modo Luana — Grupos + Repescagem Cruzada"**. Disponível **apenas** para a organizadora `LUANA` e organizadores vinculados aos torneios dela; atletas inscritos veem automaticamente.

---

### 1. Controle de acesso

Criar helper `useLuanaAccess()` que retorna `true` se:
- `organizers.username === 'LUANA'` (login atual), **OU**
- `tournament.created_by` pertence à LUANA (organizador vinculado via `tournament_organizers` ou criado por ela), **OU**
- usuário é admin global.

A opção só aparece no `GenerateBracketDialog` se `useLuanaAccess() === true` **e** `sport === 'beach_volleyball'`.

Atletas: visualização do bracket é pública por natureza (já passa pelo `TournamentPublicView`), então não precisa nada extra — qualquer atleta vê.

---

### 2. Formato — regras

**Fase de grupos (Snake já existente):** distribui em `G` chaves de `S` times.

**Repescagem cruzada (novo round):** entre fim dos grupos e quartas.
- 1º colocados de cada chave passam **direto** para as quartas.
- 2º e 3º colocados disputam vagas remanescentes em cruzamento espelhado entre chaves adjacentes:
  - **2A × 3D** e **2D × 3A** (chaves extremas)
  - **2B × 3C** e **2C × 3B** (chaves centrais)
- Vencedores ocupam as 4 vagas restantes das quartas.

**Pergunta no momento da geração** (dentro do `GenerateBracketDialog` quando o modo é selecionado):
> "O torneio começa direto nas **Quartas de Final** (8 times) ou tem **Oitavas de Final** (16 times)?"

- Se **Oitavas**: passam 4 (1º) + 8 da repescagem (2º+3º cruzados em 4 jogos, e mais 4 jogos extras com sobra) → 16 nas oitavas.
- Se **Quartas**: passam 4 (1º) + 4 da repescagem cruzada → 8 nas quartas.

Semis e final seguem o padrão atual (Mirrored Extremes). Disputa de 3º lugar mantida.

---

### 3. Backend

Sem alterações de schema. Usa colunas existentes:
- `modalities.game_system` recebe novo valor `'group_cross_repechage'`.
- `matches.bracket_type` recebe `'repechage'` para os jogos cruzados (round entre groups e knockout).
- `matches.round` segue convenção: groups=0, repescagem=1, quartas=2, semi=3, final=4, 3º lugar=4.

Edge function `organizer-api` apenas valida o novo `game_system` na lista de aceitos.

---

### 4. Engine novo

Arquivo `src/engine/luanaModeEngine.ts`:
- `generateLuanaBracket({ teams, groupCount, startsAt: 'quarters' | 'eighths' })` → cria grupos via Snake existente, gera repescagem cruzada com pares fixos por chaveCount, e pluga vencedores nas quartas/oitavas.
- Reutiliza `chapeuDistribution.ts` para os 1º colocados que aguardam.
- Validação pós-geração via `postGenerationValidator.ts`.

Engine **separado** de Single/Double Elim (regra de Engine Separation já no projeto).

---

### 5. UI

- `GenerateBracketDialog.tsx`: nova radio option "Modo Luana — Grupos + Repescagem Cruzada" (condicional ao `useLuanaAccess`). Quando selecionada, mostra:
  - Slider de nº de chaves (default 4).
  - Radio "Inicia em: Quartas / Oitavas".
- Badges visuais nos matches de repescagem: `REP-1`, `REP-2` etc. com cor distinta (laranja).
- `MatchSequenceViewer` e `BracketTreeView`: rótulos PT-BR ("Repescagem Cruzada", "Quartas via Repescagem").

---

### 6. Testes

`src/test/luanaModeEngine.test.ts`:
- 12 duplas, 4 chaves de 3, inicia nas quartas → 4 jogos repescagem + 4 quartas.
- 16 duplas, 4 chaves de 4, inicia nas quartas → mesmo padrão.
- 20 duplas, 4 chaves de 5, inicia nas oitavas → repescagem expandida.
- Validações: nenhum 1º enfrenta outro 1º antes da semi; cruzamento A×D / B×C respeitado; sem auto-confronto.

---

### 7. O que **não** muda

- Eliminação Simples e Dupla Eliminação intocados.
- Outros esportes (Futevôlei, Beach Tennis) não enxergam o modo.
- Outros organizadores (não-LUANA, não-vinculados) nem veem a opção no dialog.
- Sistema de pontuação, ranking, status, e cascade resets reutilizam pipelines existentes.

---

### Resumo do que será criado/alterado

**Novos arquivos:**
- `src/engine/luanaModeEngine.ts`
- `src/hooks/useLuanaAccess.ts`
- `src/test/luanaModeEngine.test.ts`

**Editados:**
- `src/components/GenerateBracketDialog.tsx` (nova opção condicional + sub-perguntas)
- `src/lib/roundLabels.ts` (rótulo "Repescagem Cruzada")
- `src/components/MatchSequenceViewer.tsx` (badge REP)
- `supabase/functions/organizer-api/index.ts` (validar novo `game_system`)
