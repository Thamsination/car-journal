<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { token, activeVehicleId, vehicleList, events, parts, healthIntervals, vehicleConfig, tireConfig, platformConfig } from '$lib/stores';
	import { getPendingWrites, flushPendingWrites } from '$lib/offline';
	import { loadVehiclesRegistry, saveVehiclesRegistry, loadEvents, loadParts, loadHealthConfig, loadVehicleConfig, loadTireConfig, loadPlatform, clearShaCache, loadPlatformIndex, createVehicleFiles, saveVehicleConfig, deleteVehicleFiles, type PlatformIndexEntry } from '$lib/github';
	import { generateHealthConfig } from '$lib/utils';

	let { children } = $props();
	let pendingCount = $state(0);
	let syncing = $state(false);
	let dropdownOpen = $state(false);
	let switching = $state(false);

	let addVehicleOpen = $state(false);
	let addStep = $state(0);
	let platformIndex = $state<PlatformIndexEntry[]>([]);
	let addMake = $state('');
	let addModel = $state('');
	let addYear = $state<number | null>(null);
	let addPlatformId = $state('');
	let addLicensePlate = $state('');
	let addName = $state('');
	let addOdometer = $state('');
	let addSaving = $state(false);
	let addError = $state('');

	let editVehicleOpen = $state(false);
	let editVehicleId = $state('');
	let editName = $state('');
	let editPlate = $state('');
	let editOdometer = $state('');
	let editSaving = $state(false);
	let editError = $state('');
	let confirmDelete = $state(false);

	const availableMakes = $derived(
		[...new Set(platformIndex.map((e) => e.make))].sort()
	);

	const availableModels = $derived(() => {
		if (!addMake) return [];
		const models = new Set<string>();
		for (const e of platformIndex) {
			if (e.make === addMake) {
				for (const m of e.models) models.add(m);
			}
		}
		return [...models].sort();
	});

	const availableYears = $derived(() => {
		if (!addMake || !addModel) return [];
		const years = new Set<number>();
		for (const e of platformIndex) {
			if (e.make === addMake && e.models.includes(addModel)) {
				for (let y = e.yearFrom; y <= e.yearTo; y++) years.add(y);
			}
		}
		return [...years].sort((a, b) => b - a);
	});

	const matchingPlatforms = $derived(() => {
		if (!addMake || !addModel || !addYear) return [];
		return platformIndex.filter(
			(e) => e.make === addMake && e.models.includes(addModel) && addYear! >= e.yearFrom && addYear! <= e.yearTo
		);
	});

	function resetAddVehicle() {
		addStep = 0;
		addMake = '';
		addModel = '';
		addYear = null;
		addPlatformId = '';
		addLicensePlate = '';
		addName = '';
		addOdometer = '';
		addError = '';
		addSaving = false;
	}

	async function openAddVehicle() {
		dropdownOpen = false;
		resetAddVehicle();
		if (platformIndex.length === 0) {
			platformIndex = await loadPlatformIndex();
		}
		addVehicleOpen = true;
	}

	function advanceStep() {
		const matches = matchingPlatforms();
		if (addStep === 0 && addMake && addModel && addYear) {
			if (matches.length === 1) {
				addPlatformId = matches[0].platformId;
				addStep = 2;
			} else if (matches.length > 1) {
				addStep = 1;
			}
		} else if (addStep === 1 && addPlatformId) {
			addStep = 2;
		}
	}

	function goBackStep() {
		if (addStep === 2) {
			const matches = matchingPlatforms();
			addStep = matches.length > 1 ? 1 : 0;
			addPlatformId = '';
		} else if (addStep === 1) {
			addStep = 0;
			addPlatformId = '';
		}
	}

	async function confirmAddVehicle() {
		if (!addPlatformId) return;
		addSaving = true;
		addError = '';
		try {
			const platform = await loadPlatform(addPlatformId);
			if (!platform) throw new Error('Platform not found');

			const vehicleId = addLicensePlate.trim().toUpperCase().replace(/\s+/g, '') || `V${Date.now().toString(36).toUpperCase()}`;
			const label = addName.trim() || `${addMake} ${addModel}`;

			const odoVal = parseInt(addOdometer, 10);
			const config = {
				name: label,
				licensePlate: addLicensePlate.trim().toUpperCase(),
				vin: '',
				platform: addPlatformId,
				year: addYear!,
				make: addMake,
				model: addModel,
				chassis: platform.chassisCodes?.[0] ?? '',
				engine: '',
				drivetrain: '',
				odometer: (!isNaN(odoVal) && odoVal > 0) ? odoVal : null
			};

			const healthCfg = generateHealthConfig(platform);

			await createVehicleFiles(vehicleId, config, healthCfg);

			const registry = await loadVehiclesRegistry();
			registry.vehicles.push({ id: vehicleId, label });
			registry.activeVehicle = vehicleId;
			await saveVehiclesRegistry(registry, `Register vehicle: ${label}`);

			$vehicleList = registry.vehicles;
			$activeVehicleId = vehicleId;

			$events = [];
			$parts = [];
			$healthIntervals = healthCfg.intervals;
			$vehicleConfig = config;
			$tireConfig = null;
			$platformConfig = platform;

			addVehicleOpen = false;
			resetAddVehicle();
		} catch (e) {
			addError = e instanceof Error ? e.message : String(e);
		} finally {
			addSaving = false;
		}
	}

	function openEditVehicle(id: string) {
		dropdownOpen = false;
		editVehicleId = id;
		const entry = $vehicleList.find((v) => v.id === id);
		editName = entry?.label ?? '';
		editPlate = id;
		editOdometer = '';
		editError = '';
		editSaving = false;
		confirmDelete = false;

		if (id === $activeVehicleId && $vehicleConfig) {
			editName = $vehicleConfig.name;
			editPlate = $vehicleConfig.licensePlate;
			editOdometer = $vehicleConfig.odometer ? String($vehicleConfig.odometer) : '';
		}
		editVehicleOpen = true;
	}

	async function saveEditVehicle() {
		editSaving = true;
		editError = '';
		try {
			const needsSwitch = editVehicleId !== $activeVehicleId;
			if (needsSwitch) {
				await switchVehicle(editVehicleId);
			}

			if ($vehicleConfig) {
				const odoVal = parseInt(editOdometer, 10);
				const updated = {
					...$vehicleConfig,
					name: editName.trim() || $vehicleConfig.name,
					licensePlate: editPlate.trim().toUpperCase(),
					odometer: (!isNaN(odoVal) && odoVal > 0) ? odoVal : null
				};
				$vehicleConfig = updated;
				await saveVehicleConfig(updated, `Update vehicle: ${updated.name}`);
			}

			const registry = await loadVehiclesRegistry();
			const entry = registry.vehicles.find((v) => v.id === editVehicleId);
			if (entry) {
				entry.label = editName.trim() || entry.label;
				await saveVehiclesRegistry(registry, `Update registry: ${entry.label}`);
				$vehicleList = registry.vehicles;
			}

			editVehicleOpen = false;
		} catch (e) {
			editError = e instanceof Error ? e.message : String(e);
		} finally {
			editSaving = false;
		}
	}

	async function deleteVehicle() {
		editSaving = true;
		editError = '';
		try {
			await deleteVehicleFiles(editVehicleId);

			const registry = await loadVehiclesRegistry();
			registry.vehicles = registry.vehicles.filter((v) => v.id !== editVehicleId);

			const wasActive = editVehicleId === $activeVehicleId;
			if (wasActive) {
				const next = registry.vehicles[0]?.id ?? '';
				registry.activeVehicle = next;
			}
			await saveVehiclesRegistry(registry, `Delete vehicle: ${editVehicleId}`);
			$vehicleList = registry.vehicles;

			editVehicleOpen = false;

			if (wasActive) {
				if (registry.vehicles.length > 0) {
					await switchVehicle(registry.vehicles[0].id);
				} else {
					$activeVehicleId = '';
					$events = [];
					$parts = [];
					$healthIntervals = [];
					$vehicleConfig = null;
					$tireConfig = null;
					$platformConfig = null;
				}
			}
		} catch (e) {
			editError = e instanceof Error ? e.message : String(e);
		} finally {
			editSaving = false;
		}
	}

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
			$healthIntervals = hc.intervals;
			$tireConfig = tc;

			if (vc && vc.odometer === undefined) {
				const legacyOdo = typeof localStorage !== 'undefined'
					? localStorage.getItem('manual_odometer')
					: null;
				if (legacyOdo) {
					const parsed = JSON.parse(legacyOdo);
					if (typeof parsed === 'number' && parsed > 0) {
						vc.odometer = parsed;
						saveVehicleConfig(vc, 'Migrate odometer to vehicle config').catch(() => {});
						localStorage.removeItem('manual_odometer');
					}
				}
			}
			$vehicleConfig = vc;

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
							<span class="dropdown-edit" onclick={(e) => { e.stopPropagation(); openEditVehicle(v.id); }}>⚙</span>
						</div>
					{/each}
						<div class="dropdown-divider"></div>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="dropdown-item dropdown-item-add" onclick={openAddVehicle}>
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

{#if editVehicleOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => { editVehicleOpen = false; }}>
		<div class="modal-panel" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<span class="modal-title">Edit Vehicle</span>
				<button class="modal-close" onclick={() => { editVehicleOpen = false; }}>&times;</button>
			</div>
			<div class="modal-body">
				<label class="field-label">Name</label>
				<input class="field-input" type="text" bind:value={editName} />

				<label class="field-label">License plate</label>
				<input class="field-input" type="text" bind:value={editPlate} disabled />

				<label class="field-label">Odometer (km)</label>
				<input class="field-input" type="number" inputmode="numeric" placeholder="Tap to set km" bind:value={editOdometer} />

				{#if editError}
					<p class="add-error">{editError}</p>
				{/if}

				{#if !confirmDelete}
					<button class="btn-delete" onclick={() => { confirmDelete = true; }}>Delete Vehicle</button>
				{:else}
					<div class="delete-confirm">
						<p class="delete-warning">This will permanently delete all data for this vehicle. Platform data will be preserved.</p>
						<div class="delete-actions">
							<button class="btn-secondary" onclick={() => { confirmDelete = false; }}>Cancel</button>
							<button class="btn-delete-confirm" disabled={editSaving} onclick={deleteVehicle}>
								{editSaving ? 'Deleting...' : 'Confirm Delete'}
							</button>
						</div>
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => { editVehicleOpen = false; }}>Cancel</button>
				<button class="btn-primary" disabled={editSaving} onclick={saveEditVehicle}>
					{editSaving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if addVehicleOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => { addVehicleOpen = false; }}>
		<div class="modal-panel" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<span class="modal-title">Add Vehicle</span>
				<button class="modal-close" onclick={() => { addVehicleOpen = false; }}>&times;</button>
			</div>

			{#if addStep === 0}
				<div class="modal-body">
					<label class="field-label">Make</label>
					<select class="field-select" bind:value={addMake} onchange={() => { addModel = ''; addYear = null; addPlatformId = ''; }}>
						<option value="">Select make</option>
						{#each availableMakes as make}
							<option value={make}>{make}</option>
						{/each}
					</select>

					{#if addMake}
						<label class="field-label">Model</label>
						<select class="field-select" bind:value={addModel} onchange={() => { addYear = null; addPlatformId = ''; }}>
							<option value="">Select model</option>
							{#each availableModels() as model}
								<option value={model}>{model}</option>
							{/each}
						</select>
					{/if}

					{#if addModel}
						<label class="field-label">Year</label>
						<select class="field-select" bind:value={addYear} onchange={() => { addPlatformId = ''; }}>
							<option value={null}>Select year</option>
							{#each availableYears() as year}
								<option value={year}>{year}</option>
							{/each}
						</select>
					{/if}
				</div>
				<div class="modal-footer">
					<button class="btn-secondary" onclick={() => { addVehicleOpen = false; }}>Cancel</button>
					<button class="btn-primary" disabled={!addMake || !addModel || !addYear} onclick={advanceStep}>Next</button>
				</div>

			{:else if addStep === 1}
				<div class="modal-body">
					<p class="step-hint">Multiple platform variants match. Select yours:</p>
					{#each matchingPlatforms() as p}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="platform-option"
							class:platform-option-selected={addPlatformId === p.platformId}
							onclick={() => { addPlatformId = p.platformId; }}
						>
							<span class="platform-id">{p.platformId}</span>
						</div>
					{/each}
				</div>
				<div class="modal-footer">
					<button class="btn-secondary" onclick={goBackStep}>Back</button>
					<button class="btn-primary" disabled={!addPlatformId} onclick={advanceStep}>Next</button>
				</div>

			{:else if addStep === 2}
				<div class="modal-body">
					<div class="confirm-summary">
						<span class="confirm-label">Vehicle</span>
						<span class="confirm-value">{addYear} {addMake} {addModel}</span>
					</div>
					<div class="confirm-summary">
						<span class="confirm-label">Platform</span>
						<span class="confirm-value">{addPlatformId}</span>
					</div>

					<label class="field-label">License plate <span class="optional">(optional)</span></label>
					<input class="field-input" type="text" placeholder="e.g. ABC 123" bind:value={addLicensePlate} />

					<label class="field-label">Name <span class="optional">(optional)</span></label>
					<input class="field-input" type="text" placeholder="e.g. My daily driver" bind:value={addName} />

					<label class="field-label">Current odometer <span class="optional">(recommended)</span></label>
					<input class="field-input" type="number" inputmode="numeric" placeholder="e.g. 85000" bind:value={addOdometer} />

					{#if addError}
						<p class="add-error">{addError}</p>
					{/if}
				</div>
				<div class="modal-footer">
					<button class="btn-secondary" onclick={goBackStep}>Back</button>
					<button class="btn-primary" disabled={addSaving} onclick={confirmAddVehicle}>
						{addSaving ? 'Creating...' : 'Add Vehicle'}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

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

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 300;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.modal-panel {
		background: var(--color-surface);
		border-radius: var(--radius-lg, 16px) var(--radius-lg, 16px) 0 0;
		width: 100%;
		max-width: 480px;
		max-height: 85vh;
		overflow-y: auto;
		box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 12px;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-title {
		font-size: 17px;
		font-weight: 700;
	}

	.modal-close {
		font-size: 24px;
		line-height: 1;
		color: var(--color-text-secondary);
		background: none;
		border: none;
		padding: 0 4px;
		cursor: pointer;
	}

	.modal-body {
		padding: 16px 20px;
	}

	.modal-footer {
		display: flex;
		gap: 10px;
		padding: 12px 20px 24px;
		padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
	}

	.field-label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: 6px;
		margin-top: 14px;
	}

	.field-label:first-child {
		margin-top: 0;
	}

	.optional {
		font-weight: 400;
		color: var(--color-text-tertiary, #999);
	}

	.field-select,
	.field-input {
		width: 100%;
		padding: 10px 12px;
		font-size: 15px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		appearance: none;
		-webkit-appearance: none;
	}

	.field-select {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23999' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 12px center;
		padding-right: 32px;
	}

	.step-hint {
		font-size: 14px;
		color: var(--color-text-secondary);
		margin: 0 0 12px;
	}

	.platform-option {
		padding: 12px 14px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		margin-bottom: 8px;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}

	.platform-option:active {
		background: rgba(142, 142, 147, 0.08);
	}

	.platform-option-selected {
		border-color: var(--color-accent);
		background: rgba(0, 122, 255, 0.06);
	}

	.platform-id {
		font-size: 15px;
		font-weight: 600;
	}

	.confirm-summary {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
	}

	.confirm-label {
		font-size: 14px;
		color: var(--color-text-secondary);
	}

	.confirm-value {
		font-size: 14px;
		font-weight: 600;
	}

	.btn-primary,
	.btn-secondary {
		flex: 1;
		padding: 12px 16px;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
	}

	.btn-primary {
		background: var(--color-accent);
		color: #fff;
	}

	.btn-primary:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.btn-secondary {
		background: var(--color-surface-elevated, #f2f2f7);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}

	.add-error {
		color: var(--color-danger, #ff3b30);
		font-size: 13px;
		margin-top: 12px;
	}

	.dropdown-edit {
		margin-left: auto;
		font-size: 14px;
		color: var(--color-text-secondary);
		padding: 4px 6px;
		border-radius: var(--radius-sm);
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.dropdown-edit:active {
		opacity: 1;
		background: rgba(142, 142, 147, 0.12);
	}

	.btn-delete {
		width: 100%;
		padding: 12px 16px;
		margin-top: 24px;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		background: none;
		color: var(--color-danger, #ff3b30);
	}

	.btn-delete:active {
		background: rgba(255, 59, 48, 0.08);
	}

	.delete-confirm {
		margin-top: 16px;
		padding: 14px;
		border: 1px solid var(--color-danger, #ff3b30);
		border-radius: var(--radius-sm);
	}

	.delete-warning {
		font-size: 13px;
		color: var(--color-danger, #ff3b30);
		margin: 0 0 12px;
	}

	.delete-actions {
		display: flex;
		gap: 8px;
	}

	.btn-delete-confirm {
		flex: 1;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border: none;
		background: var(--color-danger, #ff3b30);
		color: #fff;
	}

	.btn-delete-confirm:disabled {
		opacity: 0.4;
	}
</style>
