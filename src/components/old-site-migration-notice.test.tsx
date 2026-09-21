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
const DISMISSED_KEY = "cookerist:old-site-notice-dismissed";

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
	window.localStorage.removeItem(DISMISSED_KEY);
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
	});

	it("shows the notice when visiting the old hostname", () => {
		setHostname(OLD_SITE_HOSTNAME);
		render(<OldSiteMigrationNotice />);
		expect(
			screen.getByRole("dialog", { name: /cookerist has moved/i }),
		).toBeInTheDocument();
	});

	it("stays hidden after already being dismissed", () => {
		setHostname(OLD_SITE_HOSTNAME);
		window.localStorage.setItem(DISMISSED_KEY, "1");
		render(<OldSiteMigrationNotice />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("dismisses and remembers via the Not now link", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.click(screen.getByRole("button", { name: /not now/i }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
	});

	it("dismisses when the backdrop is clicked", async () => {
		setHostname(OLD_SITE_HOSTNAME);
		const user = userEvent.setup();
		render(<OldSiteMigrationNotice />);

		await user.click(screen.getByRole("button", { name: /^dismiss$/i }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("dismisses when Escape is pressed", async () => {
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
