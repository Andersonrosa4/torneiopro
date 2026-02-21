import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";

interface Ad {
  id: string;
  title: string;
  image_url: string | null;
  link_url: string | null;
}

const SystemAdsBanner = () => {
  const [ads, setAds] = useState<Ad[]>([]);

  useEffect(() => {
    supabase
      .from("system_ads")
      .select("id, title, image_url, link_url")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .limit(3)
      .then(({ data }) => {
        if (data) setAds(data);
      });
  }, []);

  if (ads.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Megaphone className="h-4 w-4" /> Anúncios
      </h2>
      <div className="space-y-2">
        {ads.map((ad) => (
          <Card
            key={ad.id}
            className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] overflow-hidden cursor-pointer hover:border-amber-500/40 transition-all"
            onClick={() => ad.link_url && window.open(ad.link_url, "_blank")}
          >
            {ad.image_url && (
              <img src={ad.image_url} alt={ad.title} className="w-full h-32 object-cover" />
            )}
            <CardContent className="p-3">
              <p className="text-sm font-semibold text-foreground">{ad.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SystemAdsBanner;
