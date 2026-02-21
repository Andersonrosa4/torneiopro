

# Plano de Implementacao - Activity Feed, Notificacoes, Ranking ELO e Visibilidade

## Visao Geral

Este plano adiciona 4 novos modulos ao sistema existente **sem alterar** nenhum codigo, tabela ou layout atual. Tudo sera criado em novos arquivos e novas tabelas.

---

## Etapa 1: Banco de Dados (Migrations)

### 1.1 Tabela `activities` (Feed Universal)
- `id`, `actor_id` (uuid, referencia auth.users), `verb` (text), `object_id` (uuid), `object_type` (text), `metadata` (jsonb), `visibility` (text: public/friends), `sport` (text), `created_at`
- RLS: SELECT publico para visibility='public', autenticado para proprios

### 1.2 Tabela `notifications` (Sistema Geral)
- `id`, `user_id` (uuid), `type` (text), `title` (text), `message` (text), `reference_id` (uuid nullable), `reference_type` (text nullable), `read` (boolean default false), `created_at`
- RLS: SELECT/UPDATE apenas para o proprio usuario (user_id = auth.uid())
- Habilitar Realtime nesta tabela

### 1.3 Tabela `athlete_rankings` (Ranking ELO por Esporte)
- `id`, `user_id` (uuid), `sport` (text), `elo_rating` (integer default 1200), `points` (integer default 0), `wins` (integer default 0), `losses` (integer default 0), `matches_played` (integer default 0), `updated_at`
- Constraint UNIQUE (user_id, sport)
- RLS: SELECT publico, UPDATE/INSERT via edge function (service role)

### 1.4 Alteracao em `tournaments`
- Adicionar coluna `visibility` (text default 'public') -- valores: 'public', 'private'

### 1.5 Alteracao em `ranking_communities`
- Adicionar coluna `visibility` (text default 'public') -- valores: 'public', 'private'

---

## Etapa 2: Edge Function `activity-api`

Nova edge function em `supabase/functions/activity-api/index.ts` com acoes:

- **`list_feed`**: Lista atividades publicas, com filtro opcional por `sport`. Paginacao com limit/offset.
- **`log_activity`**: Cria uma nova atividade (chamado internamente por outras edge functions apos eventos).
- **`list_notifications`**: Lista notificacoes do usuario autenticado (nao lidas primeiro).
- **`mark_notification_read`**: Marca uma notificacao como lida.
- **`mark_all_read`**: Marca todas as notificacoes do usuario como lidas.
- **`get_athlete_ranking`**: Retorna ranking ELO de um usuario por esporte.
- **`update_elo`**: Calcula e aplica ELO apos confirmacao de partida (K=32, formula padrao).

### Integracao com `challenge-api`
Ao confirmar placar (acao `submit_score` com status `confirmed`), o `challenge-api` sera atualizado para:
1. Chamar internamente a logica de ELO via banco direto (mesma edge function, service role)
2. Inserir 2 Activities: vitoria do vencedor + derrota do perdedor
3. Inserir 2 Notifications: para ambos os atletas

---

## Etapa 3: Paginas do Frontend

### 3.1 `src/pages/AthleteHome.tsx` (Hub do Atleta)
- Pagina principal apos login do atleta
- Filtro de esporte no topo (chips com os 6 esportes)
- Secoes:
  - **Feed de Atividades**: Cards com acoes recentes (vitorias, desafios, torneios)
  - **Torneios Publicos**: Lista de torneios com visibility='public', filtrado por esporte
  - **Meu Ranking**: Card com posicao ELO no esporte selecionado
  - **Notificacoes recentes**: Preview das ultimas 3
- Visual tematico por esporte (cores diferentes para cada um)

### 3.2 `src/pages/AthleteNotifications.tsx`
- Lista completa de notificacoes
- Marcar como lida (individual e "marcar todas")
- Icones por tipo (desafio, torneio, resultado)

### 3.3 `src/pages/PublicFeed.tsx`
- Feed publico sem login (somente visibility='public')
- Filtro por esporte
- Cards de atividades com avatar, verbo, tempo relativo

### 3.4 `src/components/NotificationBell.tsx`
- Componente de sininho para o header
- Badge com contagem de nao lidas
- Dropdown com preview das ultimas notificacoes
- Usa Realtime para atualizar em tempo real

### 3.5 Atualizacao no `CreateTournament.tsx`
- Adicionar campo "Visibilidade" (Publico/Privado) no formulario de criacao

### 3.6 Atualizacao no `RankingCommunities.tsx`
- Adicionar campo "Visibilidade" (Publico/Privado) ao criar comunidade
- Filtrar comunidades privadas (so aparecem para membros/criador)

---

## Etapa 4: Rotas e Navegacao

Novas rotas no `App.tsx`:
- `/atleta/home` -- AthleteHome (requer autenticacao)
- `/atleta/notificacoes` -- AthleteNotifications (requer autenticacao)
- `/feed` -- PublicFeed (publico)

Atualizacao no menu lateral (Index.tsx):
- Adicionar link "Feed" no menu hamburger
- Redirecionar login do atleta para `/atleta/home` em vez de `/atleta/meus-agendamentos`

---

## Etapa 5: Integracao ELO no Challenge-API

Ao confirmar placar no `challenge-api`:

```text
R_new = R_old + K * (S - E)
E = 1 / (1 + 10^((R_opp - R_self) / 400))
K = 32
S = 1 (vitoria) ou 0 (derrota)
```

- Cria/atualiza registro em `athlete_rankings` para ambos os jogadores
- Os pontos da `community_members` continuam funcionando como antes (nao altera)
- ELO e ranking da comunidade sao independentes

---

## Resumo de Arquivos

| Acao | Arquivo |
|------|---------|
| Criar | `supabase/functions/activity-api/index.ts` |
| Criar | `src/pages/AthleteHome.tsx` |
| Criar | `src/pages/AthleteNotifications.tsx` |
| Criar | `src/pages/PublicFeed.tsx` |
| Criar | `src/components/NotificationBell.tsx` |
| Editar | `supabase/functions/challenge-api/index.ts` (adicionar logs de activity + ELO) |
| Editar | `src/pages/CreateTournament.tsx` (campo visibilidade) |
| Editar | `src/pages/RankingCommunities.tsx` (campo visibilidade) |
| Editar | `src/pages/AtletaLoginPage.tsx` (redirecionar para /atleta/home) |
| Editar | `src/pages/Index.tsx` (link Feed no menu) |
| Editar | `src/App.tsx` (novas rotas) |
| Editar | `supabase/config.toml` (activity-api verify_jwt=false) |
| Migration | Tabelas activities, notifications, athlete_rankings + colunas visibility |

### Garantias
- Nenhuma tabela existente sera removida ou renomeada
- Nenhum layout/CSS existente sera alterado
- Nenhuma logica de partida/torneio/chaveamento sera modificada
- Modulos novos sao 100% desacoplados
- Login do atleta com foto de perfil continua opcional

