ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'products';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp text NOT NULL DEFAULT '';
ALTER TABLE public.wa_autoreply ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'smart';