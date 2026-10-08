CREATE TABLE public.pending_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount_paid numeric NOT NULL,
  currency text NOT NULL,
  points_calculated integer NOT NULL,
  transaction_number text NOT NULL,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending',
  approval_token text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-',''),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pending_payments_txn_uq ON public.pending_payments (lower(trim(transaction_number)));
CREATE UNIQUE INDEX pending_payments_token_uq ON public.pending_payments (approval_token);
GRANT SELECT ON public.pending_payments TO authenticated;
GRANT ALL ON public.pending_payments TO service_role;
ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments read" ON public.pending_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.create_payment(_store uuid, _amount numeric, _currency text, _txn text, _receipt text)
RETURNS TABLE(id uuid, points integer, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rate numeric; p integer; r pending_payments%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = _store AND s.owner_id = auth.uid()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  rate := CASE _currency WHEN 'USD' THEN 1000 WHEN 'SAR' THEN 240 WHEN 'YER' THEN 1.714 ELSE NULL END;
  IF rate IS NULL THEN RAISE EXCEPTION 'bad currency'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 10000000 THEN RAISE EXCEPTION 'bad amount'; END IF;
  IF length(trim(coalesce(_txn,''))) < 3 OR length(_txn) > 100 THEN RAISE EXCEPTION 'bad txn'; END IF;
  p := floor(_amount * rate);
  IF p < 1 THEN RAISE EXCEPTION 'bad amount'; END IF;
  BEGIN
    INSERT INTO pending_payments(user_id, store_id, amount_paid, currency, points_calculated, transaction_number, receipt_url)
    VALUES (auth.uid(), _store, _amount, _currency, p, trim(_txn), nullif(left(coalesce(_receipt,''),500),''))
    RETURNING * INTO r;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'duplicate txn';
  END;
  RETURN QUERY SELECT r.id, r.points_calculated, r.approval_token;
END $$;

CREATE OR REPLACE FUNCTION public.approve_payment(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r pending_payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pending_payments WHERE approval_token = _token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result','missing'); END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('result','done','status',r.status,'at',r.processed_at,'points',r.points_calculated); END IF;
  IF r.expires_at < now() THEN RETURN jsonb_build_object('result','expired'); END IF;
  UPDATE pending_payments SET status='approved', processed_at=now() WHERE id=r.id;
  INSERT INTO wallets(store_id) VALUES (r.store_id) ON CONFLICT DO NOTHING;
  UPDATE wallets SET balance = balance + r.points_calculated, updated_at=now() WHERE store_id=r.store_id;
  INSERT INTO wallet_transactions(store_id, amount, reason) VALUES (r.store_id, r.points_calculated, 'شحن جيب ✅ ' || r.amount_paid || ' ' || r.currency);
  RETURN jsonb_build_object('result','ok','points',r.points_calculated);
END $$;
REVOKE EXECUTE ON FUNCTION public.approve_payment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payment(text) TO service_role;

-- Signup gift
CREATE OR REPLACE FUNCTION public.signup_gift() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO wallets(store_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  UPDATE wallets SET balance = balance + 100, updated_at = now() WHERE store_id = NEW.id;
  INSERT INTO wallet_transactions(store_id, amount, reason) VALUES (NEW.id, 100, 'هدية التسجيل 100 نقطة 🎁');
  RETURN NEW;
END $$;
CREATE TRIGGER stores_signup_gift AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.signup_gift();

-- Mother Kingdom pricing
CREATE TABLE public.kingdom_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  supplier_name text NOT NULL DEFAULT '',
  supplier_cost_points integer NOT NULL DEFAULT 0,
  overhead_points integer NOT NULL DEFAULT 500,
  profit_multiplier numeric NOT NULL DEFAULT 2,
  dammar integer GENERATED ALWAYS AS (supplier_cost_points + overhead_points) STORED,
  profit integer GENERATED ALWAYS AS (floor((supplier_cost_points + overhead_points) * profit_multiplier)::integer) STORED,
  selling_price integer GENERATED ALWAYS AS ((supplier_cost_points + overhead_points) + floor((supplier_cost_points + overhead_points) * profit_multiplier)::integer) STORED,
  is_editable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kingdom_pricing TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kingdom_pricing TO authenticated;
GRANT ALL ON public.kingdom_pricing TO service_role;
ALTER TABLE public.kingdom_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing read" ON public.kingdom_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing admin write" ON public.kingdom_pricing FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.profits_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  service_used text NOT NULL,
  cost_points integer NOT NULL,
  dammar integer NOT NULL,
  profit_earned integer NOT NULL,
  date timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profits_log TO authenticated;
GRANT ALL ON public.profits_log TO service_role;
ALTER TABLE public.profits_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profits admin read" ON public.profits_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.spend_service(_store uuid, _service uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k kingdom_pricing%ROWTYPE; b integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id=_store AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO k FROM kingdom_pricing WHERE id=_service;
  IF NOT FOUND THEN RAISE EXCEPTION 'no service'; END IF;
  INSERT INTO wallets(store_id) VALUES (_store) ON CONFLICT DO NOTHING;
  UPDATE wallets SET balance = balance - k.selling_price, updated_at=now() WHERE store_id=_store AND balance >= k.selling_price RETURNING balance INTO b;
  IF b IS NULL THEN RAISE EXCEPTION 'insufficient'; END IF;
  INSERT INTO wallet_transactions(store_id, amount, reason) VALUES (_store, -k.selling_price, left(k.service_name,200));
  INSERT INTO profits_log(user_id, store_id, service_used, cost_points, dammar, profit_earned) VALUES (auth.uid(), _store, k.service_name, k.selling_price, k.dammar, k.profit);
  RETURN b;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kingdom_pricing;