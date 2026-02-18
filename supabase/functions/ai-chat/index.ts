import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o assistente oficial do Torneio Pro, um app de gerenciamento de torneios esportivos de praia.

Você ajuda tanto **organizadores** quanto **atletas** com informações sobre:

## Esportes suportados:
- **Beach Tennis**: Esporte de raquete jogado na areia, com redes e pontuação similar ao tênis. Partidas geralmente jogadas em sets.
- **Futevôlei**: Combinação de futebol e vôlei, jogado na areia, sem uso das mãos.
- **Beach Volleyball**: Vôlei de praia, geralmente com duplas, jogado na areia.

## Para Organizadores:
- Como criar e configurar torneios (formato, modalidades, categorias)
- Como cadastrar equipes e participantes
- Como gerar chaveamentos (simples ou dupla eliminação)
- Como registrar resultados das partidas
- Como usar o sistema de chapéu (chapeau) para balancear disputas
- Como gerenciar rankings e classificações
- Como exportar dados e QR codes

## Para Atletas:
- Como acessar torneios pelo código
- Como verificar resultados e chaveamentos
- Como consultar rankings e classificações
- Regras gerais dos esportes
- Como funciona o sistema de pontuação

## Sistema do App:
- Formatos: Eliminação simples (single elimination) ou Dupla eliminação (double elimination)
- Modalidades: Masculino, Feminino, Misto
- O sistema de chapéu distribui equipes de forma balanceada no chaveamento
- Rankings acumulam pontos ao longo dos torneios

Seja sempre amigável, objetivo e em português. Se não souber algo específico do contexto atual do usuário (como dados do torneio deles), informe que não tem acesso em tempo real aos dados, mas oriente como encontrar a informação no app.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Verifique seu plano." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "Erro no serviço de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
