import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAudioContext,
	playAlarmTone,
	primeAudioContext,
} from "./alarm-sound";

function makeMockContext(state: AudioContextState = "suspended") {
	const oscillator = {
		type: "",
		frequency: { value: 0 },
		connect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
	};
	const gain = { gain: { value: 0 }, connect: vi.fn() };
	return {
		state,
		currentTime: 1.5,
		resume: vi.fn().mockResolvedValue(undefined),
		createOscillator: vi.fn(() => oscillator),
		createGain: vi.fn(() => gain),
		destination: {},
		oscillator,
		gain,
	};
}

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleaning up test-only globals
	delete (window as any).AudioContext;
	// biome-ignore lint/suspicious/noExplicitAny: cleaning up test-only globals
	delete (window as any).webkitAudioContext;
	vi.restoreAllMocks();
});

describe("createAudioContext", () => {
	it("returns null when no AudioContext constructor is available", () => {
		expect(createAudioContext()).toBeNull();
	});

	it("constructs via window.AudioContext when available", () => {
		const mockContext = makeMockContext();
		// vi.fn needs a `function` (not arrow) implementation to be usable
		// with `new` — this stands in for the real AudioContext constructor.
		const Ctor = vi.fn(function AudioContextMock() {
			return mockContext;
		});
		// biome-ignore lint/suspicious/noExplicitAny: assigning a test-only global
		(window as any).AudioContext = Ctor;

		const context = createAudioContext();

		expect(Ctor).toHaveBeenCalledTimes(1);
		expect(context).toBe(mockContext);
	});

	it("falls back to webkitAudioContext when AudioContext is unavailable", () => {
		const mockContext = makeMockContext();
		const Ctor = vi.fn(function AudioContextMock() {
			return mockContext;
		});
		// biome-ignore lint/suspicious/noExplicitAny: assigning a test-only global
		(window as any).webkitAudioContext = Ctor;

		expect(createAudioContext()).toBe(mockContext);
	});

	it("returns null when construction throws", () => {
		// biome-ignore lint/suspicious/noExplicitAny: assigning a test-only global
		(window as any).AudioContext = vi.fn(() => {
			throw new Error("blocked");
		});

		expect(createAudioContext()).toBeNull();
	});
});

describe("primeAudioContext", () => {
	it("does nothing when context is null", () => {
		expect(() => primeAudioContext(null)).not.toThrow();
	});

	it("resumes a suspended context", () => {
		const context = makeMockContext("suspended");

		primeAudioContext(context as unknown as AudioContext);

		expect(context.resume).toHaveBeenCalledTimes(1);
	});

	it("does not resume an already-running context", () => {
		const context = makeMockContext("running");

		primeAudioContext(context as unknown as AudioContext);

		expect(context.resume).not.toHaveBeenCalled();
	});

	it("swallows a rejected resume", async () => {
		const context = makeMockContext("suspended");
		context.resume.mockRejectedValueOnce(new Error("nope"));

		expect(() =>
			primeAudioContext(context as unknown as AudioContext),
		).not.toThrow();
		await Promise.resolve();
	});
});

describe("playAlarmTone", () => {
	it("does nothing when context is null", () => {
		expect(() => playAlarmTone(null)).not.toThrow();
	});

	it("creates and plays a short tone", () => {
		const context = makeMockContext("running");

		playAlarmTone(context as unknown as AudioContext);

		expect(context.createOscillator).toHaveBeenCalledTimes(1);
		expect(context.createGain).toHaveBeenCalledTimes(1);
		expect(context.oscillator.connect).toHaveBeenCalledWith(context.gain);
		expect(context.gain.connect).toHaveBeenCalledWith(context.destination);
		expect(context.oscillator.start).toHaveBeenCalledTimes(1);
		expect(context.oscillator.stop).toHaveBeenCalledWith(
			context.currentTime + 0.6,
		);
	});

	it("swallows an error if playback fails", () => {
		const context = makeMockContext("running");
		context.createOscillator.mockImplementationOnce(() => {
			throw new Error("no audio hardware");
		});

		expect(() =>
			playAlarmTone(context as unknown as AudioContext),
		).not.toThrow();
	});
});
