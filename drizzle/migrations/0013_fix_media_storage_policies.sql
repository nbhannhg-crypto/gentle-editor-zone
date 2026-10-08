DROP POLICY "media own read" ON storage.objects;
DROP POLICY "media own write" ON storage.objects;
DROP POLICY "media own delete" ON storage.objects;
CREATE POLICY "media own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media-library' AND (storage.foldername(objects.name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid()));
CREATE POLICY "media own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-library' AND (storage.foldername(objects.name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid()));
CREATE POLICY "media own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media-library' AND (storage.foldername(objects.name))[1] IN (SELECT id::text FROM public.stores WHERE owner_id = auth.uid()));