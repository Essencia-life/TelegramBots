<script lang="ts">
	import './+layout.css';

	import WebApp from '@twa-dev/sdk';
	import type { Category, Item, UserAction } from '$lib/schema';
	import { onDestroy, onMount, setContext, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		checkListItem,
		clearLists,
		completeList,
		deleteCheckedListItems,
		getList,
		sendNewList
	} from '$lib/remote/list.remote';
	import { fractionMapping } from '$lib/utils';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import webAppDataService from '$lib/client/web-app-data.service';
	import { on } from 'svelte/events';
	import Loader from '$lib/components/Loader.svelte';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();

	let loader: Loader;
	let refreshIntervalInstance: number;

	setContext('loader', {
		show() {
			loader.show();
		},
		hide() {
			loader.hide();
		}
	});

	onMount(() => {
		console.log(WebApp);

		WebApp.SettingsButton.show().onClick(() => {
			goto(resolve('/webapp/settings'));
		});

		WebApp.BackButton.onClick(() => {
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
		WebApp.BackButton[page.route.id === '/webapp' ? 'hide' : 'show']();
	});

	function refreshInterval() {
		refreshIntervalInstance = window.setInterval(() => getList().refresh(), 30_000);
	}

	async function completeListConfirm() {
		const list = await getList();
		const completeConfirmed = await new Promise((resolve) =>
			WebApp.showConfirm('Complete shopping list?', resolve)
		);

		if (!completeConfirmed) {
			return;
		}

		if (list.some((category) => category.items.some((item) => !item.checked))) {
			const newList = await new Promise((resolve) =>
				WebApp.showConfirm('Move open items to new list?', resolve)
			);

			if (newList) {
				await completeList(true);
				await deleteCheckedListItems();
				await sendNewList();

				WebApp.close();
				return;
			}
		}

		await completeList(false);
		await clearLists();

		WebApp.close();
	}

	async function checkItem(item: Item) {
		const { id, first_name: name, username } = await webAppDataService.getUser();
		const userAction: UserAction | undefined = {
			at: new Date(),
			by: { id, name, username }
		};

		await checkListItem({
			itemId: item.id,
			userAction
		});

		await getList().refresh();
	}

	function openItem(category: Category, item: Item) {
		navigator.vibrate(50);

		goto(
			resolve('/webapp/item/[categoryId=uuid]/[itemId=uuid]', {
				categoryId: category.id,
				itemId: item.id
			})
		);
	}
</script>

{#snippet mention(user: UserAction['by'])}
	{#if user.username}
		<a class="tag personal" href="https://t.me/{user.username}">@{user.name}</a>
	{:else}
		@{user.name}
	{/if}
{/snippet}

<header class="main">
	<img class="avatar" src="/api/telegram/avatar" alt="Shopping List" />
</header>

<main>
	{#each await getList() as category (category.id)}
		<section>
			<header><big>{category.emoji}</big>{category.label}</header>
			<ul>
				{#each category.items as item (item.id)}
					<li>
						<Checkbox
							checked={item.checked}
							ontap={() => checkItem(item)}
							onlongpress={() => openItem(category, item)}
						>
							<span class="label">{item.label}</span>
							{#snippet trailing()}
								{#if item.amount}
									<span class="tag">
										{fractionMapping.get(item.amount) ?? item.amount}&hairsp;{item.unit ?? '\u00D7'}
									</span>
								{/if}
								{#if item.personal}
									{@render mention(item.added.by)}
								{/if}
							{/snippet}
						</Checkbox>
					</li>
				{/each}
				<li>
					<a
						class="link"
						href={resolve('/webapp/item/[categoryId=uuid]', { categoryId: category.id })}
					>
						<Plus strokeWidth={1.5} />
						Add Item
					</a>
				</li>
			</ul>
		</section>
	{:else}
		<p>
			There are no lists available.<br />
			Go to <a href={resolve('/webapp/settings')}>settings</a> to create new lists.
		</p>
	{/each}
</main>
<div class="bottom-bar">
	<button class="button" onclick={completeListConfirm}>Complete Shopping List</button>
</div>

{@render children?.()}

<Loader bind:this={loader} />

<style>
	main {
		display: flex;
		flex-direction: column;
		flex: 1;
		padding: 16px;
		gap: 16px;
		background: var(--app-secondary-bg-color);
		overflow: auto;
	}

	header.main {
		display: flex;
	}

	header.main img {
		margin: 8px auto;
		border-radius: 100%;
		height: 64px;
		width: 64px;
	}

	li .tag {
		padding: 2px 6px;
		font-size: 80%;
		border-radius: 8px;
		background: var(--app-accent-text-color);
		color: var(--app-bg-color);
	}

	li .tag.personal {
		background: var(--app-link-color);
		color: var(--app-bg-color);
		text-decoration: none;
	}

	a.link {
		display: flex;
		height: 40px;
		align-items: center;
		gap: 8px;
		text-decoration: none;
	}

	.bottom-bar {
		padding: 16px;
		background: var(--app-bottom-bar-bg-color);
	}
</style>
