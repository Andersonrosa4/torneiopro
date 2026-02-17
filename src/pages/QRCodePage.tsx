import { motion } from "framer-motion";
import { ArrowLeft, Download, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import LogoImage from "@/components/LogoImage";
import qrCodeImage from "@/assets/qrcode-torneiopro.png";

const QRCodePage = () => {
  const navigate = useNavigate();

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = qrCodeImage;
    link.download = "qrcode-torneiopro.png";
    link.click();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(220_15%_10%)] via-[hsl(220_12%_14%)] to-[hsl(25_15%_12%)] px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.12),transparent_70%)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.1),transparent_70%)] blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo & title */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 150 }}
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center relative"
          >
            <LogoImage className="h-20 w-20 relative z-10" />
          </motion.div>
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.2)]">
            <QrCode className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary uppercase tracking-wider">QR Code</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Escaneie o código abaixo para acessar o Torneio Pro
          </p>
        </div>

        {/* QR Code card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card)/0.6)] backdrop-blur-xl p-6 shadow-card relative overflow-hidden"
        >
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.4)] to-transparent" />

          <div className="flex flex-col items-center gap-5">
            <div className="rounded-xl bg-white p-4">
              <img
                src={qrCodeImage}
                alt="QR Code para acessar Torneio Pro"
                className="w-56 h-56"
              />
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Aponte a câmera do celular para o QR code acima
            </p>

            <Button
              onClick={handleDownload}
              variant="outline"
              className="w-full gap-2 rounded-xl"
            >
              <Download className="h-4 w-4" />
              Baixar QR Code
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-5 text-center"
        >
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-all group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            Voltar ao início
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default QRCodePage;
