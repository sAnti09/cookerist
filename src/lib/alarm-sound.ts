// Synthesizes the cook-mode timer's alarm beep via the Web Audio API rather
// than shipping an audio asset. Kept out of React so it's trivial to
// feature-detect (jsdom has no AudioContext) and mock in tests.

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
	if (typeof window === "undefined") return null;
	const withWebkit = window as typeof window & {
		webkitAudioContext?: AudioContextConstructor;
	};
	return withWebkit.AudioContext ?? withWebkit.webkitAudioContext ?? null;
}

export function createAudioContext(): AudioContext | null {
	const Ctor = getAudioContextConstructor();
	if (!Ctor) return null;
	try {
		return new Ctor();
	} catch {
		return null;
	}
}

// Mobile browsers block audio autoplay until a user gesture unlocks the
// context — call this from a click handler (starting a timer, opening cook
// mode) well ahead of when the alarm actually needs to play (TEST-258 AC5).
export function primeAudioContext(context: AudioContext | null): void {
	if (!context || context.state !== "suspended") return;
	context.resume().catch(() => {});
}

export function playAlarmTone(context: AudioContext | null): void {
	if (!context) return;
	try {
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = 880;
		gain.gain.value = 0.2;
		oscillator.connect(gain);
		gain.connect(context.destination);
		oscillator.start();
		oscillator.stop(context.currentTime + 0.6);
	} catch {
		// Playback can still fail (e.g. context never got primed) — the
		// vibration + visual "time's up" state cover AC4 regardless.
	}
}
