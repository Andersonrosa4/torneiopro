import { useState, useEffect } from "react";
import { X, Instagram, Rocket } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const INSTAGRAM_URL = "https://instagram.com/flowapps.ofc";
const STORAGE_KEY = "promo_popup_shown";

const PromoPopup = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alreadyShown = localStorage.getItem(STORAGE_KEY);
    if (alreadyShown) return;

    const timer = setTimeout(() => {
      setVisible(true);
      localStorage.setItem(STORAGE_KEY, "true");
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setVisible(false)}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setVisible(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                <Rocket className="h-7 w-7 text-primary" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-foreground">
                  Tenha seu próprio App!
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Quer um aplicativo personalizado para sua arena ou evento? A <span className="font-semibold text-foreground">FlowApps</span> cria pra você!
                </p>
              </div>

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
                style={{
                  backgroundImage: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                  boxShadow: "0 4px 20px rgba(225, 48, 108, 0.35)",
                }}
              >
                <Instagram className="h-5 w-5" />
                Fazer cotação no Instagram
              </a>

              <p className="text-xs text-muted-foreground/60">
                @flowapps.ofc
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PromoPopup;
