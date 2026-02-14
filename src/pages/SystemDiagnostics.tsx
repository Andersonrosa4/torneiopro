import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery } from "@/lib/organizerApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Database, Radio, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";

interface TableCheck {
  name: string;
  exists: boolean;
  count: number | null;
  loading: boolean;
}

const SystemDiagnostics = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tables, setTables] = useState<TableCheck[]>([]);
  const [matchColumns, setMatchColumns] = useState<string[]>([]);
  const [matchSample, setMatchSample] = useState<Record<string, any> | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"idle" | "waiting" | "success" | "fail">("idle");
  const [loading, setLoading] = useState(true);

  const tableNames = ["tournaments", "matches", "teams", "groups", "classificacao_grupos"];

  const checkTables = useCallback(async () => {
    setLoading(true);
    const results: TableCheck[] = [];

    for (const name of tableNames) {
      try {
        const { data, error } = await organizerQuery<any[]>({
          table: name,
          operation: "select",
          select: "id",
        });
        if (error) {
          results.push({ name, exists: false, count: null, loading: false });
        } else {
          results.push({ name, exists: true, count: data?.length ?? 0, loading: false });
        }
      } catch {
        results.push({ name, exists: false, count: null, loading: false });
      }
    }

    setTables(results);

    // Inspect matches columns
    try {
      const { data } = await organizerQuery<any[]>({
        table: "matches",
        operation: "select",
        select: "*",
      });
      if (data && data.length > 0) {
        const sample = data[0];
        setMatchSample(sample);
        setMatchColumns(Object.keys(sample));
      } else {
        setMatchColumns([]);
        setMatchSample(null);
      }
    } catch {
      setMatchColumns([]);
      setMatchSample(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) checkTables();
  }, [isAdmin, checkTables]);

  const testRealtime = async () => {
    setRealtimeStatus("waiting");

    let received = false;
    const channel = supabase
      .channel("diag-realtime-test")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, () => {
        received = true;
        setRealtimeStatus("success");
      })
      .subscribe();

    // Try to update a match to trigger realtime
    const { data: matches } = await organizerQuery<any[]>({
      table: "matches",
      operation: "select",
      select: "id",
    });

    if (matches && matches.length > 0) {
      await organizerQuery({
        table: "matches",
        operation: "update",
        data: { score1: 0 },
        filters: { id: matches[0].id },
      });
    }

    // Wait 5s for event
    setTimeout(() => {
      if (!received) setRealtimeStatus("fail");
      supabase.removeChannel(channel);
    }, 5000);
  };

  const tableExists = (name: string) => tables.find(t => t.name === name)?.exists ?? false;
  const matchHasField = (field: string) => matchColumns.includes(field);

  const checklist = [
    { label: "classificacao_grupos existe", ok: tableExists("classificacao_grupos") },
    { label: "matches possui campo lado", ok: matchHasField("bracket_half") },
    { label: "matches possui campo origem", ok: matchHasField("next_win_match_id") || matchHasField("next_lose_match_id") },
    { label: "matches possui campo is_chapeu", ok: matchHasField("is_chapeu") },
    { label: "realtime ativo", ok: realtimeStatus === "success" },
  ];

  if (!isAdmin) {
    return (
      <ThemedBackground>
        <AppHeader />
        <main className="container py-8 text-center">
          <p className="text-destructive font-semibold">Acesso restrito a administradores.</p>
        </main>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <AppHeader />
      <main className="container py-8 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
          <Database className="h-7 w-7" /> Diagnóstico do Sistema
        </h1>

        {/* 1) Verificação de Tabelas */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Verificação de Tabelas
              <Button variant="outline" size="sm" onClick={checkTables} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Recarregar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tableNames.map(name => {
                const t = tables.find(x => x.name === name);
                return (
                  <div key={name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                    <span className="font-mono text-sm">{name}</span>
                    <div className="flex items-center gap-3">
                      <Badge variant={t?.exists ? "default" : "destructive"}>
                        {loading ? "..." : t?.exists ? "SIM" : "NÃO"}
                      </Badge>
                      {t?.exists && (
                        <span className="text-xs text-muted-foreground">{t.count} registros</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 2) Inspeção da tabela matches */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Inspeção: matches (campos)</CardTitle>
          </CardHeader>
          <CardContent>
            {matchColumns.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum registro encontrado ou tabela inexistente.</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {matchColumns.map(col => (
                  <li key={col} className="font-mono text-xs py-1 px-2 rounded bg-muted/50">{col}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 3) Teste Realtime */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="h-5 w-5" /> Teste Realtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={testRealtime} disabled={realtimeStatus === "waiting"} className="mb-3">
              {realtimeStatus === "waiting" ? "Aguardando evento..." : "Teste Realtime"}
            </Button>
            {realtimeStatus === "success" && (
              <p className="text-sm font-medium flex items-center gap-1 text-primary">
                <CheckCircle2 className="h-4 w-4" /> Evento realtime recebido
              </p>
            )}
            {realtimeStatus === "fail" && (
              <p className="text-sm font-medium flex items-center gap-1 text-destructive">
                <XCircle className="h-4 w-4" /> Evento realtime NÃO recebido
              </p>
            )}
          </CardContent>
        </Card>

        {/* 4) Checklist Automático */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Checklist Automático</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  {item.ok ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </ThemedBackground>
  );
};

export default SystemDiagnostics;
