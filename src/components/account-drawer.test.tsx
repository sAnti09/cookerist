import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDrawer } from "./account-drawer";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

const useAppDataMock = vi.fn();
vi.mock("#/lib/app-data-context", () => ({
	useAppData: () => useAppDataMock(),
}));

const createPairingCodeMock = vi.fn();
const linkDeviceMock = vi.fn();
const syncNowMock = vi.fn();
const redeemShareCodeMock = vi.fn();

beforeEach(() => {
	navigateMock.mockReset();
	createPairingCodeMock.mockReset();
	linkDeviceMock.mockReset();
	syncNowMock.mockReset();
	redeemShareCodeMock.mockReset();
	useAppDataMock.mockReturnValue({
		hasDeviceIdentity: false,
		createPairingCode: createPairingCodeMock,
		linkDevice: linkDeviceMock,
		syncNow: syncNowMock,
		redeemShareCode: redeemShareCodeMock,
	});
});

describe("AccountDrawer", () => {
	it("renders nothing when closed", () => {
		render(<AccountDrawer open={false} onClose={vi.fn()} />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("generates and displays a pairing code", async () => {
		const user = userEvent.setup();
		createPairingCodeMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: /add another device/i }),
		);
		await user.click(
			screen.getByRole("button", { name: /generate pairing code/i }),
		);

		expect(await screen.findByText("ABC12345")).toBeInTheDocument();
	});

	it("copies the pairing code to the clipboard", async () => {
		const user = userEvent.setup();
		// userEvent.setup() installs its own Clipboard stub on `navigator` —
		// this must be defined AFTER that call, or setup() immediately
		// overwrites it.
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText: writeTextMock },
			configurable: true,
		});
		createPairingCodeMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);
		await user.click(
			screen.getByRole("button", { name: /add another device/i }),
		);
		await user.click(
			screen.getByRole("button", { name: /generate pairing code/i }),
		);
		await screen.findByText("ABC12345");

		await user.click(screen.getByRole("button", { name: /copy code/i }));

		expect(await screen.findByText(/copied/i)).toBeInTheDocument();
		expect(writeTextMock).toHaveBeenCalledWith("ABC12345");
	});

	it("hides the Share button for a pairing code when the Web Share API isn't available", async () => {
		const user = userEvent.setup();
		createPairingCodeMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);
		await user.click(
			screen.getByRole("button", { name: /add another device/i }),
		);
		await user.click(
			screen.getByRole("button", { name: /generate pairing code/i }),
		);
		await screen.findByText("ABC12345");

		expect(
			screen.queryByRole("button", { name: /^share$/i }),
		).not.toBeInTheDocument();
	});

	it("shares the pairing code via the native share sheet when available", async () => {
		const shareMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "share", {
			value: shareMock,
			configurable: true,
		});
		const user = userEvent.setup();
		createPairingCodeMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);
		await user.click(
			screen.getByRole("button", { name: /add another device/i }),
		);
		await user.click(
			screen.getByRole("button", { name: /generate pairing code/i }),
		);
		await screen.findByText("ABC12345");

		await user.click(screen.getByRole("button", { name: /^share$/i }));

		expect(shareMock).toHaveBeenCalledWith({
			title: "Cookerist pairing code",
			text: "Sync your data to another device using the code ABC12345.",
		});
		// @ts-expect-error -- removing a test-only stub, not a real DOM property
		delete navigator.share;
	});

	it("shows an error if generating a pairing code fails", async () => {
		const user = userEvent.setup();
		createPairingCodeMock.mockRejectedValue(new Error("network"));
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: /add another device/i }),
		);
		await user.click(
			screen.getByRole("button", { name: /generate pairing code/i }),
		);

		expect(
			await screen.findByText(/couldn't generate a code/i),
		).toBeInTheDocument();
	});

	it("closes the 'Add another device' row when 'Link this device' is opened", async () => {
		const user = userEvent.setup();
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: /add another device/i }),
		);
		expect(
			screen.getByRole("button", { name: /generate pairing code/i }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /link this device/i }));

		expect(
			screen.queryByRole("button", { name: /generate pairing code/i }),
		).not.toBeInTheDocument();
		expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
	});

	it("links this device with an entered code", async () => {
		const user = userEvent.setup();
		linkDeviceMock.mockResolvedValue(undefined);
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /link this device/i }));
		await user.type(screen.getByLabelText(/pairing code/i), "xyz789");
		await user.click(
			screen.getByRole("button", { name: /^link this device$/i }),
		);

		await waitFor(() => {
			expect(linkDeviceMock).toHaveBeenCalledWith("XYZ789");
		});
	});

	it("shows an error if linking fails", async () => {
		const user = userEvent.setup();
		linkDeviceMock.mockRejectedValue(new Error("bad code"));
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /link this device/i }));
		await user.type(screen.getByLabelText(/pairing code/i), "BADCODE1");
		await user.click(
			screen.getByRole("button", { name: /^link this device$/i }),
		);

		expect(await screen.findByText(/didn't work/i)).toBeInTheDocument();
	});

	it("shows the sync icon button only once this device has an identity", () => {
		render(<AccountDrawer open={true} onClose={vi.fn()} />);
		expect(
			screen.queryByRole("button", { name: /sync now/i }),
		).not.toBeInTheDocument();

		useAppDataMock.mockReturnValue({
			hasDeviceIdentity: true,
			createPairingCode: createPairingCodeMock,
			linkDevice: linkDeviceMock,
			syncNow: syncNowMock,
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /sync now/i }),
		).toBeInTheDocument();
	});

	it("reports the sync result", async () => {
		const user = userEvent.setup();
		syncNowMock.mockResolvedValue(true);
		useAppDataMock.mockReturnValue({
			hasDeviceIdentity: true,
			createPairingCode: createPairingCodeMock,
			linkDevice: linkDeviceMock,
			syncNow: syncNowMock,
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /sync now/i }));

		expect(await screen.findByText("Synced.")).toBeInTheDocument();
	});

	it("hides the 'Link this device' row once this device already has an identity", () => {
		const first = render(<AccountDrawer open={true} onClose={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /link this device/i }),
		).toBeInTheDocument();
		first.unmount();

		useAppDataMock.mockReturnValue({
			hasDeviceIdentity: true,
			createPairingCode: createPairingCodeMock,
			linkDevice: linkDeviceMock,
			syncNow: syncNowMock,
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);
		expect(
			screen.queryByRole("button", { name: /link this device/i }),
		).not.toBeInTheDocument();
	});

	it("redeems a share code and shows the resulting item", async () => {
		const user = userEvent.setup();
		redeemShareCodeMock.mockResolvedValue({
			table: "recipes",
			id: "recipe-1",
			title: "Garlic Butter Shrimp Pasta",
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: /redeem a share code/i }),
		);
		await user.type(screen.getByLabelText(/share code/i), "abcd1234");
		await user.click(screen.getByRole("button", { name: /redeem code/i }));

		expect(redeemShareCodeMock).toHaveBeenCalledWith("ABCD1234");
		expect(
			await screen.findByText(/garlic butter shrimp pasta/i),
		).toBeInTheDocument();
	});

	it("shows an error if redeeming a share code fails", async () => {
		const user = userEvent.setup();
		redeemShareCodeMock.mockRejectedValue(new Error("bad code"));
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: /redeem a share code/i }),
		);
		await user.type(screen.getByLabelText(/share code/i), "BADCODE1");
		await user.click(screen.getByRole("button", { name: /redeem code/i }));

		expect(await screen.findByText(/didn't work/i)).toBeInTheDocument();
	});

	it.each([
		["recipes" as const, "/recipes/$recipeId", { recipeId: "recipe-1" }],
		["grocery_lists" as const, "/grocery/$listId", { listId: "list-1" }],
		["meal_plans" as const, "/meal-plan/$planId", { planId: "plan-1" }],
	])("navigates to a redeemed %s item and closes the drawer when View is tapped", async (table, to, params) => {
		const user = userEvent.setup();
		const id = Object.values(params)[0];
		redeemShareCodeMock.mockResolvedValue({ table, id, title: "Item" });
		const onClose = vi.fn();
		render(<AccountDrawer open={true} onClose={onClose} />);

		await user.click(
			screen.getByRole("button", { name: /redeem a share code/i }),
		);
		await user.type(screen.getByLabelText(/share code/i), "ABCD1234");
		await user.click(screen.getByRole("button", { name: /redeem code/i }));
		await user.click(await screen.findByRole("button", { name: /view/i }));

		expect(onClose).toHaveBeenCalled();
		expect(navigateMock).toHaveBeenCalledWith({ to, params });
	});

	it("shows a message when sync fails", async () => {
		const user = userEvent.setup();
		syncNowMock.mockRejectedValue(new Error("network"));
		useAppDataMock.mockReturnValue({
			hasDeviceIdentity: true,
			createPairingCode: createPairingCodeMock,
			linkDevice: linkDeviceMock,
			syncNow: syncNowMock,
			redeemShareCode: redeemShareCodeMock,
		});
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /sync now/i }));

		expect(await screen.findByText(/sync failed/i)).toBeInTheDocument();
	});

	it("calls onClose when the backdrop is clicked", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<AccountDrawer open={true} onClose={onClose} />);

		await user.click(
			screen.getByRole("button", { name: /close account panel/i }),
		);

		expect(onClose).toHaveBeenCalled();
	});
});
