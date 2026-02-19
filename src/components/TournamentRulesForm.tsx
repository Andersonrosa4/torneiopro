import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { motion } from "framer-motion";

export interface TournamentRulesState {
  mode: string;
  sets_format: string;
  games_to_win_set: number;
  min_difference: number;
  tiebreak_enabled: boolean;
  tiebreak_at: string;
  tiebreak_points: number;
  final_set_tiebreak_mode: string;
  super_tiebreak_enabled: boolean;
  super_tiebreak_points: number;
  super_tiebreak_replaces_third_set: boolean;
  no_ad: boolean;
  golden_point: boolean;
  points_sequence: string;
  first_server: string;
  server_rotation: string;
  walkover_enabled: boolean;
  retirement_keep_score: boolean;
  ranking_criteria_order: string;
}

export function getDefaultRules(sport: string): TournamentRulesState {
  if (sport === "padel") {
    return {
      mode: "doubles",
      sets_format: "best_of_3",
      games_to_win_set: 6,
      min_difference: 2,
      tiebreak_enabled: true,
      tiebreak_at: "6-6",
      tiebreak_points: 7,
      final_set_tiebreak_mode: "super_tiebreak",
      super_tiebreak_enabled: true,
      super_tiebreak_points: 10,
      super_tiebreak_replaces_third_set: true,
      no_ad: false,
      golden_point: true,
      points_sequence: "0,15,30,40",
      first_server: "coin_toss",
      server_rotation: "fixed_order",
      walkover_enabled: true,
      retirement_keep_score: true,
      ranking_criteria_order: "WINS,HEAD_TO_HEAD,SETS_DIFF,GAMES_DIFF,POINTS_DIFF,RANDOM",
    };
  }
  // Tennis defaults
  return {
    mode: "singles",
    sets_format: "best_of_3",
    games_to_win_set: 6,
    min_difference: 2,
    tiebreak_enabled: true,
    tiebreak_at: "6-6",
    tiebreak_points: 7,
    final_set_tiebreak_mode: "normal",
    super_tiebreak_enabled: true,
    super_tiebreak_points: 10,
    super_tiebreak_replaces_third_set: true,
    no_ad: true,
    golden_point: false,
    points_sequence: "0,15,30,40,ADV",
    first_server: "coin_toss",
    server_rotation: "fixed_order",
    walkover_enabled: true,
    retirement_keep_score: true,
    ranking_criteria_order: "WINS,HEAD_TO_HEAD,SETS_DIFF,GAMES_DIFF,POINTS_DIFF,RANDOM",
  };
}

interface Props {
  sport: string;
  rules: TournamentRulesState;
  onChange: (rules: TournamentRulesState) => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-4">
    <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">{title}</h3>
    {children}
  </div>
);

const TournamentRulesForm = ({ sport, rules, onChange }: Props) => {
  const update = (partial: Partial<TournamentRulesState>) => onChange({ ...rules, ...partial });

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4">
      {/* Mode */}
      {sport === "tennis" && (
        <Section title="Modo de Jogo">
          <RadioGroup value={rules.mode} onValueChange={(v) => update({ mode: v })} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="singles" id="mode-singles" />
              <Label htmlFor="mode-singles">Singles</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="doubles" id="mode-doubles" />
              <Label htmlFor="mode-doubles">Doubles</Label>
            </div>
          </RadioGroup>
        </Section>
      )}

      {/* Sets */}
      <Section title="Formato de Sets">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Formato</Label>
            <Select value={rules.sets_format} onValueChange={(v) => update({ sets_format: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="best_of_3">Melhor de 3</SelectItem>
                {sport === "tennis" && <SelectItem value="best_of_5">Melhor de 5</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Games p/ vencer set</Label>
            <Input type="number" min={1} max={12} value={rules.games_to_win_set} onChange={(e) => update({ games_to_win_set: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Diferença mínima</Label>
            <Input type="number" min={1} max={4} value={rules.min_difference} onChange={(e) => update({ min_difference: Number(e.target.value) })} />
          </div>
        </div>
      </Section>

      {/* Tiebreak */}
      <Section title="Tiebreak">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tiebreak habilitado</Label>
            <Switch checked={rules.tiebreak_enabled} onCheckedChange={(v) => update({ tiebreak_enabled: v })} />
          </div>
          {rules.tiebreak_enabled && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Tiebreak em</Label>
                <Input value={rules.tiebreak_at} onChange={(e) => update({ tiebreak_at: e.target.value })} placeholder="6-6" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pontos do tiebreak</Label>
                <Input type="number" min={5} max={15} value={rules.tiebreak_points} onChange={(e) => update({ tiebreak_points: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Set decisivo</Label>
                <Select value={rules.final_set_tiebreak_mode} onValueChange={(v) => update({ final_set_tiebreak_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Tiebreak Normal</SelectItem>
                    <SelectItem value="super_tiebreak">Super Tiebreak</SelectItem>
                    <SelectItem value="advantage">Advantage (sem tiebreak)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* Super Tiebreak */}
      <Section title="Super Tiebreak">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Super Tiebreak habilitado</Label>
            <Switch checked={rules.super_tiebreak_enabled} onCheckedChange={(v) => update({ super_tiebreak_enabled: v })} />
          </div>
          {rules.super_tiebreak_enabled && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Pontos</Label>
                <Input type="number" min={7} max={21} value={rules.super_tiebreak_points} onChange={(e) => update({ super_tiebreak_points: Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Substitui 3º set</Label>
                <Switch checked={rules.super_tiebreak_replaces_third_set} onCheckedChange={(v) => update({ super_tiebreak_replaces_third_set: v })} />
              </div>
            </>
          )}
        </div>
      </Section>

      {/* Scoring Variants */}
      <Section title="Variantes de Pontuação">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">No-Ad (sem vantagem)</Label>
            <Switch checked={rules.no_ad} onCheckedChange={(v) => update({ no_ad: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Golden Point</Label>
            <Switch checked={rules.golden_point} onCheckedChange={(v) => update({ golden_point: v })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Sequência de pontos</Label>
            <Input value={rules.points_sequence} onChange={(e) => update({ points_sequence: e.target.value })} placeholder="0,15,30,40,ADV" />
          </div>
        </div>
      </Section>

      {/* Match Rules */}
      <Section title="Regras de Partida">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Primeiro sacador</Label>
            <Select value={rules.first_server} onValueChange={(v) => update({ first_server: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coin_toss">Sorteio</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">W.O. habilitado</Label>
            <Switch checked={rules.walkover_enabled} onCheckedChange={(v) => update({ walkover_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Manter placar em desistência</Label>
            <Switch checked={rules.retirement_keep_score} onCheckedChange={(v) => update({ retirement_keep_score: v })} />
          </div>
        </div>
      </Section>
    </motion.div>
  );
};

export default TournamentRulesForm;
