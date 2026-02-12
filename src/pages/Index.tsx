import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

const sports = [
  {
    id: "beach_volleyball",
    name: "Beach Volley",
    emoji: "🏐",
    gradient: "from-amber-500 to-orange-600",
    description: "Organize torneios de vôlei de praia",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    emoji: "⚽",
    gradient: "from-green-500 to-emerald-600",
    description: "Organize torneios de futevôlei",
  },
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    emoji: "🎾",
    gradient: "from-sky-500 to-blue-600",
    description: "Organize torneios de beach tennis",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Trophy className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-display">
          Arena Pro
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Gerenciador Profissional de Torneios
        </p>
      </motion.div>

      <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-3">
        {sports.map((sport, i) => (
          <motion.button
            key={sport.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => navigate("/auth", { state: { sport: sport.id } })}
            className="group flex flex-col items-center rounded-2xl border border-border bg-card p-8 shadow-card transition-all hover:border-primary/40 hover:shadow-glow"
          >
            <span className="mb-3 text-5xl">{sport.emoji}</span>
            <h2 className="text-xl font-bold font-display">{sport.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground text-center">
              {sport.description}
            </p>
          </motion.button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <button
          onClick={() => navigate("/athlete-login")}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Sou atleta → Entrar com código do torneio
        </button>
      </motion.div>
    </div>
  );
};

export default Index;
