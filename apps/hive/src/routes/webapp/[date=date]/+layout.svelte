<script lang="ts">
	import { onMount, onDestroy, type Snippet } from 'svelte';
	import { on } from 'svelte/events';
	import WebApp from '@twa-dev/sdk';
	import type { PageProps } from './$types';
	import { afterNavigate, goto, preloadCode } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteDate } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import { getBookings } from '$lib/calendar.remote';
	import ms from 'ms';
	import { swipe } from '$lib/attachments/swipe';
	import { Button } from 'flowbite-svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';

	interface Props extends PageProps {
		children?: Snippet;
	}

	let { children, data, params }: Props = $props();
	let refreshIntervalInstance: number;
	let dateInput: HTMLInputElement;

	const startOfDay = $derived(new Date(params.date));
	const endOfDay = $derived.by(() => {
		const d = new Date(params.date);
		d.setHours(23, 59, 59, 999);
		return d;
	});

	const hours = Array.from(Array(23), (_item, index) => index + 1);
	const timeFormatter = new Intl.DateTimeFormat('pt', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const now = new SvelteDate();

	$effect(() => {
		const interval = setInterval(() => {
			now.setTime(Date.now());
		}, 10_000);

		return () => {
			clearInterval(interval);
		};
	});

	function percent(date: Date) {
		const start = new Date(startOfDay);
		start.setHours(0, 0, 0, 0);

		const end = new Date(start);
		end.setHours(24, 0, 0, 0);

		const percentValue = (date.getTime() - start.getTime()) / (end.getTime() - start.getTime());
		return `${Math.min(Math.max(percentValue, 0), 1) * 100}%`;
	}

	function timeToRows(start: string, end: string) {
		const startDate = new Date(start);
		const endDate = new Date(end);

		const startTime = Math.floor(startDate.getHours() * 4 + startDate.getMinutes() / 15) + 1;
		const endTime = Math.floor(endDate.getHours() * 4 + endDate.getMinutes() / 15) + 1;

		return `${startTime} / ${endTime}`;
	}

	function isShortBooking(start: string, end: string) {
		return Date.parse(end) - Date.parse(start) < ms('45m');
	}

	function isPast(date: string) {
		return Date.parse(date) < Date.now();
	}

	const scrollIntoView: Attachment = (node) => {
		window.setTimeout(() => {
			node.scrollIntoView({ block: 'center' });
		}, 1);
	};

	function prevDay() {
		const date = new Date(Date.parse(params.date) - ms('1d'))
			.toISOString()
			.substring(0, 10) as `${number}-${number}-${number}`;

		goto(resolve('/webapp/[date=date]', { date }), {
			replaceState: true,
			noScroll: true
		});
	}

	function nextDay() {
		const date = new Date(Date.parse(params.date) + ms('1d'))
			.toISOString()
			.substring(0, 10) as `${number}-${number}-${number}`;

		goto(resolve('/webapp/[date=date]', { date }), {
			replaceState: true,
			noScroll: true
		});
	}

	function refreshInterval() {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}

		refreshIntervalInstance = window.setInterval(() => getBookings(params.date).refresh(), 30_000);
	}

	onMount(() => {
		preloadCode(resolve('/webapp/[date=date]/booking', params));

		WebApp.BackButton?.onClick(() => {
			history.back();
		});

		refreshInterval();
	});

	onDestroy(() => {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}
	});

	on(document, 'visibilitychange', () => {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}

		if (document.visibilityState === 'visible') {
			getBookings(params.date).refresh();
			refreshInterval();
		}
	});

	afterNavigate((navigation) => {
		if (navigation.to?.route.id === '/webapp/[date=date]') {
			WebApp.BackButton?.hide();
		} else {
			WebApp.BackButton?.show();
		}
	});
</script>

<header class="sticky top-0 z-10 mb-6 flex h-16 items-center justify-between bg-surface">
	<Button outline class="border-0 p-2!" onclick={prevDay}>
		<ChevronLeft />
	</Button>
	<label class="relative">
		<input
			type="date"
			value={params.date}
			class="absolute inset-0"
			bind:this={dateInput}
			oninput={(event) =>
				goto(
					resolve('/webapp/[date=date]', {
						date: event.currentTarget.value as `${number}-${number}-${number}`
					}),
					{
						replaceState: true,
						noScroll: true
					}
				)}
		/>
		<Button
			outline
			class="relative rounded-none border-0 bg-surface!"
			onclick={() => dateInput.showPicker()}
		>
			<h2 class="font-medium tracking-wide whitespace-nowrap">
				{startOfDay
					.toLocaleDateString('en-gb', {
						day: '2-digit',
						month: '2-digit',
						year: '2-digit',
						weekday: 'long'
					})
					.replaceAll('/', '.')}
			</h2>
		</Button>
	</label>
	<Button outline class="border-0 p-2!" onclick={nextDay}>
		<ChevronRight />
	</Button>
</header>

<main
	class="calendar touch-pan-y"
	{@attach swipe({ threshold: 100, left: nextDay, right: prevDay })}
>
	<div class="column col-1! row-start-4! -row-end-1! text-sm text-gray-700">
		{#each hours as hour}
			<div class="row-span-4">
				<time>{timeFormatter.format(new Date(startOfDay).setHours(hour))}</time>
			</div>
		{/each}
	</div>
	<div class="column">
		{#each Array(24) as _}
			<div class="row-span-4 rounded-lg bg-white"></div>
		{/each}
	</div>
	<div class="column">
		{#each await getBookings(params.date) as booking (booking.id)}
			{@const isOwn =
				booking.extendedProperties?.shared?.telegramUserId === data.user.id.toString()}

			<svelte:element
				this={isOwn ? 'a' : 'div'}
				class="booking mb-3 flex flex-col rounded-lg bg-accent p-2! text-white"
				class:small={isShortBooking(booking.start!.dateTime!, booking.end!.dateTime!)}
				class:past={isPast(booking.end!.dateTime!)}
				style:grid-row={timeToRows(booking.start!.dateTime!, booking.end!.dateTime!)}
				data-sveltekit-noscroll
				href={isOwn
					? resolve('/webapp/[date=date]/booking/[[id]]', {
							date: params.date,
							id: booking.id!
						})
					: undefined}
			>
				<b>{booking.summary}</b>
				<div class="overflow-hidden leading-6">{booking.description}</div>
			</svelte:element>
		{/each}

		{#if startOfDay.getTime() < now.getTime() && now.getTime() < endOfDay.getTime()}
			<div
				class="now pointer-events-none absolute inset-x-0 border-t-2 border-amber"
				style:--now={percent(now)}
				{@attach scrollIntoView}
			></div>
		{/if}
	</div>
</main>

<Button
	pill
	class="fixed right-4 bottom-4 h-12 w-12 p-2! text-xl"
	onclick={() => goto(resolve('/webapp/[date=date]/booking', params), { noScroll: true })}
>
	<Plus />
</Button>

{@render children?.()}

<style>
	.calendar {
		--cell-size: 48px;
		--cell-gap: 6px;
		display: grid;
		grid-template-rows: repeat(96, calc(var(--cell-size) / 4));
		grid-template-columns: auto 1fr;
		gap: var(--cell-gap) 12px;
	}

	.column {
		position: relative;
		display: grid;
		grid-row: 1 / -1;
		grid-template-rows: subgrid;
		grid-column: 2;
		grid-auto-flow: row;
	}

	time {
		display: block;
		transform: translateY(var(--cell-gap));
	}

	.now {
		top: var(--now);
	}

	.now::before {
		content: '';
		display: block;
		height: 8px;
		width: 8px;
		border-radius: 100%;
		background: var(--color-amber);
		margin-top: -1px;
		transform: translate(-50%, -50%);
	}

	.booking.small {
		font-size: 80%;
	}

	.booking.past {
		opacity: 0.5;
	}

	a.booking {
		background: var(--color-forest);
		text-decoration: none;
	}

	.booking.small div {
		display: inline;
	}
</style>
