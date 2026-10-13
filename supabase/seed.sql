-- Local only (runs after migrations on `supabase db reset`). Hosted projects never run this file.
-- The worker's database login (01-tech-stack, M4): a fixed local test password. On hosted projects the owner
-- sets a real one with `alter role uteach_worker with login password '…'`.
alter role uteach_worker with login password 'uteach-worker-local';
