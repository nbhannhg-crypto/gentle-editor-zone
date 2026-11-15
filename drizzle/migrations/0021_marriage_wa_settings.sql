CREATE TABLE public.marriage_wa_settings (
  store_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  instance text NOT NULL DEFAULT '',
  smart boolean NOT NULL DEFAULT true,
  welcome text NOT NULL DEFAULT '',
  questions jsonb NOT NULL DEFAULT '{}'::jsonb,
  learned jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marriage_wa_settings TO authenticated;
GRANT ALL ON public.marriage_wa_settings TO service_role;
ALTER TABLE public.marriage_wa_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages marriage wa settings" ON public.marriage_wa_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));