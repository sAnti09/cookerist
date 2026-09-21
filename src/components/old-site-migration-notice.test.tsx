import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OLD_SITE_HOSTNAME } from "#/lib/site-domain";
import { OldSiteMigrationNotice } from "./old-site-migration-notice";

const useAppDataMock = vi.fn();
vi.mock("#/lib/app-data-context", () => ({
	useAppData: () => useAppDataMock(),
}));

const createPairingCodeMock = vi.fn();
const SEEN_KEY = "cookerist:old-site-notice-seen";

function setHostname(hostname: string) {
	Object.defineProperty(window, "location", {
		value: { ...window.location, hostname },
		writable: true,
		configurable: true,
	});
}

const originalLocation = window.location;

beforeEach(() => {
	createPairingCodeMock.mockReset();
	useAppDataMock.mockReturnValue({ createPairingCode: createPairingCodeMock });
	window.localStorage.removeItem(SEEN_KEY);
});

afterEach(() => {
	Object.defineProperty(window, "location", {
		value: originalLocation,
		writable: true,
		configurable: true,
	});
});

describe("OldSiteMigrationNotice", () => {
	it("renders nothing when visiting any other hostname", () => {
		setHostname("cookerist.com");
		render(<OldSiteMigrationNotice />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.queryByText(/has moved/i)).not.toBeInTheDocument();
	});

	it("auto-opens the dialog on the first ever visit to the old hostname", () => {
		setHostname(OLD_SITE_HOSTNAME);
		render(<OldSiteMigrationNotice />);
		expect(
			screen.getByRole("dialog", { name: /cookerist has moved/i }),
		).toBeInTheDocument();
		expect(window.localStorage.getItem(SEEN_KEY)).toBe("1");
	});

	it("shows the persistent banner instead of the dialog on a later visit", () => {
		setHostname(OLD_SITE_HOSTNAME);
		window.localStorage.setItem(SEEN_KEY, "1");
		render(<OldSiteMigrationNotice />);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /move my data/i }),
		).toBeInTheDocument();
	});

	it("reopens the dialog from the banner and shows the banner again after closing it", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		window.localStorage.setItem(SEEN_KEY, "1");
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.click(screen.getByRole("button", { name: /move my data/i }));
		expect(
			screen.getByRole("dialog", { name: /cookerist has moved/i }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /not now/i }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /move my data/i }),
		).toBeInTheDocument();
	});

	it("dismisses the dialog when the backdrop is clicked", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.click(screen.getByRole("button", { name: /^dismiss$/i }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("dismisses the dialog when Escape is pressed", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.keyboard("{Escape}");

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("generates and displays a pairing code", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		createPairingCodeMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.click(screen.getByRole("button", { name: /generate code/i }));

		expect(await screen.findByText("ABC12345")).toBeInTheDocument();
	});

	it("shows an error if generating a code fails", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		createPairingCodeMock.mockRejectedValue(new Error("network"));
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.click(screen.getByRole("button", { name: /generate code/i }));

		expect(
			await screen.findByText(/couldn't generate a code/i),
		).toBeInTheDocument();
	});

	it("copies the generated code to the clipboard", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		const user = userEvent.setup();
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText: writeTextMock },
			configurable: true,
		});
		createPairingCodeMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: new Date(Date.now() + 600_000).toISOString(),
		});
		render(<OldSiteMigrationNotice />);
		await user.click(screen.getByRole("button", { name: /generate code/i }));
		await screen.findByText("ABC12345");

		await user.click(screen.getByRole("button", { name: /copy code/i }));

		expect(await screen.findByText(/copied/i)).toBeInTheDocument();
		expect(writeTextMock).toHaveBeenCalledWith("ABC12345");
	});
});
