<script lang="ts">
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { resolve } from '$app/paths';

	import { dragHandleZone, dragHandle, type DndEvent, type Options } from 'svelte-dnd-action';
	import { Listgroup, ListgroupItem, Badge } from 'flowbite-svelte';

	import { fractionMapping } from '$lib/utils';
	import type { Category, Item } from '$lib/schema';
	import { getCollapsedCategories, toggleCategory } from '$lib/cloudStorage.svelte';

	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

	import AsyncCheckbox from './AsyncCheckbox.svelte';

	import { checkListItem, moveListItem } from './list.remote';

	interface Props {
		category: Category;
	}

	const dropZoneOptions: Omit<Options, 'items'> = {
		dropFromOthersDisabled: true,
		dropTargetStyle: { outline: 'none' },
		flipDurationMs: 300
	};
	const { category }: Props = $props();
	const collapsedCategories = getCollapsedCategories();

	let items = $derived(category.items.filter((item) => !item.checked));
	let checkedItems = $derived(category.items.filter((item) => item.checked));

	function handleSort(e: CustomEvent<DndEvent<Item>>) {
		items = e.detail.items;
	}

	async function saveSort(e: CustomEvent<DndEvent<Item>>) {
		items = e.detail.items;

		const id = e.detail.info.id;
		const index = items.findIndex((item) => item.id === id);

		if (index === 0) {
			const nextItem = items.at(1);

			if (nextItem) {
				await moveListItem({ id, categoryId: category.id, before: nextItem.id });
			}
		} else {
			const prevItem = items.at(index - 1);

			if (prevItem) {
				await moveListItem({ id, categoryId: category.id, after: prevItem.id });
			}
		}
	}
</script>

<section>
	<h2 class="m-1 flex items-center gap-2">
		<span>{category.emoji}</span>
		{category.label}
		<button class="ml-auto text-primary" onclick={() => toggleCategory(category.id)}>
			{#if collapsedCategories[category.id]}
				<ChevronsUpDown size={20} />
			{:else}
				<ChevronsDownUp size={20} />
			{/if}
		</button>
	</h2>
	{#if !collapsedCategories[category.id]}
		<div transition:slide>
			<Listgroup active>
				{#each checkedItems as item (item.id)}
					<div animate:flip={{ duration: dropZoneOptions.flipDurationMs }}>
						{@render listItem(item)}
					</div>
				{/each}

				{#if items.length}
					<div
						class="divide-y divide-gray-200 dark:divide-gray-700"
						use:dragHandleZone={{ items, ...dropZoneOptions, dragDisabled: items.length < 2 }}
						onconsider={handleSort}
						onfinalize={saveSort}
					>
						{#each items as item (item.id)}
							<div animate:flip={{ duration: dropZoneOptions.flipDurationMs }}>
								{@render listItem(item)}
							</div>
						{/each}
					</div>
				{/if}
				<ListgroupItem
					class="h-10 items-center gap-4 py-0 pl-3.25"
					href={resolve('/webapp/item/[categoryId=uuid]', { categoryId: category.id })}
					data-sveltekit-noscroll
				>
					<Plus strokeWidth={1.5} />
					Add Item
				</ListgroupItem>
			</Listgroup>
		</div>
	{/if}
</section>

{#snippet listItem(item: Item)}
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
				{#if item.added.by.username}
					<Badge color="amber" href="https://t.me/{item.added.by.username}"
						>@{item.added.by.name}</Badge
					>
				{:else}
					<Badge color="amber">@{item.added.by.name}</Badge>
				{/if}
			{/if}
			{#if item.amount}
				<Badge>
					{fractionMapping.get(item.amount) ?? item.amount}&hairsp;{item.unit || '\u00D7'}
				</Badge>
			{/if}
			<button
				class="text-gray-200 dark:text-gray-600"
				class:invisible={item.checked}
				use:dragHandle
			>
				<GripVertical />
			</button>
		</div>
	</ListgroupItem>
{/snippet}
