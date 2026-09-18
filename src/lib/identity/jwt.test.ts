// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSigningKeyFromEnv, signDeviceAccessToken } from "./jwt";

function base64UrlDecode(segment: string): Uint8Array<ArrayBuffer> {
	const padded = segment
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(segment.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function decodeJsonSegment(segment: string): unknown {
	return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
}

async function generateSigningKeyFixture() {
	const keyPair = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
	const kid = randomUUID();
	return {
		kid,
		privateJwk: { ...privateJwk, kid },
		publicKey: keyPair.publicKey,
	};
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

describe("loadSigningKeyFromEnv", () => {
	it("parses the kid and JWK out of DEVICE_JWT_SIGNING_KEY", () => {
		process.env.DEVICE_JWT_SIGNING_KEY = JSON.stringify({
			kty: "EC",
			kid: "test-kid",
			crv: "P-256",
			x: "x-value",
			y: "y-value",
			d: "d-value",
		});
		const key = loadSigningKeyFromEnv();
		expect(key.kid).toBe("test-kid");
		expect(key.privateJwk).toMatchObject({ kty: "EC", d: "d-value" });
	});

	it("throws when the env var is missing", () => {
		delete process.env.DEVICE_JWT_SIGNING_KEY;
		expect(() => loadSigningKeyFromEnv()).toThrow(/DEVICE_JWT_SIGNING_KEY/);
	});

	it("throws when the JWK has no kid", () => {
		process.env.DEVICE_JWT_SIGNING_KEY = JSON.stringify({ kty: "EC" });
		expect(() => loadSigningKeyFromEnv()).toThrow(/kid/);
	});
});

describe("signDeviceAccessToken", () => {
	it("produces a JWT with the expected header, payload, and a verifiable signature", async () => {
		const { kid, privateJwk, publicKey } = await generateSigningKeyFixture();

		const { token, expiresAt } = await signDeviceAccessToken({
			userId: "11111111-1111-1111-1111-111111111111",
			signingKey: { kid, privateJwk },
			ttlSeconds: 3600,
		});

		const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
		expect(decodeJsonSegment(encodedHeader)).toEqual({
			alg: "ES256",
			kid,
			typ: "JWT",
		});
		const payload = decodeJsonSegment(encodedPayload) as Record<
			string,
			unknown
		>;
		expect(payload.sub).toBe("11111111-1111-1111-1111-111111111111");
		expect(payload.role).toBe("authenticated");
		expect(payload.exp).toBe(expiresAt);
		expect(payload.exp).toBeGreaterThan(payload.iat as number);

		const isValid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			publicKey,
			base64UrlDecode(encodedSignature),
			new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
		);
		expect(isValid).toBe(true);
	});

	it("rejects verification against a different key pair's signature", async () => {
		const signer = await generateSigningKeyFixture();
		const other = await generateSigningKeyFixture();

		const { token } = await signDeviceAccessToken({
			userId: "22222222-2222-2222-2222-222222222222",
			signingKey: { kid: signer.kid, privateJwk: signer.privateJwk },
			ttlSeconds: 60,
		});
		const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

		const isValid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			other.publicKey,
			base64UrlDecode(encodedSignature),
			new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
		);
		expect(isValid).toBe(false);
	});
});
