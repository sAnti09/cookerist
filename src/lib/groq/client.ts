import Groq from "groq-sdk";

export function getGroqClient(): Groq {
	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		throw new Error("GROQ_API_KEY is not set");
	}
	return new Groq({ apiKey });
}
