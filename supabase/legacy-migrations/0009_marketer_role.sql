-- Adding an enum value must be its own migration/transaction (Postgres
-- disallows using a freshly added enum value in the same transaction that
-- added it).
alter type public.user_role add value 'marketer';
