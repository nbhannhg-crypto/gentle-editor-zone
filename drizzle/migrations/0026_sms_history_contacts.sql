CREATE TABLE public.sms_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 user_id uuid NOT NULL,
 from_number text NOT NULL DEFAULT '',
 to_number text NOT NULL,
 text text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 provider_id text UNIQUE,
 parts integer NOT NULL DEFAULT 0,
 cost_amount text,
 cost_currency text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_messages_select ON public.sms_messages FOR SELECT TO authenticated USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())) OR (SELECT public.has_role((SELECT auth.uid()), 'admin')));
CREATE POLICY sms_messages_insert ON public.sms_messages FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY sms_messages_update ON public.sms_messages FOR UPDATE TO authenticated USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())) OR (SELECT public.has_role((SELECT auth.uid()), 'admin'))) WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())) OR (SELECT public.has_role((SELECT auth.uid()), 'admin')));
CREATE INDEX sms_messages_store_created_idx ON public.sms_messages(store_id, created_at DESC);
CREATE INDEX sms_messages_user_idx ON public.sms_messages(user_id);
CREATE TABLE public.sms_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id),
 name text NOT NULL DEFAULT '',
 phone text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(store_id, phone)
);
GRANT SELECT, INSERT, UPDATE ON public.sms_contacts TO authenticated;
GRANT ALL ON public.sms_contacts TO service_role;
ALTER TABLE public.sms_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_contacts_select ON public.sms_contacts FOR SELECT TO authenticated USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())) OR (SELECT public.has_role((SELECT auth.uid()), 'admin')));
CREATE POLICY sms_contacts_insert ON public.sms_contacts FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY sms_contacts_update ON public.sms_contacts FOR UPDATE TO authenticated USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())) OR (SELECT public.has_role((SELECT auth.uid()), 'admin'))) WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = (SELECT auth.uid())) OR (SELECT public.has_role((SELECT auth.uid()), 'admin')));