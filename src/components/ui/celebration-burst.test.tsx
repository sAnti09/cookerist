import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CelebrationBurst } from "./celebration-burst";

describe("CelebrationBurst", () => {
	it("renders as a decorative, non-interactive overlay hidden from screen readers", () => {
		const { container } = render(<CelebrationBurst />);

		const overlay = container.firstElementChild as HTMLElement;
		expect(overlay).toHaveAttribute("aria-hidden", "true");
		expect(overlay).toHaveClass("pointer-events-none");
	});

	it("renders a full spread of confetti pieces and celebration icons", () => {
		const { container } = render(<CelebrationBurst />);

		expect(container.querySelectorAll(".confetti-piece")).toHaveLength(22);
		expect(container.querySelectorAll(".lucide-party-popper")).toHaveLength(2);
		expect(container.querySelectorAll(".lucide-chef-hat")).toHaveLength(1);
		expect(container.querySelectorAll(".lucide-sparkles")).toHaveLength(2);
	});

	it("launches confetti outward from each popper's mouth rather than raining from the top", () => {
		const { container } = render(<CelebrationBurst />);
		const pieces = Array.from(
			container.querySelectorAll<HTMLElement>(".confetti-piece"),
		);

		expect(pieces).toHaveLength(22);
		for (const piece of pieces) {
			// Anchored at a popper's mouth (left or right edge), not top:0.
			expect(piece.style.top).toBe("");
			expect(piece.style.left || piece.style.right).toBe("9%");
			// A non-zero launch vector — it's actually flying somewhere.
			expect(piece.style.getPropertyValue("--burst-x")).not.toBe("0px");
		}
	});
});
