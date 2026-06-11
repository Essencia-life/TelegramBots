<script lang="ts">
	import type { Snippet } from 'svelte';
	import { dragHandleZone, dragHandle, type DndEvent, type Options } from 'svelte-dnd-action';
	import { Modal, Listgroup, ListgroupItem } from 'flowbite-svelte';

	import { resolve } from '$app/paths';

	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	import { getList } from '../list.remote';
	import type { Category } from '$lib/schema';
	import { moveCategory } from './category/[[categoryId=uuid]]/category.remote';
	import { flip } from 'svelte/animate';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
	const dropZoneOptions: Omit<Options, 'items'> = {
		dropFromOthersDisabled: true,
		dropTargetStyle: { outline: 'none' },
		flipDurationMs: 300
	};

	let categories = $derived(await getList());

	function handleSort(e: CustomEvent<DndEvent<Category>>) {
		categories = e.detail.items;
	}

	async function saveSort(e: CustomEvent<DndEvent<Category>>) {
		categories = e.detail.items;

		const categoryId = e.detail.info.id;
		const insertIndex = categories.findIndex((category) => category.id === categoryId);

		await moveCategory({ categoryId, insertIndex });
	}
</script>

<Modal
	open
	title="Settings"
	placement="bottom-center"
	class="rounded-b-none"
	onclose={() => history.back()}
>
	<h4>Categories</h4>
	<Listgroup active>
		{#if categories.length}
			<div
				class="divide-y divide-gray-200 dark:divide-gray-700"
				use:dragHandleZone={{
					items: categories,
					...dropZoneOptions,
					dragDisabled: categories.length < 2
				}}
				onconsider={handleSort}
				onfinalize={saveSort}
			>
				{#each categories as category (category.id)}
					<div animate:flip={{ duration: dropZoneOptions.flipDurationMs }}>
						<ListgroupItem
							href={resolve('/webapp/settings/category/[[categoryId=uuid]]', {
								categoryId: category.id
							})}
							data-sveltekit-noscroll
							class="h-10 items-center py-0 pr-1"
						>
							<div class="text-lg">{category.emoji}</div>
							{category.label}
							<button class="ml-auto text-gray-200 dark:text-gray-600" use:dragHandle>
								<GripVertical />
							</button>
						</ListgroupItem>
					</div>
				{/each}
			</div>
		{/if}
		<ListgroupItem
			class="h-10 items-center py-0 pl-3.25"
			href={resolve('/webapp/settings/category')}
		>
			<Plus strokeWidth={1.5} />
			Add Category
		</ListgroupItem>
	</Listgroup>
</Modal>

{@render children?.()}
