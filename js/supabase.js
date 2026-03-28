const SUPABASE_URL = 'https://biyytdbxnchvohcmehyx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpeXl0ZGJ4bmNodm9oY21laHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzM4MTAsImV4cCI6MjA5MDI0OTgxMH0.lYlsOUXJHCQluRyB9ow3-gzv83AeQBZmDvveGm4p70U'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)