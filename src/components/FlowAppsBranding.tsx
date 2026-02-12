import { Instagram } from "lucide-react";

const INSTAGRAM_URL = "https://instagram.com/flowapps.ofc";

interface FlowAppsBrandingProps {
  variant: "home-footer" | "internal-footer" | "login-cta" | "tournament-cta";
}

const FlowAppsBranding = ({ variant }: FlowAppsBrandingProps) => {
  const instagramLink = (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 font-bold text-transparent bg-clip-text transition-all hover:scale-105"
      style={{
        backgroundImage: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
        filter: "drop-shadow(0 0 6px rgba(225, 48, 108, 0.4))",
      }}
    >
      <Instagram className="h-4 w-4 text-pink-500" style={{ filter: "drop-shadow(0 0 4px rgba(225, 48, 108, 0.5))" }} />
      @flowapps.ofc
    </a>
  );

  if (variant === "home-footer") {
    return (
      <footer className="mt-12 pb-6 text-center space-y-2">
        <p className="text-sm text-[hsl(35_30%_70%)]">
          Desenvolvido por <span className="font-semibold text-[hsl(35_30%_85%)]">FlowApps</span>
        </p>
        <div className="text-sm text-[hsl(35_30%_70%)]">{instagramLink}</div>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:scale-105"
          style={{
            backgroundImage: "linear-gradient(135deg, #e53e3e, #c53030, #9b2c2c)",
            boxShadow: "0 4px 15px rgba(229, 62, 62, 0.4)",
          }}
        >
          Criar meu aplicativo
        </a>
      </footer>
    );
  }

  if (variant === "internal-footer") {
    return (
      <footer className="mt-8 pb-4 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by{" "}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-inline-flex items-center gap-1 font-medium text-primary/70 hover:text-primary transition-colors"
          >
            <Instagram className="inline h-3 w-3 mr-0.5" />
            FlowApps
          </a>
        </p>
      </footer>
    );
  }

  if (variant === "login-cta") {
    return (
      <div className="mt-5 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm p-4 text-center space-y-1">
        <p className="text-xs text-muted-foreground">
          Quer um sistema personalizado para sua arena?
        </p>
        <p className="text-xs">
          Fale comigo no Instagram{" "}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Instagram className="h-3.5 w-3.5" />
            @flowapps.ofc
          </a>
        </p>
      </div>
    );
  }

  if (variant === "tournament-cta") {
    return (
      <div className="mt-8 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-6 text-center space-y-2">
        <p className="text-base font-semibold text-foreground">Gostou do sistema?</p>
        <p className="text-sm text-muted-foreground">
          Crie o seu aplicativo com a FlowApps
        </p>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-2 rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Instagram className="h-4 w-4" />
          Falar com FlowApps
        </a>
      </div>
    );
  }

  return null;
};

export default FlowAppsBranding;
