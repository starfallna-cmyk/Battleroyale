// Supabase-backed accounts for KILLSHOT.
// The URL + anon key are public by design (the anon key is safe to ship in a
// static client; row-level security guards the data).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = 'https://lxtjlstuwoqzqqrajhuy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dGpsc3R1d29xenFxcmFqaHV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NjcyNjIsImV4cCI6MjA5NzA0MzI2Mn0.UDF0Ee3wgrb6qJamCvi9JV1jioPATj8tPgOD10mM4eM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Friendly wrappers — each returns { ok, error?, ...data }
export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { username } },
  });
  if (error) return { ok: false, error: error.message };
  if (data.session) return { ok: true, session: data.session };
  // accounts are auto-confirmed server-side, so we can log straight in for
  // instant play even though signUp didn't hand back a session
  const login = await signIn(email, password);
  if (login.ok) return login;
  return { ok: true, needsConfirm: true };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, session: data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

// Returns the player's profile row ({ username, is_admin, ... }) or null.
export async function getProfile() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles').select('username, is_admin').eq('id', user.id).single();
  if (error || !data) {
    // fall back to the email check if the profile row isn't readable yet
    return { username: user.email?.split('@')[0] || 'Player',
      is_admin: (user.email || '').toLowerCase() === 'chase.pivor@icloud.com' };
  }
  return data;
}

export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange(() => cb());
}
