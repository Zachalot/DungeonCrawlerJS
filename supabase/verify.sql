-- Run after the migrations. Read-only: checks that RLS is on and the policies and functions exist.

select relname as table, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relname in ('profiles', 'saves');
-- expect two rows, both rls_enabled = true

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
-- expect 2 policies on profiles (SELECT, UPDATE) and 4 on saves (SELECT, INSERT, UPDATE, DELETE)

select proname as function
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('handle_new_user', 'username_available', 'save_slot');
-- expect three rows

select public.username_available('nobody_has_this_name');
-- expect true
