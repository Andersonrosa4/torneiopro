import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface Props {
  userId: string;
}

export default function MyDebts({ userId }: Props) {
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("user_debts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setDebts(data || []); setLoading(false); });
  }, [userId]);

  if (loading) return <p className="text-center py-8 text-muted-foreground">Carregando...</p>;

  const open = debts.filter((d) => d.status === "open");
  const paid = debts.filter((d) => d.status === "paid");

  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <h3 className="font-semibold text-destructive flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" /> Débitos Pendentes
          </h3>
          <p className="text-sm text-destructive/80 mb-3">
            Você possui débitos em aberto. Resolva na arena para poder fazer novas reservas.
          </p>
          {open.map((d) => (
            <Card key={d.id} className="mb-2 border-destructive/30">
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">R$ {Number(d.amount).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{d.reason || "Não comparecimento"}</p>
                </div>
                <Badge variant="destructive">Em aberto</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {open.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">Nenhum débito pendente. 🎉</p>
      )}

      {paid.length > 0 && (
        <div>
          <h3 className="font-semibold text-muted-foreground mb-2">Histórico</h3>
          {paid.map((d) => (
            <Card key={d.id} className="mb-2">
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">R$ {Number(d.amount).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{d.reason}</p>
                </div>
                <Badge variant="outline">Pago</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
