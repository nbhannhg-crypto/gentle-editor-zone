CREATE TABLE public.brains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🧠',
  specialty text NOT NULL DEFAULT 'sales',
  source text NOT NULL DEFAULT 'both',
  instructions text NOT NULL DEFAULT '',
  knowledge text NOT NULL DEFAULT '',
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brains TO authenticated;
GRANT ALL ON public.brains TO service_role;
ALTER TABLE public.brains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brains" ON public.brains FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE TABLE public.brain_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '✨',
  guide text NOT NULL DEFAULT '',
  price_points integer NOT NULL DEFAULT 2,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_services TO authenticated;
GRANT ALL ON public.brain_services TO service_role;
ALTER TABLE public.brain_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read services" ON public.brain_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write services" ON public.brain_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));