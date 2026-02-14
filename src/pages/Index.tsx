import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import beachSportsBg from "@/assets/beach-sports-bg.jpg";
import beachVolleyImg from "@/assets/sport-beach-volleyball.jpg";
import futevoleiImg from "@/assets/sport-futevolei.jpg";
import beachTennisImg from "@/assets/sport-beach-tennis.jpg";
import { Trophy } from "lucide-react";

const sports = [
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    image: beachVolleyImg,
    accent: "from-amber-500/80 to-orange-600/80",
    borderColor: "border-amber-400/50",
    btnBg: "bg-amber-500 hover:bg-amber-600",
    glowColor: "0 0 20px hsl(35 85% 55% / 0.4)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    image: futevoleiImg,
    accent: "from-emerald-500/80 to-teal-600/80",
    borderColor: "border-emerald-400/50",
    btnBg: "bg-emerald-500 hover:bg-emerald-600",
    glowColor: "0 0 20px hsl(155 55% 40% / 0.4)",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    image: beachTennisImg,
    accent: "from-sky-500/80 to-blue-600/80",
    borderColor: "border-sky-400/50",
    btnBg: "bg-sky-500 hover:bg-sky-600",
    glowColor: "0 0 20px hsl(195 85% 45% / 0.4)",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-10">
      {/* Full-screen background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${beachSportsBg})`,
          filter: "blur(3px) brightness(0.5)",
        }}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* App icon + branding */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex flex-col items-center mt-4 mb-6"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mb-3 shadow-glow">
          <Trophy className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white font-display tracking-tight">
          Gestão Pro
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Sistema profissional de gestão de torneios
        </p>
      </motion.div>

      {/* Cards */}
      <div className="relative z-10 w-full max-w-md flex flex-col gap-4 mb-8">
        {sports.map((sport, i) => (
          <motion.button
            key={sport.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 120 }}
            onClick={() => navigate("/auth", { state: { sport: sport.id } })}
            className={`group relative h-36 overflow-hidden rounded-2xl border ${sport.borderColor} cursor-pointer`}
            style={{ boxShadow: sport.glowColor }}
          >
            <img
              src={sport.image}
              alt={sport.name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className={`absolute inset-0 bg-gradient-to-r ${sport.accent}`} />
            <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-white/30 transition-colors duration-300" />

            <div className="relative h-full flex items-center justify-between px-5">
              <h2 className="text-xl font-bold text-white font-display drop-shadow-lg">
                {sport.name}
              </h2>
              <span
                className={`px-4 py-1.5 text-xs font-bold text-white rounded-full ${sport.btnBg} transition-colors shadow-md`}
              >
                Criar agora
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="relative z-10 flex flex-col gap-3 w-full max-w-md"
      >
        <button
          onClick={() => navigate("/auth")}
          className="w-full py-3 text-sm font-bold text-white bg-gradient-primary rounded-full hover:opacity-90 transition-all shadow-glow"
        >
          Criar meu torneio
        </button>
        <button
          onClick={() => navigate("/athlete-login")}
          className="w-full py-3 text-sm font-semibold text-white border border-white/25 rounded-full hover:bg-white/10 transition-all"
        >
          Sou atleta → Entrar com código
        </button>
      </motion.div>

      {/* Branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="relative z-10 mt-auto pt-10"
      >
        <FlowAppsBranding variant="home-footer" />
      </motion.div>
    </div>
  );
};

export default Index;
