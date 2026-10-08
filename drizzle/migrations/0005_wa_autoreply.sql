CREATE TABLE public.wa_autoreply (
  instance text PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  voice boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_autoreply TO authenticated;
GRANT ALL ON public.wa_autoreply TO service_role;
ALTER TABLE public.wa_autoreply ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own autoreply" ON public.wa_autoreply FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

CREATE TABLE public.wa_inbox (
  msg_id text PRIMARY KEY,
  instance text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  from_number text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  reply text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wa_inbox TO authenticated;
GRANT ALL ON public.wa_inbox TO service_role;
ALTER TABLE public.wa_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inbox" ON public.wa_inbox FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.spend_points_system(_store uuid, _amount integer, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b integer;
BEGIN
  INSERT INTO wallets(store_id) VALUES (_store) ON CONFLICT DO NOTHING;
  UPDATE wallets SET balance = balance - _amount, updated_at = now()
    WHERE store_id = _store AND balance >= _amount RETURNING balance INTO b;
  IF b IS NULL THEN RAISE EXCEPTION 'insufficient'; END IF;
  INSERT INTO wallet_transactions(store_id, amount, reason) VALUES (_store, -_amount, left(_reason,200));
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.spend_points_system(uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_points_system(uuid,integer,text) TO service_role;