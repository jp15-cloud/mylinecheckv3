CREATE TABLE public.shared_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift TEXT NOT NULL,
  member TEXT,
  brand_name TEXT NOT NULL DEFAULT 'LUMA',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, date, shift)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_shifts TO authenticated;
GRANT ALL ON public.shared_shifts TO service_role;

ALTER TABLE public.shared_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their shared shifts"
  ON public.shared_shifts FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their shared shifts"
  ON public.shared_shifts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their shared shifts"
  ON public.shared_shifts FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their shared shifts"
  ON public.shared_shifts FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.get_shared_shift(_id uuid)
RETURNS TABLE (
  id uuid,
  date date,
  shift text,
  member text,
  brand_name text,
  payload jsonb,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.date, s.shift, s.member, s.brand_name, s.payload, s.updated_at
  FROM public.shared_shifts s
  WHERE s.id = _id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_shift(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_shift(uuid) TO anon, authenticated;