
-- Quiz Battle Rooms
CREATE TABLE public.quiz_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  host_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, playing, finished
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_question INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 10,
  question_answered_by TEXT DEFAULT NULL, -- player_id who answered current question correctly first
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players in a quiz room
CREATE TABLE public.quiz_room_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.quiz_rooms(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  is_host BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quiz_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_room_players ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can see rooms/players)
CREATE POLICY "Anyone can read quiz rooms" ON public.quiz_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can read quiz room players" ON public.quiz_room_players FOR SELECT USING (true);

-- Public insert (no auth required for casual game)
CREATE POLICY "Anyone can create quiz rooms" ON public.quiz_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can join quiz rooms" ON public.quiz_room_players FOR INSERT WITH CHECK (true);

-- Public update (managed by edge function logic)
CREATE POLICY "Anyone can update quiz rooms" ON public.quiz_rooms FOR UPDATE USING (true);
CREATE POLICY "Anyone can update quiz room players" ON public.quiz_room_players FOR UPDATE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_room_players;

-- Index for fast code lookup
CREATE INDEX idx_quiz_rooms_code ON public.quiz_rooms(code);
CREATE INDEX idx_quiz_room_players_room_id ON public.quiz_room_players(room_id);
