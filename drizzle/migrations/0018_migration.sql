CREATE TABLE public.call_voice_cache (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  key text not null,
  text text not null,
  voice_id text not null default '',
  model text not null default '',
  speed numeric not null default 1,
  emotion text not null default '',
  path text not null,
  uses integer not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_voice_cache TO authenticated;
GRANT ALL ON public.call_voice_cache TO service_role;
ALTER TABLE public.call_voice_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own store or admin" ON public.call_voice_cache FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR exists(select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin') OR exists(select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid()));

CREATE POLICY "call vault own" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'call-vault' AND (public.has_role(auth.uid(),'admin') OR exists(select 1 from public.stores s where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid())))
WITH CHECK (bucket_id = 'call-vault' AND (public.has_role(auth.uid(),'admin') OR exists(select 1 from public.stores s where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid())));