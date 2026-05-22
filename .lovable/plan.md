## Objetivo
Separar o ranking por **etapa** mantendo um **ranking geral** (consolidado das etapas) no mesmo torneio/modalidade, sem duplicar dados nem reescrever a aba de Ranking.

## Estratégia (resumo)
Hoje a tabela `rankings` guarda pontos por `tournament_id + modality_id + athlete_name` — sem `stage_id`. Por isso, ao trocar de etapa, o ranking é o mesmo. A solução mais eficiente é **persistir os pontos por etapa** e **calcular o Geral em tempo real somando as etapas** (sem tabela extra, sem job).

## Mudanças

### 1. Banco (1 migração)
- Adicionar coluna `stage_id uuid NULL` em `public.rankings`.
- Índice composto `(tournament_id, modality_id, stage_id)` para leitura rápida.
- Dados existentes ficam com `stage_id = NULL` → continuam aparecendo como "antes das etapas" (compatível).

### 2. UI da aba Ranking (`RankingsTab.tsx`)
- Adicionar seletor no topo: **Geral · Etapa 1 · Etapa 2 · …** (usa as `tournament_stages` já existentes).
- **Etapa específica**: lê `rankings` filtrando `stage_id = X` (já existe o filtro, só passa). Adicionar/editar/remover grava com `stage_id = X`.
- **Geral**: lê todas as linhas do torneio/modalidade e agrega no cliente (`SUM(points) GROUP BY athlete_name`), exibindo somatório, etapas em que pontuou e badges acumuladas.
- No modo Geral, edição manual fica desabilitada (com aviso "Edite a pontuação dentro da etapa correspondente"), evitando inconsistência.

### 3. Geração automática de ranking
- A função `generateAutoRanking` já recebe `stageId` no escopo; ao gerar, gravar `stage_id = stageId` (etapa atual).
- "Geral" passa a ser sempre derivado — nunca gerado diretamente.

### 4. Histórico de pontos
- `ranking_points_history` já tem `stage_id`. Sem mudança de schema, só continua sendo populado corretamente.

### 5. Exportações (PDF/Excel/CSV)
- Quando estiver em uma etapa: exporta só aquela etapa (cabeçalho mostra o nome).
- Quando estiver em Geral: exporta o consolidado.

## Por que é eficiente
- **1 coluna + 1 índice** resolvem a separação.
- **Geral é uma agregação client-side** (poucas centenas de linhas no máximo), sem tabela materializada, sem trigger, sem job.
- **Compatível com dados antigos** (NULL = "sem etapa", aparece tanto no Geral quanto na pseudo-etapa "Sem etapa", se quiser).
- Reaproveita 100% da UI atual — só adiciona o seletor de etapa e a agregação.

## Fora de escopo
- Nenhuma mudança em chaveamento, propagação ou Edge Functions.
- Sem novas tabelas.

Confirma que sigo nesse caminho?