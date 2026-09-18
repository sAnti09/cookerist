import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDrawer } from "./account-drawer";

const useAppDataMock = vi.fn();
vi.mock("#/lib/app-data-context", () => ({
	useAppData: () => useAppDataMock(),
}));

const createPairingCodeMock = vi.fn();
const linkDeviceMock = vi.fn();
const syncNowMock = vi.fn();

beforeEach(() => {
	createPairingCodeMock.mockReset();
	linkDeviceMock.mockReset();
	syncNowMock.mockReset();
	useAppDataMock.mockReturnValue({
		hasDeviceIdentity: false,
		createPairingCode: createPairingCodeMock,
		linkDevice: linkDeviceMock,
		syncNow: syncNowMock,
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
			screen.getByRole("button", { name: /generate pairing code/i }),
		);

		expect(await screen.findByText("ABC12345")).toBeInTheDocument();
	});

	it("shows an error if generating a pairing code fails", async () => {
		const user = userEvent.setup();
		createPairingCodeMock.mockRejectedValue(new Error("network"));
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.click(
			screen.getByRole("button", { name: /generate pairing code/i }),
		);

		expect(
			await screen.findByText(/couldn't generate a code/i),
		).toBeInTheDocument();
	});

	it("links this device with an entered code", async () => {
		const user = userEvent.setup();
		linkDeviceMock.mockResolvedValue(undefined);
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.type(screen.getByLabelText(/pairing code/i), "xyz789");
		await user.click(screen.getByRole("button", { name: /link this device/i }));

		await waitFor(() => {
			expect(linkDeviceMock).toHaveBeenCalledWith("XYZ789");
		});
	});

	it("shows an error if linking fails", async () => {
		const user = userEvent.setup();
		linkDeviceMock.mockRejectedValue(new Error("bad code"));
		render(<AccountDrawer open={true} onClose={vi.fn()} />);

		await user.type(screen.getByLabelText(/pairing code/i), "BADCODE1");
		await user.click(screen.getByRole("button", { name: /link this device/i }));

		expect(await screen.findByText(/didn't work/i)).toBeInTheDocument();
	});

	it("shows the sync section only once this device has an identity", () => {
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
