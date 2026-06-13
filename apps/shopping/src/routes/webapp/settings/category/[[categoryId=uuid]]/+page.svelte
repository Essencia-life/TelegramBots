<script lang="ts">
	import { getList } from '../../../list.remote';
	import { deleteCategory, setCategory, type SetCategoryInput } from './category.remote';
	import { page } from '$app/state';
	import WebApp from '$lib/webapp';
	import { Modal, Label, Input, ButtonGroup, Button } from 'flowbite-svelte';
	import { emojiRegex } from '$lib/utils';

	const list = $derived(await getList());
	const category = $derived(list.find((category) => category.id === page.params.categoryId)!);

	$effect(() => {
		if (category) {
			setCategory.fields.set({
				emoji: category.emoji,
				label: category.label
			});
		} else {
			setCategory.fields.set({});
		}
	});

	let loading = $state(false);

	async function onsubmit({
		form,
		submit
	}: {
		form: HTMLFormElement;
		data: SetCategoryInput;
		submit: () => Promise<boolean>;
	}) {
		loading = true;

		await submit();
		form.reset();

		loading = false;

		history.back();
	}

	async function confirmAndDelete() {
		if (category.items.length > 0) {
			WebApp.showAlert('Category still have items. Please move or delete those before.');
			return;
		}

		const deleteConfirmed = await new Promise((resolve) =>
			WebApp.showPopup(
				{
					message: 'Are you sure you want to delete this category?',
					buttons: [{ type: 'cancel' }, { id: 'delete', type: 'destructive', text: 'Delete' }]
				},
				resolve
			)
		);

		if (deleteConfirmed) {
			loading = true;

			await deleteCategory(category.id);

			loading = false;
		}
	}
</script>

<Modal
	open
	focustrap
	title={category ? 'Edit Category' : 'Add Category'}
	placement="bottom-center"
	class="rounded-b-none"
	onclose={() => history.back()}
>
	<form
		id="category-form"
		class="grid grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2"
		{...setCategory.enhance(onsubmit)}
	>
		<Label for="category-label">Emoji & Label</Label>
		<ButtonGroup>
			<Input
				required
				placeholder="⬜️"
				maxlength={2}
				pattern={emojiRegex.source}
				class="flex-1 text-center"
				{...setCategory.fields.emoji.as('text')}
			/>
			<Input
				required
				placeholder="Label"
				autofocus
				class="flex-6"
				{...setCategory.fields.label.as('text')}
			/>
		</ButtonGroup>

		{#if category}
			<input {...setCategory.fields.id.as('hidden', category.id)} />
		{/if}
	</form>

	{#snippet footer()}
		{#if category}
			<Button {loading} color="red" class="w-full" onclick={confirmAndDelete}
				>Delete Category</Button
			>
		{/if}
		<Button {loading} type="submit" form="category-form" class="w-full">
			{category ? 'Save Changes' : 'Add Category'}
		</Button>
	{/snippet}
</Modal>
