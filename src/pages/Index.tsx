import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import beachSportsBg from "@/assets/beach-sports-bg.jpg";

const sports = [
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    accent: "from-amber-500/80 to-orange-600/80",
    glowColor: "hsl(35 85% 55% / 0.3)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    accent: "from-emerald-500/80 to-teal-600/80",
    glowColor: "hsl(155 55% 40% / 0.3)",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    accent: "from-sky-500/80 to-blue-600/80",
    glowColor: "hsl(195 85% 45% / 0.3)",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Background image with blur and darken */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${beachSportsBg})`,
          filter: "blur(8px) brightness(0.45)",
        }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl font-bold tracking-tight text-white font-display text-center mb-10"
        >
          Controle total do seu torneio.
        </motion.h1>

        <div className="grid w-full gap-4 sm:grid-cols-3 mb-8">
          {sports.map((sport, i) => (
            <motion.button
              key={sport.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1, type: "spring", stiffness: 120 }}
              onClick={() => navigate("/auth", { state: { sport: sport.id } })}
              className="group relative overflow-hidden rounded-xl border border-[hsl(0_0%_100%/0.12)] sport-card-glow cursor-pointer"
              style={{ boxShadow: `0 4px 20px ${sport.glowColor}` }}
            >
              {/* Gradient overlay */}
              <div className={`relative p-6 bg-gradient-to-br ${sport.accent}`} />

              {/* Text overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <h2 className="text-lg sm:text-xl font-bold text-white font-display drop-shadow-lg text-center mb-3">
                  {sport.name}
                </h2>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/auth", { state: { sport: sport.id } });
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-black/40 rounded-full hover:bg-black/60 transition-all"
                >
                  Criar agora
                </button>
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <button
            onClick={() => navigate("/auth")}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-primary rounded-full hover:opacity-90 transition-all"
          >
            Criar meu torneio
          </button>
          <button
            onClick={() => navigate("/athlete-login")}
            className="px-6 py-2.5 text-sm font-semibold text-white border border-[hsl(0_0%_100%/0.3)] rounded-full hover:bg-[hsl(0_0%_100%/0.1)] transition-all"
          >
            Sou atleta → Entrar com código
          </button>
        </motion.div>

        <FlowAppsBranding variant="home-footer" />
      </div>
    </div>
  );
};

export default Index;
