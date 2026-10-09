-- ==================================================================
-- Payments INSERT hardening -- 2026-10-08
--
-- Before: policy "allow lenders to insert payments" was
--   FOR INSERT TO public WITH CHECK (true)
-- `public` includes `anon`, and the anon key ships in js/supabase.js, so
-- anyone -- logged in or not -- could insert payment rows against any
-- record under any lender_id. Fake payments lower a borrower's risk score
-- (velocity / partial-payment signals) and corrupt the payments ledger.
--
-- After: only authenticated users, only as themselves (lender_id = the
-- caller's lender row), only on records they own. Admin may insert any.
-- Matches every client insert path: my-records.html (Save payment,
-- Settle) and bulk-upload.html (Bulk Payments) -- all insert
-- lender_id = currentLenderId on the lender's own records.
--
-- Run the whole file once in the Supabase SQL editor. Safe to re-run.
-- ==================================================================

BEGIN;

-- Drop every INSERT-only policy on payments (whatever it was named),
-- leaving SELECT/UPDATE/DELETE/ALL policies untouched.
DO $do$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'payments' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.payments', pol.policyname);
  END LOOP;
END
$do$;

CREATE POLICY payments_insert_own_records
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      lender_id = (
        SELECT l.id FROM public.lenders l
         WHERE l.phone = split_part(auth.jwt() ->> 'email', '@', 1)
      )
      AND record_id IN (
        SELECT r.id FROM public.records r
          JOIN public.lenders l ON l.id = r.lender_id
         WHERE l.phone = split_part(auth.jwt() ->> 'email', '@', 1)
      )
    )
  );

COMMIT;

-- -- Verify ---------------------------------------------------------
-- Expect exactly two rows:
--   payments_insert_own_records   INSERT  {authenticated}
--   payments_select_own_or_admin  SELECT  {authenticated}
-- Any other row with roles {public} or qual/with_check = 'true' is
-- still open -- report it.
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'payments'
 ORDER BY cmd, policyname;
