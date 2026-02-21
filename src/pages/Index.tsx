import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { QrCode, Smartphone, Download, Menu, CalendarDays, LogIn, UserPlus, X, Trophy, Activity } from "lucide-react";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import LogoImage from "@/components/LogoImage";
import qrCodeImg from "@/assets/qrcode-torneiopro.png";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const sports = [
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    video: "/videos/sport-beach-volleyball.mp4",
    subtitle: "Torneios · Chaveamento · Placar",
    accent: "from-amber-500/80 to-orange-600/80",
    glowColor: "hsl(35 85% 55% / 0.35)",
    borderGlow: "hsl(35 85% 55% / 0.4)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    video: "/videos/sport-futevolei.mp4",
    subtitle: "Torneios · Chaveamento · Placar",
    accent: "from-emerald-500/80 to-teal-600/80",
    glowColor: "hsl(155 55% 40% / 0.35)",
    borderGlow: "hsl(155 55% 45% / 0.4)",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    video: "/videos/sport-beach-tennis.mp4",
    subtitle: "Torneios · Chaveamento · Placar",
    accent: "from-sky-500/80 to-blue-600/80",
    glowColor: "hsl(195 85% 45% / 0.35)",
    borderGlow: "hsl(195 85% 50% / 0.4)",
  },
  {
    id: "tennis",
    name: "Tênis",
    video: "/videos/sport-tennis.mp4",
    subtitle: "Torneios · Chaveamento · Placar",
    accent: "from-lime-500/80 to-green-600/80",
    glowColor: "hsl(120 50% 40% / 0.35)",
    borderGlow: "hsl(120 50% 45% / 0.4)",
  },
  {
    id: "padel",
    name: "Padel",
    video: "/videos/sport-padel.mp4",
    subtitle: "Torneios · Chaveamento · Placar",
    accent: "from-violet-500/80 to-purple-600/80",
    glowColor: "hsl(270 60% 50% / 0.35)",
    borderGlow: "hsl(270 60% 55% / 0.4)",
  },
  {
    id: "futsal",
    name: "Futsal",
    video: "/videos/sport-futsal.mp4",
    subtitle: "Torneios · Chaveamento · Placar",
    accent: "from-red-500/80 to-rose-600/80",
    glowColor: "hsl(0 70% 50% / 0.35)",
    borderGlow: "hsl(0 70% 55% / 0.4)",
  },
];

/* ---------- Cosmic particle field ---------- */
const particles = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  size: 1.5 + Math.random() * 3,
  x: Math.random() * 100,
  y: Math.random() * 100,
  delay: Math.random() * 8,
  duration: 4 + Math.random() * 6,
  color: Math.random() > 0.5
    ? `hsl(22 90% ${55 + Math.random() * 20}% / ${0.25 + Math.random() * 0.35})`
    : `hsl(35 80% ${55 + Math.random() * 20}% / ${0.2 + Math.random() * 0.3})`,
}));

const SportCard = ({ sport, i, navigate }: { sport: typeof sports[number]; i: number; navigate: ReturnType<typeof useNavigate> }) => (
  <motion.button
    key={sport.id}
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 120 }}
    onClick={() => navigate("/auth", { state: { sport: sport.id } })}
    className="group relative overflow-hidden rounded-2xl sport-card-glow cursor-pointer w-full"
    style={{
      boxShadow: `0 4px 24px ${sport.glowColor}, inset 0 0 0 1px ${sport.borderGlow}`,
    }}
  >
    <div className="relative overflow-hidden h-32 sm:h-44 md:h-48">
      <video
        src={sport.video}
        autoPlay
        muted
        loop
        playsInline
        preload={i === 0 ? "auto" : "metadata"}
        className="absolute inset-0 w-full h-full object-cover scale-[1.15] pointer-events-none"
      />
      <div className={`absolute inset-0 bg-gradient-to-t ${sport.accent}`} />
      <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[hsl(0_0%_100%/0.35)] transition-colors duration-300" />
    </div>
    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
      <h2 className="text-base sm:text-xl font-bold text-white font-display drop-shadow-lg">
        {sport.name}
      </h2>
    </div>
  </motion.button>
);

const Index = () => {
  const navigate = useNavigate();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-10">
      {/* ── Hamburger menu button ── */}
      <button
        onClick={() => setMenuOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(0_0%_100%/0.15)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md text-foreground hover:bg-[hsl(220_15%_15%/0.9)] transition-colors"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Slide-out menu overlay ── */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute left-0 top-0 bottom-0 w-72 border-r border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_20%_8%)] p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <LogoImage className="h-8 w-8" />
                <span className="font-display font-bold text-foreground">Torneio Pro</span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              <button
                onClick={() => { setMenuOpen(false); navigate("/agendamentos"); }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-foreground hover:bg-[hsl(0_0%_100%/0.08)] transition-colors"
              >
                <CalendarDays className="h-5 w-5 text-primary" />
                Agendamento de Quadras
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate("/comunidades"); }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-foreground hover:bg-[hsl(0_0%_100%/0.08)] transition-colors"
              >
                <Trophy className="h-5 w-5 text-amber-400" />
                Rankings & Desafios
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate("/feed"); }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-foreground hover:bg-[hsl(0_0%_100%/0.08)] transition-colors"
              >
                <Activity className="h-5 w-5 text-emerald-400" />
                Feed de Atividades
              </button>

              <div className="my-2 border-t border-[hsl(0_0%_100%/0.08)]" />
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Atleta</p>

              <button
                onClick={() => { setMenuOpen(false); navigate("/atleta/cadastro"); }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-foreground hover:bg-[hsl(0_0%_100%/0.08)] transition-colors"
              >
                <UserPlus className="h-5 w-5 text-emerald-400" />
                Criar Conta
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate("/athlete-login"); }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-foreground hover:bg-[hsl(0_0%_100%/0.08)] transition-colors"
              >
                <LogIn className="h-5 w-5 text-sky-400" />
                Entrar como Atleta
              </button>

              <div className="my-2 border-t border-[hsl(0_0%_100%/0.08)]" />
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Arena</p>

              <button
                onClick={() => { setMenuOpen(false); navigate("/arena-login"); }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left font-medium text-foreground hover:bg-[hsl(0_0%_100%/0.08)] transition-colors"
              >
                <LogIn className="h-5 w-5 text-amber-400" />
                Login da Arena
              </button>
            </nav>
          </motion.div>
        </div>
      )}
      {/* ── Deep space background ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />

      {/* Warm nebula glow — top-left */}
      <div className="absolute top-[-15%] left-[-15%] w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,hsl(22_80%_45%/0.14),transparent_65%)] blur-3xl animate-float-slow" />
      {/* Cool nebula — top-right */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,hsl(195_70%_40%/0.08),transparent_60%)] blur-3xl animate-float-slow" style={{ animationDelay: "4s" }} />
      {/* Warm nebula — bottom-right */}
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,hsl(15_80%_40%/0.12),transparent_65%)] blur-3xl animate-float-slow" style={{ animationDelay: "2s" }} />
      {/* Center subtle blue */}
      <div className="absolute top-[50%] left-[30%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,hsl(220_60%_30%/0.06),transparent_60%)] blur-3xl" />

      {/* ── Cosmic particles ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-cosmic-particle"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            }}
          />
        ))}
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(220_25%_4%/0.7)_100%)]" />

      {/* ══════════ Content ══════════ */}
      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <div className="mx-auto mb-3 flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center">
            <LogoImage className="h-36 w-36 sm:h-44 sm:w-44" />
          </div>
        </motion.div>

        {/* Hero title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8 text-center max-w-xl mx-auto"
        >
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold leading-tight">
            <span className="text-gradient-primary">Placar ao vivo</span>{" "}
            <span className="text-foreground">e chaves automáticas para torneios esportivos</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-[hsl(35_30%_65%)]">
            Sistema profissional de gestão de torneios
          </p>
        </motion.div>

        {/* Sport cards grid */}
        <div className="w-full grid grid-cols-3 gap-3 sm:gap-4">
          {sports.slice(0, 3).map((sport, i) => (
            <SportCard key={sport.id} sport={sport} i={i} navigate={navigate} />
          ))}
        </div>
        <div className="w-full grid grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
          {sports.slice(3, 6).map((sport, i) => (
            <SportCard key={sport.id} sport={sport} i={i + 3} navigate={navigate} />
          ))}
        </div>

        {/* Athlete CTA — prominent */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-10 w-full max-w-md"
        >
          <button
            onClick={() => navigate("/athlete-login")}
            className="w-full rounded-2xl py-4 text-center font-display font-bold text-lg sm:text-xl tracking-wide text-white uppercase transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, hsl(195 80% 35%), hsl(210 70% 30%))",
              boxShadow: "0 0 30px hsl(195 80% 50% / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.1)",
            }}
          >
            Entrar como Atleta
            <span className="block text-xs sm:text-sm font-body font-normal tracking-normal normal-case opacity-70 mt-0.5">
              Código do torneio
            </span>
          </button>
        </motion.div>

        {/* QR Code section — inline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
          className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-[hsl(0_0%_100%/0.08)] bg-[hsl(220_15%_10%/0.6)] backdrop-blur-md px-6 py-5 max-w-xs w-full"
        >
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-foreground">
            <Smartphone className="h-4 w-4 text-primary" />
            Acessar pelo celular
          </div>
          <img
            src={qrCodeImg}
            alt="QR Code Torneio Pro"
            className="h-36 w-36 rounded-lg bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">Escaneie para abrir no celular</p>
          <button
            onClick={() => navigate("/qrcode")}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-all"
          >
            <QrCode className="h-3.5 w-3.5" />
            QR Code
          </button>
        </motion.div>

        {/* Install App button — only shows when available */}
        {canInstall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 }}
            className="mt-6"
          >
            <button
              onClick={promptInstall}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-display font-semibold text-white transition-all hover:scale-105"
              style={{
                background: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 85% 45%))",
                boxShadow: "0 0 20px hsl(45 90% 50% / 0.3)",
              }}
            >
              <Download className="h-4 w-4" />
              Instalar App
            </button>
          </motion.div>
        )}

        <FlowAppsBranding variant="home-footer" />
      </div>
    </div>
  );
};

export default Index;
