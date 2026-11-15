CREATE TABLE public.marriage_wa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance text NOT NULL,
  phone text NOT NULL,
  store_id uuid NOT NULL,
  step integer NOT NULL DEFAULT 0,
  gender text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance, phone)
);
GRANT SELECT, DELETE ON public.marriage_wa_sessions TO authenticated;
GRANT ALL ON public.marriage_wa_sessions TO service_role;
ALTER TABLE public.marriage_wa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads wa sessions" ON public.marriage_wa_sessions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "owner deletes wa sessions" ON public.marriage_wa_sessions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));