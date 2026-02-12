import { useSportTheme } from "@/contexts/SportContext";

const sportDecorations: Record<string, { pattern: string; icons: string[] }> = {
  beach_volleyball: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(35 40% 85% / 0.3) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(195 60% 80% / 0.15) 0%, transparent 50%)",
    icons: ["🏐"],
  },
  futevolei: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(155 40% 85% / 0.25) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(195 50% 80% / 0.15) 0%, transparent 50%)",
    icons: ["⚽"],
  },
  beach_tennis: {
    pattern: "radial-gradient(circle at 30% 70%, hsl(180 40% 85% / 0.25) 0%, transparent 50%), radial-gradient(circle at 70% 30%, hsl(22 60% 80% / 0.15) 0%, transparent 50%)",
    icons: ["🎾"],
  },
};

const ThemedBackground = ({ children }: { children: React.ReactNode }) => {
  const { selectedSport } = useSportTheme();
  const deco = selectedSport ? sportDecorations[selectedSport] : null;

  return (
    <div className="relative min-h-screen bg-gradient-surface">
      {/* Sand texture */}
      <div className="fixed inset-0 sand-texture pointer-events-none" />

      {/* Sport-specific pattern overlay */}
      {deco && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ backgroundImage: deco.pattern }}
        />
      )}

      {/* Subtle net/court lines */}
      {selectedSport && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {/* Horizontal court line */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-primary/5" />
          {/* Vertical court line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-primary/5" />
          {/* Net pattern dots */}
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />
          {/* Floating sport icon */}
          <div className="absolute top-8 right-8 text-4xl opacity-[0.06] select-none">
            {deco?.icons[0]}
          </div>
          <div className="absolute bottom-12 left-12 text-3xl opacity-[0.04] select-none rotate-12">
            {deco?.icons[0]}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default ThemedBackground;
