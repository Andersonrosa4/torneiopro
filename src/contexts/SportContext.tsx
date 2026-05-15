import { createContext, useContext, useState, ReactNode, useEffect } from "react";

type SportType = "beach_volleyball" | "futevolei" | "beach_tennis";

const STORAGE_KEY = "tp.selectedSport";

const isValidSport = (v: any): v is SportType =>
  v === "beach_volleyball" || v === "futevolei" || v === "beach_tennis";

interface SportContextType {
  selectedSport: SportType | null;
  setSelectedSport: (sport: SportType | null) => void;
}

const SportContext = createContext<SportContextType>({
  selectedSport: null,
  setSelectedSport: () => {},
});

export const useSportTheme = () => useContext(SportContext);

export const SportProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSport, setSelectedSportState] = useState<SportType | null>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      return isValidSport(stored) ? stored : null;
    } catch {
      return null;
    }
  });

  const setSelectedSport = (sport: SportType | null) => {
    setSelectedSportState(sport);
    try {
      if (sport) localStorage.setItem(STORAGE_KEY, sport);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  // Apply sport theme to document
  useEffect(() => {
    if (selectedSport) {
      document.documentElement.setAttribute("data-sport", selectedSport);
    } else {
      document.documentElement.removeAttribute("data-sport");
    }
  }, [selectedSport]);

  return (
    <SportContext.Provider value={{ selectedSport, setSelectedSport }}>
      {children}
    </SportContext.Provider>
  );
};
