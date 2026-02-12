import { createContext, useContext, useState, ReactNode, useEffect } from "react";

type SportType = "beach_volleyball" | "futevolei" | "beach_tennis";

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
  const [selectedSport, setSelectedSport] = useState<SportType | null>(null);

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
