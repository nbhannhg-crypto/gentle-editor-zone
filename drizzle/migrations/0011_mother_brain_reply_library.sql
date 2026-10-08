ALTER TABLE public.brains ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.brains ADD COLUMN IF NOT EXISTS voice_name text NOT NULL DEFAULT '';
ALTER TABLE public.brains ADD COLUMN IF NOT EXISTS library_tag text NOT NULL DEFAULT '';
ALTER TABLE public.brains ADD COLUMN IF NOT EXISTS in_mother boolean NOT NULL DEFAULT false;

CREATE TABLE public.reply_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tag text NOT NULL DEFAULT 'عام',
  trigger_text text NOT NULL,
  reply_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reply_library_store_idx ON public.reply_library(store_id, tag);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reply_library TO authenticated;
GRANT ALL ON public.reply_library TO service_role;
ALTER TABLE public.reply_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages library" ON public.reply_library FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.reply_library_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM reply_library WHERE store_id = NEW.store_id) >= 100000 THEN RAISE EXCEPTION 'library full'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reply_library_cap BEFORE INSERT ON public.reply_library FOR EACH ROW EXECUTE FUNCTION public.reply_library_cap();