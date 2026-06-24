<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import { on } from 'svelte/events';
	import type { HttpError } from '@sveltejs/kit';
	import { Spinner, Button } from 'flowbite-svelte';
	import ms from 'ms';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	import ShieldAlert from '@lucide/svelte/icons/shield-alert';

	import WebApp from '$lib/webapp';

	import ListCategory from './ListCategory.svelte';

	import {
		clearLists,
		completeList,
		deleteCheckedListItems,
		getList,
		sendNewList
	} from './list.remote';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();

	let ready = $state(false);
	let refreshIntervalInstance: number;

	onMount(async () => {
		console.log(WebApp);

		if (WebApp.initData) {
			await cookieStore.set({
				name: 'session',
				value: WebApp.initData,
				expires: WebApp.initDataUnsafe.auth_date * 1000 + ms('23h'),
				sameSite: 'strict'
			});
		}

		WebApp.SettingsButton?.show().onClick(() => {
			goto(resolve('/webapp/settings'));
		});

		WebApp.BackButton?.onClick(() => {
			history.back();
		});

		ready = true;

		refreshInterval();
	});

	onDestroy(() => {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}
	});

	on(document, 'visibilitychange', () => {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}

		if (document.visibilityState === 'visible') {
			getList().refresh();
			refreshInterval();
		}
	});

	$effect(() => {
		WebApp.BackButton?.[page.route.id === '/webapp' ? 'hide' : 'show']();
	});

	function refreshInterval() {
		refreshIntervalInstance = window.setInterval(() => getList().refresh(), 30_000);
	}
</script>

{#snippet loading()}
	<div class="flex h-full flex-col items-center justify-center gap-8">
		<Spinner size="16" />
		Logging in...
	</div>
{/snippet}

<svelte:boundary>
	{#snippet pending()}
		{@render loading()}
	{/snippet}

	{#snippet failed(error)}
		<div class="flex h-full flex-col items-center justify-center gap-8 text-red-600">
			<ShieldAlert size={64} />
			Error: {(error as HttpError).body.message}
		</div>
	{/snippet}

	{#if ready}
		<main class="flex flex-1 flex-col gap-4 overflow-auto">
			{#each await getList() as category (category.id)}
				<ListCategory {category} />
			{:else}
				<p>
					There are no lists available.<br />
					Go to <a href={resolve('/webapp/settings')}>settings</a> to create new lists.
				</p>
			{/each}
		</main>

		{@render children?.()}
	{:else}
		{@render loading()}
	{/if}
</svelte:boundary>
