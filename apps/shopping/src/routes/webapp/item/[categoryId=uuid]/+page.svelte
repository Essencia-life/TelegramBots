<script lang="ts">
	import { page } from '$app/state';
	import { dialogOpen } from '$lib/attachments/dialogOpen';
	import webAppDataService from '$lib/client/web-app-data.service';
	import SwitchButton from '$lib/components/SwitchButton.svelte';
	import type { UserAction } from '$lib/schema';
	import { getContext } from 'svelte';
	import { addListItem, getList } from '$lib/remote/list.remote';

	let dialogRef: HTMLDialogElement;

	const loader = getContext<{ show: () => void; hide: () => void }>('loader');

	const list = $derived(await getList());
	const category = $derived(list.find((category) => category.id === page.params.categoryId)!);

	let categoryId = $derived(category?.id);
	let label = $state<string>('');
	let amount = $state<number>();
	let unit = $state<string>();
	let personal = $state(false);

	let disabled = $state(false);

	async function save() {
		disabled = true;
		loader.show();

		const { id, first_name: name, username } = await webAppDataService.getUser();
		const userAction: UserAction | undefined = {
			at: new Date(),
			by: { id, name, username }
		};

		await addListItem({
			categoryId,
			item: {
				label,
				amount,
				unit,
				personal,
				added: userAction
			}
		});

		await getList().refresh();

		dialogRef.close();
		loader.hide();
	}
</script>

<dialog bind:this={dialogRef} {@attach dialogOpen} onclose={() => history.back()}>
	<form>
		<section>
			<header>Add item</header>
			<ul>
				{#if categoryId}
					<li>
						<label>
							<span class="required">Category</span>
							<select bind:value={categoryId}>
								{#each list as category}
									<option value={category.id}>{category.label}</option>
								{/each}
							</select>
						</label>
					</li>
				{/if}
				<li>
					<label>
						<span class="required">Label</span>
						<input required autofocus bind:value={label} />
					</label>
				</li>
				<li>
					<label>
						Amount
						<input bind:value={amount} type="number" inputmode="numeric" />
					</label>
				</li>
				<li>
					<label>
						Unit
						<input bind:value={unit} list="units" />
						<datalist id="units">
							<option>x</option>
							<option>g</option>
							<option>kg</option>
							<option>ml</option>
							<option>l</option>
							<option>bag</option>
							<option>bags</option>
							<option>head</option>
							<option>heads</option>
							<option>crate</option>
							<option>crates</option>
							<option>jar</option>
							<option>jars</option>
							<option>bottle</option>
							<option>bottles</option>
						</datalist>
					</label>
				</li>
				<li>
					<label>
						Personal
						<SwitchButton bind:checked={personal} />
					</label>
				</li>
			</ul>
		</section>
		<button class="button" onclick={save} {disabled}>Add Item</button>
	</form>
</dialog>

<style>
	ul {
		margin-block: 16px;
	}
</style>
