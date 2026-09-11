import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoPickerButton } from "./photo-picker-button";

function getFileInputs(container: HTMLElement) {
	const inputs = Array.from(
		container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
	);
	return { galleryInput: inputs[0], cameraInput: inputs[1] };
}

// jsdom doesn't evaluate the `sm:` media query that hides one of these two
// buttons per viewport in a real browser, so both are "visible" to
// testing-library at once here — pick the mobile menu trigger explicitly by
// its Radix-added `aria-haspopup`, which the plain desktop button lacks.
function getMobileTrigger(): HTMLElement {
	const trigger = screen
		.getAllByRole("button", { name: "Add a photo" })
		.find((button) => button.getAttribute("aria-haspopup") === "menu");
	if (!trigger) throw new Error("Mobile trigger button not found");
	return trigger;
}

function getDesktopButton(): HTMLElement {
	const button = screen
		.getAllByRole("button", { name: "Add a photo" })
		.find((el) => !el.hasAttribute("aria-haspopup"));
	if (!button) throw new Error("Desktop button not found");
	return button;
}

// Radix's DropdownMenu opens/selects on pointerdown/pointerup rather than a
// plain click, and userEvent's full simulated pointer sequence is extremely
// slow against it in jsdom (multiple real seconds per interaction) — firing
// the pointer events directly keeps these tests fast.
function openMenu(trigger: HTMLElement) {
	fireEvent.pointerDown(trigger, { button: 0, pointerId: 1 });
	fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
}

function selectMenuItem(item: HTMLElement) {
	fireEvent.pointerDown(item, { button: 0, pointerId: 1 });
	fireEvent.pointerUp(item, { button: 0, pointerId: 1 });
	fireEvent.click(item);
}

// Radix's popper positioning keeps polling (ResizeObserver + a rAF fallback)
// for as long as a menu instance is open, and jsdom's fake layout makes that
// meaningfully slower wall-clock time than a real browser — comfortably under
// this budget, but well past the default 5s.
const DROPDOWN_TEST_TIMEOUT = 15000;

describe("PhotoPickerButton", () => {
	it(
		"shows a mobile trigger with a Take Photo / Choose from Gallery menu",
		() => {
			render(<PhotoPickerButton onPhotoSelected={vi.fn()} />);

			openMenu(getMobileTrigger());

			expect(
				screen.getByRole("menuitem", { name: /take photo/i }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("menuitem", { name: /choose from gallery/i }),
			).toBeInTheDocument();
		},
		DROPDOWN_TEST_TIMEOUT,
	);

	it(
		"opens the camera input when Take Photo is chosen",
		() => {
			const { container } = render(
				<PhotoPickerButton onPhotoSelected={vi.fn()} />,
			);
			const { cameraInput } = getFileInputs(container);
			const clickSpy = vi
				.spyOn(cameraInput, "click")
				.mockImplementation(() => {});

			openMenu(getMobileTrigger());
			selectMenuItem(screen.getByRole("menuitem", { name: /take photo/i }));

			expect(clickSpy).toHaveBeenCalledTimes(1);
		},
		DROPDOWN_TEST_TIMEOUT,
	);

	it(
		"opens the gallery input when Choose from Gallery is chosen",
		() => {
			const { container } = render(
				<PhotoPickerButton onPhotoSelected={vi.fn()} />,
			);
			const { galleryInput } = getFileInputs(container);
			const clickSpy = vi
				.spyOn(galleryInput, "click")
				.mockImplementation(() => {});

			openMenu(getMobileTrigger());
			selectMenuItem(
				screen.getByRole("menuitem", { name: /choose from gallery/i }),
			);

			expect(clickSpy).toHaveBeenCalledTimes(1);
		},
		DROPDOWN_TEST_TIMEOUT,
	);

	it("opens the gallery input directly from the desktop button, with no menu", () => {
		// A plain click, not a Radix-driven one — fireEvent is the right tool
		// (see the comment on openMenu above re: userEvent being pathologically
		// slow against jsdom's fake layout once Radix is anywhere in the tree).
		const { container } = render(
			<PhotoPickerButton onPhotoSelected={vi.fn()} />,
		);
		const { galleryInput } = getFileInputs(container);
		const clickSpy = vi
			.spyOn(galleryInput, "click")
			.mockImplementation(() => {});

		fireEvent.click(getDesktopButton());

		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	});

	it("calls onPhotoSelected with a valid image file chosen from the gallery input", async () => {
		const onPhotoSelected = vi.fn();
		const { container } = render(
			<PhotoPickerButton onPhotoSelected={onPhotoSelected} />,
		);
		const { galleryInput } = getFileInputs(container);
		const file = new File(["data"], "dish.jpg", { type: "image/jpeg" });

		await userEvent.upload(galleryInput, file);

		expect(onPhotoSelected).toHaveBeenCalledWith(file);
		expect(galleryInput.value).toBe("");
	});

	it("calls onPhotoSelected with a valid image file chosen from the camera input", async () => {
		const onPhotoSelected = vi.fn();
		const { container } = render(
			<PhotoPickerButton onPhotoSelected={onPhotoSelected} />,
		);
		const { cameraInput } = getFileInputs(container);
		const file = new File(["data"], "dish.png", { type: "image/png" });

		await userEvent.upload(cameraInput, file);

		expect(onPhotoSelected).toHaveBeenCalledWith(file);
	});

	it("ignores a non-image file", async () => {
		const onPhotoSelected = vi.fn();
		const { container } = render(
			<PhotoPickerButton onPhotoSelected={onPhotoSelected} />,
		);
		const { galleryInput } = getFileInputs(container);
		const file = new File(["data"], "notes.txt", { type: "text/plain" });

		await userEvent.upload(galleryInput, file);

		expect(onPhotoSelected).not.toHaveBeenCalled();
	});

	it("disables every trigger button when disabled", () => {
		render(<PhotoPickerButton onPhotoSelected={vi.fn()} disabled />);

		for (const button of screen.getAllByRole("button", {
			name: "Add a photo",
		})) {
			expect(button).toBeDisabled();
		}
	});
});
