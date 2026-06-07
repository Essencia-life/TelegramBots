<script lang="ts">
	import WebApp from '$lib/webapp';
	import type { UserAction } from '$lib/schema';
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { checkListItem, getList } from './list.remote';
	import { fractionMapping } from '$lib/utils';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import { on } from 'svelte/events';
	import { Spinner, Listgroup, ListgroupItem, Badge, Button } from 'flowbite-svelte';
	import AsyncCheckbox from './AsyncCheckbox.svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import ms from 'ms';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();

	let refreshIntervalInstance: number;

	let loginPromise: Promise<void> | undefined = $state();

	onMount(async () => {
		console.log(WebApp);

		if (WebApp.initData) {
			await cookieStore.set({
				name: 'session',
				value: WebApp.initData,
				expires: WebApp.initDataUnsafe.auth_date * 1000 + ms('1d'),
				sameSite: 'strict'
			});
		}

		WebApp.SettingsButton?.show().onClick(() => {
			goto(resolve('/webapp/settings'));
		});

		WebApp.BackButton?.onClick(() => {
			history.back();
		});

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

	async function completeListConfirm() {
		// TODO
		// 	const list = await getList();
		// 	const completeConfirmed = await new Promise((resolve) =>
		// 		WebApp.showConfirm('Complete shopping list?', resolve)
		// 	);
		// 	if (!completeConfirmed) {
		// 		return;
		// 	}
		// 	if (list.some((category) => category.items.some((item) => !item.checked))) {
		// 		const newList = await new Promise((resolve) =>
		// 			WebApp.showConfirm('Move open items to new list?', resolve)
		// 		);
		// 		if (newList) {
		// 			await completeList(true);
		// 			await deleteCheckedListItems();
		// 			await sendNewList();
		// 			WebApp.close();
		// 			return;
		// 		}
		// 	}
		// 	await completeList(false);
		// 	await clearLists();
		// 	WebApp.close();
	}
</script>

{#snippet mention(user: UserAction['by'])}
	{#if user.username}
		<Badge color="amber" href="https://t.me/{user.username}">@{user.name}</Badge>
	{:else}
		<Badge color="amber">@{user.name}</Badge>
	{/if}
{/snippet}

<svelte:boundary>
	{#snippet pending()}
		<div class="flex h-full flex-col items-center justify-center gap-8">
			<Spinner size="16" />
			Logging in...
		</div>
	{/snippet}
	<main class="mt-2 flex flex-1 flex-col gap-4 overflow-auto">
		{#each await getList() as category (category.id)}
			<section>
				<h2 class="m-1 flex items-center gap-2">
					<span>{category.emoji}</span>
					{category.label}
					<button class="ml-auto text-primary">
						{#if false}
							<ChevronsUpDown size={20} />
						{:else}
							<ChevronsDownUp size={20} />
						{/if}
					</button>
				</h2>
				<Listgroup active>
					{#each category.items as item (item.id)}
						<div animate:flip={{ duration: 300 }} transition:slide={{ duration: 500 }}>
							<ListgroupItem class="h-10 items-center py-0 pr-1">
								<AsyncCheckbox checked={item.checked} action={() => checkListItem(item.id)} />
								<a
									class="overflow-hidden text-ellipsis whitespace-nowrap"
									href={resolve('/webapp/item/[categoryId=uuid]/[[itemId=uuid]]', {
										categoryId: category.id,
										itemId: item.id
									})}
									data-sveltekit-noscroll
								>
									{item.label}
								</a>
								<div class="ml-auto flex shrink-0 items-center gap-1">
									{#if item.personal}
										{@render mention(item.added.by)}
									{/if}
									{#if item.amount}
										<Badge>
											{fractionMapping.get(item.amount) ?? item.amount}&hairsp;{item.unit ||
												'\u00D7'}
										</Badge>
									{/if}
									<button class="text-gray-200 dark:text-gray-600" class:invisible={item.checked}>
										<!-- TODO: implement https://github.com/isaacHagoel/svelte-dnd-action#drag-handles-support -->
										<GripVertical />
									</button>
								</div>
							</ListgroupItem>
						</div>
					{/each}
					<ListgroupItem
						class="h-10 items-center gap-4 py-0 pl-3.25"
						href={resolve('/webapp/item/[categoryId=uuid]', { categoryId: category.id })}
						data-sveltekit-noscroll
					>
						<Plus strokeWidth={1.5} />
						Add Item
					</ListgroupItem>
				</Listgroup>
			</section>
		{:else}
			<p>
				There are no lists available.<br />
				Go to <a href={resolve('/webapp/settings')}>settings</a> to create new lists.
			</p>
		{/each}
	</main>

	<div class="py-3">
		<Button class="w-full" onclick={completeListConfirm}>Complete Shopping List</Button>
	</div>

	{@render children?.()}

	{#snippet failed(error)}
		<div class="flex h-full flex-col items-center justify-center gap-8 text-red-600">
			<ShieldAlert size={64} />
			Error: {error.body.message}
		</div>
	{/snippet}
</svelte:boundary>
