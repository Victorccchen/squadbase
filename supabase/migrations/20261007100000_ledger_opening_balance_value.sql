-- Phase 1 PR-09 (part 1): ledger entry type for credits carried over from a
-- paper card (D8-1). A new enum value cannot be used in the transaction that
-- adds it, so it has its own migration; 20261007110000 uses it. Staging only.

alter type public.credit_ledger_entry_type add value if not exists 'opening_balance';

comment on type public.credit_ledger_entry_type is
  'purchase, attend_debit, no_show_debit, match_debit, admin_adjust, reversal, opening_balance (credits left on a paper card when it is moved into the system, at the card''s unit price).';
