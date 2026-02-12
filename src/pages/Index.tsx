import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import beachVolleyImg from "@/assets/sport-beach-volleyball.jpg";
import futevoleiImg from "@/assets/sport-futevolei.jpg";
import beachTennisImg from "@/assets/sport-beach-tennis.jpg";

const sports = [
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    image: beachVolleyImg,
    description: "Organize torneios de vôlei de praia",
    accent: "from-red-900/80 to-red-700/80",
    glowColor: "hsl(0 75% 45% / 0.35)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    image: futevoleiImg,
    description: "Organize torneios de futevôlei",
    accent: "from-red-800/80 to-rose-900/80",
    glowColor: "hsl(0 70% 40% / 0.35)",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    image: beachTennisImg,
    description: "Organize torneios de beach tennis",
    accent: "from-rose-900/80 to-red-800/80",
    glowColor: "hsl(355 70% 42% / 0.35)",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Dark arena background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(0_0%_6%)] via-[hsl(0_0%_9%)] to-[hsl(0_5%_8%)]" />

      {/* Subtle red ambient at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[hsl(0_60%_20%/0.15)] to-transparent" />

      {/* Animated light beams — red tinted */}
      <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(0_70%_50%/0.06)] to-transparent rotate-12 animate-light-beam" />
      <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(45_70%_50%/0.04)] to-transparent -rotate-6 animate-light-beam" style={{ animationDelay: "2s" }} />
      <div className="absolute top-0 left-1/2 w-20 h-full bg-gradient-to-b from-[hsl(0_60%_45%/0.05)] to-transparent rotate-3 animate-light-beam" style={{ animationDelay: "4s" }} />

      {/* Stadium light spots — red/gold */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[radial-gradient(ellipse_at_center,hsl(0_70%_45%/0.1),transparent_70%)]" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_center,hsl(45_70%_50%/0.08),transparent_70%)]" />

      {/* Net texture line */}
      <div className="absolute top-[40%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-[hsl(0_0%_100%/0.08)] to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Trophy className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white font-display">
            Gestão Pro
          </h1>
          <p className="mt-3 text-lg text-[hsl(45_50%_75%)]">
            Sistema profissional de gestão de torneios
          </p>
        </motion.div>

        <div className="grid w-full gap-6 sm:grid-cols-3">
          {sports.map((sport, i) => (
            <motion.button
              key={sport.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 120 }}
              onClick={() => navigate("/auth", { state: { sport: sport.id } })}
              className="group relative overflow-hidden rounded-2xl border border-[hsl(0_0%_100%/0.12)] sport-card-glow cursor-pointer"
              style={{ boxShadow: `0 4px 20px ${sport.glowColor}` }}
            >
              {/* Sport image */}
              <div className="relative h-52 sm:h-56 overflow-hidden">
                <img
                  src={sport.image}
                  alt={sport.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-t ${sport.accent}`} />

                {/* Glow border on hover */}
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[hsl(0_0%_100%/0.3)] transition-colors duration-300" />
              </div>

              {/* Text overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h2 className="text-2xl font-bold text-white font-display drop-shadow-lg">
                  {sport.name}
                </h2>
                <p className="mt-1 text-sm text-[hsl(0_0%_100%/0.85)]">
                  {sport.description}
                </p>
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 text-center"
        >
          <button
            onClick={() => navigate("/athlete-login")}
            className="rounded-full border border-[hsl(0_0%_100%/0.15)] bg-[hsl(0_0%_100%/0.06)] px-6 py-2.5 text-sm text-[hsl(45_40%_80%)] hover:bg-[hsl(0_0%_100%/0.12)] hover:text-white transition-all backdrop-blur-sm"
          >
            Sou atleta → Entrar com código do torneio
          </button>
        </motion.div>

        <FlowAppsBranding variant="home-footer" />
      </div>
    </div>
  );
};

export default Index;
