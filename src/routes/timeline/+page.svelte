<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { token, events, statusFilter, latestOdometer, nextScheduledEvent } from '$lib/stores';
	import { loadEvents } from '$lib/github';
	import { formatCost, formatDate, formatDateISO, deriveStatus, statusLabel, statusColor, eventCategory, categoryLabel, categoryColor, completionQuality, computeMfrMilestones, computeRecMilestones, milestoneId } from '$lib/utils';
	import type { CarEvent, DerivedStatus, ServiceMilestone } from '$lib/types';

	let loading = $state(true);
	let loadError = $state('');
	let searchQuery = $state('');
	let anchorEl: HTMLElement | null = null;
	let focusId = $state<string | null>(null);
	let showMfr = $state(true);
	let showRec = $state(true);

	$effect(() => {
		const params = $page.url.searchParams;
		focusId = params.get('focus');
	});

	function anchorAction(node: HTMLElement, shouldAnchor: boolean) {
		if (shouldAnchor) anchorEl = node;
		return {
			update(newVal: boolean) {
				if (newVal) anchorEl = node;
			}
		};
	}

	function smartStatusText(evt: CarEvent, status: DerivedStatus, odoKm: number): string {
		if (status === 'completed') return '✓';
		if (status === 'today') return 'Today';
		if (status === 'scheduled' && evt.date) {
			const today = new Date(formatDateISO(new Date()) + 'T00:00:00');
			const target = new Date(evt.date + 'T00:00:00');
			const days = Math.round((target.getTime() - today.getTime()) / 86400000);
			return days === 1 ? 'In 1 day' : `In ${days} days`;
		}
		if (status === 'delayed' && evt.km !== null && odoKm > 0) {
			const overdue = odoKm - evt.km;
			if (overdue > 0) return `Overdue ${overdue.toLocaleString()} km`;
		}
		if (status === 'planned') return 'Planned';
		if (status === 'backlog') return 'Backlog';
		if (status === 'delayed') return 'Delayed';
		return '';
	}

	const statuses: { value: string; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'today', label: 'Today' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'delayed', label: 'Delayed' },
		{ value: 'planned', label: 'Planned' },
		{ value: 'backlog', label: 'Backlog' }
	];

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		try {
			if ($events.length === 0) {
				$events = await loadEvents();
			}
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
			await tick();
			await tick();
			requestAnimationFrame(() => {
				if (anchorEl) {
					anchorEl.scrollIntoView({ block: 'center', behavior: 'instant' });
				}
			});
		}
	});

	interface TimelineEntry {
		kind: 'event' | 'odometer' | 'milestone';
		evt?: CarEvent;
		milestone?: ServiceMilestone;
		km: number;
		sortDate: string;
	}

	const mfrMilestones = $derived(computeMfrMilestones($events));
	const recMilestones = $derived(computeRecMilestones($events));

	const PX_PER_KM = 0.004;
	const MIN_GAP = 12;
	const MAX_GAP = 120;

	const sortedEvents = $derived.by(() => {
		let all = [...$events];

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			all = all.filter((e) =>
				e.event.toLowerCase().includes(q) ||
				e.provider.toLowerCase().includes(q) ||
				e.notes.toLowerCase().includes(q)
			);
		}

		if ($statusFilter !== 'all') {
			all = all.filter((e) => deriveStatus(e) === $statusFilter);
		}

		all.sort((a, b) => {
			const aKm = a.km ?? -1;
			const bKm = b.km ?? -1;
			if (aKm !== bKm) return aKm - bKm;
			if (!a.date && !b.date) return 0;
			if (!a.date) return 1;
			if (!b.date) return -1;
			return a.date.localeCompare(b.date);
		});

		return all;
	});

	const timelineEntries = $derived.by(() => {
		const entries: TimelineEntry[] = [];
		const odoKm = $latestOdometer.km;

		const combined: TimelineEntry[] = [];
		for (const evt of sortedEvents) {
			combined.push({ kind: 'event', evt, km: evt.km ?? 0, sortDate: evt.date || '' });
		}
		if (showMfr) {
			for (const ms of mfrMilestones) {
				combined.push({ kind: 'milestone', milestone: ms, km: ms.km, sortDate: '' });
			}
		}
		if (showRec) {
			for (const ms of recMilestones) {
				combined.push({ kind: 'milestone', milestone: ms, km: ms.km, sortDate: '' });
			}
		}
		combined.sort((a, b) => {
			if (a.km !== b.km) return a.km - b.km;
			if (a.kind === 'milestone' && b.kind !== 'milestone') return 1;
			if (a.kind !== 'milestone' && b.kind === 'milestone') return -1;
			return 0;
		});

		let odoInserted = false;
		for (const entry of combined) {
			if (!odoInserted && odoKm > 0 && entry.km > odoKm) {
				entries.push({ kind: 'odometer', km: odoKm, sortDate: '' });
				odoInserted = true;
			}
			entries.push(entry);
		}
		if (!odoInserted && odoKm > 0) {
			entries.push({ kind: 'odometer', km: odoKm, sortDate: '' });
		}

		return entries;
	});

	function gapBetween(prevKm: number, nextKm: number): number {
		if (prevKm <= 0 && nextKm <= 0) return MIN_GAP;
		const diff = Math.abs(nextKm - prevKm);
		const px = diff * PX_PER_KM;
		return Math.min(MAX_GAP, Math.max(MIN_GAP, px));
	}

	const nextId = $derived($nextScheduledEvent?.id ?? null);
</script>

<svelte:head>
	<title>Timeline — G31 Journal</title>
</svelte:head>

<div class="container timeline-container">
	<div class="sticky-header">
		<div class="search-bar">
			<input type="search" placeholder="Search timeline..." bind:value={searchQuery} />
		</div>

		<div class="filter-row">
			{#each statuses as s}
				<button
					class="filter-chip"
					class:active={$statusFilter === s.value}
					onclick={() => ($statusFilter = s.value)}
				>
					{s.label}
				</button>
			{/each}
			<button
				class="filter-chip filter-chip-mfr"
				class:active={showMfr}
				onclick={() => (showMfr = !showMfr)}
			>
				MFR
			</button>
			<button
				class="filter-chip filter-chip-rec"
				class:active={showRec}
				onclick={() => (showRec = !showRec)}
			>
				REC
			</button>
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading timeline...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else if timelineEntries.length === 0}
		<div class="empty-state">No events found</div>
	{:else}
		<div class="timeline">
			{#each timelineEntries as entry, i}
				{@const gap = i > 0 ? gapBetween(timelineEntries[i - 1].km, entry.km) : 0}
				{#if entry.kind === 'odometer'}
					<div
						class="tl-row odometer-row"
						style="margin-top: {gap}px"
					use:anchorAction={!focusId}
				>
						<div class="tl-ruler">
							<div class="ruler-line"></div>
							<div class="ruler-km odo-km">
								{$latestOdometer.source === 'estimated' ? '~' : ''}{entry.km.toLocaleString()}{$latestOdometer.source === 'event' ? '+' : ''} km
							</div>
							<div class="odo-dot"></div>
							<div class="ruler-line"></div>
						</div>
						<div class="odo-marker">
							<span class="odo-label">You are here</span>
							{#if $nextScheduledEvent?.km && $latestOdometer.km > 0}
								{@const remaining = $nextScheduledEvent.km - $latestOdometer.km}
								{#if remaining > 0}
									<span class="odo-remaining">{remaining.toLocaleString()} km to next service</span>
								{:else}
									<span class="odo-overdue">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
								{/if}
							{/if}
						</div>
					</div>
			{:else if entry.kind === 'milestone' && entry.milestone}
				{@const ms = entry.milestone}
				<div class="tl-row" style="margin-top: {gap}px">
					<div class="tl-ruler">
						<div class="ruler-line ruler-line-ms"></div>
						<div class="ruler-km ms-km">{ms.km.toLocaleString()}</div>
						<div class="ruler-dot ms-dot"></div>
						<div class="ruler-line ruler-line-ms"></div>
					</div>
					<a
						href="{base}/timeline/service?kind={ms.kind}&km={ms.km}"
						class="ms-card ms-card-{ms.kind}"
					>
						<span class="ms-badge ms-badge-{ms.kind}">{ms.kind === 'mfr' ? 'MFR' : 'REC'}</span>
						<span class="ms-tasks">{ms.tasks.join(', ')}</span>
					</a>
				</div>
				{:else if entry.evt}
					{@const evt = entry.evt}
					{@const status = deriveStatus(evt)}
					{@const isNext = evt.id === nextId}
					{@const isFocus = focusId ? evt.id === focusId : false}
					<div
						class="tl-row"
						class:next-scheduled={isNext}
						class:focused-row={isFocus}
						style="margin-top: {gap}px"
						use:anchorAction={isFocus || (!focusId && isNext)}
					>
						<div class="tl-ruler">
							<div class="ruler-line" class:completed-line={evt.completed}></div>
							{#if evt.km}
								<div class="ruler-km" class:completed-km={evt.completed}>
									{evt.kmEstimated ? '~' : ''}{evt.km.toLocaleString()}
								</div>
							{:else}
								<div class="ruler-km no-km">—</div>
							{/if}
							<div class="ruler-dot" class:completed-dot={evt.completed} class:next-dot={isNext}></div>
							<div class="ruler-line" class:completed-line={evt.completed}></div>
						</div>
						<a href="{base}/timeline/{evt.id}" class="tl-card" class:tl-card-next={isNext}>
							<div class="tl-card-header">
								<span
									class="category-badge"
									style="background: {categoryColor(eventCategory(evt.event, evt.category))}"
								>
									{categoryLabel(eventCategory(evt.event, evt.category))}
								</span>
								{#if status === 'completed'}
									{@const quality = completionQuality(evt)}
									<span class="quality-mark quality-{quality}" title={quality === 'green' ? 'Fully documented' : quality === 'amber' ? 'Missing receipt' : 'Missing information'}>✓</span>
								{:else}
									<span class="status-text" style="color: {statusColor(status)}">
										{smartStatusText(evt, status, $latestOdometer.km)}
									</span>
								{/if}
							</div>
							<h3 class="tl-card-title" class:tl-card-title-next={isNext}>{evt.event}</h3>
							<div class="tl-card-meta">
								{#if evt.date}
									<span class="meta-item">{formatDate(evt.date)}</span>
								{/if}
								{#if evt.provider}
									<span class="meta-item">{evt.provider}</span>
								{/if}
								{#if evt.cost > 0}
									<span class="meta-cost">{formatCost(evt.cost)}</span>
								{/if}
							</div>
						</a>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<a href="{base}/timeline/new" class="fab" aria-label="Add new event">+</a>
</div>

<style>
	.timeline-container {
		padding-bottom: 80px;
	}

	.sticky-header {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--color-bg);
		padding-top: 4px;
		padding-bottom: 4px;
	}

	.search-bar {
		margin-bottom: 12px;
	}

	.filter-row {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 4px;
		margin-bottom: 12px;
		-webkit-overflow-scrolling: touch;
	}

	.filter-chip {
		padding: 6px 14px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		transition: all 0.2s;
	}

	.filter-chip.active {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}

	.timeline {
		display: flex;
		flex-direction: column;
	}

	.tl-row {
		display: flex;
		align-items: stretch;
		min-height: 60px;
	}

	/* ---- Left ruler column ---- */
	.tl-ruler {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 56px;
		flex-shrink: 0;
		position: relative;
	}

	.ruler-line {
		flex: 1;
		width: 2px;
		background: var(--color-border);
		min-height: 6px;
	}

	.ruler-line.completed-line {
		background: var(--color-accent);
		opacity: 0.4;
	}

	.ruler-km {
		font-size: 10px;
		font-weight: 600;
		color: var(--color-text-secondary);
		white-space: nowrap;
		padding: 2px 0;
		text-align: center;
	}

	.ruler-km.completed-km {
		color: var(--color-accent);
		opacity: 0.7;
	}

	.ruler-km.no-km {
		color: var(--color-border);
	}

	.ruler-km.odo-km {
		font-size: 11px;
		font-weight: 700;
		color: var(--color-accent);
		background: var(--color-bg);
		padding: 2px 6px;
		border-radius: 8px;
	}

	.ruler-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-border);
		flex-shrink: 0;
	}

	.ruler-dot.completed-dot {
		background: var(--color-accent);
		opacity: 0.6;
	}

	.ruler-dot.next-dot {
		width: 14px;
		height: 14px;
		background: var(--color-accent);
		opacity: 1;
		box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.2);
	}

	.odo-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--color-success);
		flex-shrink: 0;
		box-shadow: 0 0 0 4px rgba(52, 199, 89, 0.25);
	}

	/* ---- Odometer "you are here" marker ---- */
	.odometer-row {
		align-items: center;
	}

	.odo-marker {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 14px;
		background: var(--color-surface);
		border: 2px solid var(--color-success);
		border-radius: var(--radius-md);
		margin-left: 8px;
	}

	.odo-label {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-success);
	}

	.odo-remaining {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.odo-overdue {
		font-size: 12px;
		color: var(--color-danger);
		font-weight: 600;
	}

	.focused-row .tl-card {
		box-shadow: 0 0 0 2px var(--color-accent), 0 2px 12px rgba(0, 113, 227, 0.15);
	}

	/* ---- Event cards ---- */
	.tl-card {
		flex: 1;
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 12px 14px;
		margin-left: 8px;
		text-decoration: none;
		color: var(--color-text);
		transition: box-shadow 0.2s;
	}

	.tl-card:active {
		box-shadow: var(--shadow-md);
	}

	.tl-card-next {
		border-color: var(--color-accent);
		border-width: 2px;
		padding: 14px 16px;
		box-shadow: 0 2px 12px rgba(0, 113, 227, 0.15);
	}

	.tl-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.category-badge {
		font-size: 10px;
		font-weight: 600;
		color: white;
		padding: 2px 7px;
		border-radius: 8px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.status-text {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	.quality-mark {
		font-size: 16px;
		font-weight: 800;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
		line-height: 1;
	}

	.quality-green {
		background: #34c759;
	}

	.quality-amber {
		background: #ff9500;
	}

	.quality-red {
		background: #ff3b30;
	}

	.tl-card-title {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 4px;
		line-height: 1.3;
	}

	.tl-card-title-next {
		font-size: 16px;
	}

	.tl-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.meta-item::after {
		content: '·';
		margin-left: 8px;
		color: var(--color-border);
	}

	.meta-item:last-of-type::after {
		content: '';
	}

	.meta-cost {
		font-weight: 600;
		color: var(--color-text);
		margin-left: auto;
	}

	/* ---- FAB ---- */
	.fab {
		position: fixed;
		bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 16px);
		right: 20px;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--color-accent);
		color: white;
		font-size: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-md);
		text-decoration: none;
		z-index: 50;
		transition: transform 0.2s, background 0.2s;
	}

	.fab:active {
		transform: scale(0.92);
	}

	/* ---- MFR milestone cards ---- */
	.filter-chip-mfr {
		border-style: dashed;
	}

	.filter-chip-mfr.active {
		background: #8e8e93;
		border-color: #8e8e93;
		border-style: solid;
	}

	.filter-chip-rec.active {
		background: #92400e;
		border-color: #92400e;
		border-style: solid;
	}

	.ruler-line-ms {
		background: #c7c7cc;
		opacity: 0.5;
	}

	.ms-km {
		color: #8e8e93 !important;
		font-weight: 500 !important;
		opacity: 0.7;
	}

	.ms-dot {
		width: 8px !important;
		height: 8px !important;
		background: #c7c7cc !important;
		border: 1px dashed #8e8e93;
	}

	.ms-card {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		background: transparent;
		border: 1px dashed #c7c7cc;
		border-radius: var(--radius-md);
		padding: 8px 12px;
		margin-left: 8px;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}

	.ms-card:hover, .ms-card:active {
		background: rgba(142, 142, 147, 0.1);
	}

	.ms-card-rec {
		border-color: #d97706;
	}

	.ms-badge {
		font-size: 9px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 6px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		flex-shrink: 0;
		background: var(--color-surface);
	}

	.ms-badge-mfr {
		color: #8e8e93;
		border: 1px solid #c7c7cc;
	}

	.ms-badge-rec {
		color: #92400e;
		border: 1px solid #d97706;
	}

	.ms-tasks {
		font-size: 12px;
		color: #8e8e93;
		line-height: 1.3;
	}

	.loading, .empty-state, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
