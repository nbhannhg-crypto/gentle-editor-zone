CREATE TABLE public.store_ui_prefs (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_ui_prefs TO authenticated;
GRANT ALL ON public.store_ui_prefs TO service_role;
ALTER TABLE public.store_ui_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own store prefs" ON public.store_ui_prefs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));