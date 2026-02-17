import { useEffect, useState } from "react";
import logoImg from "@/assets/logo-tp.png";

interface LogoImageProps {
  className?: string;
}

const LogoImage = ({ className = "h-32 w-32" }: LogoImageProps) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;
        const maxCh = Math.max(r, g, b);
        const minCh = Math.min(r, g, b);
        const saturation = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh;

        // Remove only pure white background
        if (brightness > 245) {
          data[i + 3] = 0;
        } else if (brightness > 225 && saturation < 0.1) {
          const factor = Math.min(1, (brightness - 225) / 20);
          data[i + 3] = Math.round(data[i + 3] * (1 - factor));
        } else {
          // Boost brightness and saturation for non-white pixels
          // This makes gold more vivid and silver more visible
          const boost = 1.25;
          data[i] = Math.min(255, Math.round(r * boost));
          data[i + 1] = Math.min(255, Math.round(g * boost));
          data[i + 2] = Math.min(255, Math.round(b * boost));
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setDataUrl(canvas.toDataURL("image/png"));
    };
    img.src = logoImg;
  }, []);

  if (!dataUrl) {
    return <div className={className} />;
  }

  return (
    <img
      src={dataUrl}
      alt="Torneio Pro"
      className={`${className} object-contain`}
      style={{ clipPath: 'inset(2%)', filter: 'brightness(1.35) contrast(1.15) saturate(1.3)' }}
    />
  );
};

export default LogoImage;
