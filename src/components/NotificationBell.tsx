import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const NotificationBell = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadCount();

    // Realtime subscription
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => {
          loadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase.functions.invoke("activity-api", {
      body: { action: "list_notifications", limit: 50 },
    });
    if (Array.isArray(data)) {
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }
  };

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/atleta/notificacoes")}>
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );
};

export default NotificationBell;
