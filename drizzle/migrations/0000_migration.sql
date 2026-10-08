CREATE TABLE public.training_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_text text NOT NULL,
  response_text text NOT NULL,
  category text NOT NULL DEFAULT 'عام',
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_rules TO anon, authenticated;
GRANT ALL ON public.training_rules TO service_role;
ALTER TABLE public.training_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all" ON public.training_rules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  matched_rule_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_messages TO anon, authenticated;
GRANT ALL ON public.customer_messages TO service_role;
ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.customer_messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert" ON public.customer_messages FOR INSERT TO anon, authenticated WITH CHECK (true);