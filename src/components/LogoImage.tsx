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

        if (brightness > 250) {
          // Pure white → fully transparent
          data[i + 3] = 0;
        } else if (brightness > 200 && r > 190 && g > 190 && b > 190) {
          // Near-white with low saturation → fade out smoothly
          const factor = (brightness - 200) / 50; // 0 to 1
          data[i + 3] = Math.round(data[i + 3] * (1 - factor));
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
    />
  );
};

export default LogoImage;
