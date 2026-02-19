import logoImg from "@/assets/logo-tp.png";

interface LogoImageProps {
  className?: string;
}

// Simplified: render the logo directly with CSS filters instead of canvas processing.
// Canvas-based pixel manipulation was causing visible delay on initial load.
const LogoImage = ({ className = "h-32 w-32" }: LogoImageProps) => (
  <img
    src={logoImg}
    alt="Torneio Pro"
    fetchPriority="high"
    loading="eager"
    className={`${className} object-contain`}
    style={{ filter: "brightness(1.35) contrast(1.15) saturate(1.3)", clipPath: "inset(2%)" }}
  />
);

export default LogoImage;
