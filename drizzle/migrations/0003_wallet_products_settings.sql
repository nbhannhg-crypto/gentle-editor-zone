CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage products" ON public.products FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE TABLE public.wallets (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read wallet" ON public.wallets FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read tx" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points > 0 AND points <= 100000),
  amount_sar numeric NOT NULL DEFAULT 0,
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.topup_requests TO authenticated;
GRANT ALL ON public.topup_requests TO service_role;
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners create topup" ON public.topup_requests FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));
CREATE POLICY "owners read topup" ON public.topup_requests FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.app_settings(key, value) VALUES
  ('payment_instructions', 'حوّل المبلغ على حساب المنصة البنكي ثم اكتب رقم العملية هنا، ويُضاف رصيدك بعد التأكيد.'),
  ('point_price_sar', '0.10');

CREATE OR REPLACE FUNCTION public.ensure_wallet(_store uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = _store AND (owner_id = auth.uid() OR has_role(auth.uid(),'admin'))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO wallets(store_id) VALUES (_store) ON CONFLICT DO NOTHING;
  SELECT balance INTO b FROM wallets WHERE store_id = _store;
  RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.spend_points(_store uuid, _amount integer, _reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b integer;
BEGIN
  IF _amount <= 0 OR _amount > 100 THEN RAISE EXCEPTION 'bad amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = _store AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO wallets(store_id) VALUES (_store) ON CONFLICT DO NOTHING;
  UPDATE wallets SET balance = balance - _amount, updated_at = now()
    WHERE store_id = _store AND balance >= _amount RETURNING balance INTO b;
  IF b IS NULL THEN RAISE EXCEPTION 'insufficient'; END IF;
  INSERT INTO wallet_transactions(store_id, amount, reason) VALUES (_store, -_amount, left(_reason, 200));
  RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.review_topup(_id uuid, _approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r topup_requests%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO r FROM topup_requests WHERE id = _id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not pending'; END IF;
  UPDATE topup_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END WHERE id = _id;
  IF _approve THEN
    INSERT INTO wallets(store_id) VALUES (r.store_id) ON CONFLICT DO NOTHING;
    UPDATE wallets SET balance = balance + r.points, updated_at = now() WHERE store_id = r.store_id;
    INSERT INTO wallet_transactions(store_id, amount, reason) VALUES (r.store_id, r.points, 'شحن رصيد');
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_wallet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_points(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_topup(uuid, boolean) TO authenticated;