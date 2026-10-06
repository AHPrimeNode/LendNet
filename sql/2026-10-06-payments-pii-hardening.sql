-- ══════════════════════════════════════════════════════════════════
-- Payments PII hardening — 2026-10-06
--
-- Before: a SELECT policy let any authenticated user read EVERY payments
-- row (all columns, including free-text `notes`, `payment_date`,
-- `lender_id`) so cross-lender risk scoring could see payment amounts.
--
-- After:
--   1. public.payment_amounts(record_ids[]) — SECURITY DEFINER RPC that
--      returns ONLY (record_id, amount) for the requested records. This is
--      what query-borrower.html and insights.html call for scoring.
--   2. Full-row SELECT on payments restricted to: payments the caller
--      logged, payments on records the caller owns, or admin.
--
-- Run the whole file once in the Supabase SQL editor (postgres role).
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Scoring RPC ─────────────────────────────────────────────────
-- Built dynamically so the argument/return types match whatever
-- payments.record_id and payments.amount actually are (uuid/bigint,
-- numeric/…) without guessing.
DO $do$
DECLARE
  id_type  text;
  amt_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO id_type
    FROM pg_attribute
   WHERE attrelid = 'public.payments'::regclass AND attname = 'record_id';

  SELECT format_type(atttypid, atttypmod) INTO amt_type
    FROM pg_attribute
   WHERE attrelid = 'public.payments'::regclass AND attname = 'amount';

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.payment_amounts(p_record_ids %1$s[])
    RETURNS TABLE (record_id %1$s, amount %2$s)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
      SELECT p.record_id, p.amount
        FROM public.payments p
       WHERE p.record_id = ANY(p_record_ids)
         -- caller must be an actual lender, not just any auth user
         AND EXISTS (
           SELECT 1 FROM public.lenders l
            WHERE l.phone = split_part(auth.jwt() ->> 'email', '@', 1)
         )
    $body$
  $f$, id_type, amt_type);
END
$do$;

REVOKE ALL     ON FUNCTION public.payment_amounts FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payment_amounts TO authenticated;

-- ── 2. Replace the open SELECT policy ─────────────────────────────
-- Drops every SELECT-only policy on payments (whatever it was named),
-- leaving INSERT/UPDATE/DELETE/ALL policies untouched.
DO $do$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'payments' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.payments', pol.policyname);
  END LOOP;
END
$do$;

CREATE POLICY payments_select_own_or_admin
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR lender_id = (
      SELECT l.id FROM public.lenders l
       WHERE l.phone = split_part(auth.jwt() ->> 'email', '@', 1)
    )
    OR record_id IN (
      SELECT r.id FROM public.records r
        JOIN public.lenders l ON l.id = r.lender_id
       WHERE l.phone = split_part(auth.jwt() ->> 'email', '@', 1)
    )
  );

COMMIT;

-- Tell PostgREST about the new function right away.
NOTIFY pgrst, 'reload schema';

-- ── Verify ─────────────────────────────────────────────────────────
-- Expect: exactly one SELECT policy (payments_select_own_or_admin).
-- If any row shows cmd = 'ALL' with qual = 'true', it ALSO grants full
-- read access and must be narrowed too — report it before launch.
SELECT policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'payments'
 ORDER BY cmd, policyname;
