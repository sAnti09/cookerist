import { Send } from "lucide-react";
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
		<form
			onSubmit={handleSubmit}
			className="card flex items-end gap-2 rounded-full bg-surface py-[0.4rem] pr-[0.4rem] pl-[1.3rem] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
		>
			<Textarea
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder="What do you want to cook?"
				rows={1}
				aria-label="Describe a dish"
				disabled={disabled}
				className="py-2 text-base"
			/>
			<Button
				type="submit"
				aria-label="Get recipe"
				disabled={disabled || value.trim().length === 0}
				className="size-10 shrink-0 rounded-full p-0"
			>
				<Send className="size-4" />
			</Button>
		</form>
	);
}
