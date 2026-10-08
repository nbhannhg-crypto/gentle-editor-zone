CREATE TABLE public.media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'audio',
  title text NOT NULL DEFAULT '',
  code text NOT NULL DEFAULT '',
  transcript text NOT NULL DEFAULT '',
  path text NOT NULL,
  mime text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_library TO authenticated;
GRANT ALL ON public.media_library TO service_role;
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own media" ON public.media_library FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  subject text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  admin_reply text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or admin" ON public.complaints FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "insert own" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'new' AND admin_reply = '');
CREATE POLICY "admin update" ON public.complaints FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "media own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media-library' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid()));
CREATE POLICY "media own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-library' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid()));
CREATE POLICY "media own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media-library' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid()));