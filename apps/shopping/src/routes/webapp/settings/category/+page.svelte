<script lang="ts">
	import EmojiRegex from 'emoji-regex-xs';
	import { dialogOpen } from '$lib/attachments/dialogOpen';
	import { getContext } from 'svelte';
	import { getList } from '$lib/remote/list.remote';
	import { createCategory } from '$lib/remote/category.remote';

	let dialogRef: HTMLDialogElement;

	const emojiRegex = EmojiRegex();
	const loader = getContext<{ show: () => void; hide: () => void }>('loader');

	let emoji = $state<string>('');
	let label = $state<string>('');

	let disabled = $state(false);

	async function save() {
		disabled = true;
		loader.show();

		await createCategory({
			label,
			emoji
		});
		await getList().refresh();

		dialogRef.close();
		loader.hide();
	}
</script>

<dialog bind:this={dialogRef} {@attach dialogOpen} onclose={() => history.back()}>
	<form onsubmit={save}>
		<section>
			<header>Add category</header>
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

		<button class="button" {disabled}>Add Category</button>
	</form>
</dialog>

<style>
	ul {
		margin-block: 16px;
	}
</style>
