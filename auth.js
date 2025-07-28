import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://vobftcreopaqrfoonybp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvYmZ0Y3Jlb3BhcXJmb29ueWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzOTAxNDcsImV4cCI6MjA2ODk2NjE0N30.1n0H8fhQLwKWe9x8sdQYXKX002Bo4VywijxGLxX8jbo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

const SESSION_DURATION = 3 * 60 * 60 * 1000; // 3 hours

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const loginTimeKey = `login_time_{session.user.id}`;
  let loginTime = localStorage.getItem(loginTimeKey);

  if (!loginTime) {
    loginTime = Date.now().toString();
    localStorage.setItem(loginTimeKey, loginTime);
  }

  const sessionStart = parseInt(loginTime, 10);
  const now = Date.now();

  if (now - sessionStart > SESSION_DURATION) {
    localStorage.removeItem(loginTimeKey);
    await supabase.auth.signOut();
    return null;
  }

  return session;
}

(async () => {
  try {
    const session = await getCurrentSession();
    if (!session) {
      const current = encodeURIComponent(location.pathname + location.search);
      location.replace(`https://secure-gateway-login.vercel.app/auth/login?redirect=${current}`);
    }
  } catch (err) {
    console.error("Auth check failed", err);
    location.replace("https://secure-gateway-login.vercel.app/auth/login");
  }
})();