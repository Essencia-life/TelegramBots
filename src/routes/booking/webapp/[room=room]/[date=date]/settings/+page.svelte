<script lang="ts">
	import { Modal, Listgroup, ListgroupItem } from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import type { PageProps } from './$types';

	const { params, data }: PageProps = $props();
</script>

<Modal
	open
	title="Settings"
	placement="bottom-center"
	class="rounded-b-none"
	onclose={() => history.back()}
>
	<h4>Room</h4>
	<Listgroup active>
		{#each data.rooms as room (room.slug)}
			<ListgroupItem
				href={resolve('/booking/webapp/[room=room]/[date=date]', {
					room: room.slug,
					date: params.date
				})}
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
