<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import {
		token, events, latestOdometer, healthIntervals, dailyAverageKm,
		vehicleConfig, tireConfig, tireStatus, tireSwapEvents, manualOdometer
	} from '$lib/stores';
	import { loadEvents, saveEvents, loadHealthConfig, saveHealthConfig, loadVehicleConfig, loadTireConfig, saveTireConfig } from '$lib/github';
	import { formatDate, formatDateISO } from '$lib/utils';
	import type { HealthConfig, CarEvent, ServiceInterval, TireProfile, TireSeason, TireConfig } from '$lib/types';

	let loading = $state(true);
	let loadError = $state('');
	let editingId = $state<string | null>(null);
	let editKm = $state('');
	let editMonths = $state('');
	let saving = $state(false);

	let tireEditOpen = $state(false);
	let tireSaving = $state(false);
	let tireEditBrand = $state('');
	let tireEditModel = $state('');
	let tireEditFrontSize = $state('');
	let tireEditRearSize = $state('');
	let tireEditStaggered = $state(false);
	let tireEditSeason = $state<TireSeason>('summer');
	let tireEditFrontDot = $state('');
	let tireEditRearDot = $state('');
	let tireEditPerAxleDot = $state(false);
	let tireEditProfileId = $state<string | null>(null);
	let swapSaving = $state(false);
	let showArchived = $state(false);
	let tireExpanded = $state(false);
	let editingOdo = $state(false);
	let odoInput = $state('');
	let odoInputEl = $state<HTMLInputElement | null>(null);

	const activeProfiles = $derived($tireConfig?.profiles.filter((p) => !p.archived) ?? []);
	const archivedProfiles = $derived($tireConfig?.profiles.filter((p) => p.archived) ?? []);

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		try {
			const promises: Promise<void>[] = [];
			if ($events.length === 0) {
				promises.push(loadEvents().then((e) => { $events = e; }));
			}
			if ($healthIntervals.length === 0) {
				promises.push(loadHealthConfig().then((c) => { $healthIntervals = c.intervals; }));
			}
			if (!$vehicleConfig) {
				promises.push(loadVehicleConfig().then((v) => { $vehicleConfig = v; }));
			}
			if (!$tireConfig) {
				promises.push(loadTireConfig().then((t) => { $tireConfig = t; }));
			}
			await Promise.all(promises);
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	async function startOdoEdit() {
		odoInput = $latestOdometer.km > 0 ? $latestOdometer.km.toString() : '';
		editingOdo = true;
		await tick();
		odoInputEl?.focus();
		odoInputEl?.select();
	}

	function saveOdo() {
		const val = parseInt(odoInput, 10);
		if (!isNaN(val) && val > 0) {
			$manualOdometer = val;
		}
		editingOdo = false;
	}

	function cancelOdo() {
		editingOdo = false;
	}

	function handleOdoKey(e: KeyboardEvent) {
		if (e.key === 'Enter') saveOdo();
		else if (e.key === 'Escape') cancelOdo();
	}

	interface ComponentStatus {
		interval: ServiceInterval;
		lastEvent: CarEvent | null;
		lastKm: number | null;
		lastDate: string;
		remainingKm: number | null;
		remainingDays: number | null;
		usedKmPct: number;
		usedTimePct: number;
		health: 'good' | 'warning' | 'overdue';
	}

	const WARNING_THRESHOLD = 0.8;

	const componentStatuses = $derived.by((): ComponentStatus[] => {
		const odoKm = $latestOdometer.km;
		const now = Date.now();
		const healthOrder = { overdue: 0, warning: 1, good: 2 };

		return $healthIntervals.map((interval) => {
			const lastEvent = findLastService(interval);
			const lastKm = lastEvent?.km ?? null;
			const lastDate = lastEvent?.date ?? '';

			let remainingKm: number | null = null;
			let usedKmPct = 0;
			if (interval.intervalKm && odoKm > 0) {
				const baseKm = lastKm ?? 0;
				const nextDueKm = baseKm + interval.intervalKm;
				remainingKm = nextDueKm - odoKm;
				usedKmPct = Math.min(1, Math.max(0, (odoKm - baseKm) / interval.intervalKm));
			}

			let remainingDays: number | null = null;
			let usedTimePct = 0;
			if (interval.intervalMonths && lastDate) {
				const lastMs = new Date(lastDate + 'T00:00:00').getTime();
				const intervalMs = interval.intervalMonths * 30.44 * 86400000;
				const nextDueMs = lastMs + intervalMs;
				remainingDays = Math.round((nextDueMs - now) / 86400000);
				usedTimePct = Math.min(1, Math.max(0, (now - lastMs) / intervalMs));
			}

			let health: 'good' | 'warning' | 'overdue' = 'good';
			if (!lastEvent) {
				const firstDueKm = interval.intervalKm ?? Infinity;
				if (odoKm > 0 && odoKm >= firstDueKm) {
					health = 'overdue';
				} else if (odoKm > 0 && interval.intervalKm && odoKm >= firstDueKm * WARNING_THRESHOLD) {
					health = 'warning';
				}
			} else {
				const kmOverdue = remainingKm !== null && remainingKm < 0;
				const timeOverdue = remainingDays !== null && remainingDays < 0;
				const kmWarning = remainingKm !== null && usedKmPct >= WARNING_THRESHOLD && remainingKm >= 0;
				const timeWarning = remainingDays !== null && usedTimePct >= WARNING_THRESHOLD && remainingDays >= 0;

				if (kmOverdue || timeOverdue) health = 'overdue';
				else if (kmWarning || timeWarning) health = 'warning';
			}

			return {
				interval, lastEvent, lastKm, lastDate,
				remainingKm, remainingDays, usedKmPct, usedTimePct, health
			};
		}).sort((a, b) => {
			const aKm = a.remainingKm ?? Infinity;
			const bKm = b.remainingKm ?? Infinity;
			return aKm - bKm;
		});
	});

	const overdueCount = $derived(componentStatuses.filter((c) => c.health === 'overdue').length);
	const warningCount = $derived(componentStatuses.filter((c) => c.health === 'warning').length);

	const overallHealth = $derived.by(() => {
		const tireIsOverdue = $tireStatus.health === 'overdue';
		const tireIsWarning = $tireStatus.health === 'warning';
		const compOverdue = overdueCount > 0;
		const compWarning = warningCount > 0;

		if (compOverdue || tireIsOverdue) return 'bad' as const;
		if (compWarning || tireIsWarning) return 'okay' as const;
		if (componentStatuses.length === 0) return 'good' as const;
		return 'good' as const;
	});

	const healthSummary = $derived.by(() => {
		const tireH = $tireStatus.health;
		const hasOverdue = overdueCount > 0 || tireH === 'overdue';
		const hasWarning = warningCount > 0 || tireH === 'warning';

		if (hasOverdue && hasWarning) return 'Your car has overdue service items and other components need attention soon.';
		if (hasOverdue) return 'Your car has overdue service items that need attention.';
		if (hasWarning) return 'Your car is in good condition but needs attention soon.';
		return 'Your car is in good condition.';
	});

	const overallColors = { good: '#34c759', okay: '#ff9500', bad: '#ff3b30' };
	const overallIcons = { good: '✓', okay: '!', bad: '✕' };

	function vehicleTitle(v: typeof $vehicleConfig): string {
		if (!v) return 'Vehicle';
		return `${v.year} ${v.make} ${v.chassis} ${v.model}`;
	}

	function findLastService(interval: ServiceInterval): CarEvent | null {
		const matches = $events.filter((e) => {
			if (!e.completed) return false;
			const tasks = e.tasks ?? [e.event];
			return tasks.some((t) =>
				interval.taskMatches.some((m) => t.toLowerCase().includes(m.toLowerCase()))
			);
		});
		matches.sort((a, b) => {
			const aKm = a.km ?? 0;
			const bKm = b.km ?? 0;
			if (aKm !== bKm) return bKm - aKm;
			return (b.date || '').localeCompare(a.date || '');
		});
		return matches[0] ?? null;
	}

	function startEdit(id: string) {
		const interval = $healthIntervals.find((i) => i.id === id);
		if (!interval) return;
		editingId = id;
		editKm = interval.intervalKm?.toString() ?? '';
		editMonths = interval.intervalMonths?.toString() ?? '';
	}

	async function saveEdit() {
		if (!editingId) return;
		saving = true;
		try {
			const updated = $healthIntervals.map((i) => {
				if (i.id !== editingId) return i;
				return {
					...i,
					intervalKm: editKm ? parseInt(editKm, 10) : null,
					intervalMonths: editMonths ? parseInt(editMonths, 10) : null
				};
			});
			const config: HealthConfig = { intervals: updated };
			await saveHealthConfig(config, `Update interval: ${editingId}`);
			$healthIntervals = updated;
			editingId = null;
		} catch {
			alert('Failed to save');
		} finally {
			saving = false;
		}
	}

	function formatRemaining(km: number | null, days: number | null): string {
		const parts: string[] = [];
		if (km !== null) {
			if (km < 0) parts.push(`${Math.abs(km).toLocaleString()} km overdue`);
			else parts.push(`${km.toLocaleString()} km`);
		}
		if (days !== null) {
			if (days < 0) parts.push(`${Math.abs(days)} days overdue`);
			else if (days > 365) parts.push(`${Math.round(days / 30)} months`);
			else parts.push(`${days} days`);
		}
		return parts.join(' · ') || 'No data';
	}

	function remainingColor(remainPct: number): string {
		if (remainPct <= 0) return '#ff3b30';
		if (remainPct <= (1 - WARNING_THRESHOLD)) return '#ff9500';
		return '#34c759';
	}

	function startTireEdit(profile: TireProfile) {
		tireEditProfileId = profile.id;
		tireEditBrand = profile.brand;
		tireEditModel = profile.model;
		tireEditFrontSize = profile.frontSize;
		tireEditRearSize = profile.rearSize ?? '';
		tireEditStaggered = !!profile.rearSize;
		tireEditSeason = profile.season;
		tireEditFrontDot = profile.frontDot;
		tireEditRearDot = profile.rearDot ?? '';
		tireEditPerAxleDot = !!profile.rearDot;
		tireEditOpen = true;
	}

	function startNewTireEdit() {
		tireEditProfileId = null;
		tireEditBrand = '';
		tireEditModel = '';
		tireEditFrontSize = '';
		tireEditRearSize = '';
		tireEditStaggered = false;
		tireEditSeason = 'summer';
		tireEditFrontDot = '';
		tireEditRearDot = '';
		tireEditPerAxleDot = false;
		tireEditOpen = true;
	}

	function closeTireEdit() {
		tireEditOpen = false;
	}

	async function handleTireSwap(profile: TireProfile) {
		if (swapSaving) return;
		const label = `${seasonLabels[profile.season]} · ${profile.brand} ${profile.model}`;
		if (!confirm(`Switch to ${label}?\n\nThis will create a tire-swap event.`)) return;

		swapSaving = true;
		try {
			const seasonName = seasonLabels[profile.season].toLowerCase();
			const newEvt: CarEvent = {
				id: `evt_swap_${Date.now().toString(36)}`,
				km: Math.max(0, $latestOdometer.km - 1),
				date: formatDateISO(new Date()),
				event: `${seasonLabels[profile.season]} tires`,
				cost: 0,
				currency: 'DKK',
				provider: '',
				notes: `Profile: ${profile.id}`,
				invoiceNr: '',
				completed: true,
				category: 'tire-swap',
				tasks: [`${seasonName} tires`],
				kmEstimated: $latestOdometer.source !== 'manual'
			};

			const updatedEvents = [...$events, newEvt];
			await saveEvents(updatedEvents, `Tire swap: ${seasonLabels[profile.season]} tires`);
			$events = updatedEvents;
		} catch {
			alert('Failed to create tire swap event');
		} finally {
			swapSaving = false;
		}
	}

	async function archiveProfile(profile: TireProfile) {
		if (!$tireConfig) return;
		if (!confirm(`Archive "${profile.brand} ${profile.model}"?`)) return;
		const updated = $tireConfig.profiles.map((p) =>
			p.id === profile.id ? { ...p, archived: true } : p
		);
		const cfg: TireConfig = { profiles: updated, warningPct: $tireConfig.warningPct };
		try {
			await saveTireConfig(cfg, `Archive tire profile: ${profile.id}`);
			$tireConfig = cfg;
		} catch {
			alert('Failed to archive profile');
		}
	}

	async function restoreProfile(profile: TireProfile) {
		if (!$tireConfig) return;
		const updated = $tireConfig.profiles.map((p) =>
			p.id === profile.id ? { ...p, archived: false } : p
		);
		const cfg: TireConfig = { profiles: updated, warningPct: $tireConfig.warningPct };
		try {
			await saveTireConfig(cfg, `Restore tire profile: ${profile.id}`);
			$tireConfig = cfg;
		} catch {
			alert('Failed to restore profile');
		}
	}

	async function deleteProfile(profile: TireProfile) {
		if (!$tireConfig) return;
		if (!confirm(`Permanently delete "${profile.brand} ${profile.model}"?\n\nThis cannot be undone.`)) return;
		const updated = $tireConfig.profiles.filter((p) => p.id !== profile.id);
		const cfg: TireConfig = { profiles: updated, warningPct: $tireConfig.warningPct };
		try {
			await saveTireConfig(cfg, `Delete tire profile: ${profile.id}`);
			$tireConfig = cfg;
		} catch {
			alert('Failed to delete profile');
		}
	}

	async function saveTireEdit() {
		if (!$tireConfig) return;
		tireSaving = true;
		try {
			const newProfile: TireProfile = {
				id: tireEditProfileId ?? `${tireEditSeason}-${Date.now().toString(36)}`,
				season: tireEditSeason,
				brand: tireEditBrand.trim(),
				model: tireEditModel.trim(),
				frontSize: tireEditFrontSize.trim(),
				rearSize: tireEditStaggered && tireEditRearSize.trim() ? tireEditRearSize.trim() : null,
				frontDot: tireEditFrontDot.trim(),
				rearDot: tireEditPerAxleDot && tireEditRearDot.trim() ? tireEditRearDot.trim() : null,
				maxKm: $tireStatus.profile?.maxKm ?? 40000,
				maxMonths: $tireStatus.profile?.maxMonths ?? 60
			};

			let updatedProfiles: TireProfile[];
			if (tireEditProfileId) {
				updatedProfiles = $tireConfig.profiles.map((p) =>
					p.id === tireEditProfileId ? newProfile : p
				);
			} else {
				updatedProfiles = [...$tireConfig.profiles, newProfile];
			}

			const updatedConfig: TireConfig = { profiles: updatedProfiles, warningPct: $tireConfig.warningPct };
			await saveTireConfig(updatedConfig, `Update tire profile: ${newProfile.id}`);
			$tireConfig = updatedConfig;
			tireEditOpen = false;
		} catch {
			alert('Failed to save tire spec');
		} finally {
			tireSaving = false;
		}
	}

	function tireDisplaySize(profile: TireProfile): string {
		if (profile.rearSize) return `${profile.frontSize} / ${profile.rearSize}`;
		return profile.frontSize;
	}

	function tireDisplayDot(profile: TireProfile): string {
		if (!profile.frontDot) return '';
		if (profile.rearDot && profile.rearDot !== profile.frontDot) {
			return `DOT ${profile.frontDot} / ${profile.rearDot}`;
		}
		return `DOT ${profile.frontDot}`;
	}

	const seasonLabels: Record<TireSeason, string> = {
		summer: 'Summer',
		winter: 'Winter',
		'all-year': 'All-year'
	};

	function tireHealthColor(h: string): string {
		if (h === 'overdue') return '#ff3b30';
		if (h === 'warning') return '#ff9500';
		return '#34c759';
	}
</script>

<svelte:head>
	<title>Car — G31 Journal</title>
</svelte:head>

<div class="container car-container">
	{#if loading}
		<div class="loading">Loading car data...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else}
		<!-- Vehicle Info + Health -->
		<div class="vehicle-card">
			<div class="vehicle-header">
				<div class="vehicle-identity">
					<h2 class="vehicle-name">{vehicleTitle($vehicleConfig)}</h2>
					{#if $vehicleConfig}
						<span class="vehicle-detail">{$vehicleConfig.engine} · {$vehicleConfig.drivetrain}</span>
					{/if}
				</div>
			<span class="health-badge" style="color: {overallColors[overallHealth]}">
				{overallHealth === 'good' ? 'Good' : overallHealth === 'okay' ? 'Attention' : 'Overdue'}
			</span>
			</div>
			{#if editingOdo}
				<div class="odo-edit">
					<input
						type="number"
						inputmode="numeric"
						class="odo-input"
						bind:value={odoInput}
						bind:this={odoInputEl}
						onkeydown={handleOdoKey}
						onblur={saveOdo}
						placeholder="Enter km"
					/>
					<span class="odo-unit">km</span>
				</div>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="odometer" onclick={startOdoEdit}>
					<span class="odo-value">
						{$latestOdometer.source === 'estimated' ? '~' : ''}{$latestOdometer.km.toLocaleString()}{$latestOdometer.source === 'event' ? '+' : ''}
					</span>
					<span class="odo-unit">km</span>
				</div>
			{/if}
			{#if $latestOdometer.source === 'estimated' && $dailyAverageKm > 0}
				<span class="odo-source">Estimated · {$dailyAverageKm} km/day avg</span>
			{:else if $latestOdometer.source === 'manual' || $latestOdometer.source === 'none'}
				<span class="odo-source">Tap to set km</span>
			{:else if $latestOdometer.source === 'event'}
				<span class="odo-source">Based on last completed event</span>
			{/if}
			<p class="health-summary">{healthSummary}</p>
		</div>

		<!-- Tires -->
		{#if $tireStatus.currentSet || activeProfiles.length > 0}
			{@const tire = $tireStatus}
			<h3 class="section-title">Tires</h3>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="tire-card"
				class:tire-overdue={tire.health === 'overdue'}
				class:tire-warning={tire.health === 'warning'}
				class:tire-card-expanded={tireExpanded}
			>
				<!-- Tappable summary header -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="tire-summary" onclick={() => (tireExpanded = !tireExpanded)}>
					{#if tire.currentSet}
						<div class="tire-header">
							<span class="tire-set">{tire.profile ? seasonLabels[tire.profile.season] : tire.currentSet} tires</span>
							<span class="tire-health-badge" style="color: {tireHealthColor(tire.health)}">
								{tire.health === 'good' ? 'Good' : tire.health === 'warning' ? 'Wear soon' : 'Replace'}
							</span>
						</div>
						{#if tire.profile}
							<span class="tire-detail">
								{tire.profile.brand} {tire.profile.model} · {tireDisplaySize(tire.profile)}
								{#if tireDisplayDot(tire.profile)} · {tireDisplayDot(tire.profile)}{/if}
							</span>
						{/if}
						{@const kmOverdue = tire.kmPct >= 1}
						{@const ageOverdue = tire.agePct >= 1}
						<div class="tire-stats" class:tire-stats-single={kmOverdue !== ageOverdue}>
							{#if !(ageOverdue && !kmOverdue)}
								<div class="tire-stat">
									<span class="tire-stat-label">Km driven</span>
									<span class="tire-stat-value">{tire.kmDriven.toLocaleString()} km</span>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {Math.max(0, (1 - tire.kmPct) * 100)}%; background: {remainingColor(Math.max(0, 1 - tire.kmPct))}"></div>
								</div>
									{#if tire.remainingKm !== null}
										<span class="tire-stat-remaining" style="color: {tire.remainingKm < 0 ? '#ff3b30' : 'var(--color-text-secondary)'}">
											{#if tire.remainingKm < 0}
												{Math.abs(tire.remainingKm).toLocaleString()} km overdue
											{:else}
												{tire.remainingKm.toLocaleString()} km remaining
											{/if}
										</span>
									{/if}
								</div>
							{/if}
							{#if !(kmOverdue && !ageOverdue)}
								<div class="tire-stat">
									<span class="tire-stat-label">Age{#if tire.profile?.frontDot} (DOT){/if}</span>
									<span class="tire-stat-value">
										{#if tire.ageDays > 365}
											{Math.floor(tire.ageDays / 365)}y {Math.round((tire.ageDays % 365) / 30)}m
										{:else if tire.ageDays > 30}
											{Math.round(tire.ageDays / 30)} months
										{:else}
											{tire.ageDays} days
										{/if}
									</span>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {Math.max(0, (1 - tire.agePct) * 100)}%; background: {remainingColor(Math.max(0, 1 - tire.agePct))}"></div>
								</div>
									{#if tire.remainingDays !== null}
										<span class="tire-stat-remaining" style="color: {tire.remainingDays < 0 ? '#ff3b30' : 'var(--color-text-secondary)'}">
											{#if tire.remainingDays < 0}
												{Math.abs(tire.remainingDays)} days overdue
											{:else if tire.remainingDays > 365}
												{Math.round(tire.remainingDays / 30)} months remaining
											{:else}
												{tire.remainingDays} days remaining
											{/if}
										</span>
									{/if}
								</div>
							{/if}
						</div>
						{#if tire.swapEvent}
							<span class="tire-swap-date">Mounted: {formatDate(tire.swapEvent.date)} · {(tire.swapEvent.km ?? 0).toLocaleString()} km</span>
						{/if}
					{:else}
						<div class="tire-header">
							<span class="tire-set">Tires</span>
							<span class="tire-expand-hint">{tireExpanded ? '▾' : '▸'}</span>
						</div>
					{/if}
				</div>

				<!-- Expanded content -->
				{#if tireExpanded}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="tire-expanded" onclick={(e) => e.stopPropagation()}>
						<div class="tire-section-label">My Tires</div>
						<div class="my-tires-list">
							{#each activeProfiles as profile (profile.id)}
								{@const isActive = $tireStatus.profile?.id === profile.id}
								<div class="tire-profile-row" class:profile-active={isActive}>
									<button
										class="tire-radio"
										class:tire-radio-active={isActive}
										onclick={() => handleTireSwap(profile)}
										disabled={isActive || swapSaving}
										aria-label="Switch to {profile.brand} {profile.model}"
									>
										<span class="radio-dot"></span>
									</button>
									<div class="tire-profile-info">
										<span class="tire-profile-name">{seasonLabels[profile.season]} · {profile.brand} {profile.model}</span>
										<span class="tire-profile-spec">
											{tireDisplaySize(profile)}{#if tireDisplayDot(profile)} · {tireDisplayDot(profile)}{/if}
										</span>
									</div>
									<div class="tire-profile-actions">
										<button class="tire-action-btn" onclick={() => startTireEdit(profile)} aria-label="Edit profile">✎</button>
										<button class="tire-action-btn tire-action-archive" onclick={() => archiveProfile(profile)} aria-label="Archive profile">▼</button>
									</div>
								</div>
							{/each}

							{#if tireEditOpen}
								<div class="tire-edit-panel">
									<span class="edit-panel-title">{tireEditProfileId ? 'Edit tire set' : 'New tire set'}</span>
									<div class="edit-row">
										<div class="edit-field">
											<label for="tire-brand">Make</label>
											<input id="tire-brand" type="text" bind:value={tireEditBrand} placeholder="e.g. Aplus" />
										</div>
										<div class="edit-field">
											<label for="tire-model">Model</label>
											<input id="tire-model" type="text" bind:value={tireEditModel} placeholder="e.g. A610 100Y" />
										</div>
									</div>
									<div class="edit-field">
										<label for="tire-front-size">Front size</label>
										<input id="tire-front-size" type="text" bind:value={tireEditFrontSize} placeholder="e.g. 225/55R17" />
									</div>
									<label class="toggle-row">
										<input type="checkbox" bind:checked={tireEditStaggered} />
										<span>Staggered (different rear size)</span>
									</label>
									{#if tireEditStaggered}
										<div class="edit-field">
											<label for="tire-rear-size">Rear size</label>
											<input id="tire-rear-size" type="text" bind:value={tireEditRearSize} placeholder="e.g. 255/45R17" />
										</div>
									{/if}
									<div class="edit-field">
										<label for="tire-season">Season</label>
										<select id="tire-season" bind:value={tireEditSeason}>
											<option value="summer">Summer</option>
											<option value="winter">Winter</option>
											<option value="all-year">All-year</option>
										</select>
									</div>
									<div class="edit-field">
										<label for="tire-front-dot">DOT code (last 4 digits)</label>
										<input id="tire-front-dot" type="text" bind:value={tireEditFrontDot} placeholder="e.g. 2523" maxlength="4" inputmode="numeric" />
									</div>
									<label class="toggle-row">
										<input type="checkbox" bind:checked={tireEditPerAxleDot} />
										<span>Different rear DOT</span>
									</label>
									{#if tireEditPerAxleDot}
										<div class="edit-field">
											<label for="tire-rear-dot">Rear DOT code</label>
											<input id="tire-rear-dot" type="text" bind:value={tireEditRearDot} placeholder="e.g. 2420" maxlength="4" inputmode="numeric" />
										</div>
									{/if}
									<div class="edit-actions">
										<button class="edit-cancel" onclick={closeTireEdit}>Cancel</button>
										<button class="edit-save" onclick={saveTireEdit} disabled={tireSaving}>{tireSaving ? 'Saving...' : 'Save'}</button>
									</div>
								</div>
							{:else}
								<button class="tire-add-btn" onclick={startNewTireEdit}>+ Add tire set</button>
							{/if}
						</div>

						{#if archivedProfiles.length > 0}
							<button class="archived-toggle" onclick={() => (showArchived = !showArchived)}>
								Archived ({archivedProfiles.length}) {showArchived ? '▾' : '▸'}
							</button>
							{#if showArchived}
								<div class="my-tires-list archived-list">
									{#each archivedProfiles as profile (profile.id)}
										<div class="tire-profile-row">
											<div class="tire-profile-info">
												<span class="tire-profile-name">{seasonLabels[profile.season]} · {profile.brand} {profile.model}</span>
												<span class="tire-profile-spec">
													{tireDisplaySize(profile)}{#if tireDisplayDot(profile)} · {tireDisplayDot(profile)}{/if}
												</span>
											</div>
											<div class="tire-profile-actions">
												<button class="tire-action-btn tire-action-restore" onclick={() => restoreProfile(profile)} aria-label="Restore profile">↑</button>
												<button class="tire-action-btn tire-action-delete" onclick={() => deleteProfile(profile)} aria-label="Delete profile">✕</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						{/if}

						{#if $tireSwapEvents.length > 0}
							<div class="tire-section-label">Tire History</div>
							<div class="tire-history">
								{#each $tireSwapEvents as swapEvt}
									<a href="{base}/timeline/{swapEvt.id}" class="tire-history-item">
										<span class="tire-history-name">{swapEvt.event}</span>
										<span class="tire-history-meta">{formatDate(swapEvt.date)} · {(swapEvt.km ?? 0).toLocaleString()} km</span>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Component Status -->
		<h3 class="section-title">Component Status</h3>

		<div class="component-list">
			{#each componentStatuses as comp}
				<div
					class="comp-card"
					class:comp-overdue={comp.health === 'overdue'}
					class:comp-warning={comp.health === 'warning'}
					class:comp-clickable={editingId !== comp.interval.id && !!comp.lastEvent}
					onclick={() => {
						if (editingId !== comp.interval.id && comp.lastEvent) {
							goto(`${base}/timeline?focus=${comp.lastEvent.id}`);
						}
					}}
					role={editingId !== comp.interval.id && comp.lastEvent ? 'link' : undefined}
					tabindex={editingId !== comp.interval.id && comp.lastEvent ? 0 : undefined}
				>
					<div class="comp-header">
						<span class="comp-name">{comp.interval.name}</span>
						<button class="comp-edit" onclick={(e) => { e.stopPropagation(); startEdit(comp.interval.id); }} aria-label="Edit interval">✎</button>
					</div>

					{#if editingId === comp.interval.id}
						<div class="edit-row">
							<div class="edit-field">
								<label>Interval (km)</label>
								<input type="number" bind:value={editKm} placeholder="e.g. 30000" inputmode="numeric" />
							</div>
							<div class="edit-field">
								<label>Interval (months)</label>
								<input type="number" bind:value={editMonths} placeholder="e.g. 24" inputmode="numeric" />
							</div>
						</div>
						<div class="edit-actions">
							<button class="edit-cancel" onclick={() => (editingId = null)}>Cancel</button>
							<button class="edit-save" onclick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
						</div>
					{:else}
						<div class="comp-meta">
							{#if comp.lastEvent}
								<span class="meta-last">Last: {formatDate(comp.lastDate)}{comp.lastKm ? ` · ${comp.lastKm.toLocaleString()} km` : ''}</span>
							{:else if comp.health === 'overdue'}
								<span class="meta-last meta-unknown">No service record found</span>
							{:else}
								<span class="meta-last">First service at {(comp.interval.intervalKm ?? 0).toLocaleString()} km</span>
							{/if}
						</div>

						{#if comp.lastEvent}
							{@const usedPct = Math.max(comp.usedKmPct, comp.usedTimePct)}
							{@const remainPct = Math.max(0, 1 - usedPct)}
							<div class="progress-row">
								<span class="progress-label" style="color: {remainingColor(remainPct)}">
									{Math.round(remainPct * 100)}%
								</span>
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {remainPct * 100}%; background: {remainingColor(remainPct)}"
									></div>
								</div>
							</div>

							<div class="comp-remaining">
								{#if comp.health === 'overdue'}
									<span class="remaining-overdue">{formatRemaining(comp.remainingKm, comp.remainingDays)}</span>
								{:else}
									<span class="remaining-ok">{formatRemaining(comp.remainingKm, comp.remainingDays)} remaining</span>
								{/if}
							</div>
						{:else if comp.interval.intervalKm && $latestOdometer.km > 0}
							{@const usedPct = Math.min(1, Math.max(0, $latestOdometer.km / comp.interval.intervalKm))}
							{@const remainPct = Math.max(0, 1 - usedPct)}
							{@const remainingKm = comp.interval.intervalKm - $latestOdometer.km}
							<div class="progress-row">
								<span class="progress-label" style="color: {remainingColor(remainPct)}">
									{Math.round(remainPct * 100)}%
								</span>
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {remainPct * 100}%; background: {remainingColor(remainPct)}"
									></div>
								</div>
							</div>

							<div class="comp-remaining">
								{#if remainingKm > 0}
									<span class="remaining-ok">{remainingKm.toLocaleString()} km remaining</span>
								{:else}
									<span class="remaining-overdue">{Math.abs(remainingKm).toLocaleString()} km overdue</span>
								{/if}
							</div>
						{/if}

						<div class="comp-interval">
							{#if comp.interval.intervalKm}
								<span>Every {comp.interval.intervalKm.toLocaleString()} km</span>
							{/if}
							{#if comp.interval.intervalMonths}
								<span>Every {comp.interval.intervalMonths} months</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.car-container {
		padding-bottom: 80px;
	}

	/* Vehicle card */
	.vehicle-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 20px 16px 16px;
		margin-bottom: 12px;
		text-align: center;
	}

	.vehicle-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.vehicle-identity {
		text-align: left;
	}

	.vehicle-name {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.3px;
		margin-bottom: 2px;
	}

	.vehicle-detail {
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.odometer {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
		cursor: pointer;
	}

	.odometer:active {
		opacity: 0.7;
	}

	.odo-value {
		font-size: 32px;
		font-weight: 800;
		letter-spacing: -1px;
	}

	.odo-edit {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
	}

	.odo-input {
		width: 140px;
		font-size: 28px;
		font-weight: 800;
		letter-spacing: -1px;
		text-align: center;
		border: none;
		border-bottom: 2px solid var(--color-primary);
		background: transparent;
		color: var(--color-text);
		outline: none;
		padding: 2px 0;
		-moz-appearance: textfield;
	}

	.odo-input::-webkit-inner-spin-button,
	.odo-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.odo-unit {
		font-size: 15px;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.odo-source {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--color-text-secondary);
		text-align: center;
	}

	.health-badge {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
		flex-shrink: 0;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.health-summary {
		margin-top: 10px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--color-text-secondary);
		text-align: center;
	}

	/* Section title */
	.section-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 12px;
	}

	/* Tire card */
	.tire-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin-bottom: 24px;
		overflow: hidden;
	}

	.tire-summary {
		padding: 14px 16px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.tire-summary:active {
		background: rgba(0, 0, 0, 0.03);
	}

	.tire-expand-hint {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.tire-expanded {
		border-top: 1px solid var(--color-border);
		padding: 14px 16px;
	}

	.tire-section-label {
		font-size: 11px;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
		margin-bottom: 8px;
	}

	.tire-card.tire-overdue {
		border-left: 4px solid #ff3b30;
	}

	.tire-card.tire-warning {
		border-left: 4px solid #ff9500;
	}

	.tire-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.tire-set {
		font-size: 15px;
		font-weight: 600;
		text-transform: capitalize;
	}

	.tire-health-badge {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.tire-detail {
		font-size: 12px;
		color: var(--color-text-secondary);
		display: block;
		margin-bottom: 12px;
	}

	.tire-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 10px;
	}

	.tire-stats-single {
		grid-template-columns: 1fr;
	}

	.tire-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tire-stat-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.tire-stat-value {
		font-size: 14px;
		font-weight: 600;
	}

	.tire-stat-remaining {
		font-size: 11px;
	}

	.tire-swap-date {
		font-size: 11px;
		color: var(--color-text-secondary);
	}

	/* Tire edit panel */
	.tire-edit-panel {
		padding: 14px;
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.toggle-row input[type="checkbox"] {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		accent-color: var(--color-accent);
	}

	/* Tire history */
	.tire-history {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--color-border);
	}

	.tire-history-title {
		display: block;
		font-size: 11px;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
		margin-bottom: 8px;
	}

	.tire-history-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
		text-decoration: none;
		color: var(--color-text);
	}

	.tire-history-item:last-child {
		border-bottom: none;
	}

	.tire-history-item:active {
		opacity: 0.7;
	}

	.tire-history-name {
		font-size: 13px;
		font-weight: 500;
	}

	.tire-history-meta {
		font-size: 11px;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	/* Component list */
	.component-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.comp-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
	}

	.comp-card.comp-clickable {
		cursor: pointer;
	}

	.comp-card.comp-clickable:active {
		opacity: 0.85;
	}

	.comp-card.comp-overdue {
		border-left: 4px solid #ff3b30;
	}

	.comp-card.comp-warning {
		border-left: 4px solid #ff9500;
	}

	.comp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.comp-name {
		font-size: 15px;
		font-weight: 600;
	}

	.comp-edit {
		font-size: 16px;
		color: var(--color-text-secondary);
		background: none;
		border: none;
		padding: 4px 8px;
		cursor: pointer;
	}

	.comp-meta {
		margin-bottom: 8px;
	}

	.meta-last {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.meta-unknown {
		color: #ff3b30;
		font-weight: 500;
	}

	.progress-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 6px;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: var(--color-border);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
	}

	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-label {
		font-size: 12px;
		font-weight: 700;
		min-width: 36px;
		text-align: left;
	}

	.comp-remaining {
		margin-bottom: 6px;
	}

	.remaining-ok {
		font-size: 13px;
		color: var(--color-text);
		font-weight: 500;
	}

	.remaining-overdue {
		font-size: 13px;
		color: #ff3b30;
		font-weight: 600;
	}

	.comp-interval {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: var(--color-text-secondary);
	}

	.edit-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 8px 0;
	}

	.edit-field label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: 4px;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	.edit-cancel {
		flex: 1;
		padding: 8px;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--color-text);
	}

	.edit-save {
		flex: 1;
		padding: 8px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 600;
	}

	.edit-save:disabled {
		opacity: 0.6;
	}

	/* My Tires list */
	.my-tires-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		margin-bottom: 12px;
	}

	.tire-profile-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--color-border);
	}

	.tire-profile-row:last-child {
		border-bottom: none;
	}

	.profile-active {
		background: rgba(0, 113, 227, 0.05);
	}

	.tire-radio {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid var(--color-border);
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		cursor: pointer;
		padding: 0;
		transition: border-color 0.15s;
	}

	.tire-radio-active {
		border-color: var(--color-accent);
	}

	.radio-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: transparent;
		transition: background 0.15s;
	}

	.tire-radio-active .radio-dot {
		background: var(--color-accent);
	}

	.tire-radio:disabled {
		cursor: default;
	}

	.tire-profile-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.tire-profile-name {
		font-size: 13px;
		font-weight: 600;
	}

	.tire-profile-spec {
		font-size: 11px;
		color: var(--color-text-secondary);
	}

	.tire-profile-actions {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
	}

	.tire-action-btn {
		font-size: 14px;
		color: var(--color-text-secondary);
		background: none;
		border: none;
		padding: 4px 6px;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.15s;
	}

	.tire-action-btn:active {
		background: var(--color-border);
	}

	.tire-action-archive {
		font-size: 12px;
	}

	.tire-action-restore {
		color: var(--color-accent);
	}

	.tire-action-delete {
		color: #ff3b30;
	}

	.tire-add-btn {
		display: block;
		width: 100%;
		padding: 12px;
		background: none;
		border: none;
		border-top: 1px solid var(--color-border);
		color: var(--color-accent);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		text-align: center;
		transition: background 0.15s;
	}

	.tire-add-btn:active {
		background: rgba(0, 113, 227, 0.05);
	}

	.edit-panel-title {
		font-size: 13px;
		font-weight: 700;
		display: block;
		margin-bottom: 4px;
	}

	.archived-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		padding: 8px 0;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		margin-bottom: 8px;
	}

	.archived-list {
		opacity: 0.7;
		margin-bottom: 12px;
	}

	.loading, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
