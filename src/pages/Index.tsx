import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import beachSportsBg from "@/assets/beach-sports-bg.jpg";
import beachVolleyImg from "@/assets/sport-beach-volleyball.jpg";
import futevoleiImg from "@/assets/sport-futevolei.jpg";
import beachTennisImg from "@/assets/sport-beach-tennis.jpg";

const sports = [
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    image: beachVolleyImg,
    accent: "from-amber-500/80 to-orange-600/80",
    glowColor: "hsl(35 85% 55% / 0.3)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    image: futevoleiImg,
    accent: "from-emerald-500/80 to-teal-600/80",
    glowColor: "hsl(155 55% 40% / 0.3)",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    image: beachTennisImg,
    accent: "from-sky-500/80 to-blue-600/80",
    glowColor: "hsl(195 85% 45% / 0.3)",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Background image with subtle blur */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${beachSportsBg})`,
          filter: "blur(3px) brightness(0.55)",
        }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Central translucent container */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-2xl px-6 py-12 rounded-3xl"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-display text-center mb-8"
        >
          Controle total do seu torneio.
        </motion.h1>

        {/* Cards Grid */}
        <div className="grid w-full gap-5 grid-cols-1 sm:grid-cols-3 mb-8">
          {sports.map((sport, i) => (
            <motion.button
              key={sport.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 120 }}
              onClick={() => navigate("/auth", { state: { sport: sport.id } })}
              className="group relative h-64 overflow-hidden rounded-2xl border border-[hsl(0_0%_100%/0.15)] sport-card-glow cursor-pointer"
              style={{ boxShadow: `0 8px 24px ${sport.glowColor}` }}
            >
              {/* Card Image */}
              <img
                src={sport.image}
                alt={sport.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />

              {/* Gradient overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${sport.accent}`} />

              {/* Border glow on hover */}
              <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[hsl(0_0%_100%/0.3)] transition-colors duration-300" />

              {/* Text overlay at bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-center">
                <h2 className="text-lg font-bold text-white font-display drop-shadow-lg text-center mb-2">
                  {sport.name}
                </h2>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/auth", { state: { sport: sport.id } });
                  }}
                  className="px-3 py-1 text-xs font-semibold text-white bg-black/50 rounded-full hover:bg-black/70 transition-all"
                >
                  Criar agora
                </button>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
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
      </motion.div>

      {/* Branding Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="relative z-10 mt-12"
      >
        <FlowAppsBranding variant="home-footer" />
      </motion.div>
    </div>
  );
};

export default Index;
