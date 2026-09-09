import { AlarmClock, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	createAudioContext,
	playAlarmTone,
	primeAudioContext,
} from "#/lib/alarm-sound";
import { cn } from "#/lib/utils";

type StepTimerProps = {
	estimatedMinutes: number;
};

// idle: not yet started (or stopped/reset back to the start).
// running/paused: counting down, or held at the current remaining time.
// finished: reached zero — alarm already fired.
type TimerPhase = "idle" | "running" | "paused" | "finished";

const MINUTE_STEP_SECONDS = 60;
const SECOND_STEP_SECONDS = 5;
const MIN_DURATION_SECONDS = SECOND_STEP_SECONDS;
// A single alarm firing was easy to miss — repeat it until the user
// acknowledges (Reset) or leaves the step, like a real kitchen timer.
const ALARM_REPEAT_INTERVAL_MS = 3000;

function formatClock(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function StepTimer({ estimatedMinutes }: StepTimerProps) {
	// The single source of truth for the configured duration, in seconds —
	// the minutes/seconds steppers below both just add/subtract from this,
	// so e.g. bumping seconds past 55 rolls naturally into the next minute.
	const [durationSeconds, setDurationSeconds] = useState(estimatedMinutes * 60);
	const [remainingSeconds, setRemainingSeconds] = useState(
		estimatedMinutes * 60,
	);
	const [phase, setPhase] = useState<TimerPhase>("idle");
	const audioContextRef = useRef<AudioContext | null>(null);

	// Priming happens as soon as the timer for this step mounts — cook mode
	// only renders a timer in response to the user's Next/Back/Cook-mode tap,
	// so this still runs inside that user-gesture window (TEST-258 AC5).
	useEffect(() => {
		audioContextRef.current = createAudioContext();
		primeAudioContext(audioContextRef.current);
	}, []);

	useEffect(() => {
		if (phase !== "running") return;
		const interval = setInterval(() => {
			setRemainingSeconds((current) => Math.max(0, current - 1));
		}, 1000);
		return () => clearInterval(interval);
	}, [phase]);

	useEffect(() => {
		if (phase !== "running" || remainingSeconds > 0) return;
		setPhase("finished");
	}, [phase, remainingSeconds]);

	// Fires immediately on reaching "finished", then keeps repeating until the
	// user acknowledges it (Reset) or leaves the step — a single beep was too
	// easy to miss over kitchen noise.
	useEffect(() => {
		if (phase !== "finished") return;
		function fireAlarm() {
			playAlarmTone(audioContextRef.current);
			if (typeof navigator.vibrate === "function") {
				navigator.vibrate([300, 100, 300]);
			}
		}
		fireAlarm();
		const interval = setInterval(fireAlarm, ALARM_REPEAT_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [phase]);

	function handleDurationChange(nextTotalSeconds: number) {
		if (phase === "finished" || nextTotalSeconds < MIN_DURATION_SECONDS) return;
		setDurationSeconds(nextTotalSeconds);
		setRemainingSeconds(nextTotalSeconds);
	}

	function handleStart() {
		primeAudioContext(audioContextRef.current);
		setPhase("running");
	}

	function handlePause() {
		setPhase("paused");
	}

	// Cancels the current run and goes back to the initial setup view —
	// unlike Reset, this leaves "active" mode entirely.
	function handleStop() {
		setPhase("idle");
		setRemainingSeconds(durationSeconds);
	}

	// Restarts the countdown from the current duration setting. While
	// running/paused this stays in place (the clock just jumps back to the
	// top); from the finished state it's the only way back, so it returns
	// all the way to the initial setup UI (duration + Start).
	function handleReset() {
		setRemainingSeconds(durationSeconds);
		setPhase((current) => (current === "finished" ? "idle" : current));
	}

	const isActive = phase === "running" || phase === "paused";

	return (
		<div
			className={cn(
				"w-full max-w-xs rounded-[18px] border p-4 text-center",
				phase === "finished" ? "border-sage bg-bg2" : "border-line bg-bg2",
			)}
		>
			{phase === "finished" ? (
				<div className="flex flex-col items-center gap-3">
					<div className="flex items-center justify-center gap-2 text-sage">
						<AlarmClock className="size-5 animate-pulse" aria-hidden="true" />
						<p className="font-medium">Time's up!</p>
					</div>
					<Button variant="secondary" className="gap-1.5" onClick={handleReset}>
						<RotateCcw className="size-3.5" aria-hidden="true" />
						Reset
					</Button>
				</div>
			) : (
				<>
					<p className="display-title text-3xl font-semibold tabular-nums">
						{formatClock(remainingSeconds)}
					</p>
					<div className="mt-3 flex flex-wrap items-center justify-center gap-2">
						<div className="inline-flex items-center gap-2 rounded-full border border-input px-2 py-1">
							<Button
								variant="secondary"
								className="size-7 rounded-full p-0"
								aria-label="Decrease timer minutes"
								onClick={() =>
									handleDurationChange(durationSeconds - MINUTE_STEP_SECONDS)
								}
							>
								−
							</Button>
							<span className="w-14 text-center text-sm tabular-nums">
								{Math.floor(durationSeconds / 60)} min
							</span>
							<Button
								variant="secondary"
								className="size-7 rounded-full p-0"
								aria-label="Increase timer minutes"
								onClick={() =>
									handleDurationChange(durationSeconds + MINUTE_STEP_SECONDS)
								}
							>
								+
							</Button>
						</div>
						<div className="inline-flex items-center gap-2 rounded-full border border-input px-2 py-1">
							<Button
								variant="secondary"
								className="size-7 rounded-full p-0"
								aria-label="Decrease timer seconds"
								onClick={() =>
									handleDurationChange(durationSeconds - SECOND_STEP_SECONDS)
								}
							>
								−
							</Button>
							<span className="w-14 text-center text-sm tabular-nums">
								{durationSeconds % 60} sec
							</span>
							<Button
								variant="secondary"
								className="size-7 rounded-full p-0"
								aria-label="Increase timer seconds"
								onClick={() =>
									handleDurationChange(durationSeconds + SECOND_STEP_SECONDS)
								}
							>
								+
							</Button>
						</div>
					</div>
					<div className="mt-3 flex flex-wrap items-center justify-center gap-2">
						{isActive ? (
							<>
								{phase === "running" ? (
									<Button
										variant="secondary"
										className="gap-1.5"
										onClick={handlePause}
									>
										<Pause className="size-3.5" aria-hidden="true" />
										Pause
									</Button>
								) : (
									<Button className="gap-1.5" onClick={handleStart}>
										<Play className="size-3.5" aria-hidden="true" />
										Resume
									</Button>
								)}
								<Button
									variant="secondary"
									className="gap-1.5"
									onClick={handleStop}
								>
									<Square className="size-3.5" aria-hidden="true" />
									Stop
								</Button>
								<Button
									variant="secondary"
									className="gap-1.5"
									onClick={handleReset}
								>
									<RotateCcw className="size-3.5" aria-hidden="true" />
									Reset
								</Button>
							</>
						) : (
							<Button className="gap-1.5" onClick={handleStart}>
								<Play className="size-3.5" aria-hidden="true" />
								Start
							</Button>
						)}
					</div>
				</>
			)}
		</div>
	);
}
