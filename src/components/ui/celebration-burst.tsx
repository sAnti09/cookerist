import { ChefHat, PartyPopper, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { cn } from "#/lib/utils";

// React's CSSProperties doesn't type arbitrary custom properties — these
// carry per-instance randomized values (launch trajectory, rotation) into
// the keyframes below.
type CustomCSSProperties = CSSProperties & Record<`--${string}`, string>;

const CONFETTI_COLORS = ["var(--accent)", "var(--sage)"];
const PARTICLES_PER_POPPER = 11;
// Where each popper's mouth sits, matching the PartyPopper icons below —
// confetti launches from these exact points, not from the top of the screen.
const POPPER_ORIGIN = { left: "9%", right: "9%" } as const;

type PopperSide = "left" | "right";

type ConfettiPiece = {
	side: PopperSide;
	shape: "dot" | "streamer";
	color: string;
	delay: number;
	duration: number;
	rotate: number;
	burstX: number;
	burstY: number;
	fallX: number;
	fallY: number;
};

function createConfettiFrom(side: PopperSide): ConfettiPiece[] {
	// Poppers point up and inward, so their confetti fans out up-and-inward
	// too: left popper sprays up-right, right popper sprays up-left.
	const direction = side === "left" ? 1 : -1;

	return Array.from({ length: PARTICLES_PER_POPPER }, (_, index) => {
		const burstDistance = 55 + Math.random() * 95;
		const burstAngle = ((35 + Math.random() * 45) * Math.PI) / 180;
		const burstX = Math.round(direction * burstDistance * Math.cos(burstAngle));
		const burstY = Math.round(-burstDistance * Math.sin(burstAngle));
		const fallDistance = 130 + Math.random() * 160;

		return {
			side,
			shape: index % 2 === 0 ? "dot" : "streamer",
			color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
			delay: Math.round(Math.random() * 220) / 1000,
			duration: 2.2 + Math.round(Math.random() * 500) / 1000,
			rotate: Math.round(Math.random() * 360),
			burstX,
			burstY,
			fallX: Math.round(burstX * 1.2),
			fallY: Math.round(burstY + fallDistance),
		};
	});
}

function createConfetti(): ConfettiPiece[] {
	return [...createConfettiFrom("left"), ...createConfettiFrom("right")];
}

// A one-shot celebratory burst for the cook mode "done" screen — plays once
// on mount and settles back to nothing, so it doesn't linger and distract
// while the user reads the finish message. Purely decorative: hidden from
// screen readers, and stilled entirely under prefers-reduced-motion (see
// styles.css) since none of it carries information the text doesn't.
export function CelebrationBurst() {
	const [confetti] = useState(createConfetti);

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 overflow-hidden"
		>
			{confetti.map((piece, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: a fixed-size, never-reordered decorative list
					key={index}
					className={cn(
						"confetti-piece absolute bottom-[19%]",
						piece.shape === "dot" ? "size-1.5 rounded-full" : "h-2.5 w-1",
					)}
					style={
						{
							[piece.side]: POPPER_ORIGIN[piece.side],
							backgroundColor: piece.color,
							animationDelay: `${piece.delay}s`,
							animationDuration: `${piece.duration}s`,
							"--confetti-rotate": `${piece.rotate}deg`,
							"--burst-x": `${piece.burstX}px`,
							"--burst-y": `${piece.burstY}px`,
							"--fall-x": `${piece.fallX}px`,
							"--fall-y": `${piece.fallY}px`,
						} as CustomCSSProperties
					}
				/>
			))}

			<PartyPopper
				className="celebration-icon absolute bottom-[18%] left-[8%] size-9 text-accent"
				style={{ "--pop-rotate": "-25deg" } as CustomCSSProperties}
			/>
			<PartyPopper
				className="celebration-icon absolute right-[8%] bottom-[18%] size-9 text-sage"
				style={
					{
						"--pop-rotate": "25deg",
						animationDelay: "0.1s",
					} as CustomCSSProperties
				}
			/>
			<ChefHat
				className="celebration-icon absolute top-[30%] left-1/2 size-8 text-accent"
				style={{ animationDelay: "0.15s" }}
			/>
			<Sparkles
				className="celebration-icon absolute top-[22%] left-[28%] size-5 text-sage"
				style={{ animationDelay: "0.25s" }}
			/>
			<Sparkles
				className="celebration-icon absolute top-[24%] right-[26%] size-5 text-accent"
				style={{ animationDelay: "0.35s" }}
			/>
		</div>
	);
}
