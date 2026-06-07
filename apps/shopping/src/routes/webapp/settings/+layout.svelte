<script lang="ts">
	import { getList } from '../list.remote';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { Modal, Listgroup, ListgroupItem } from 'flowbite-svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
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
		{#each await getList() as category}
			<ListgroupItem
				href={resolve('/webapp/settings/category/[[categoryId=uuid]]', {
					categoryId: category.id
				})}
				data-sveltekit-noscroll
				class="h-10 items-center py-0 pr-1"
			>
				<div class="text-lg">{category.emoji}</div>
				{category.label}
				<button class="ml-auto text-gray-200 dark:text-gray-600">
					<!-- TODO: implement https://github.com/isaacHagoel/svelte-dnd-action#drag-handles-support -->
					<GripVertical />
				</button>
			</ListgroupItem>
		{/each}
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
