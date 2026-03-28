<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { token, events, statusFilter, latestOdometer, nextScheduledEvent, dailyAverageKm, platformConfig, vehicleConfig } from '$lib/stores';
	import { receiptUrl } from '$lib/github';
	import { formatCost, formatDate, formatDateISO, deriveStatus, statusLabel, statusColor, eventCategory, categoryLabel, categoryColor, completionQuality, computeMfrMilestones, computeRecMilestones, milestoneId, milestoneTaskStatuses, milestoneCardStatus, milestoneActionText, capitalizeTask, getServiceIntervals, computeTimeMilestones } from '$lib/utils';
	import type { TaskWithStatus, TimeMilestone } from '$lib/utils';
	import type { CarEvent, DerivedStatus, ServiceMilestone } from '$lib/types';

	let loading = $state(true);
	let loadError = $state('');
	let searchQuery = $state('');
	let anchorEl: HTMLElement | null = null;
	let focusId = $state<string | null>(null);
	let showMfr = $state(true);
	let showRec = $state(true);
	let expandedIds = $state(new Set<string>());

	function toggleExpand(id: string) {
		const next = new Set(expandedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedIds = next;
	}

	function receiptName(path: string): string {
		const parts = path.split('/');
		return parts[parts.length - 1];
	}

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
		if (status === 'overdue' && evt.km !== null && odoKm > 0) {
			const over = odoKm - evt.km;
			if (over > 0) return `Overdue ${over.toLocaleString()} km`;
			return 'Overdue';
		}
		if (status === 'overdue') return 'Overdue';
		if (status === 'scheduled' && evt.date) {
			const today = new Date(formatDateISO(new Date()) + 'T00:00:00');
			const target = new Date(evt.date + 'T00:00:00');
			const days = Math.round((target.getTime() - today.getTime()) / 86400000);
			if (days === 0) return 'Today';
			return days === 1 ? 'In 1 day' : `In ${days} days`;
		}
		return 'Scheduled';
	}

	const statuses: { value: string; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'overdue', label: 'Overdue' }
	];

	const serviceIntervals = $derived(getServiceIntervals($platformConfig, $vehicleConfig?.transmission));

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		loading = false;
		await tick();
		await tick();
		requestAnimationFrame(() => {
			if (anchorEl) {
				anchorEl.scrollIntoView({ block: 'center', behavior: 'instant' });
			}
		});
	});

	interface TimelineEntry {
		kind: 'event' | 'odometer' | 'milestone' | 'time-milestone';
		evt?: CarEvent;
		milestone?: ServiceMilestone;
		timeMilestone?: TimeMilestone;
		coveredMilestones?: ServiceMilestone[];
		km: number;
		sortDate: string;
	}

	const mfrMilestones = $derived(computeMfrMilestones($events, serviceIntervals));
	const recMilestones = $derived(computeRecMilestones($events, serviceIntervals));
	const timeMilestones = $derived(computeTimeMilestones(serviceIntervals, $events, $latestOdometer.km, $dailyAverageKm));

	type NextMilestoneInfo = { type: 'km'; ms: ServiceMilestone } | { type: 'time'; tm: TimeMilestone };

	const nextMilestone = $derived.by((): NextMilestoneInfo | null => {
		const odoKm = $latestOdometer.km;
		if (odoKm <= 0) return null;
		const kmBased: NextMilestoneInfo[] = [...mfrMilestones, ...recMilestones]
			.filter((ms) => ms.km > odoKm)
			.map((ms) => ({ type: 'km' as const, ms }));
		const timeBased: NextMilestoneInfo[] = timeMilestones
			.filter((tm) => tm.status !== 'covered')
			.map((tm) => ({ type: 'time' as const, tm }));
		const all = [...kmBased, ...timeBased].sort((a, b) => {
			const aKm = a.type === 'km' ? a.ms.km : a.tm.estimatedKm;
			const bKm = b.type === 'km' ? b.ms.km : b.tm.estimatedKm;
			return aKm - bKm;
		});
		return all[0] ?? null;
	});

	const outstandingTasks = $derived.by(() => {
		const odoKm = $latestOdometer.km;
		if (odoKm <= 0) return [];
		const seen = new Set<string>();
		const result: string[] = [];
		const allMs = [...mfrMilestones, ...recMilestones];
		for (const ms of allMs) {
			if (ms.km > odoKm) continue;
			const stats = milestoneTaskStatuses(ms, $events, odoKm, serviceIntervals);
			for (const ts of stats) {
				if (ts.status === 'red' && !seen.has(ts.task)) {
					seen.add(ts.task);
					result.push(ts.task);
				}
			}
		}
		return result;
	});

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
			const odoKm = $latestOdometer.km;
			all = all.filter((e) => deriveStatus(e, odoKm) === $statusFilter);
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

	const ATTACH_TOLERANCE_KM = 1000;

	const timelineEntries = $derived.by(() => {
		const entries: TimelineEntry[] = [];
		const odoKm = $latestOdometer.km;

		const allMilestones: ServiceMilestone[] = [];
		if (showMfr) allMilestones.push(...mfrMilestones);
		if (showRec) {
			for (const ms of recMilestones) {
				const stats = milestoneTaskStatuses(ms, $events, odoKm, serviceIntervals);
				const card = milestoneCardStatus(stats);
				if (card === 'covered' || card === 'amber' || card === 'red' || ms.km > odoKm) {
					allMilestones.push(ms);
				}
			}
		}

		const attachedMsIds = new Set<string>();
		const eventEntries: TimelineEntry[] = sortedEvents.map((evt) => {
			const evtKm = evt.km ?? 0;
			const matched: ServiceMilestone[] = [];
			if (evt.completed && evtKm > 0) {
				const rawEvtTasks = (evt.tasks && evt.tasks.length > 0 ? evt.tasks : [evt.event])
					.map((t) => t.toLowerCase().trim());
				const evtTasks = new Set([
					...rawEvtTasks,
					...rawEvtTasks.map((t) => 'check ' + t)
				]);
				for (const ms of allMilestones) {
					const stats = milestoneTaskStatuses(ms, $events, odoKm, serviceIntervals);
					const card = milestoneCardStatus(stats);
					if (card !== 'covered' || Math.abs(ms.km - evtKm) > ATTACH_TOLERANCE_KM) continue;
					const hasOverlap = ms.tasks.some((t) => evtTasks.has(t.toLowerCase().trim()));
					if (hasOverlap) {
						matched.push(ms);
						attachedMsIds.add(`${ms.kind}-${ms.km}`);
					}
				}
			}
			return {
				kind: 'event' as const, evt, km: evtKm, sortDate: evt.date || '',
				coveredMilestones: matched.length > 0 ? matched : undefined
			};
		});

		const combined: TimelineEntry[] = [...eventEntries];
		for (const ms of allMilestones) {
			if (!attachedMsIds.has(`${ms.kind}-${ms.km}`)) {
				combined.push({ kind: 'milestone', milestone: ms, km: ms.km, sortDate: '' });
			}
		}

		if (showMfr) {
			for (const tm of timeMilestones.filter((t) => t.kind === 'mfr')) {
				combined.push({ kind: 'time-milestone', timeMilestone: tm, km: tm.estimatedKm, sortDate: '' });
			}
		}
		if (showRec) {
			for (const tm of timeMilestones.filter((t) => t.kind === 'rec')) {
				combined.push({ kind: 'time-milestone', timeMilestone: tm, km: tm.estimatedKm, sortDate: '' });
			}
		}

		combined.sort((a, b) => {
			if (a.km !== b.km) return a.km - b.km;
			const isMs = (k: string) => k === 'milestone' || k === 'time-milestone';
			if (isMs(a.kind) && !isMs(b.kind)) return 1;
			if (!isMs(a.kind) && isMs(b.kind)) return -1;
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
					<a class="odo-marker" href="{base}/timeline/new?km={$latestOdometer.km}">
						{#if nextMilestone?.type === 'km'}
							{@const remaining = nextMilestone.ms.km - $latestOdometer.km}
							{#if remaining > 0}
								<span class="odo-label">In {remaining.toLocaleString()} km</span>
								<span class="odo-action">{milestoneActionText(nextMilestone.ms.tasks)}</span>
							{:else}
								<span class="odo-overdue">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
							{/if}
						{:else if nextMilestone?.type === 'time'}
							{@const dueDate = new Date(nextMilestone.tm.dueDate + '-01T00:00:00')}
							<span class="odo-label">{dueDate.getFullYear()} {dueDate.toLocaleString('en', { month: 'long' })}</span>
							<span class="odo-action">{capitalizeTask(nextMilestone.tm.task)}</span>
						{:else}
							<span class="odo-label">You are here</span>
						{/if}
						{#if outstandingTasks.length > 0}
							<div class="odo-attention">
								<span class="odo-attention-title">Needs attention</span>
								<ul class="odo-attention-list">
									{#each outstandingTasks as task}
										<li>{capitalizeTask(task)}</li>
									{/each}
								</ul>
							</div>
						{/if}
						<span class="odo-tap-hint">Tap to add entry</span>
					</a>
					</div>
		{:else if entry.kind === 'milestone' && entry.milestone}
			{@const ms = entry.milestone}
			{@const taskStats = milestoneTaskStatuses(ms, $events, $latestOdometer.km, serviceIntervals)}
			{@const cardStatus = milestoneCardStatus(taskStats)}
			<div class="tl-row" style="margin-top: {gap}px">
				<div class="tl-ruler">
					<div class="ruler-line ruler-line-ms"></div>
					<div class="ruler-km ms-km">{ms.km.toLocaleString()}</div>
					<div class="ruler-dot ms-dot" class:ms-dot-covered={cardStatus === 'covered'} class:ms-dot-amber={cardStatus === 'amber'} class:ms-dot-red={cardStatus === 'red'}></div>
					<div class="ruler-line ruler-line-ms"></div>
				</div>
				<a
					href="{base}/timeline/service?kind={ms.kind}&km={ms.km}"
					class="ms-card"
					class:ms-card-covered={cardStatus === 'covered'}
					class:ms-card-amber={cardStatus === 'amber'}
					class:ms-card-red={cardStatus === 'red'}
				>
					<div class="ms-card-header">
						<span class="ms-category-label">
							{ms.kind === 'mfr' ? 'OEM Service' : 'Recommended'}
						</span>
						{#if cardStatus === 'covered'}
							<span class="ms-status-label" style="color: #34c759">OK</span>
						{:else if cardStatus === 'amber' || cardStatus === 'red'}
							{@const worst = taskStats.reduce((a, b) => b.overdueKm > a.overdueKm ? b : a)}
							<span class="ms-status-label" style="color: {cardStatus === 'red' ? '#ff3b30' : '#ff9500'}">Overdue {worst.overdueKm.toLocaleString()} km</span>
						{/if}
					</div>
					<div class="ms-task-list">
						{#each taskStats as ts}
							<span class="ms-task-item ms-task-{ts.status}">{ts.task}</span>
						{/each}
					</div>
					{#if ms.km > $latestOdometer.km && $dailyAverageKm > 0}
						{@const daysAway = (ms.km - $latestOdometer.km) / $dailyAverageKm}
						{@const est = new Date(Date.now() + daysAway * 86400000)}
						<span class="ms-estimate">~{est.getFullYear()} {est.toLocaleString('en', { month: 'long' })}</span>
					{/if}
				</a>
			</div>
		{:else if entry.kind === 'time-milestone' && entry.timeMilestone}
			{@const tm = entry.timeMilestone}
			{@const dueDate = new Date(tm.dueDate + '-01T00:00:00')}
			{@const dueDateLabel = `${dueDate.getFullYear()} ${dueDate.toLocaleString('en', { month: 'long' })}`}
			<div class="tl-row" style="margin-top: {gap}px">
				<div class="tl-ruler">
					<div class="ruler-line ruler-line-ms"></div>
					<div class="ruler-km ms-km">~{tm.estimatedKm.toLocaleString()}</div>
					<div class="ruler-dot ms-dot" class:ms-dot-covered={tm.status === 'covered'}></div>
					<div class="ruler-line ruler-line-ms"></div>
				</div>
				<div
					class="ms-card"
					class:ms-card-covered={tm.status === 'covered'}
				>
					<div class="ms-card-header">
						<span class="ms-category-label">
							{tm.kind === 'mfr' ? 'OEM Service' : 'Recommended'}
						</span>
						{#if tm.status === 'covered'}
							<span class="ms-status-label" style="color: #34c759">OK</span>
						{:else if tm.status === 'overdue'}
							<span class="ms-status-label" style="color: #ff3b30">Overdue</span>
						{/if}
					</div>
					<div class="ms-task-list">
						<span class="ms-task-item ms-task-{tm.status === 'covered' ? 'covered' : 'scheduled'}">{tm.task}</span>
					</div>
					<span class="ms-estimate">{dueDateLabel}</span>
				</div>
			</div>
		{:else if entry.evt}
			{@const evt = entry.evt}
			{@const status = deriveStatus(evt, $latestOdometer.km)}
			{@const isNext = evt.id === nextId}
			{@const isFocus = focusId ? evt.id === focusId : false}
			{@const isExpanded = expandedIds.has(evt.id)}
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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="tl-card-wrapper" onclick={(e) => { if (e.target instanceof HTMLElement && e.target.closest('.tl-detail')) return; toggleExpand(evt.id); }}>
						<div class="tl-card" class:tl-card-next={isNext} class:tl-card-expanded={isExpanded}>
						<div class="tl-card-header">
							<span class="category-label">
								{categoryLabel(eventCategory(evt.event, evt.category))}
							</span>
							{#if status === 'completed'}
								{@const quality = completionQuality(evt)}
								<span class="status-label" style="color: {quality === 'green' ? '#34c759' : quality === 'amber' ? '#ff9500' : '#ff3b30'}">
									{quality === 'green' ? 'OK' : quality === 'amber' ? 'No Receipt' : 'Overdue'}
								</span>
							{:else if status === 'overdue'}
								<span class="status-label" style="color: #ff3b30">
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
							{#if entry.coveredMilestones && entry.coveredMilestones.length > 0}
								<div class="covered-milestones">
									{#each entry.coveredMilestones as cms}
										<a href="{base}/timeline/service?kind={cms.kind}&km={cms.km}" class="covered-ms-row">
											<span class="covered-ms-label">
												{cms.kind === 'mfr' ? 'OEM Service' : 'Recommended'}
											</span>
										</a>
									{/each}
								</div>
							{/if}
						</div>
						{#if isExpanded}
							<div class="tl-detail">
								{#if evt.notes}
									<div class="detail-section">
										<span class="detail-label">Notes</span>
										<p class="detail-text">{evt.notes}</p>
									</div>
								{/if}
							{#if evt.receipts && evt.receipts.length > 0}
									<div class="detail-section">
										<span class="detail-label">Receipts</span>
										<div class="detail-receipts">
											{#each evt.receipts as r}
												<a href={receiptUrl(r)} target="_blank" rel="noopener noreferrer" class="receipt-link">
													{receiptName(r)}
												</a>
											{/each}
										</div>
									</div>
								{/if}
								<div class="detail-actions">
									<a href="{base}/timeline/{evt.id}" class="detail-btn detail-btn-edit">Edit</a>
									{#if !evt.receipts || evt.receipts.length === 0}
										<a href="{base}/timeline/{evt.id}" class="detail-btn detail-btn-receipt">Add Receipt</a>
									{/if}
								</div>
							</div>
						{/if}
					</div>
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
		border: 2px solid var(--color-text);
		border-radius: var(--radius-md);
		margin-left: 8px;
	}

	.odo-label {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text);
	}

	.odo-remaining {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	a.odo-marker {
		text-decoration: none;
		color: inherit;
	}

	.odo-action {
		font-size: 12px;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.odo-tap-hint {
		display: block;
		margin-top: 8px;
		font-size: 11px;
		color: var(--color-accent);
		opacity: 0.7;
	}

	.odo-attention {
		margin-top: 8px;
	}

	.odo-attention-title {
		font-size: 12px;
		font-weight: 700;
		color: #ff3b30;
	}

	.odo-attention-list {
		margin: 4px 0 0;
		padding: 0 0 0 16px;
		font-size: 12px;
		color: #ff3b30;
		line-height: 1.5;
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
	.tl-card-wrapper {
		flex: 1;
		margin-left: 8px;
		cursor: pointer;
	}

	.tl-card {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 12px 14px;
		text-decoration: none;
		color: var(--color-text);
		transition: box-shadow 0.2s, border-radius 0.2s;
	}

	.tl-card:active {
		box-shadow: var(--shadow-md);
	}

	.tl-card-expanded {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom-color: transparent;
	}

	.tl-card-next {
		border-color: var(--color-accent);
		border-width: 2px;
		padding: 14px 16px;
		box-shadow: 0 2px 12px rgba(0, 113, 227, 0.15);
	}

	.tl-card-next.tl-card-expanded {
		border-bottom-color: transparent;
	}

	/* ---- Accordion detail panel ---- */
	.tl-detail {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-top: none;
		border-radius: 0 0 var(--radius-md) var(--radius-md);
		padding: 12px 14px;
		cursor: default;
	}

	.detail-section {
		margin-bottom: 10px;
	}

	.detail-section:last-of-type {
		margin-bottom: 12px;
	}

	.detail-label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
		margin-bottom: 3px;
	}

	.detail-text {
		font-size: 13px;
		color: var(--color-text);
		line-height: 1.5;
		margin: 0;
		white-space: pre-wrap;
	}

	.detail-value {
		font-size: 13px;
		color: var(--color-text);
	}

	.detail-tasks {
		margin: 0;
		padding: 0 0 0 18px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--color-text);
	}

	.detail-receipts {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.receipt-link {
		font-size: 13px;
		color: var(--color-accent);
		text-decoration: none;
		word-break: break-all;
	}

	.receipt-link:hover {
		text-decoration: underline;
	}

	.detail-actions {
		display: flex;
		gap: 8px;
		padding-top: 4px;
		border-top: 1px solid var(--color-border);
	}

	.detail-btn {
		font-size: 13px;
		font-weight: 600;
		padding: 6px 16px;
		border-radius: 8px;
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.detail-btn:active {
		opacity: 0.7;
	}

	.detail-btn-edit {
		background: var(--color-accent);
		color: white;
	}

	.detail-btn-receipt {
		background: var(--color-surface);
		color: var(--color-accent);
		border: 1px solid var(--color-accent);
	}

	.tl-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.category-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.status-label {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
		flex-shrink: 0;
		text-transform: uppercase;
		letter-spacing: 0.3px;
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

	.covered-milestones {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px dashed var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.covered-ms-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		text-decoration: none;
		color: inherit;
	}

	.covered-ms-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.covered-ms-check {
		font-size: 12px;
		font-weight: 700;
		color: #34c759;
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
		display: block;
		background: transparent;
		border: 1px dashed #c7c7cc;
		border-radius: var(--radius-md);
		padding: 12px 14px;
		margin-left: 8px;
		text-decoration: none;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.15s;
	}

	.ms-card:hover, .ms-card:active {
		background: rgba(142, 142, 147, 0.1);
	}

	.ms-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.ms-category-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.ms-status-label {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
		flex-shrink: 0;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.ms-task-list {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 6px;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.4;
		text-transform: capitalize;
	}

	.ms-task-item {
		white-space: nowrap;
	}

	.ms-task-covered { color: var(--color-text-secondary); }
	.ms-task-scheduled { color: var(--color-text); }

	.ms-estimate {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: var(--color-text-secondary);
		font-style: italic;
	}
	.ms-task-amber { color: #f59e0b; }
	.ms-task-red { color: #ff3b30; }

	.ms-card-covered {
		border-color: #8e8e93;
		opacity: 0.6;
	}

	.ms-card-amber {
		border-color: #c7c7cc;
		border-style: solid;
	}

	.ms-card-red {
		border-color: #c7c7cc;
		border-style: solid;
	}

	.ms-dot-covered {
		background: #8e8e93 !important;
		border-style: solid !important;
	}

	.ms-dot-amber {
		background: #f59e0b !important;
		border-color: #f59e0b !important;
		border-style: solid !important;
	}

	.ms-dot-red {
		background: #ff3b30 !important;
		border-color: #ff3b30 !important;
		border-style: solid !important;
	}

	.ms-covered-mark {
		color: #8e8e93;
		font-size: 14px;
		font-weight: 700;
		flex-shrink: 0;
	}

	.ms-overdue-label {
		font-size: 10px;
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.ms-overdue-amber { color: #f59e0b; }
	.ms-overdue-red { color: #ff3b30; }

	.loading, .empty-state, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
