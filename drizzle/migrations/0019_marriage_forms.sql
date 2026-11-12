CREATE SEQUENCE IF NOT EXISTS public.marriage_form_seq START 101;
CREATE TABLE public.marriage_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code text NOT NULL DEFAULT ('ND-' || nextval('public.marriage_form_seq')),
  gender text NOT NULL DEFAULT 'male',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marriage_forms TO authenticated;
GRANT ALL ON public.marriage_forms TO service_role;
ALTER TABLE public.marriage_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner or admin manage marriage forms" ON public.marriage_forms FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.submit_marriage_form(_store uuid, _gender text, _data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = _store) THEN RAISE EXCEPTION 'store not found'; END IF;
  IF _gender NOT IN ('male','female') THEN RAISE EXCEPTION 'bad gender'; END IF;
  IF jsonb_typeof(_data) <> 'object' OR length(_data::text) > 8000 THEN RAISE EXCEPTION 'bad data'; END IF;
  INSERT INTO marriage_forms(store_id, gender, data) VALUES (_store, _gender, _data) RETURNING code INTO c;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.submit_marriage_form(uuid,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_marriage_form(uuid,text,jsonb) TO anon, authenticated;