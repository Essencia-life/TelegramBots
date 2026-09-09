<script lang="ts">
	import { Spinner, Checkbox, type CheckboxProps } from 'flowbite-svelte';

	interface Props extends CheckboxProps {
		action: () => Promise<void>;
	}

	const { action, ...restProps }: Props = $props();
	let loading = $state(false);

	async function onclick(event: Event & { currentTarget: HTMLInputElement }) {
		event.preventDefault();
		event.stopPropagation();
		loading = true;
		await action();
		loading = false;
		(document.activeElement as HTMLElement | null)?.blur();
	}
</script>

<div class="relative">
	<Checkbox
		class="h-5 w-5 rounded-full"
		style="background-size: 1.25em !important"
		{...restProps}
		{onclick}
	/>
	{#if loading}
		<Spinner size="5" class="absolute inset-0" />
	{/if}
</div>
