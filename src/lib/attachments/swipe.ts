export type SwipeOptions = {
	threshold?: number;
	left?: () => void;
	right?: () => void;
};

export function swipe(options: SwipeOptions = {}) {
	const { threshold = 50, left, right } = options;

	return (node: HTMLElement) => {
		let startX: number | null = null;

		function onTouchStart(event: TouchEvent) {
			startX = event.touches[0].clientX;
		}

		function onTouchEnd(event: TouchEvent) {
			if (startX === null) return;

			const endX = event.changedTouches[0].clientX;
			const deltaX = endX - startX;

			if (Math.abs(deltaX) >= threshold) {
				if (deltaX > 0) {
					right?.();
				} else {
					left?.();
				}
			}

			startX = null;
		}

		node.addEventListener('touchstart', onTouchStart, { passive: true });
		node.addEventListener('touchend', onTouchEnd);

		return () => {
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchend', onTouchEnd);
		};
	};
}
