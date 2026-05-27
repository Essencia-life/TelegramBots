<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		checked: boolean;
	}

	let { checked = $bindable(), ...restProps } = $props();
</script>

<input type="checkbox" bind:checked {...restProps} />
<div></div>

<style>
	input {
		display: none;
	}

	div {
		border-radius: 16px;
		border: 1px solid var(--app-section-separator-color);
		padding: 2px;
		width: calc((24px + 2px + 1px) * 2); /* width + padding + border */
		margin-block: 5px;
	}

	div::before {
		content: '';
		display: block;
		border-radius: 16px;
		height: 24px;
		width: 24px;
		background-color: var(--app-section-separator-color);
		transition:
			transform 100ms ease-in-out,
			background-color 100ms ease-in-out;
	}

	input:checked + div::before {
		background-color: var(--app-accent-text-color);
		transform: translateX(100%);
	}
</style>
