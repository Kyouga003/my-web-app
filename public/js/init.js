// Supabase client initialization � shared by every page.
// Reads the runtime config injected by /js/config.js (Supabase URL + anon key).
// Security is enforced by Row Level Security in the database, not by key secrecy.

const createClient = window.supabase && window.supabase.createClient;
let supabase = null;
let currentUser = null;

export function initSupabase() {
  if (supabase) return supabase;
  const cfg = window.SUPABASE_CONFIG || {};
  if (!createClient || !cfg.url || !cfg.key) {
    console.error('Supabase browser client or configuration is missing.');
    return null;
:  // Initialize theme
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  
  supabase = createClient(cfg.url, cfg.key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session ? session.user : null;
    window.dispatchEvent(new CustomEvent('authstate', { detail: { user: currentUser, session } }));
  });

  const dispatchCurrentAuthState = () => {
    window.dispatchEvent(new CustomEvent('authstate', { detail: { user: currentUser, session: null } }));
  };
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', dispatchCurrentAuthState, { once: true });
  } else {
    queueMicrotask(dispatchCurrentAuthState);
  }

  // Restore any existing session so pages render the signed-in state immediately.
  supabase.auth.getUser().then(({ data }) => {
    currentUser = data.user || null;
    window.dispatchEvent(new CustomEvent('authstate', { detail: { user: currentUser, session: null } }));
  }).catch(() => {
    currentUser = null;
    window.dispatchEvent(new CustomEvent('authstate', { detail: { user: null, session: null } }));
  });

  return supabase;
}

export { supabase, currentUser };
