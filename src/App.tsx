import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SportProvider } from "@/contexts/SportContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AthleteLogin from "./pages/AthleteLogin";
import TournamentPublicView from "./pages/TournamentPublicView";
import PublicRankingsView from "./pages/PublicRankingsView";
import Dashboard from "./pages/Dashboard";
import CreateTournament from "./pages/CreateTournament";
import TournamentDetail from "./pages/TournamentDetail";
import NotFound from "./pages/NotFound";
import SimulationTest from "./pages/SimulationTest";
import SystemDiagnostics from "./pages/SystemDiagnostics";
import QRCodePage from "./pages/QRCodePage";
import CourtBooking from "./pages/CourtBooking";
import ArenaLogin from "./pages/ArenaLogin";
import ArenaDashboard from "./pages/ArenaDashboard";
import AtletaCadastro from "./pages/AtletaCadastro";
import AtletaLoginPage from "./pages/AtletaLoginPage";
import AtletaRecuperarSenha from "./pages/AtletaRecuperarSenha";
import ResetPassword from "./pages/ResetPassword";
import MeusAgendamentos from "./pages/MeusAgendamentos";
import AdminArenaOwners from "./pages/AdminArenaOwners";

import ScrollToTop from "@/components/ScrollToTop";
import AiAssistant from "@/components/AiAssistant";

const queryClient = new QueryClient(); // force rebuild

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SportProvider>
          <AuthProvider>
            <ScrollToTop />
            <AiAssistant />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/athlete-login" element={<AthleteLogin />} />
              <Route path="/tournament-view/:id" element={<TournamentPublicView />} />
              <Route path="/ranking/:code" element={<PublicRankingsView />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/tournaments/new" element={<ProtectedRoute><CreateTournament /></ProtectedRoute>} />
              <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetail /></ProtectedRoute>} />
              <Route path="/qrcode" element={<QRCodePage />} />
              <Route path="/agendamentos" element={<CourtBooking />} />
              <Route path="/arena-login" element={<ArenaLogin />} />
              <Route path="/arena-dashboard" element={<ArenaDashboard />} />
              <Route path="/atleta/cadastro" element={<AtletaCadastro />} />
              <Route path="/atleta/login" element={<AtletaLoginPage />} />
              <Route path="/atleta/recuperar-senha" element={<AtletaRecuperarSenha />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/atleta/meus-agendamentos" element={<MeusAgendamentos />} />
              <Route path="/admin-arenas" element={<AdminArenaOwners />} />
              <Route path="/simulation-test" element={<SimulationTest />} />
              <Route path="/diagnostics" element={<ProtectedRoute><SystemDiagnostics /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </SportProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
