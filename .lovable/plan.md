# Lixeira Global (Soft-Delete + Recuperação)

Hoje só `bracket_backups` salva chaves antes de apagar. Vou estender essa proteção para **toda** exclusão do sistema (torneios, etapas, modalidades, times, partidas, classificações, rankings, comunidades, reservas, atletas, etc.), criando uma "lixeira" central com restauração.

## O que será feito

### 1. Tabela central `deleted_records` (lixeira)
Snapshot completo antes de qualquer DELETE:
- `id`, `table_name`, `record_id`, `record_snapshot` (jsonb com a linha inteira)
- `related_snapshots` (jsonb, ex: ao apagar torneio salva partidas/times/rankings juntos)
- `tournament_id`, `modality_id`, `stage_id` (índices para filtrar)
- `deleted_by`, `deleted_at`, `reason`, `restored_at`
- RLS: organizador do torneio + admin podem ver/restaurar

### 2. Trigger genérico de captura
Função `capture_before_delete()` que escreve em `deleted_records` antes de qualquer `BEFORE DELETE` nas tabelas relevantes:
`tournaments`, `tournament_stages`, `modalities`, `teams`, `matches`, `groups`, `classificacao_grupos`, `rankings`, `ranking_points_history`, `participants`, `bookings`, `court_bookings`, `community_members`, `ranking_communities`, `challenges`, `arenas`, `courts`, `organizers`, `tournament_organizers`.

Vantagem: pega **toda** exclusão (via app, via Edge Function, via SQL direto) — impossível contornar.

### 3. TTL e retenção
Padrão: 30 dias. Job/edge function `cleanup-deleted-records` (já existe `auto-healer`, dá pra encadear) apaga registros > 30 dias.

### 4. UI "Lixeira"
Nova aba `RecycleBinTab.tsx` no painel do torneio + página global `/admin/lixeira` para admin:
- Lista agrupada por tipo (Torneio, Etapa, Modalidade, Time, Partida, Ranking…)
- Filtro por data, tabela, atleta
- Botão **Restaurar** (re-INSERT da linha + dependências) e **Apagar definitivo**
- Aviso visual quando há itens na lixeira

### 5. Edge Function `recycle-bin-api`
- `restore(record_id)`: re-insere snapshot, valida que `record_id` não existe, restaura dependências do `related_snapshots` na ordem correta (pais antes de filhos)
- `purge(record_id)`: remove definitivamente
- `list(filters)`: lista paginada

### 6. Ajuste das rotinas que já apagam
- `undoBracket` em `organizerApi.ts` já tem snapshot — passa a também gravar em `deleted_records` no formato unificado
- `aggressiveCascadeReset.ts`, deletions em `RankingsTab`, stage-deletion, etc.: nada muda no código de chamada (o trigger captura), mas adiciono `reason` via `SET LOCAL app.delete_reason` quando útil para auditoria

## Detalhes técnicos

```text
DELETE FROM <table>
   │
   ▼  BEFORE DELETE trigger
capture_before_delete()
   │   ├─ to_jsonb(OLD) → record_snapshot
   │   ├─ coleta filhos por FK lógica → related_snapshots
   │   └─ INSERT deleted_records
   ▼
DELETE prossegue normalmente
```

Restauração:
1. Verifica que `record_id` não existe na tabela original
2. Re-insere `record_snapshot` (com `OVERRIDING SYSTEM VALUE` se necessário)
3. Re-insere `related_snapshots` na ordem topológica
4. Marca `restored_at`

## Escopo desta primeira entrega
1. Migration: tabela `deleted_records` + função + triggers nas 19 tabelas listadas + RLS
2. Edge Function `recycle-bin-api` (list/restore/purge)
3. Componente `RecycleBinTab` (aba dentro de `TournamentDetail`) + rota admin `/lixeira`
4. Badge de aviso no header quando há itens na lixeira do torneio atual

Não inclui (pode vir depois): exportar lixeira para Excel, restauração parcial de campos, versionamento histórico de updates.

Confirmar para eu começar pela migration.
