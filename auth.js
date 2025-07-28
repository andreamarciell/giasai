/* auth.js – Supabase guard & helpers for Toppery AML */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// TODO: sostituisci con le tue chiavi del progetto Supabase
const SUPABASE_URL  = "https://vobftcreopaqrfoonybp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvYmZ0Y3Jlb3BhcXJmb29ueWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzOTAxNDcsImV4cCI6MjA2ODk2NjE0N30.1n0H8fhQLwKWe9x8sdQYXKX002Bo4VywijxGLxX8jbo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true }
});

const SESSION_MS = 3 * 60 * 60 * 1000; // 3 ore

export async function getCurrentSession(){
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const key = `login_time_${session.user.id}`;
    let start = localStorage.getItem(key);
    if (!start){
        localStorage.setItem(key, Date.now());
        return session;
    }
    if (Date.now() - Number(start) > SESSION_MS){
        localStorage.removeItem(key);
        await supabase.auth.signOut();
        return null;
    }
    return session;
}

// logout helper
export async function logout(){
    const { data: { session } } = await supabase.auth.getSession();
    if (session) localStorage.removeItem(`login_time_${session.user.id}`);
    await supabase.auth.signOut();
}

// Immediate guard: run only if *not* on login.html
(async () => {
    if (location.pathname.endsWith("login.html")) return;
    const s = await getCurrentSession();
    if (!s){
        const redirectParam = encodeURIComponent(location.pathname + location.search);
        location.replace(`login.html?redirect=${redirectParam}`);
    }
})();
