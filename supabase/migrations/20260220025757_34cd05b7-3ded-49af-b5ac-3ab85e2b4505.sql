
-- ====================================================
-- MÓDULO: Agendamentos de Quadras
-- Novas tabelas (usa arenas, courts, arena_admins, states, cities existentes)
-- ====================================================

-- 1) customers (clientes sem login)
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf text NOT NULL UNIQUE,
  phone text NOT NULL,
  state_id uuid REFERENCES public.states(id),
  city_id uuid REFERENCES public.cities(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Anyone can view and insert customers (no login required for booking)
CREATE POLICY "Anyone can view customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT WITH CHECK (true);
-- Arena admins and app admins can update customers
CREATE POLICY "Arena admins can update customers" ON public.customers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2) court_time_slots
CREATE TABLE public.court_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.court_time_slots ENABLE ROW LEVEL SECURITY;

-- Unique constraint to prevent duplicate slots
CREATE UNIQUE INDEX idx_court_time_slots_unique ON public.court_time_slots (court_id, date, start_time, end_time);

-- Anyone can view slots (needed for booking flow)
CREATE POLICY "Anyone can view court_time_slots" ON public.court_time_slots FOR SELECT USING (true);
-- Arena admin can manage slots
CREATE POLICY "Arena admin can manage court_time_slots" ON public.court_time_slots FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.courts c
    JOIN public.arena_admins aa ON aa.arena_id = c.arena_id
    WHERE c.id = court_time_slots.court_id AND aa.user_id = auth.uid()
  )
);
-- App admins can manage all slots
CREATE POLICY "App admin can manage court_time_slots" ON public.court_time_slots FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- 3) customer_wallet
CREATE TABLE public.customer_wallet (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view customer_wallet" ON public.customer_wallet FOR SELECT USING (true);
CREATE POLICY "Arena admin can manage customer_wallet" ON public.customer_wallet FOR ALL USING (
  EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 4) court_bookings
CREATE TABLE public.court_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id uuid NOT NULL REFERENCES public.arenas(id),
  court_id uuid NOT NULL REFERENCES public.courts(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'canceled', 'finished', 'no_show')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'debt')),
  price numeric NOT NULL DEFAULT 0,
  penalty_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.court_bookings ENABLE ROW LEVEL SECURITY;

-- Unique index to prevent double bookings on same court/date/time
CREATE UNIQUE INDEX idx_court_bookings_no_conflict 
  ON public.court_bookings (court_id, date, start_time, end_time)
  WHERE status IN ('reserved', 'finished');

-- Anyone can view bookings (needed for availability check)
CREATE POLICY "Anyone can view court_bookings" ON public.court_bookings FOR SELECT USING (true);
-- Anyone can insert bookings (no login required)
CREATE POLICY "Anyone can insert court_bookings" ON public.court_bookings FOR INSERT WITH CHECK (true);
-- Arena admin can manage bookings
CREATE POLICY "Arena admin can manage court_bookings" ON public.court_bookings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.arena_admins WHERE arena_id = court_bookings.arena_id AND user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);
CREATE POLICY "Arena admin can delete court_bookings" ON public.court_bookings FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.arena_admins WHERE arena_id = court_bookings.arena_id AND user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 5) payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.court_bookings(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('pix', 'card', 'cash')),
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert payments" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Arena admin can manage payments" ON public.payments FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.court_bookings cb
    JOIN public.arena_admins aa ON aa.arena_id = cb.arena_id
    WHERE cb.id = payments.booking_id AND aa.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 6) wallet_transactions
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('charge', 'payment', 'penalty')),
  description text,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wallet_transactions" ON public.wallet_transactions FOR SELECT USING (true);
CREATE POLICY "Arena admin can manage wallet_transactions" ON public.wallet_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- ====================================================
-- INDEXES for performance
-- ====================================================
CREATE INDEX idx_court_bookings_court_date ON public.court_bookings (court_id, date);
CREATE INDEX idx_court_bookings_customer ON public.court_bookings (customer_id);
CREATE INDEX idx_court_bookings_arena ON public.court_bookings (arena_id);
CREATE INDEX idx_court_time_slots_court_date ON public.court_time_slots (court_id, date);
CREATE INDEX idx_wallet_transactions_customer ON public.wallet_transactions (customer_id);
CREATE INDEX idx_customers_cpf ON public.customers (cpf);

-- ====================================================
-- FUNCTION: Auto-create wallet on customer insert
-- ====================================================
CREATE OR REPLACE FUNCTION public.create_customer_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customer_wallet (customer_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (customer_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_customer_wallet
AFTER INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.create_customer_wallet();
