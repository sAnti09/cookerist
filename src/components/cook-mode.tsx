import { X } from "lucide-react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { StepTimer } from "#/components/step-timer";
import { Button } from "#/components/ui/button";
import { CelebrationBurst } from "#/components/ui/celebration-burst";
import { highlightIngredientMentions } from "#/lib/highlight-ingredients";
import type { Recipe } from "#/lib/recipe";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";

type CookModeProps = {
	recipe: Recipe;
	onUpdate: (recipe: Recipe) => void;
	onClose: () => void;
};

// Wake Lock isn't in every target's DOM lib yet (and jsdom never implements
// it), so this stays feature-detected via `"wakeLock" in navigator` rather
// than typed — see AC5 (graceful fallback) on TEST-257.
type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
	wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

export function CookMode({ recipe, onUpdate, onClose }: CookModeProps) {
	const { steps } = recipe;
	const [index, setIndex] = useState(0);
	const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

	// Cook mode is a full-screen overlay, but a fixed-position element doesn't
	// stop the page underneath from scrolling on its own (most visibly on iOS,
	// where a swipe inside the overlay can rubber-band the body behind it).
	useBodyScrollLock(true);

	useEffect(() => {
		let cancelled = false;

		async function acquireWakeLock() {
			if (!("wakeLock" in navigator)) return;
			try {
				const sentinel = await (
					navigator as NavigatorWithWakeLock
				).wakeLock.request("screen");
				if (cancelled) {
					sentinel.release().catch(() => {});
					return;
				}
				wakeLockRef.current = sentinel;
			} catch {
				// Wake lock can be refused (e.g. low battery, backgrounded tab) —
				// cook mode still works, it just won't keep the screen awake.
			}
		}

		acquireWakeLock();

		function handleVisibilityChange() {
			if (document.visibilityState === "visible") acquireWakeLock();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			wakeLockRef.current?.release().catch(() => {});
			wakeLockRef.current = null;
		};
	}, []);

	const finished = index >= steps.length;
	const currentStep = finished ? null : steps[index];
	const isLast = index === steps.length - 1;
	const progressPercent =
		steps.length > 0
			? Math.round((Math.min(index, steps.length) / steps.length) * 100)
			: 0;

	function handleBack() {
		setIndex((current) => Math.max(0, current - 1));
	}

	function handleNext() {
		if (!currentStep) return;
		onUpdate({
			...recipe,
			steps: steps.map((step, stepIndex) =>
				stepIndex === index ? { ...step, checked: true } : step,
			),
		});
		setIndex((current) => current + 1);
	}

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
			else if (event.key === "ArrowLeft") handleBack();
			else if (event.key === "ArrowRight") handleNext();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	});

	// Swipe left (finger moves right-to-left) advances, same direction as
	// tapping Next; swipe right goes Back. Ignored when the gesture is mostly
	// vertical (a scroll) or too short to be a deliberate swipe.
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const SWIPE_THRESHOLD_PX = 50;

	function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
		const touch = event.touches[0];
		touchStartRef.current = touch
			? { x: touch.clientX, y: touch.clientY }
			: null;
	}

	function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
		const start = touchStartRef.current;
		touchStartRef.current = null;
		const touch = event.changedTouches[0];
		if (!start || !touch) return;

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		if (
			Math.abs(deltaX) < SWIPE_THRESHOLD_PX ||
			Math.abs(deltaX) < Math.abs(deltaY)
		) {
			return;
		}
		if (deltaX < 0) handleNext();
		else handleBack();
	}

	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-bg">
			<div className="flex items-center justify-between gap-3 border-line border-b p-5">
				<div>
					<p className="text-ink-dim text-xs">
						{finished ? "All done" : `Step ${index + 1} of ${steps.length}`}
					</p>
					{currentStep?.section ? (
						<p className="display-title text-accent text-sm">
							{currentStep.section}
						</p>
					) : null}
				</div>
				<Button
					variant="secondary"
					className="size-8 shrink-0 rounded-[10px] p-0"
					aria-label="Exit cook mode"
					onClick={onClose}
				>
					<X className="size-4" aria-hidden="true" />
				</Button>
			</div>

			<div
				role="progressbar"
				aria-label="Steps completed"
				aria-valuenow={progressPercent}
				aria-valuemin={0}
				aria-valuemax={100}
				className="h-1 w-full overflow-hidden bg-bg2"
			>
				<div
					className="h-full bg-sage transition-[width] duration-300 ease-out"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			<div
				className="flex flex-1 items-center justify-center overflow-y-auto p-8 text-center"
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				{finished ? (
					<div>
						<CelebrationBurst />
						<p className="display-title font-semibold text-2xl">
							That's every step
						</p>
						<p className="mt-2 text-ink-dim">
							Nicely done — head back to check anything you missed.
						</p>
					</div>
				) : (
					<div className="flex flex-col items-center gap-4">
						<p className="display-title font-semibold text-2xl leading-snug">
							{currentStep
								? highlightIngredientMentions(
										currentStep.text,
										recipe.ingredients,
									).map((segment, segmentIndex) =>
										segment.matched ? (
											<span
												// biome-ignore lint/suspicious/noArrayIndexKey: segments are a stable derived split of static step text, never reordered
												key={segmentIndex}
												className="text-accent"
											>
												{segment.text}
											</span>
										) : (
											// biome-ignore lint/suspicious/noArrayIndexKey: segments are a stable derived split of static step text, never reordered
											<Fragment key={segmentIndex}>{segment.text}</Fragment>
										),
									)
								: null}
						</p>
						{currentStep?.estimatedMinutes ? (
							<StepTimer
								key={currentStep.id}
								estimatedMinutes={currentStep.estimatedMinutes}
							/>
						) : null}
					</div>
				)}
			</div>

			<div className="flex items-center justify-between gap-3 border-line border-t p-5">
				<Button variant="secondary" onClick={handleBack} disabled={index === 0}>
					Back
				</Button>
				{finished ? (
					<Button onClick={onClose}>Back to recipe</Button>
				) : (
					<Button onClick={handleNext}>{isLast ? "Finish" : "Next"}</Button>
				)}
			</div>
		</div>
	);
}
