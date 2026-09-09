import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as alarmSound from "#/lib/alarm-sound";
import { StepTimer } from "./step-timer";

function advanceTimersByTime(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(alarmSound, "createAudioContext").mockReturnValue(
		{} as AudioContext,
	);
	vi.spyOn(alarmSound, "primeAudioContext").mockImplementation(() => {});
	vi.spyOn(alarmSound, "playAlarmTone").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	// biome-ignore lint/suspicious/noExplicitAny: cleaning up a test-only navigator patch
	delete (navigator as any).vibrate;
});

describe("StepTimer", () => {
	it("defaults the countdown to the estimated duration, with a Start control", () => {
		render(<StepTimer estimatedMinutes={5} />);

		expect(screen.getByText("5:00")).toBeInTheDocument();
		expect(screen.getByText("5 min")).toBeInTheDocument();
		expect(screen.getByText("0 sec")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Pause" }),
		).not.toBeInTheDocument();
	});

	it("primes the audio context on mount", () => {
		render(<StepTimer estimatedMinutes={5} />);

		expect(alarmSound.createAudioContext).toHaveBeenCalledTimes(1);
		expect(alarmSound.primeAudioContext).toHaveBeenCalledTimes(1);
	});

	it("counts down once started, replacing Start with Pause/Stop/Reset controls", () => {
		render(<StepTimer estimatedMinutes={1} />);

		fireEvent.click(screen.getByRole("button", { name: "Start" }));
		expect(
			screen.queryByRole("button", { name: "Start" }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();

		advanceTimersByTime(3000);
		expect(screen.getByText("0:57")).toBeInTheDocument();
	});

	it("primes the audio context again when Start is pressed", () => {
		render(<StepTimer estimatedMinutes={5} />);

		fireEvent.click(screen.getByRole("button", { name: "Start" }));

		expect(alarmSound.primeAudioContext).toHaveBeenCalledTimes(2);
	});

	it("lets the user adjust the duration before finishing, updating the countdown immediately", () => {
		render(<StepTimer estimatedMinutes={5} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Increase timer minutes" }),
		);
		expect(screen.getByText("6 min")).toBeInTheDocument();
		expect(screen.getByText("6:00")).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Decrease timer minutes" }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Decrease timer minutes" }),
		);
		expect(screen.getByText("4 min")).toBeInTheDocument();
		expect(screen.getByText("4:00")).toBeInTheDocument();
	});

	it("rejects a minutes decrease that would drop the total below the minimum", () => {
		render(<StepTimer estimatedMinutes={1} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Decrease timer minutes" }),
		);

		expect(screen.getByText("1 min")).toBeInTheDocument();
		expect(screen.getByText("1:00")).toBeInTheDocument();
	});

	it("adjusts the running countdown immediately when the duration changes mid-run", () => {
		render(<StepTimer estimatedMinutes={5} />);

		fireEvent.click(screen.getByRole("button", { name: "Start" }));
		advanceTimersByTime(2000);
		expect(screen.getByText("4:58")).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Increase timer minutes" }),
		);

		expect(screen.getByText("6:00")).toBeInTheDocument();
	});

	describe("seconds stepper", () => {
		it("adjusts the duration in steps of 5 seconds, updating the countdown immediately", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(
				screen.getByRole("button", { name: "Increase timer seconds" }),
			);
			expect(screen.getByText("1 min")).toBeInTheDocument();
			expect(screen.getByText("5 sec")).toBeInTheDocument();
			expect(screen.getByText("1:05")).toBeInTheDocument();

			fireEvent.click(
				screen.getByRole("button", { name: "Increase timer seconds" }),
			);
			expect(screen.getByText("10 sec")).toBeInTheDocument();
			expect(screen.getByText("1:10")).toBeInTheDocument();
		});

		it("rolls over into the neighboring minute as seconds cross 0/55", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(
				screen.getByRole("button", { name: "Decrease timer seconds" }),
			);
			expect(screen.getByText("0 min")).toBeInTheDocument();
			expect(screen.getByText("55 sec")).toBeInTheDocument();
			expect(screen.getByText("0:55")).toBeInTheDocument();

			fireEvent.click(
				screen.getByRole("button", { name: "Increase timer seconds" }),
			);
			expect(screen.getByText("1 min")).toBeInTheDocument();
			expect(screen.getByText("0 sec")).toBeInTheDocument();
			expect(screen.getByText("1:00")).toBeInTheDocument();
		});

		it("does not let the total drop below the 5-second minimum", () => {
			render(<StepTimer estimatedMinutes={1} />);

			for (let i = 0; i < 12; i++) {
				fireEvent.click(
					screen.getByRole("button", { name: "Decrease timer seconds" }),
				);
			}

			expect(screen.getByText("0 min")).toBeInTheDocument();
			expect(screen.getByText("5 sec")).toBeInTheDocument();
			expect(screen.getByText("0:05")).toBeInTheDocument();
		});

		it("adjusts the running countdown immediately when seconds change mid-run", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(1000);
			fireEvent.click(
				screen.getByRole("button", { name: "Increase timer seconds" }),
			);

			expect(screen.getByText("1:05")).toBeInTheDocument();
		});

		it("no longer allows adjusting seconds once finished", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);

			expect(
				screen.queryByRole("button", { name: "Increase timer seconds" }),
			).not.toBeInTheDocument();
		});
	});

	describe("pause and resume", () => {
		it("pauses the countdown, holding the remaining time, and shows a Resume control", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Pause" }));

			expect(screen.getByText("4:58")).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Pause" }),
			).not.toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Resume" }),
			).toBeInTheDocument();

			// Time passing while paused shouldn't move the countdown.
			advanceTimersByTime(5000);
			expect(screen.getByText("4:58")).toBeInTheDocument();
		});

		it("resumes counting down from where it was paused", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Pause" }));
			fireEvent.click(screen.getByRole("button", { name: "Resume" }));

			expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
			advanceTimersByTime(1000);
			expect(screen.getByText("4:57")).toBeInTheDocument();
		});

		it("still allows the duration to be adjusted while paused", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Pause" }));

			fireEvent.click(
				screen.getByRole("button", { name: "Increase timer minutes" }),
			);

			expect(screen.getByText("6:00")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Resume" }),
			).toBeInTheDocument();
		});
	});

	describe("stop", () => {
		it("cancels the run and returns to the initial setup view", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Stop" }));

			expect(screen.getByText("5:00")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Pause" }),
			).not.toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Stop" }),
			).not.toBeInTheDocument();
		});

		it("stops back to the current (possibly adjusted) duration, not the original estimate", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(
				screen.getByRole("button", { name: "Increase timer minutes" }),
			);
			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Stop" }));

			expect(screen.getByText("6:00")).toBeInTheDocument();
			expect(screen.getByText("6 min")).toBeInTheDocument();
		});

		it("stops a paused timer back to the initial setup view too", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Pause" }));
			fireEvent.click(screen.getByRole("button", { name: "Stop" }));

			expect(screen.getByText("5:00")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
		});

		it("does not resume counting after being stopped", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			fireEvent.click(screen.getByRole("button", { name: "Stop" }));
			advanceTimersByTime(5000);

			expect(screen.getByText("5:00")).toBeInTheDocument();
		});
	});

	describe("reset (while active)", () => {
		it("restarts a running countdown back to the full duration, without leaving the running state", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Reset" }));

			expect(screen.getByText("5:00")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

			advanceTimersByTime(1000);
			expect(screen.getByText("4:59")).toBeInTheDocument();
		});

		it("restarts a paused countdown back to the full duration, staying paused", () => {
			render(<StepTimer estimatedMinutes={5} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(2000);
			fireEvent.click(screen.getByRole("button", { name: "Pause" }));
			fireEvent.click(screen.getByRole("button", { name: "Reset" }));

			expect(screen.getByText("5:00")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Resume" }),
			).toBeInTheDocument();

			advanceTimersByTime(5000);
			expect(screen.getByText("5:00")).toBeInTheDocument();
		});
	});

	describe("finishing", () => {
		it("plays the alarm, vibrates, and shows the time's up state when the countdown reaches zero", () => {
			const vibrate = vi.fn();
			Object.defineProperty(navigator, "vibrate", {
				configurable: true,
				value: vibrate,
			});
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);

			expect(screen.getByText("Time's up!")).toBeInTheDocument();
			expect(alarmSound.playAlarmTone).toHaveBeenCalledTimes(1);
			expect(vibrate).toHaveBeenCalledWith([300, 100, 300]);
		});

		it("does not crash when navigator.vibrate is unsupported", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);

			expect(screen.getByText("Time's up!")).toBeInTheDocument();
		});

		it("no longer allows adjusting the duration once finished", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);

			expect(
				screen.queryByRole("button", { name: "Increase timer minutes" }),
			).not.toBeInTheDocument();
		});

		it("keeps the countdown display at zero once finished, even if timers keep advancing", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);
			advanceTimersByTime(5000);

			expect(screen.getByText("Time's up!")).toBeInTheDocument();
		});

		it("repeats the alarm every few seconds until acknowledged, since a single beep is easy to miss", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);
			expect(alarmSound.playAlarmTone).toHaveBeenCalledTimes(1);

			advanceTimersByTime(3000);
			expect(alarmSound.playAlarmTone).toHaveBeenCalledTimes(2);

			advanceTimersByTime(3000);
			expect(alarmSound.playAlarmTone).toHaveBeenCalledTimes(3);
		});

		it("stops repeating the alarm once reset", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);
			expect(alarmSound.playAlarmTone).toHaveBeenCalledTimes(1);

			fireEvent.click(screen.getByRole("button", { name: "Reset" }));
			advanceTimersByTime(10_000);

			expect(alarmSound.playAlarmTone).toHaveBeenCalledTimes(1);
		});

		it("shows a Reset control that returns to the initial setup UI (duration + Start)", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);
			fireEvent.click(screen.getByRole("button", { name: "Reset" }));

			expect(screen.queryByText("Time's up!")).not.toBeInTheDocument();
			expect(screen.getByText("1:00")).toBeInTheDocument();
			expect(screen.getByText("1 min")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Increase timer minutes" }),
			).toBeInTheDocument();
		});

		it("can be started again after a reset", () => {
			render(<StepTimer estimatedMinutes={1} />);

			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(60_000);
			fireEvent.click(screen.getByRole("button", { name: "Reset" }));
			fireEvent.click(screen.getByRole("button", { name: "Start" }));
			advanceTimersByTime(1000);

			expect(screen.getByText("0:59")).toBeInTheDocument();
		});
	});
});
