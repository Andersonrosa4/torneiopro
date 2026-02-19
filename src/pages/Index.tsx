import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { QrCode } from "lucide-react";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import LogoImage from "@/components/LogoImage";

const sports = [
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    video: "/videos/sport-beach-volleyball.mp4",
    description: "Organize torneios de vôlei de praia",
    accent: "from-amber-500/80 to-orange-600/80",
    glowColor: "hsl(35 85% 55% / 0.3)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    video: "/videos/sport-futevolei.mp4",
    description: "Organize torneios de futevôlei",
    accent: "from-emerald-500/80 to-teal-600/80",
    glowColor: "hsl(155 55% 40% / 0.3)",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    video: "/videos/sport-beach-tennis.mp4",
    description: "Organize torneios de beach tennis",
    accent: "from-sky-500/80 to-blue-600/80",
    glowColor: "hsl(195 85% 45% / 0.3)",
  },
  {
    id: "tennis",
    name: "Tênis",
    video: "/videos/sport-tennis.mp4",
    description: "Organize torneios de tênis",
    accent: "from-lime-500/80 to-green-600/80",
    glowColor: "hsl(120 50% 40% / 0.3)",
  },
  {
    id: "padel",
    name: "Padel",
    video: "/videos/sport-padel.mp4",
    description: "Organize torneios de padel",
    accent: "from-violet-500/80 to-purple-600/80",
    glowColor: "hsl(270 60% 50% / 0.3)",
  },
];

const SportCard = ({ sport, i, navigate }: { sport: typeof sports[number]; i: number; navigate: ReturnType<typeof useNavigate> }) => (
  <motion.button
    key={sport.id}
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 120 }}
    onClick={() => navigate("/auth", { state: { sport: sport.id } })}
    className="group relative overflow-hidden rounded-2xl border border-[hsl(0_0%_100%/0.12)] sport-card-glow cursor-pointer"
    style={{ boxShadow: `0 4px 20px ${sport.glowColor}` }}
  >
    <div className="relative h-32 sm:h-44 md:h-48 overflow-hidden">
      <video
        src={sport.video}
        autoPlay
        muted
        loop
        playsInline
        preload={i === 0 ? "auto" : "metadata"}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
      <div className={`absolute inset-0 bg-gradient-to-t ${sport.accent}`} />
      <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[hsl(0_0%_100%/0.3)] transition-colors duration-300" />
    </div>
    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
      <h2 className="text-lg sm:text-xl font-bold text-white font-display drop-shadow-lg">
        {sport.name}
      </h2>
      <p className="mt-0.5 text-[11px] sm:text-xs text-[hsl(0_0%_100%/0.85)] leading-tight">
        {sport.description}
      </p>
    </div>
  </motion.button>
);

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 pt-8">
      {/* Beach arena background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220_15%_8%)] via-[hsl(220_12%_12%)] to-[hsl(25_15%_14%)]" />

      {/* Sand texture at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[hsl(35_35%_65%/0.3)] to-transparent" />

      {/* Animated light beams */}
      <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(195_80%_60%/0.08)] to-transparent rotate-12 animate-light-beam" />
      <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(35_80%_60%/0.06)] to-transparent -rotate-6 animate-light-beam" style={{ animationDelay: "2s" }} />
      <div className="absolute top-0 left-1/2 w-20 h-full bg-gradient-to-b from-[hsl(180_60%_50%/0.05)] to-transparent rotate-3 animate-light-beam" style={{ animationDelay: "4s" }} />

      {/* Stadium light spots */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[radial-gradient(ellipse_at_center,hsl(195_80%_60%/0.12),transparent_70%)]" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_center,hsl(22_80%_55%/0.1),transparent_70%)]" />

      {/* Net texture line */}
      <div className="absolute top-[40%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-[hsl(0_0%_100%/0.1)] to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <div className="mx-auto mb-5 flex h-56 w-56 items-center justify-center">
            <LogoImage className="h-56 w-56" />
          </div>
          <p className="mt-3 text-lg text-[hsl(35_30%_80%)]">
            Sistema profissional de gestão de torneios
          </p>
        </motion.div>

        {/* Court container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="relative w-full rounded-3xl border-2 border-[hsl(0_0%_100%/0.15)] p-3 sm:p-5 bg-[hsl(140_35%_22%/0.35)] backdrop-blur-sm"
          style={{
            boxShadow: "inset 0 0 60px hsl(140 30% 20% / 0.2), 0 0 40px hsl(140 30% 20% / 0.1)",
          }}
        >
          {/* Court lines */}
          {/* Center line horizontal */}
          <div className="absolute top-1/2 left-[5%] right-[5%] h-px bg-[hsl(0_0%_100%/0.2)]" />
          {/* Center line vertical */}
          <div className="absolute left-1/2 top-[5%] bottom-[5%] w-px bg-[hsl(0_0%_100%/0.2)]" />
          {/* Service boxes - top left */}
          <div className="absolute top-[5%] left-[5%] w-[45%] h-[45%] border-b border-r border-[hsl(0_0%_100%/0.08)] rounded-br-lg" />
          {/* Service boxes - top right */}
          <div className="absolute top-[5%] right-[5%] w-[45%] h-[45%] border-b border-l border-[hsl(0_0%_100%/0.08)] rounded-bl-lg" />
          {/* Service boxes - bottom left */}
          <div className="absolute bottom-[5%] left-[5%] w-[45%] h-[45%] border-t border-r border-[hsl(0_0%_100%/0.08)] rounded-tr-lg" />
          {/* Service boxes - bottom right */}
          <div className="absolute bottom-[5%] right-[5%] w-[45%] h-[45%] border-t border-l border-[hsl(0_0%_100%/0.08)] rounded-tl-lg" />
          {/* Net glow */}
          <div className="absolute top-1/2 -translate-y-1/2 left-[3%] right-[3%] h-1 bg-gradient-to-r from-transparent via-[hsl(0_0%_100%/0.12)] to-transparent rounded-full" />

          {/* Cards grid: 3 top + 2 bottom centered */}
          <div className="relative z-10 space-y-3 sm:space-y-5">
            {/* Top row: 3 cards */}
            <div className="grid grid-cols-3 gap-3 sm:gap-5">
              {sports.slice(0, 3).map((sport, i) => (
                <SportCard key={sport.id} sport={sport} i={i} navigate={navigate} />
              ))}
            </div>
            {/* Bottom row: 2 cards centered */}
            <div className="grid grid-cols-2 gap-3 sm:gap-5 max-w-[66.666%] mx-auto">
              {sports.slice(3, 5).map((sport, i) => (
                <SportCard key={sport.id} sport={sport} i={i + 3} navigate={navigate} />
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 text-center"
        >
          <button
            onClick={() => navigate("/athlete-login")}
            className="rounded-full border border-[hsl(0_0%_100%/0.15)] bg-[hsl(0_0%_100%/0.06)] px-6 py-2.5 text-sm text-[hsl(35_30%_85%)] hover:bg-[hsl(0_0%_100%/0.12)] hover:text-white transition-all backdrop-blur-sm"
          >
            Sou atleta → Entrar com código do torneio
          </button>
          <button
            onClick={() => navigate("/qrcode")}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-all backdrop-blur-sm"
          >
            <QrCode className="h-4 w-4" />
            QR Code do App
          </button>
        </motion.div>

        <FlowAppsBranding variant="home-footer" />
      </div>
    </div>
  );
};

export default Index;
