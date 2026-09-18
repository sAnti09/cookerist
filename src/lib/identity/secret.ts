const DEVICE_SECRET_BYTES = 32;

// Crockford base32 minus I/L/O/U (easy to misread) -- 32 symbols so
// `byte % 32` over a full byte range (0-255) has zero modulo bias.
const PAIRING_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAIRING_CODE_LENGTH = 8;

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

// The bearer credential for one device -- high-entropy (256 bits), so a
// single unsalted SHA-256 hash (see hashToken) is enough to store it
// unguessably; salting only matters for low-entropy, human-chosen secrets.
export function generateDeviceSecret(): string {
	const bytes = new Uint8Array(DEVICE_SECRET_BYTES);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes);
}

// Short and human-typeable (read aloud between two devices) -- acceptable
// entropy given it's single-use and expires in minutes (see registry.ts's
// PAIRING_CODE_TTL_SECONDS), unlike deviceSecret above which has to remain
// safe indefinitely.
export function generatePairingCode(): string {
	const bytes = new Uint8Array(PAIRING_CODE_LENGTH);
	crypto.getRandomValues(bytes);
	return Array.from(
		bytes,
		(byte) => PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length],
	).join("");
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return toHex(new Uint8Array(digest));
}

// Avoids a data-dependent early-exit string comparison when checking a
// device secret's hash against the stored one.
export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
