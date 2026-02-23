# Sincronização Frontend ↔ Backend (Correções 2026-02-23)

## Problema Corrigido
Labels de destino ("Venc. Jogo X", "Perd. Jogo X") no MatchSequenceViewer estavam usando lógica local (`position % 2`) que divergia do roteamento real do banco de dados (`next_win_match_id` / `next_lose_match_id`).

## Solução Aplicada

### 1. Unificação de Labels (MatchSequenceViewer.tsx)
- Substituída lógica local por `getSlotFeeders()` de `src/lib/feederLabels.ts`
- Mesmo utilitário usado pelo BracketTreeView → 100% sincronizado
- Fallback estrutural mantido para rounds sem links explícitos

### 2. Correção de Links no Banco
- 14 registros na tabela `matches` tinham `next_win_match_id` inconsistente com a progressão real
- Links de `next_lose_match_id` corrigidos (3º lugar, auto-referências removidas)

### 3. Fonte Única de Verdade
- `matchNumbering.ts` → numeração canônica dos jogos
- `feederLabels.ts` → labels de origem (Venc./Perd.) com slot correto (team1/team2)
- Aba Sequência = referência visual primária

## Regra Crítica
**NUNCA** usar `position % 2` para determinar slot de destino. Sempre usar `getSlotFeeders()` que consulta `next_win_match_id` / `next_lose_match_id` reais e aplica fallbacks inteligentes (chapéu detection, bracket_type, etc.).
