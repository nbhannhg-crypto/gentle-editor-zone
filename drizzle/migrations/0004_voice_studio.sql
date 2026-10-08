CREATE TABLE public.studio_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  text text NOT NULL,
  voice_id text NOT NULL,
  voice_name text NOT NULL DEFAULT '',
  path text NOT NULL,
  chars integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_audio TO authenticated;
GRANT ALL ON public.studio_audio TO service_role;
ALTER TABLE public.studio_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own studio audio" ON public.studio_audio FOR ALL TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE TABLE public.studio_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  fish_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_voices TO authenticated;
GRANT ALL ON public.studio_voices TO service_role;
ALTER TABLE public.studio_voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own studio voices" ON public.studio_voices FOR ALL TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE POLICY "studio files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid()));
CREATE POLICY "studio files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid()));
CREATE POLICY "studio files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid()));