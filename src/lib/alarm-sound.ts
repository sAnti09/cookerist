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

// A single soft tone was easy to miss over kitchen noise, so each alarm
// firing is a sharp triple-beep (like a microwave/kitchen timer) rather
// than one long note.
const ALARM_BEEP_COUNT = 3;
const ALARM_BEEP_DURATION_SECONDS = 0.15;
const ALARM_BEEP_GAP_SECONDS = 0.1;
const ALARM_BEEP_FREQUENCY_HZ = 1046.5; // C6 — more piercing than a low sine tone
const ALARM_BEEP_GAIN = 0.35;

export function playAlarmTone(context: AudioContext | null): void {
	if (!context) return;
	try {
		for (let i = 0; i < ALARM_BEEP_COUNT; i++) {
			const startTime =
				context.currentTime +
				i * (ALARM_BEEP_DURATION_SECONDS + ALARM_BEEP_GAP_SECONDS);
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.type = "square";
			oscillator.frequency.value = ALARM_BEEP_FREQUENCY_HZ;
			gain.gain.value = ALARM_BEEP_GAIN;
			oscillator.connect(gain);
			gain.connect(context.destination);
			oscillator.start(startTime);
			oscillator.stop(startTime + ALARM_BEEP_DURATION_SECONDS);
		}
	} catch {
		// Playback can still fail (e.g. context never got primed) — the
		// vibration + visual "time's up" state cover AC4 regardless.
	}
}
