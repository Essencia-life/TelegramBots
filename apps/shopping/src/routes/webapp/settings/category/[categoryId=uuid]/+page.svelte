<script lang="ts">
	import EmojiRegex from 'emoji-regex-xs';
	import { dialogOpen } from '$lib/attachments/dialogOpen';
	import { getContext } from 'svelte';
	import { getList } from '$lib/remote/list.remote';
	import { deleteCategory, updateCategory } from '$lib/remote/category.remote';
	import { page } from '$app/state';
	import WebApp from '@twa-dev/sdk';

	let dialogRef: HTMLDialogElement;

	const emojiRegex = EmojiRegex();
	const loader = getContext<{ show: () => void; hide: () => void }>('loader');

	const list = $derived(await getList());
	const category = $derived(list.find((category) => category.id === page.params.categoryId)!);

	let emoji = $state<string>('');
	let label = $state<string>('');

	$effect(() => {
		if (category) {
			label = category.label;
			emoji = category.emoji;
		}
	});

	let disabled = $state(false);

	async function save() {
		disabled = true;
		loader.show();

		await updateCategory({
			id: category.id,
			label,
			emoji
		});
		await getList().refresh();

		dialogRef.close();
		loader.hide();
	}

	async function remove() {
		if (category.items.length > 0) {
			WebApp.showAlert('Category still have items. Please move or delete those before.');
			return;
		}

		disabled = true;
		loader.show();

		const deleteConfirmed = await new Promise((resolve) =>
			WebApp.showPopup(
				{
					message: 'Are you sure you want to delete this category?',
					buttons: [{ type: 'cancel' }, { id: 'delete', type: 'destructive', text: 'Delete' }]
				},
				resolve
			)
		);

		if (!deleteConfirmed) {
			disabled = false;
			loader.hide();
			return;
		}

		await deleteCategory(category.id);

		await getList().refresh();

		dialogRef.close();
		loader.hide();
	}
</script>

<dialog bind:this={dialogRef} {@attach dialogOpen} onclose={() => history.back()}>
	<form onsubmit={save}>
		<section>
			<header>Edit category</header>
			<ul>
				<li>
					<label>
						<span class="required">Label</span>
						<input required autofocus bind:value={label} />
					</label>
				</li>
				<li>
					<label>
						<span class="required">Emoji</span>
						<input
							required
							bind:value={emoji}
							placeholder="⬜️"
							maxlength="2"
							pattern={emojiRegex.source}
						/>
					</label>
				</li>
			</ul>
		</section>

		<button class="button link descructive" onclick={remove} {disabled}>Delete Category</button>
		<button class="button" {disabled}>Save Category</button>
	</form>
</dialog>

<style>
	ul {
		margin-block: 16px;
	}
</style>
