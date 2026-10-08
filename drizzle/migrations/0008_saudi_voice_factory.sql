CREATE TABLE public.factory_golden (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  path text not null,
  score integer not null default 0,
  mood text not null default '',
  speed numeric not null default 1,
  created_at timestamptz not null default now()
);
CREATE TABLE public.factory_retrain (
  id uuid primary key default gen_random_uuid(),
  text text not null unique,
  note text not null default '',
  attempts integer not null default 0,
  last_score integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
CREATE TABLE public.factory_notes (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  say text not null,
  created_at timestamptz not null default now()
);
CREATE TABLE public.factory_logs (
  id uuid primary key default gen_random_uuid(),
  summary text not null default '',
  trained integer not null default 0,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.factory_golden, public.factory_retrain, public.factory_notes, public.factory_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factory_golden, public.factory_retrain, public.factory_notes, public.factory_logs TO authenticated;
ALTER TABLE public.factory_golden ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_retrain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "factory admin all golden" ON public.factory_golden FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "factory admin all retrain" ON public.factory_retrain FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "factory admin all notes" ON public.factory_notes FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "factory admin read logs" ON public.factory_logs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
COMMENT ON TABLE public.factory_golden IS 'Saudi Voice Factory: ready voices that passed the pronunciation check (owner only)';
COMMENT ON TABLE public.factory_retrain IS 'Saudi Voice Factory: texts that need retraining (owner only)';
