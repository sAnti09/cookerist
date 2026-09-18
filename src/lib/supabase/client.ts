import { createClient } from "@supabase/supabase-js";
import { getAccessToken } from "#/lib/identity/device";

// Read directly from the client bundle (see .env.example) rather than via a
// server function -- the URL + publishable key are meant to be public,
// protected by Row Level Security rather than secrecy, so this is a
// deliberate exception to "never call third-party APIs straight from the
// client" (see CLAUDE.md's AI provider abstraction, which hides GROQ_API_KEY
// for exactly the opposite reason).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
	throw new Error(
		"Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY -- copy .env.example to .env and fill in the values from the Supabase dashboard.",
	);
}

// accessToken is our own self-signed device JWT (see CLAUDE.md's
// "Account-less identity layer"), not a Supabase Auth session -- undefined
// until this device has an identity, in which case every request goes out
// unauthenticated (correct: RLS then hides every row, since there's
// nothing to share/sync for this device yet).
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
	accessToken: async () => (await getAccessToken()) ?? null,
});
