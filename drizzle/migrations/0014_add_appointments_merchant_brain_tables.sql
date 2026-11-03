CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  service text NOT NULL DEFAULT '',
  appointment_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'قادم',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage appointments" ON public.appointments FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE TABLE public.merchant_brain_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  brain_id uuid,
  reply_id uuid,
  toggle_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  usage_type text,
  platform text,
  voice_mode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, toggle_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_brain_usage TO authenticated;
GRANT ALL ON public.merchant_brain_usage TO service_role;
ALTER TABLE public.merchant_brain_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brain usage" ON public.merchant_brain_usage FOR ALL TO authenticated
  USING (merchant_id = auth.uid()) WITH CHECK (merchant_id = auth.uid());

CREATE TABLE public.merchant_brain_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  mother_brain_id uuid,
  type text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_brain_overrides TO authenticated;
GRANT ALL ON public.merchant_brain_overrides TO service_role;
ALTER TABLE public.merchant_brain_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brain overrides" ON public.merchant_brain_overrides FOR ALL TO authenticated
  USING (merchant_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (merchant_id = auth.uid());

CREATE OR REPLACE FUNCTION public.kingdom_brains()
RETURNS TABLE(id uuid, name text, emoji text, short_desc text, reply_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.emoji,
         left(b.instructions, 120) AS short_desc,
         (SELECT count(*)::integer FROM reply_library r WHERE r.store_id = b.store_id AND r.tag = coalesce(nullif(b.library_tag,''), b.name)) AS reply_count
  FROM brains b
  WHERE b.in_mother OR b.store_id IN (SELECT s.id FROM stores s WHERE s.owner_id = auth.uid())
  ORDER BY b.uses DESC, b.created_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.kingdom_brains() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kingdom_brains() TO service_role;

CREATE OR REPLACE FUNCTION public.kingdom_replies(_brain uuid)
RETURNS TABLE(id uuid, trigger_text text, reply_text text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.trigger_text, r.reply_text
  FROM reply_library r
  JOIN brains b ON b.id = _brain AND r.store_id = b.store_id
  WHERE r.tag = coalesce(nullif(b.library_tag,''), b.name)
    AND (b.in_mother OR b.store_id IN (SELECT s.id FROM stores s WHERE s.owner_id = auth.uid()) OR auth.uid() IS NULL)
  ORDER BY r.created_at
$$;
GRANT EXECUTE ON FUNCTION public.kingdom_replies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kingdom_replies(uuid) TO service_role;