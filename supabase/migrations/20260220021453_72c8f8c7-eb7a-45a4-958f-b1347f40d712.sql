
-- States table
CREATE TABLE public.states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  uf text NOT NULL UNIQUE
);
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view states" ON public.states FOR SELECT USING (true);

-- Cities table
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES public.states(id) ON DELETE CASCADE,
  name text NOT NULL
);
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view cities" ON public.cities FOR SELECT USING (true);

-- Arenas table
CREATE TABLE public.arenas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  description text,
  state_id uuid NOT NULL REFERENCES public.states(id),
  city_id uuid NOT NULL REFERENCES public.cities(id),
  address text,
  phone text,
  whatsapp text,
  opening_time time NOT NULL DEFAULT '08:00',
  closing_time time NOT NULL DEFAULT '22:00',
  working_days text NOT NULL DEFAULT 'mon,tue,wed,thu,fri,sat,sun',
  cancel_policy_hours integer NOT NULL DEFAULT 2,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.arenas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active arenas" ON public.arenas FOR SELECT USING (active = true);

-- Arena admins table
CREATE TABLE public.arena_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id uuid NOT NULL REFERENCES public.arenas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(arena_id, user_id)
);
ALTER TABLE public.arena_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Arena admins can view own" ON public.arena_admins FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Arena admins full view for admin" ON public.arena_admins FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only app admins can manage arena_admins" ON public.arena_admins FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Helper function: check if user is arena admin
CREATE OR REPLACE FUNCTION public.is_arena_admin(_arena_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.arena_admins
    WHERE arena_id = _arena_id AND user_id = auth.uid()
  );
$$;

-- Arena admin policies for arenas management
CREATE POLICY "Arena admins can update own arena" ON public.arenas FOR UPDATE USING (public.is_arena_admin(id));
CREATE POLICY "App admins can manage arenas" ON public.arenas FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Arena admins can view own arena even inactive" ON public.arenas FOR SELECT USING (public.is_arena_admin(id));

-- Courts table
CREATE TABLE public.courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id uuid NOT NULL REFERENCES public.arenas(id) ON DELETE CASCADE,
  name text NOT NULL,
  sport_type text NOT NULL DEFAULT 'beach_tennis',
  surface_type text DEFAULT 'sand',
  slot_duration_minutes integer NOT NULL DEFAULT 60,
  price_per_slot numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active courts" ON public.courts FOR SELECT USING (active = true);
CREATE POLICY "Arena admin can manage courts" ON public.courts FOR ALL USING (public.is_arena_admin(arena_id));
CREATE POLICY "Arena admin can view all courts" ON public.courts FOR SELECT USING (public.is_arena_admin(arena_id));

-- Bookings table
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id uuid NOT NULL REFERENCES public.arenas(id),
  court_id uuid NOT NULL REFERENCES public.courts(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','blocked','no_show')),
  payment_method text DEFAULT 'later' CHECK (payment_method IN ('pix','cash','card','later')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Unique constraint to prevent double booking
CREATE UNIQUE INDEX idx_bookings_no_double ON public.bookings (court_id, booking_date, start_time) WHERE status IN ('confirmed','blocked');

-- Bookings RLS
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Arena admin can view arena bookings" ON public.bookings FOR SELECT USING (public.is_arena_admin(arena_id));
CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Arena admin can manage bookings" ON public.bookings FOR ALL USING (public.is_arena_admin(arena_id));
-- Public view of booked slots (without user details) for availability check
CREATE POLICY "Anyone can check availability" ON public.bookings FOR SELECT USING (true);

-- User debts table
CREATE TABLE public.user_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  booking_id uuid REFERENCES public.bookings(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own debts" ON public.user_debts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Arena admin can manage debts" ON public.user_debts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND public.is_arena_admin(b.arena_id)
  )
);
CREATE POLICY "App admin can manage all debts" ON public.user_debts FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for bookings
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- Seed Brazilian states
INSERT INTO public.states (name, uf) VALUES
  ('Acre','AC'),('Alagoas','AL'),('Amapá','AP'),('Amazonas','AM'),
  ('Bahia','BA'),('Ceará','CE'),('Distrito Federal','DF'),('Espírito Santo','ES'),
  ('Goiás','GO'),('Maranhão','MA'),('Mato Grosso','MT'),('Mato Grosso do Sul','MS'),
  ('Minas Gerais','MG'),('Pará','PA'),('Paraíba','PB'),('Paraná','PR'),
  ('Pernambuco','PE'),('Piauí','PI'),('Rio de Janeiro','RJ'),('Rio Grande do Norte','RN'),
  ('Rio Grande do Sul','RS'),('Rondônia','RO'),('Roraima','RR'),('Santa Catarina','SC'),
  ('São Paulo','SP'),('Sergipe','SE'),('Tocantins','TO');
