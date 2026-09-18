import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareResourceDialog } from "./share-resource-dialog";

const useAppDataMock = vi.fn();
vi.mock("#/lib/app-data-context", () => ({
	useAppData: () => useAppDataMock(),
}));

const shareResourceMock = vi.fn();

beforeEach(() => {
	shareResourceMock.mockReset();
	useAppDataMock.mockReturnValue({ shareResource: shareResourceMock });
});

describe("ShareResourceDialog", () => {
	it("renders nothing when closed", () => {
		render(
			<ShareResourceDialog
				open={false}
				onClose={vi.fn()}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("generates and displays a share code", async () => {
		const user = userEvent.setup();
		shareResourceMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(
			<ShareResourceDialog
				open={true}
				onClose={vi.fn()}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /generate share code/i }),
		);

		expect(shareResourceMock).toHaveBeenCalledWith("recipes", "r1");
		expect(await screen.findByText("ABC12345")).toBeInTheDocument();
	});

	it("shows an error if generating a code fails", async () => {
		const user = userEvent.setup();
		shareResourceMock.mockRejectedValue(new Error("network"));
		render(
			<ShareResourceDialog
				open={true}
				onClose={vi.fn()}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /generate share code/i }),
		);

		expect(
			await screen.findByText(/couldn't generate a code/i),
		).toBeInTheDocument();
	});

	it("copies the code to the clipboard", async () => {
		const user = userEvent.setup();
		// userEvent.setup() installs its own Clipboard stub on `navigator` —
		// this must be defined AFTER that call, or setup() immediately
		// overwrites it.
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText: writeTextMock },
			configurable: true,
		});
		shareResourceMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(
			<ShareResourceDialog
				open={true}
				onClose={vi.fn()}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);
		await user.click(
			screen.getByRole("button", { name: /generate share code/i }),
		);
		await screen.findByText("ABC12345");

		await user.click(screen.getByRole("button", { name: /copy code/i }));

		expect(await screen.findByText(/copied/i)).toBeInTheDocument();
		expect(writeTextMock).toHaveBeenCalledWith("ABC12345");
	});

	it("hides the Share button when the Web Share API isn't available", async () => {
		const user = userEvent.setup();
		shareResourceMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(
			<ShareResourceDialog
				open={true}
				onClose={vi.fn()}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);
		await user.click(
			screen.getByRole("button", { name: /generate share code/i }),
		);
		await screen.findByText("ABC12345");

		expect(
			screen.queryByRole("button", { name: /^share$/i }),
		).not.toBeInTheDocument();
	});

	it("shares the code via the native share sheet when available", async () => {
		const shareMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "share", {
			value: shareMock,
			configurable: true,
		});
		const user = userEvent.setup();
		shareResourceMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(
			<ShareResourceDialog
				open={true}
				onClose={vi.fn()}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);
		await user.click(
			screen.getByRole("button", { name: /generate share code/i }),
		);
		await screen.findByText("ABC12345");

		await user.click(screen.getByRole("button", { name: /^share$/i }));

		expect(shareMock).toHaveBeenCalledWith({
			title: "Cookerist share code",
			text: 'The recipe "Garlic Butter Shrimp Pasta" has been shared and can be redeemed using the code ABC12345.',
		});
		// @ts-expect-error -- removing a test-only stub, not a real DOM property
		delete navigator.share;
	});

	it("calls onClose when Escape is pressed", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<ShareResourceDialog
				open={true}
				onClose={onClose}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);

		await user.keyboard("{Escape}");

		expect(onClose).toHaveBeenCalled();
	});

	it("calls onClose when the backdrop is clicked", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<ShareResourceDialog
				open={true}
				onClose={onClose}
				table="recipes"
				id="r1"
				title="Garlic Butter Shrimp Pasta"
			/>,
		);

		await user.click(screen.getByRole("button", { name: /dismiss dialog/i }));

		expect(onClose).toHaveBeenCalled();
	});
});
