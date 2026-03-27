<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { token, activeVehicleId, vehicleList, events, parts, healthIntervals, vehicleConfig, tireConfig, platformConfig } from '$lib/stores';
	import { getPendingWrites, flushPendingWrites } from '$lib/offline';
	import { loadVehiclesRegistry, saveVehiclesRegistry, loadEvents, loadParts, loadHealthConfig, loadVehicleConfig, loadTireConfig, loadPlatform, clearShaCache } from '$lib/github';

	let { children } = $props();
	let pendingCount = $state(0);
	let syncing = $state(false);
	let dropdownOpen = $state(false);
	let switching = $state(false);

	async function checkPending() {
		try {
			const pending = await getPendingWrites();
			pendingCount = pending.length;
		} catch {
			pendingCount = 0;
		}
	}

	async function syncNow() {
		syncing = true;
		try {
			await flushPendingWrites();
			await checkPending();
		} finally {
			syncing = false;
		}
	}

	async function loadVehicleData() {
		if (!$activeVehicleId || !$token) return;
		clearShaCache();
		try {
			const [evts, vc, hc, tc] = await Promise.all([
				loadEvents(),
				loadVehicleConfig(),
				loadHealthConfig(),
				loadTireConfig()
			]);
			$events = evts;
			$vehicleConfig = vc;
			$healthIntervals = hc.intervals;
			$tireConfig = tc;

			if (vc?.platform) {
				const pc = await loadPlatform(vc.platform);
				$platformConfig = pc;
			} else {
				$platformConfig = null;
			}
		} catch {
			// vehicle data may not exist yet
		}
	}

	async function switchVehicle(id: string) {
		if (id === $activeVehicleId) {
			dropdownOpen = false;
			return;
		}
		switching = true;
		$activeVehicleId = id;
		$events = [];
		$parts = [];
		$healthIntervals = [];
		$vehicleConfig = null;
		$tireConfig = null;
		$platformConfig = null;
		try {
			await loadVehicleData();
		} finally {
			switching = false;
			dropdownOpen = false;
		}
	}

	onMount(async () => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {});
		}

		checkPending();
		const interval = setInterval(checkPending, 10000);

		const handleOnline = () => {
			if (pendingCount > 0) syncNow();
		};
		window.addEventListener('online', handleOnline);

		if ($token) {
			try {
				const registry = await loadVehiclesRegistry();
				$vehicleList = registry.vehicles;
				if (!$activeVehicleId && registry.activeVehicle) {
					$activeVehicleId = registry.activeVehicle;
				}
				if ($activeVehicleId) {
					await loadVehicleData();
				}
			} catch {
				// registry may not exist yet
			}
		}

		return () => {
			clearInterval(interval);
			window.removeEventListener('online', handleOnline);
		};
	});

	function handleDropdownClick(e: MouseEvent) {
		e.stopPropagation();
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	const activeLabel = $derived(
		$vehicleList.find((v) => v.id === $activeVehicleId)?.label || $activeVehicleId || 'Select Vehicle'
	);

	const navItems = [
		{ href: `${base}/`, label: 'Dashboard', icon: '◎' },
		{ href: `${base}/timeline`, label: 'Timeline', icon: '⏱' },
		{ href: `${base}/car`, label: 'Car', icon: '🚘' }
	];

	function isActive(href: string, currentPath: string): boolean {
		if (href === `${base}/`) {
			return currentPath === `${base}/` || currentPath === base;
		}
		return currentPath.startsWith(href);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if dropdownOpen}
	<div class="dropdown-backdrop" onclick={closeDropdown}></div>
{/if}

<div class="app-shell">
	<header class="top-bar">
		<div class="container top-bar-inner">
			<div class="vehicle-selector">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="selector-trigger" onclick={handleDropdownClick}>
					<span class="selector-plate">{$activeVehicleId || 'Vehicle'}</span>
					<span class="selector-label">{activeLabel}</span>
					<span class="selector-arrow">{dropdownOpen ? '▲' : '▼'}</span>
				</div>
				{#if dropdownOpen}
					<div class="selector-dropdown">
						{#each $vehicleList as v}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="dropdown-item"
								class:dropdown-item-active={v.id === $activeVehicleId}
								onclick={() => switchVehicle(v.id)}
							>
								<span class="dropdown-plate">{v.id}</span>
								<span class="dropdown-label">{v.label}</span>
							</div>
						{/each}
						<div class="dropdown-divider"></div>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="dropdown-item dropdown-item-add" onclick={() => { dropdownOpen = false; alert('Add vehicle coming soon'); }}>
							<span class="dropdown-add-icon">+</span>
							<span class="dropdown-label">Add Vehicle</span>
						</div>
					</div>
				{/if}
			</div>
			{#if $token}
				<a href="{base}/settings" class="settings-btn" aria-label="Settings">⚙︎</a>
			{/if}
		</div>
	</header>

	{#if switching}
		<div class="sync-banner">
			<span>Switching vehicle...</span>
		</div>
	{/if}

	{#if pendingCount > 0}
		<div class="sync-banner">
			<span>{pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}</span>
			<button class="sync-btn" onclick={syncNow} disabled={syncing}>
				{syncing ? 'Syncing...' : 'Sync now'}
			</button>
		</div>
	{/if}

	<main>
		{@render children()}
	</main>

	{#if $token}
		<nav class="bottom-nav">
			{#each navItems as item}
				<a
					href={item.href}
					class="nav-item"
					class:active={isActive(item.href, $page.url.pathname)}
				>
					<span class="nav-icon">{item.icon}</span>
					<span class="nav-label">{item.label}</span>
				</a>
			{/each}
		</nav>
	{/if}
</div>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.top-bar {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		padding-top: env(safe-area-inset-top, 0px);
	}

	.top-bar-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--nav-height);
	}

	.vehicle-selector {
		position: relative;
	}

	.selector-trigger {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		transition: background 0.15s;
		-webkit-tap-highlight-color: transparent;
	}

	.selector-trigger:active {
		background: rgba(142, 142, 147, 0.12);
	}

	.selector-plate {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: 0.5px;
	}

	.selector-label {
		font-size: 13px;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.selector-arrow {
		font-size: 8px;
		color: var(--color-text-secondary);
		margin-left: 2px;
	}

	.selector-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		min-width: 220px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15));
		z-index: 200;
		overflow: hidden;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		cursor: pointer;
		transition: background 0.1s;
	}

	.dropdown-item:active {
		background: rgba(142, 142, 147, 0.12);
	}

	.dropdown-item-active {
		background: rgba(0, 122, 255, 0.08);
	}

	.dropdown-plate {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.3px;
		min-width: 70px;
	}

	.dropdown-label {
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.dropdown-divider {
		height: 1px;
		background: var(--color-border);
	}

	.dropdown-item-add {
		color: var(--color-accent);
	}

	.dropdown-item-add .dropdown-label {
		color: var(--color-accent);
		font-weight: 600;
	}

	.dropdown-add-icon {
		font-size: 18px;
		font-weight: 700;
		min-width: 70px;
		text-align: center;
	}

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.settings-btn {
		font-size: 20px;
		color: var(--color-text-secondary);
		text-decoration: none;
		padding: 8px;
	}

	.sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: var(--color-warning);
		color: #1d1d1f;
		font-size: 13px;
		font-weight: 500;
	}

	.sync-btn {
		padding: 4px 12px;
		background: rgba(0, 0, 0, 0.15);
		border-radius: 12px;
		font-size: 12px;
		font-weight: 600;
		color: #1d1d1f;
	}

	.sync-btn:disabled {
		opacity: 0.6;
	}

	main {
		flex: 1;
		padding-top: 16px;
	}

	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		padding-bottom: env(safe-area-inset-bottom, 0px);
		height: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px));
	}

	.nav-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		text-decoration: none;
		color: var(--color-text-secondary);
		font-size: 10px;
		font-weight: 500;
		padding: 6px 0;
		transition: color 0.2s;
	}

	.nav-item.active {
		color: var(--color-accent);
	}

	.nav-icon {
		font-size: 20px;
		line-height: 1;
	}

	.nav-label {
		line-height: 1;
	}
</style>
