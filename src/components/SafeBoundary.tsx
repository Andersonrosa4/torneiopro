import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback for easier debugging */
  label?: string;
  /** Optional custom fallback render */
  fallback?: (reset: () => void, error: Error | null) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * SafeBoundary — generic error boundary that PREVENTS BLACK SCREENS.
 *
 * Wrap any subtree that could throw during render (theme switches, dynamic
 * forms, third-party widgets, etc). When a child throws, we show a small
 * inline fallback instead of unmounting the whole React tree.
 */
export default class SafeBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Centralized log — visible in console + can be wired to telemetry later.
    console.error(`[SafeBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback(this.reset, this.state.error);

    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="font-medium text-foreground">
              Ocorreu um erro ao exibir esta seção.
            </p>
            <p className="text-muted-foreground text-xs">
              A página continua funcionando. Você pode tentar novamente ou continuar usando o restante.
            </p>
            <Button size="sm" variant="outline" onClick={this.reset} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
