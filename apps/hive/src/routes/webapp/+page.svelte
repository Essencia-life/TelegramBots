<script lang="ts">
	import WebApp from '@twa-dev/sdk';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';
	import { page } from '$app/state';

	const { data }: PageProps = $props();

	onMount(() => {
		WebApp.ready();
	});
</script>

<pre>{JSON.stringify(Object.fromEntries(page.url.searchParams.entries()))}</pre>
<pre>{JSON.stringify(data, null, 2)}</pre>
