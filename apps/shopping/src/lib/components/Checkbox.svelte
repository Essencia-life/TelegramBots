<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import type { Snippet } from 'svelte';

	interface Props {
		checked: boolean;
		ontap: () => Promise<unknown>;
		onlongpress: () => void;
		children: Snippet;
		trailing: Snippet;
	}

	const { checked, ontap, onlongpress, children, trailing }: Props = $props();

	let loading = $state(false);

	let activeTouch: Touch | null;
	let longTouch = false;
	let touchTimeoutInstance: number | null;

	function ontouchstart(event: TouchEvent) {
		if (event.touches.length === 1) {
			activeTouch = event.touches.item(0);

			touchTimeoutInstance = window.setTimeout(() => {
				longTouch = true;
				onlongpress();
			}, 500);
		}
	}

	function ontouchmove() {
		if (touchTimeoutInstance) {
			window.clearTimeout(touchTimeoutInstance);
			touchTimeoutInstance = null;
		}

		activeTouch = null;
		longTouch = false;
	}

	function ontouchend(event: TouchEvent) {
		if (event.touches.length === 0 && activeTouch) {
			if (!longTouch) {
				loading = true;
				ontap().then(() => (loading = false));
			}

			if (touchTimeoutInstance) {
				window.clearTimeout(touchTimeoutInstance);
				touchTimeoutInstance = null;
			}

			activeTouch = null;
			longTouch = false;
		}
	}
</script>

<div class="wrapper">
	<button class:checked disabled={loading} {ontouchstart} {ontouchmove} {ontouchend}>
		<div class="checkbox">
			<div class="icon">
				<Check size={16} strokeWidth={4} />
			</div>
		</div>
		<div class="label">
			{@render children()}
		</div>
	</button>

	<div class="trailing">
		{@render trailing()}
	</div>
</div>

<style>
	.wrapper {
		display: flex;
		align-items: center;
		gap: 4px;
		user-select: none;
	}

	button,
	button:disabled {
		appearance: none;
		display: flex;
		height: 40px;
		flex: 1;
		align-items: center;
		gap: 8px;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		text-align: left;
	}

	.checkbox {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 100%;
		line-height: 0;
		transition: background-color 0.3s ease-in-out;
		color: var(--app-section-separator-color);
	}

	.checkbox .icon {
		transition: transform 0.3s ease-in-out;
	}

	.label {
		flex: 1;
	}

	.trailing {
		line-height: 0;
	}

	button.checked:not(:disabled) .checkbox {
		background-color: var(--app-accent-text-color);
		color: var(--app-bg-color);
	}

	button:not(.checked) .checkbox .icon {
		transform: scale(0);
	}

	button:not(.checked) .checkbox::before,
	button:disabled .checkbox::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 100%;
		border: 1px solid var(--app-section-separator-color);
	}

	button:disabled .checkbox::before {
		border-right-color: var(--app-accent-text-color);
		animation: rotate 0.3s linear infinite;
	}

	button.checked .label {
		text-decoration: line-through;
	}

	button.checked .label,
	button.checked + .trailing {
		opacity: 0.5;
	}

	@keyframes rotate {
		to {
			transform: rotate(360deg);
		}
	}
</style>
