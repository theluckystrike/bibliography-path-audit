import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRO_UI, SPONSORS, bindPro, isPro, onProChange, resetPro } from '../src/pro';
afterEach(() => resetPro());
function fakeManager(start: boolean) {
	let pro = start;
	const fns = new Set<() => void>();
	return {
		isPro: () => pro,
		onChange: (fn: () => void) => {
			fns.add(fn);
			return () => fns.delete(fn);
		},
		set(v: boolean) {
			pro = v;
			for (const fn of fns) fn();
		},
		listeners: () => fns.size,
	};
}

describe('pro facade', () => {
	it('is off with no manager', () => {
		expect(isPro()).toBe(false);
	});

	it('follows the GitHub Sponsors manager and tells listeners on each change', () => {
		const m = fakeManager(false);
		bindPro(m as never);
		const cb = vi.fn();
		const off = onProChange(cb);
		m.set(true);
		expect(isPro()).toBe(true);
		expect(cb).toHaveBeenCalledTimes(1);
		off();
		m.set(false);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(isPro()).toBe(false);
	});

	it('reset unbinds the manager', () => {
		const m = fakeManager(true);
		bindPro(m as never);
		expect(m.listeners()).toBe(1);
		resetPro();
		expect(m.listeners()).toBe(0);
		expect(isPro()).toBe(false);
	});

	it('the sponsor terms match product.yaml', () => {
		expect(SPONSORS).toMatchObject({ clientId: 'Ov23lic5UPGPZqhBlBGg', sponsorLogin: 'theluckystrike', minMonthlyUsd: 5, oneTimeUsd: 15, scope: 'read:user' });
		expect(PRO_UI.priceText).toBe('Sponsor $5 a month, or $15 once. When you have paid $15 in total, Pro stays on.');
	});
});
