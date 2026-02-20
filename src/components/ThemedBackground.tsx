import { useSportTheme } from "@/contexts/SportContext";

const sportDecorations: Record<string, { pattern: string; icons: string[]; courtColor: string }> = {
  beach_volleyball: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(35 40% 20% / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(195 40% 25% / 0.2) 0%, transparent 50%)",
    icons: ["🏐"],
    courtColor: "hsl(35 85% 55% / 0.06)",
  },
  futevolei: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(155 30% 18% / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(195 30% 22% / 0.2) 0%, transparent 50%)",
    icons: ["⚽"],
    courtColor: "hsl(155 60% 45% / 0.06)",
  },
  beach_tennis: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(180 30% 18% / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(22 40% 25% / 0.2) 0%, transparent 50%)",
    icons: ["🎾"],
    courtColor: "hsl(180 70% 45% / 0.06)",
  },
  tennis: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(120 30% 18% / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(80 30% 22% / 0.2) 0%, transparent 50%)",
    icons: ["🎾"],
    courtColor: "hsl(120 50% 40% / 0.06)",
  },
  padel: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(270 30% 18% / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(290 30% 22% / 0.2) 0%, transparent 50%)",
    icons: ["🏓"],
    courtColor: "hsl(270 60% 50% / 0.06)",
  },
  futsal: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(0 30% 18% / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(30 40% 22% / 0.2) 0%, transparent 50%)",
    icons: ["⚽"],
    courtColor: "hsl(0 70% 50% / 0.06)",
  },
};

const ThemedBackground = ({ children }: { children: React.ReactNode }) => {
  const { selectedSport } = useSportTheme();
  const deco = selectedSport ? sportDecorations[selectedSport] : null;

  return (
    <div className="relative min-h-screen bg-gradient-surface">
      {/* Dark sand texture */}
      <div className="fixed inset-0 sand-texture pointer-events-none" />

      {/* Sport-specific pattern overlay */}
      {deco && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backgroundImage: deco.pattern }}
        />
      )}

      {/* Court lines & net pattern */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Horizontal court line */}
        <div className="absolute top-1/2 left-0 right-0 h-px" style={{ backgroundColor: deco?.courtColor || "hsl(195 85% 50% / 0.04)" }} />
        {/* Vertical court line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{ backgroundColor: deco?.courtColor || "hsl(195 85% 50% / 0.04)" }} />
        {/* Net pattern dots */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        {/* Floating sport icons */}
        {deco && (
          <>
            <div className="absolute top-8 right-8 text-5xl opacity-[0.04] select-none">
              {deco.icons[0]}
            </div>
            <div className="absolute bottom-16 left-12 text-4xl opacity-[0.03] select-none rotate-12">
              {deco.icons[0]}
            </div>
            <div className="absolute top-1/3 left-8 text-3xl opacity-[0.02] select-none -rotate-6">
              {deco.icons[0]}
            </div>
          </>
        )}
        {/* Stadium light glow top corners */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06),transparent_70%)]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-[radial-gradient(ellipse_at_center,hsl(var(--accent)/0.04),transparent_70%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default ThemedBackground;
