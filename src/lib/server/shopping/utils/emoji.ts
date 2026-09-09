export function emojiToCode(emoji: string) {
	return [...emoji].map((char) => char.codePointAt(0)!.toString(16)).join('-');
}

export function emojiImageUrl(emoji: string, size = 96) {
	return `https://emojiapi.dev/api/v1/${emojiToCode(emoji)}/${size}.png`;
}
