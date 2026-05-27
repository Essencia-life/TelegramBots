<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { dialogOpen } from '$lib/attachments/dialogOpen';
	import { getList } from '$lib/remote/list.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import type { UUID } from 'node:crypto';

	interface Props {
		children: Snippet;
	}

	const { children }: Props = $props();
</script>

<dialog {@attach dialogOpen} class="settings" onclose={() => history.back()}>
	<section>
		<header>Categories</header>
		<ul>
			{#each await getList() as category}
				<li>
					<button
						class="link"
						onclick={() =>
							goto(
								resolve('/webapp/settings/category/[categoryId=uuid]', {
									categoryId: category.id as UUID
								})
							)}
					>
						<div class="emoji">{category.emoji}</div>
						{category.label}
					</button>
				</li>
			{/each}
			<li>
				<button class="link" onclick={() => goto(resolve('/webapp/settings/category'))}>
					<Plus />
					Add Category
				</button>
			</li>
		</ul>
	</section>
</dialog>

{@render children?.()}

<style>
	ul {
		margin-block: 16px;
	}

	button.link {
		appearance: none;
		display: flex;
		height: 40px;
		width: 100%;
		align-items: center;
		gap: 8px;
		border: 0;
		padding: 0;
		font: inherit;
		text-align: left;
	}

	button .emoji {
		font-size: 24px;
	}
</style>
