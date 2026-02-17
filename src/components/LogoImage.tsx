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
      const w = canvas.width;
      const h = canvas.height;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          const maxCh = Math.max(r, g, b);
          const minCh = Math.min(r, g, b);
          const saturation = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh;

          // Remove only very white pixels (preserve silver/metallic tones)
          if (brightness > 245) {
            data[i + 3] = 0;
          } else if (brightness > 230 && saturation < 0.08) {
            const factor = Math.min(1, (brightness - 230) / 15);
            data[i + 3] = Math.round(data[i + 3] * (1 - factor));
          }

          // Remove dark gray background pixels (low saturation, dark)
          // The logo's actual content has color (gold, silver) so saturation > 0.1
          if (brightness < 90 && saturation < 0.12) {
            // Pure dark gray / near-black without color → likely background
            if (brightness < 40) {
              data[i + 3] = 0;
            } else {
              // Fade out dark grays
              const factor = 1 - (brightness - 40) / 50;
              data[i + 3] = Math.round(data[i + 3] * (1 - factor));
            }
          }
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
      style={{ clipPath: 'inset(2%)' }}
    />
  );
};

export default LogoImage;
