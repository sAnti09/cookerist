// Self-signed JWTs for our account-less identity layer -- see CLAUDE.md's
// "Account-less identity layer". Supabase's own Anonymous Auth can't give
// two devices independent, concurrently-usable sessions under one identity
// (its refresh-token reuse detection revokes the whole session if two
// devices ever touch the same refresh-token lineage), so instead we mint
// our own JWTs, signed with a private key imported into the Supabase
// project as a JWT Signing Key (https://supabase.com/docs/guides/auth/signing-keys).
// auth.uid() in RLS policies keeps working unchanged -- it just reads the
// JWT's `sub` claim and role, regardless of whether `sub` exists in
// auth.users.

export type DeviceSigningKey = {
	kid: string;
	privateJwk: JsonWebKey;
};

export function loadSigningKeyFromEnv(): DeviceSigningKey {
	const raw = process.env.DEVICE_JWT_SIGNING_KEY;
	if (!raw) {
		throw new Error(
			"Missing DEVICE_JWT_SIGNING_KEY -- see CLAUDE.md's Environment / secrets section.",
		);
	}
	const jwk = JSON.parse(raw) as JsonWebKey & { kid?: string };
	if (!jwk.kid) {
		throw new Error(
			"DEVICE_JWT_SIGNING_KEY is missing a `kid` -- it must match the key id imported into the Supabase dashboard's JWT Signing Keys page.",
		);
	}
	return { kid: jwk.kid, privateJwk: jwk };
}

function base64UrlEncode(input: string | Uint8Array): string {
	const bytes =
		typeof input === "string" ? new TextEncoder().encode(input) : input;
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export async function signDeviceAccessToken({
	userId,
	signingKey,
	ttlSeconds,
}: {
	userId: string;
	signingKey: DeviceSigningKey;
	ttlSeconds: number;
}): Promise<{ token: string; expiresAt: number }> {
	const header = { alg: "ES256", kid: signingKey.kid, typ: "JWT" };
	const issuedAt = Math.floor(Date.now() / 1000);
	const expiresAt = issuedAt + ttlSeconds;
	// role: "authenticated" is a Postgres role, not a claim about session
	// provenance -- it's what makes the existing `to authenticated` RLS
	// policies from the sync backend (see CLAUDE.md) apply to this token.
	const payload = {
		sub: userId,
		role: "authenticated",
		iat: issuedAt,
		exp: expiresAt,
	};
	const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
	const key = await crypto.subtle.importKey(
		"jwk",
		signingKey.privateJwk,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		key,
		new TextEncoder().encode(signingInput),
	);
	const token = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
	return { token, expiresAt };
}
