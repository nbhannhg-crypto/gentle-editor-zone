CREATE TABLE public.marriage_trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  kind text NOT NULL,
  label text NOT NULL DEFAULT '',
  payload jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.marriage_trash TO authenticated;
GRANT ALL ON public.marriage_trash TO service_role;
ALTER TABLE public.marriage_trash ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads trash" ON public.marriage_trash FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));
CREATE POLICY "owner purges trash" ON public.marriage_trash FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.marriage_to_trash() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO marriage_trash(store_id, kind, label, payload)
  VALUES (OLD.store_id, TG_ARGV[0],
    CASE WHEN TG_ARGV[0] = 'form' THEN coalesce(OLD.code,'') ELSE '+' || OLD.phone END || ' ' || coalesce(to_jsonb(OLD)->'data'->>'name',''),
    to_jsonb(OLD));
  RETURN OLD;
END $$;
CREATE TRIGGER marriage_forms_trash BEFORE DELETE ON public.marriage_forms FOR EACH ROW EXECUTE FUNCTION public.marriage_to_trash('form');
CREATE TRIGGER marriage_wa_sessions_trash BEFORE DELETE ON public.marriage_wa_sessions FOR EACH ROW EXECUTE FUNCTION public.marriage_to_trash('session');

CREATE OR REPLACE FUNCTION public.restore_marriage_trash(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t marriage_trash%ROWTYPE;
BEGIN
  SELECT * INTO t FROM marriage_trash WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing'; END IF;
  IF NOT (has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM stores WHERE id = t.store_id AND owner_id = auth.uid())) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF t.kind = 'form' THEN
    INSERT INTO marriage_forms SELECT * FROM jsonb_populate_record(NULL::marriage_forms, t.payload) ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO marriage_wa_sessions SELECT * FROM jsonb_populate_record(NULL::marriage_wa_sessions, t.payload) ON CONFLICT DO NOTHING;
  END IF;
  DELETE FROM marriage_trash WHERE id = _id;
  RETURN t.label;
END $$;
GRANT EXECUTE ON FUNCTION public.restore_marriage_trash(uuid) TO authenticated;

ALTER TABLE public.marriage_wa_sessions ADD COLUMN paused boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_marriage_wa_paused(_store uuid, _phone text, _paused boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text := regexp_replace(_phone, '\D', '', 'g'); inst text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM stores WHERE id = _store AND owner_id = auth.uid())) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p LIKE '05%' THEN p := '966' || substr(p, 2); END IF;
  IF length(p) < 7 THEN RAISE EXCEPTION 'bad phone'; END IF;
  UPDATE marriage_wa_sessions SET paused = _paused, updated_at = now() WHERE store_id = _store AND phone = p;
  IF NOT FOUND THEN
    SELECT nullif(instance,'') INTO inst FROM marriage_wa_settings WHERE store_id = _store;
    IF inst IS NULL THEN SELECT instance INTO inst FROM marriage_wa_sessions WHERE store_id = _store ORDER BY updated_at DESC LIMIT 1; END IF;
    IF inst IS NULL THEN RAISE EXCEPTION 'no instance'; END IF;
    INSERT INTO marriage_wa_sessions(instance, phone, store_id, step, gender, data, done, paused)
    VALUES (inst, p, _store, 0, '', '{"greeted":"1"}'::jsonb, true, _paused);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.set_marriage_wa_paused(uuid, text, boolean) TO authenticated;