import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";

type PromptFormProps = {
	onSubmit: (prompt: string) => void;
	disabled?: boolean;
};

export function PromptForm({ onSubmit, disabled }: PromptFormProps) {
	const [value, setValue] = useState("");

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		setValue("");
		onSubmit(trimmed);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<Textarea
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder="What do you want to cook? e.g. creamy garlic butter shrimp pasta for 2"
				rows={3}
				aria-label="Describe a dish"
				disabled={disabled}
			/>
			<div>
				<Button type="submit" disabled={disabled || value.trim().length === 0}>
					Get recipe
				</Button>
			</div>
		</form>
	);
}
