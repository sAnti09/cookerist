import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import { loadGroceryLists, saveGroceryList } from "#/lib/grocery-storage";
import { renderApp } from "#/test-utils/render-app";

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));

const getDeviceIdentityMock = vi.fn();
const ensureDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
	ensureDeviceIdentity: () => ensureDeviceIdentityMock(),
}));

const runSyncMock = vi.fn();
vi.mock("#/lib/sync/sync-engine", () => ({
	runSync: () => runSyncMock(),
}));

beforeEach(() => {
	window.localStorage.clear();
	getDeviceIdentityMock.mockReset();
	ensureDeviceIdentityMock.mockReset();
	runSyncMock.mockReset();
	getDeviceIdentityMock.mockReturnValue(null);
	runSyncMock.mockResolvedValue(null);
});

function makeGroceryList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: "list-1",
		createdAt: "2026-01-15T12:00:00.000Z",
		updatedAt: "2026-01-15T12:00:00.000Z",
		sharedAt: null,
		name: "Weeknight Groceries",
		recipeIds: [],
		items: [
			{
				id: "item-1",
				text: "shrimp",
				quantity: 1,
				unit: "lb",
				checked: false,
				source: "custom",
			},
		],
		expanded: false,
		...overrides,
	};
}

describe("Grocery detail screen", () => {
	it("shows a not-found state and a link back for an unknown id", async () => {
		await renderApp("/grocery/does-not-exist");

		expect(screen.getByText(/couldn't be found/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Back to grocery lists" }),
		).toHaveAttribute("href", "/grocery");
	});

	it("renders the list's name, progress, and items", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);

		expect(
			screen.getByRole("heading", { name: "Weeknight Groceries" }),
		).toBeInTheDocument();
		expect(screen.getByText("shrimp")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"0",
		);
	});

	it("shows a sticky Start Shopping button and hides the bottom tab bar", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);

		expect(
			screen.getByRole("button", { name: "Start Shopping" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
	});

	it("hides the sticky Start Shopping button when the list has no items", async () => {
		const list = makeGroceryList({ items: [] });
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);

		expect(
			screen.queryByRole("button", { name: "Start Shopping" }),
		).not.toBeInTheDocument();
	});

	it("opens and closes grocery mode from the sticky Start Shopping button", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);
		const user = userEvent.setup();

		expect(screen.queryByText("Grocery Mode")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Start Shopping" }));
		expect(screen.getByText("Grocery Mode")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Exit grocery mode" }));
		expect(screen.queryByText("Grocery Mode")).not.toBeInTheDocument();
	});

	it("navigates back to the grocery list via the back button", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Back to grocery lists" }),
		);

		expect(
			await screen.findByRole("heading", { name: "Grocery Lists" }),
		).toBeInTheDocument();
	});

	it("uses a true history back (a POP, not a fresh navigation) when arrived at via in-app navigation, so the list's scroll position can be restored", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		const { router } = await renderApp("/grocery");
		const user = userEvent.setup();
		const historyBackSpy = vi.spyOn(router.history, "back");

		await user.click(screen.getByText(list.name));
		await user.click(
			await screen.findByRole("button", { name: "Back to grocery lists" }),
		);

		expect(historyBackSpy).toHaveBeenCalledTimes(1);
		expect(
			await screen.findByRole("heading", { name: "Grocery Lists" }),
		).toBeInTheDocument();
	});

	it("deletes the list and navigates back to the grocery lists screen after confirming", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Delete ${list.name}` }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(
			await screen.findByRole("heading", { name: "Grocery Lists" }),
		).toBeInTheDocument();
		expect(
			window.localStorage.getItem("cookerist:grocery-lists"),
		).not.toContain(list.name);
	});

	it("opens the edit form pre-populated and saves changes over the existing list", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: `Edit ${list.name}` }));

		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByRole("heading", { name: "Edit grocery list" }),
		).toBeInTheDocument();

		const nameInput = within(dialog).getByLabelText("List name");
		await user.clear(nameInput);
		await user.type(nameInput, "Updated Groceries");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		await user.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Save",
			}),
		);

		expect(
			await screen.findByRole("heading", { name: "Updated Groceries" }),
		).toBeInTheDocument();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
		);
		expect(stored).toHaveLength(1);
		expect(stored[0].id).toBe("list-1");
	});

	it("starts syncing via the list's sync icon", async () => {
		const list = makeGroceryList();
		saveGroceryList(loadGroceryLists(), list);
		ensureDeviceIdentityMock.mockImplementation(async () => {
			const identity = { deviceId: "device-1" };
			getDeviceIdentityMock.mockReturnValue(identity);
			return identity;
		});
		await renderApp(`/grocery/${list.id}`);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Start syncing" }));

		await waitFor(() => expect(ensureDeviceIdentityMock).toHaveBeenCalled());
		await waitFor(() => expect(runSyncMock).toHaveBeenCalled());
		expect(
			await screen.findByRole("button", { name: "Syncing" }),
		).toBeInTheDocument();
	});

	it("labels delete as Remove for a shared list owned by another device", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const list = makeGroceryList({
			sharedAt: "2026-01-15T12:00:00.000Z",
			ownerDeviceId: "device-2",
		});
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);

		expect(
			screen.getByRole("button", { name: `Remove ${list.name}` }),
		).toBeInTheDocument();
	});

	it("still labels delete as Delete for a shared list this device owns", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const list = makeGroceryList({
			sharedAt: "2026-01-15T12:00:00.000Z",
			ownerDeviceId: "device-1",
		});
		saveGroceryList(loadGroceryLists(), list);
		await renderApp(`/grocery/${list.id}`);

		expect(
			screen.getByRole("button", { name: `Delete ${list.name}` }),
		).toBeInTheDocument();
	});
});
