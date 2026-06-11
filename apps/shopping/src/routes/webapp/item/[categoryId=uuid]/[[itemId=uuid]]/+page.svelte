<script lang="ts">
	import { page } from '$app/state';
	import { getList } from '../../../list.remote';
	import { Modal, Label, Select, Input, ButtonGroup, Toggle, Button, Alert } from 'flowbite-svelte';
	import { deleteItem, setItem, type SetItemInput } from './item.remote';
	import WebApp from '$lib/webapp';
	import { units } from '$lib/config';

	let loading = $state(false);

	const list = $derived(await getList());
	const category = $derived(list.find((category) => category.id === page.params.categoryId)!);
	const item = $derived(
		page.params.itemId && category?.items.find((item) => item.id === page.params.itemId)
	);

	$effect(() => {
		setItem.fields.categoryId.set(category?.id);
	});

	$effect(() => {
		if (item) {
			setItem.fields.set({
				label: item.label,
				amount: item.amount,
				unit: item.unit,
				personal: item.personal
			});
		} else {
			setItem.fields.set({});
		}
	});

	async function onsubmit({
		form,
		submit
	}: {
		form: HTMLFormElement;
		data: SetItemInput;
		submit: () => Promise<boolean>;
	}) {
		loading = true;

		await submit();

		form.reset();

		loading = false;

		history.back();
	}

	async function confirmAndDelete() {
		const confirmed = await new Promise((resolve) =>
			WebApp.showPopup(
				{
					message: 'Are you sure you want to delete this item?',
					buttons: [{ type: 'cancel' }, { id: 'delete', type: 'destructive', text: 'Delete' }]
				},
				resolve
			)
		);

		if (item && confirmed) {
			loading = true;

			await deleteItem(item.id);

			loading = false;

			history.back();
		}
	}
</script>

<Modal
	open
	title={item ? 'Edit Item' : 'Add Item'}
	placement="bottom-center"
	class="rounded-b-none"
	onclose={() => history.back()}
>
	{#if item}
		<Alert border color="secondary">
			Added by
			{#if item.added.by.username}
				<a href="https://t.me/{item.added.by.username}">{item.added.by.name}</a>
			{:else}
				{item.added.by.name}
			{/if}
			on {item.added.at.toLocaleString()}.
			{#if item.lastModified}
				<br />
				Last modified by
				{#if item.lastModified.by.username}
					<a href="https://t.me/{item.lastModified.by.username}">{item.lastModified.by.name}</a>
				{:else}
					{item.lastModified.by.name}
				{/if}
				on {item.lastModified.at.toLocaleString()}.
			{/if}
		</Alert>
	{/if}
	<form
		id="item-form"
		class="grid grid-cols-[1fr_2fr] items-center gap-x-4 gap-y-2"
		{...setItem.enhance(onsubmit)}
	>
		<Label for="item-category">Category</Label>

		<Select required id="item-category" {...setItem.fields.categoryId.as('select', category?.id)}>
			{#each list as category (category.id)}
				<option value={category.id}>{category.label}</option>
			{/each}
		</Select>

		<Label for="item-label">Item</Label>
		<Input required autofocus id="item-label" {...setItem.fields.label.as('text')} />

		<Label for="item-amount">Amount</Label>
		<ButtonGroup>
			<Input
				id="item-amount"
				{...setItem.fields.amount.as('number')}
				inputmode="numeric"
				class="text-right"
			/>
			<Input
				data={units}
				id="item-unit"
				placeholder={units[0]}
				{...setItem.fields.unit.as('text')}
			/>
		</ButtonGroup>

		<Label>Personal</Label>
		<Toggle class="my-2" {...setItem.fields.personal.as('checkbox')}>Buy this for me please</Toggle>

		{#if item}
			<input {...setItem.fields.id.as('hidden', item.id)} />
			<input {...setItem.fields.previousCategoryId.as('hidden', category.id)} />
		{/if}
	</form>

	{#snippet footer()}
		{#if item}
			<Button {loading} color="red" class="w-full" onclick={confirmAndDelete}>Delete Item</Button>
		{/if}
		<Button {loading} type="submit" form="item-form" class="w-full">
			{item ? 'Save Changes' : 'Add Item'}
		</Button>
	{/snippet}
</Modal>
