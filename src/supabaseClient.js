import { createClient } from "@supabase/supabase-js";

// --- CONFIGURATION ---
// These values are now pulled from environment variables.
// You can set these in the "Settings" menu of AI Studio.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Initialize the Supabase client
// We add a check to prevent errors if keys are not yet provided
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

export const supabase = isConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY)
  : null;
