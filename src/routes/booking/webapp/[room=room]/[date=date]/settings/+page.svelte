<script lang="ts">
	import { Modal, Listgroup, ListgroupItem } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Check from '@lucide/svelte/icons/check';
	import type { PageProps } from './$types';

	const { params, data }: PageProps = $props();
</script>

<Modal
	open
	title="Settings"
	placement="bottom-center"
	class="rounded-b-none"
	onclose={() => {
		// the sheet also closes when a room was chosen and this page is already left: going back then would undo the choice
		if (page.route.id === '/booking/webapp/[room=room]/[date=date]/settings') history.back();
	}}
>
	<h4>Room</h4>
	<Listgroup active>
		{#each data.rooms as room (room.slug)}
			<ListgroupItem
				href={resolve('/booking/webapp/[room=room]/[date=date]', {
					room: room.slug,
					date: params.date
				})}
				data-sveltekit-replacestate
				class="h-10 items-center py-0"
			>
				{room.name}
				{#if room.slug === params.room}
					<Check class="ml-auto" strokeWidth={1.5} />
				{/if}
			</ListgroupItem>
		{/each}
	</Listgroup>
</Modal>
