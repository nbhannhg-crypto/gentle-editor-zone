ALTER TABLE public.marriage_wa_settings ADD COLUMN IF NOT EXISTS card_opts jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.get_marriage_card_setting(_store uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT jsonb_build_object('allow', card_customer, 'note', card_note, 'opts', card_opts) FROM public.marriage_wa_settings WHERE store_id = _store), jsonb_build_object('allow', true, 'note', '', 'opts', '{}'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION public.get_marriage_card_setting(uuid) TO anon, authenticated;
