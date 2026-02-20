import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArenaAuth } from "@/hooks/useArenaAuth";
import ArenaAuthForm from "@/components/arena/ArenaAuthForm";
import ArenaList from "@/components/arena/ArenaList";
import CourtBooking from "@/components/arena/CourtBooking";
import MyBookings from "@/components/arena/MyBookings";
import MyDebts from "@/components/arena/MyDebts";
import ArenaSchedule from "@/components/arena/ArenaSchedule";
import { Button } from "@/components/ui/button";
import { LogOut, CalendarDays, Building2, Receipt } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { useNavigate } from "react-router-dom";

export default function ArenaBooking() {
  const { user, loading, isArenaAdmin, arenaId, signOut } = useArenaAuth();
  const [selectedArena, setSelectedArena] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Carregando...</p></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-6 cursor-pointer" onClick={() => navigate("/")}>
            <LogoImage className="h-12 w-12" />
            <h1 className="text-xl font-bold">Agendamento de Quadras</h1>
          </div>
          <ArenaAuthForm />
        </div>
      </div>
    );
  }

  // Arena admin view
  if (isArenaAdmin && arenaId) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
              <LogoImage className="h-10 w-10" />
              <h1 className="text-lg font-bold">Painel da Arena</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Sair</Button>
          </div>
          <ArenaSchedule arenaId={arenaId} />
        </div>
      </div>
    );
  }

  // Athlete view
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <LogoImage className="h-10 w-10" />
            <h1 className="text-lg font-bold">Agendamento de Quadras</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Sair</Button>
        </div>

        <Tabs defaultValue="arenas" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="arenas" className="flex items-center gap-1"><Building2 className="h-4 w-4" /> Arenas</TabsTrigger>
            <TabsTrigger value="bookings" className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> Minhas Reservas</TabsTrigger>
            <TabsTrigger value="debts" className="flex items-center gap-1"><Receipt className="h-4 w-4" /> Débitos</TabsTrigger>
          </TabsList>

          <TabsContent value="arenas" className="mt-4">
            {selectedArena ? (
              <CourtBooking
                arenaId={selectedArena.id}
                arenaName={selectedArena.name}
                userId={user.id}
                onBack={() => setSelectedArena(null)}
              />
            ) : (
              <ArenaList onSelectArena={(id, name) => setSelectedArena({ id, name })} />
            )}
          </TabsContent>

          <TabsContent value="bookings" className="mt-4">
            <MyBookings userId={user.id} />
          </TabsContent>

          <TabsContent value="debts" className="mt-4">
            <MyDebts userId={user.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
