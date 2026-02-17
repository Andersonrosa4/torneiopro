import { useEffect, useRef, useState } from "react";
import logoImg from "@/assets/logo-tp.png";

interface LogoImageProps {
  className?: string;
}

const LogoImage = ({ className = "h-32 w-32" }: LogoImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

      // Remove white/near-white pixels by setting alpha to 0
      const threshold = 220; // pixels with R,G,B all above this become transparent
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0; // set alpha to 0
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setDataUrl(canvas.toDataURL("image/png"));
    };
    img.src = logoImg;
  }, []);

  if (!dataUrl) {
    // Show nothing while processing to avoid flash
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
