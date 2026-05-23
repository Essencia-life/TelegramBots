<script lang="ts">
	import WebApp from '@twa-dev/sdk';
	import {
		checkAvailability,
		createBooking,
		deleteBooking,
		updateBooking
	} from '$lib/calendar.remote';
	import type { PageProps } from './$types';
	import type { Attachment } from 'svelte/attachments';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteDate } from 'svelte/reactivity';
	import ms from 'ms';
	import type { TimePeriod } from '$lib/server/calendar';
	import { Modal, Label, Input, Button } from 'flowbite-svelte';

	const { params, data }: PageProps = $props();

	const now = new SvelteDate();
	const today = $derived(now.toISOString().substring(0, 10));
	const nowTime = $derived(now.toISOString().substring(11, 14) + '00');
	const step = 900;

	let date = $derived(params.date);
	let startTime = $derived(
		data.booking?.start?.dateTime
			? new Date(data.booking.start.dateTime).toLocaleTimeString('en', {
					hour12: false,
					hour: '2-digit',
					minute: '2-digit',
					timeZone: data.booking.start!.timeZone!
				})
			: ''
	);
	let endTime = $derived.by(() => {
		if (data.booking?.end?.dateTime) {
			return new Date(data.booking.end.dateTime).toLocaleTimeString('en', {
				hour12: false,
				hour: '2-digit',
				minute: '2-digit',
				timeZone: data.booking.end.timeZone!
			});
		}

		const bookingStartTime = data.booking?.start?.dateTime
			? new Date(data.booking.start.dateTime).toLocaleTimeString('en', {
					hour12: false,
					hour: '2-digit',
					minute: '2-digit',
					timeZone: data.booking.start!.timeZone!
				})
			: undefined;

		if (date && startTime && startTime !== bookingStartTime) {
			const startDate = new Date(date + ' ' + startTime);
			const endDate = new Date(startDate.getTime() + duration);

			return endDate.toLocaleTimeString('en', {
				hour12: false,
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Europe/Lisbon'
			});
		}

		return '';
	});
	let description = $derived(data.booking?.description ?? '');
	let duration = $state(ms('30m'));

	let loading = $state(false);

	async function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;

		const startDate = new Date(
			new Date(`${date}T${startTime}:00`).toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })
		).toISOString();
		const endDate = new Date(
			new Date(`${date}T${endTime}:00`).toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })
		).toISOString();

		const busy = await checkAvailability({ startDate, endDate });

		if (busy.length > 0) {
			loading = false;
			WebApp.showAlert('The Hive is already booked during ' + formatBusyTimes(busy));
		} else if (params.id) {
			await updateBooking({
				id: params.id,
				startDate,
				endDate,
				description: description.trim()
			});

			loading = false;
			history.back();
		} else {
			const bookingId = await createBooking({
				startDate,
				endDate,
				description: description.trim()
			});

			loading = false;
			WebApp.switchInlineQuery(bookingId);
		}
	}

	async function confirmDeleteBooking() {
		const confirmed = await new Promise((resolve) =>
			WebApp.showConfirm('Are you sure you want to delete this booking?', resolve)
		);

		if (confirmed) {
			await deleteBooking(params.id!);
			history.back();
		}
	}

	$effect(() => {
		if (date !== params.date) {
			goto(resolve('/webapp/[date=date]/booking/[[id]]', { date, id: params.id }), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	});

	$effect(() => {
		if (date && startTime && endTime) {
			const startDate = new Date(date + ' ' + startTime);
			const endDate = new Date(date + ' ' + endTime);

			duration = endDate.getTime() - startDate.getTime();
		}
	});

	function toSeconds(v: string) {
		const p = v.split(':').map(Number);
		return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
	}

	function toTime(sec: number, parts: number) {
		const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
		const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
		const ss = String(sec % 60).padStart(2, '0');
		return parts === 2 ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`;
	}

	function roundValue(v: string) {
		const parts = v.split(':').length;
		const total = toSeconds(v);

		const rounded = Math.round(total / step) * step;

		return toTime(rounded, parts);
	}

	function formatBusyTimes(times: TimePeriod[]): string {
		return times
			.map(
				(time) =>
					new Date(time.start!).toLocaleTimeString('en', {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false,
						timeZone: 'Europe/Lisbon'
					}) +
					' - ' +
					new Date(time.end!).toLocaleTimeString('en', {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false,
						timeZone: 'Europe/Lisbon'
					})
			)
			.join(', ');
	}
</script>

<Modal open placement="bottom-center" class="rounded-b-none" title={params.id ? 'Update Booking' : 'New Booking'} onclose={() => history.back()}>
  <form id="booking" class="grid grid-cols-3 items-center gap-x-4 gap-y-2" {onsubmit}>
	<Label for="booking-date">Date</Label>
	<Input required type="date" id="booking-date" class="col-span-2" bind:value={date} min={today} />

	<Label for="booking-start">Start time</Label>
	<Input
		required
		type="time"
		min={date === today ? nowTime : null}
		id="booking-start" class="col-span-2"
		{step}
		bind:value={() => startTime, (time: string) => (startTime = roundValue(time))}
	/>

	<Label for="booking-end">End time</Label>
	<Input
		required
		type="time"
		min={startTime}
		id="booking-end" class="col-span-2"
		{step}
		bind:value={() => endTime, (time: string) => (endTime = roundValue(time))}
	/>

	<Label for="booking-reason">Reason</Label>
	<Input required bind:value={description} autocapitalize="off" placeholder="e.g. Private Call" id="booking-reason" class="col-span-2"/>
  </form>

  {#snippet footer()}
	{#if params.id}
		<Button color="red" class="w-full" onclick={confirmDeleteBooking}>Delete</Button>
	{/if}
	<Button type="submit" form="booking" color="primary" class="w-full" {loading}>Book</Button>
  {/snippet}
</Modal>