ALTER TABLE public.brains ADD COLUMN IF NOT EXISTS is_kingdom boolean NOT NULL DEFAULT false;
ALTER TABLE public.brains ADD COLUMN IF NOT EXISTS short_desc text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.kingdom_brains()
RETURNS TABLE(id uuid, name text, emoji text, short_desc text, reply_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.emoji,
         left(coalesce(nullif(b.short_desc,''), b.instructions), 120) AS short_desc,
         (SELECT count(*)::integer FROM reply_library r WHERE r.store_id = b.store_id AND r.tag = coalesce(nullif(b.library_tag,''), b.name)) AS reply_count
  FROM brains b
  WHERE b.is_kingdom OR b.in_mother OR b.store_id IN (SELECT s.id FROM stores s WHERE s.owner_id = auth.uid())
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
    AND (b.is_kingdom OR b.in_mother OR b.store_id IN (SELECT s.id FROM stores s WHERE s.owner_id = auth.uid()) OR auth.uid() IS NULL)
  ORDER BY r.created_at
$$;
GRANT EXECUTE ON FUNCTION public.kingdom_replies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kingdom_replies(uuid) TO service_role;