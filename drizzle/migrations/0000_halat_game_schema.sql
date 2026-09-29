CREATE TABLE IF NOT EXISTS public.question_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid REFERENCES public.question_sets(id) ON DELETE SET NULL,
  question text NOT NULL DEFAULT '',
  option_a text NOT NULL DEFAULT '',
  option_b text NOT NULL DEFAULT '',
  option_c text NOT NULL DEFAULT '',
  option_d text NOT NULL DEFAULT '',
  correct_answer text,
  correct_answer_text text,
  question_type text NOT NULL DEFAULT 'multiple',
  category text NOT NULL DEFAULT 'Genel',
  difficulty text NOT NULL DEFAULT 'Orta',
  time_limit integer NOT NULL DEFAULT 30,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'WAITING',
  current_question integer NOT NULL DEFAULT 0,
  question_ids uuid[] NOT NULL DEFAULT '{}',
  question_started_at timestamptz,
  reveal boolean NOT NULL DEFAULT false,
  rope_position integer NOT NULL DEFAULT 0,
  set_id uuid REFERENCES public.question_sets(id) ON DELETE SET NULL,
  winner text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  team integer NOT NULL,
  connected boolean NOT NULL DEFAULT true,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer text,
  answer_text text,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_set_id_idx ON public.questions(set_id);
CREATE INDEX IF NOT EXISTS players_room_id_idx ON public.players(room_id);
CREATE INDEX IF NOT EXISTS answers_room_id_idx ON public.answers(room_id);

GRANT ALL ON public.question_sets, public.questions, public.rooms, public.players, public.answers TO service_role;
GRANT SELECT ON public.rooms, public.players TO anon, authenticated;

ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read rooms" ON public.rooms;
CREATE POLICY "Public read rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public read players" ON public.players;
CREATE POLICY "Public read players" ON public.players FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms, public.players;