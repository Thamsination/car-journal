<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		session, events, totalSpent, totalPlanned, costByCategory,
		nextBatchEvents, latestOdometer, lastCompletedKm, dailyAverageKm,
		nextScheduledEvent,
		vehicleConfig, healthIntervals, tireConfig, tireStatus, platformConfig
	} from '$lib/stores';
	import { saveVehicleConfig } from '$lib/data';
	import {
		formatCost, formatDateISO, deriveStatus, statusColor,
		eventCategory, categoryLabel, categoryColor,
		computeMfrMilestones, computeRecMilestones, computeTimeMilestones,
		milestoneTaskStatuses, milestoneCardStatus, milestoneActionText, capitalizeTask,
		getServiceIntervals, isEffectivelyCompleted
	} from '$lib/utils';
	import type { TimeMilestone } from '$lib/utils';
	import type { CarEvent, DerivedStatus, ServiceInterval, ServiceMilestone } from '$lib/types';

	let editingOdo = $state(false);
	let odoInput = $state('');
	let odoInputEl = $state<HTMLInputElement | null>(null);

	const loading = $derived(!$session || ($events.length === 0 && !$vehicleConfig));

	onMount(() => {
		if (!$session) {
			goto(`${base}/setup`);
		}
	});

	const serviceIntervals = $derived(getServiceIntervals($platformConfig, $vehicleConfig?.transmission));

	function vehicleDisplayName(v: typeof $vehicleConfig): string {
		if (!v) return 'Vehicle';
		return v.name || v.model || 'Vehicle';
	}

	function vehicleSubtitle(v: typeof $vehicleConfig): string {
		if (!v) return '';
		return [v.year, v.make, v.model].filter(Boolean).join(', ');
	}

	const transmissionLabels: Record<string, string> = {
		manual: 'Manual', automatic: 'Auto', cvt: 'CVT', dct: 'DCT', ev: 'EV'
	};

	function driveLabel(dt: string): string {
		const val = (dt || '').toUpperCase();
		if (['AWD', 'FWD', 'RWD'].includes(val)) return val;
		const awd = ['xdrive', 'quattro', '4wd', '4matic', '4motion', 'sh-awd'];
		if (awd.includes(dt.toLowerCase())) return 'AWD';
		return '2WD';
	}

	function engineLabel(v: typeof $vehicleConfig): string {
		const disp = v?.displacement ?? $platformConfig?.displacement;
		const cyl = v?.cylinders ?? $platformConfig?.cylinders;
		if (disp && cyl) return `${disp} ${cyl}-cyl`;
		if (disp) return disp;
		return v?.engine ?? '';
	}

	function vehicleTechLine(v: typeof $vehicleConfig): string {
		if (!v) return '';
		const transLabel = v.transmission ? transmissionLabels[v.transmission] ?? '' : '';
		return [v.chassis, engineLabel(v), driveLabel(v.drivetrain), transLabel].filter(Boolean).join(', ');
	}

	async function startOdoEdit() {
		odoInput = $latestOdometer.km > 0 ? $latestOdometer.km.toString() : '';
		editingOdo = true;
		await tick();
		odoInputEl?.focus();
		odoInputEl?.select();
	}

	function saveOdo() {
		const val = parseInt(odoInput, 10);
		if (!isNaN(val) && val > 0 && $vehicleConfig) {
			$vehicleConfig = { ...$vehicleConfig, odometer: val };
			saveVehicleConfig($vehicleConfig, 'Update odometer').catch(() => {});
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

	// Health summary
	const WARNING_THRESHOLD = 0.8;

	function findLastService(interval: ServiceInterval): CarEvent | null {
		const odoKm = $latestOdometer.km;
		const matches = $events.filter((e) => {
			if (!isEffectivelyCompleted(e, odoKm)) return false;
			const tasks = e.tasks ?? [e.event];
			return tasks.some((t) =>
				interval.taskMatches.some((m) => t.toLowerCase().includes(m.toLowerCase()))
			);
		});
		matches.sort((a, b) => (b.km ?? 0) - (a.km ?? 0));
		return matches[0] ?? null;
	}

	const overdueCount = $derived.by(() => {
		const odoKm = $latestOdometer.km;
		const now = Date.now();
		let count = 0;
		for (const interval of $healthIntervals) {
			const lastEvent = findLastService(interval);
			if (!lastEvent) {
				const firstDueKm = interval.intervalKm ?? Infinity;
				if (odoKm > 0 && odoKm >= firstDueKm) count++;
				continue;
			}
			const lastKm = lastEvent.km ?? null;
			const lastDate = lastEvent.date ?? '';
			if (interval.intervalKm && lastKm !== null && odoKm > 0) {
				if (lastKm + interval.intervalKm - odoKm < 0) { count++; continue; }
			}
			if (interval.intervalMonths && lastDate) {
				const lastMs = new Date(lastDate + 'T00:00:00').getTime();
				const intervalMs = interval.intervalMonths * 30.44 * 86400000;
				if (Math.round((lastMs + intervalMs - now) / 86400000) < 0) { count++; continue; }
			}
		}
		return count;
	});

	const warningCount = $derived.by(() => {
		const odoKm = $latestOdometer.km;
		const now = Date.now();
		let count = 0;
		for (const interval of $healthIntervals) {
			const lastEvent = findLastService(interval);
			if (!lastEvent) {
				const firstDueKm = interval.intervalKm ?? Infinity;
				if (odoKm > 0 && odoKm >= firstDueKm) continue; // already overdue
				if (odoKm > 0 && interval.intervalKm && odoKm >= firstDueKm * WARNING_THRESHOLD) count++;
				continue;
			}
			const lastKm = lastEvent.km ?? null;
			const lastDate = lastEvent.date ?? '';
			let isOverdue = false;
			let isWarning = false;
			if (interval.intervalKm && lastKm !== null && odoKm > 0) {
				const remaining = lastKm + interval.intervalKm - odoKm;
				const usedPct = Math.min(1, Math.max(0, (odoKm - lastKm) / interval.intervalKm));
				if (remaining < 0) isOverdue = true;
				else if (usedPct >= WARNING_THRESHOLD) isWarning = true;
			}
			if (interval.intervalMonths && lastDate) {
				const lastMs = new Date(lastDate + 'T00:00:00').getTime();
				const intervalMs = interval.intervalMonths * 30.44 * 86400000;
				const remainingDays = Math.round((lastMs + intervalMs - now) / 86400000);
				const usedTimePct = Math.min(1, Math.max(0, (now - lastMs) / intervalMs));
				if (remainingDays < 0) isOverdue = true;
				else if (usedTimePct >= WARNING_THRESHOLD) isWarning = true;
			}
			if (!isOverdue && isWarning) count++;
		}
		return count;
	});

	const overallHealth = $derived.by(() => {
		if (overdueCount > 0 || $tireStatus.health === 'overdue') return 'bad' as const;
		if (warningCount > 0 || $tireStatus.health === 'warning') return 'okay' as const;
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

	// Milestones
	const mfrMilestones = $derived(computeMfrMilestones($events, serviceIntervals, $latestOdometer.km));
	const recMilestones = $derived(computeRecMilestones($events, serviceIntervals, $latestOdometer.km));
	const timeMilestones = $derived(computeTimeMilestones(serviceIntervals, $events, $latestOdometer.km, $dailyAverageKm));

	type FutureMilestone = { type: 'km'; ms: ServiceMilestone } | { type: 'time'; tm: TimeMilestone };

	const futureMilestones = $derived.by((): FutureMilestone[] => {
		const odoKm = $latestOdometer.km;
		if (odoKm <= 0) return [];
		const kmBased: FutureMilestone[] = [...mfrMilestones, ...recMilestones]
			.filter((ms) => ms.km > odoKm)
			.map((ms) => ({ type: 'km' as const, ms }));
		const timeBased: FutureMilestone[] = timeMilestones
			.filter((tm) => tm.status !== 'covered')
			.map((tm) => ({ type: 'time' as const, tm }));
		return [...kmBased, ...timeBased].sort((a, b) => {
			const aKm = a.type === 'km' ? a.ms.km : a.tm.estimatedKm;
			const bKm = b.type === 'km' ? b.ms.km : b.tm.estimatedKm;
			return aKm - bKm;
		});
	});

	const nextMilestone = $derived(futureMilestones[0] ?? null);
	const nextMilestoneCard = $derived(futureMilestones[1] ?? null);

	function smartStatusText(evt: CarEvent, status: DerivedStatus, odoKm: number): string {
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
</script>

<svelte:head>
	<title>Dashboard — Car Journal</title>
</svelte:head>

<div class="container">
	{#if loading}
		<div class="loading">Loading dashboard...</div>
	{:else}
		<!-- 1. Vehicle Info + Odometer + Health -->
		<div class="hero-card">
			<div class="vehicle-header">
				<div class="vehicle-identity">
					<h2 class="vehicle-name">{vehicleDisplayName($vehicleConfig)}</h2>
					{#if $vehicleConfig}
						<span class="vehicle-detail">{vehicleSubtitle($vehicleConfig)}</span>
						<span class="vehicle-tech">{vehicleTechLine($vehicleConfig)}</span>
					{/if}
				</div>
			{#if overallHealth === 'good'}
				<span class="health-badge" style="color: {overallColors[overallHealth]}">Good</span>
			{:else}
				<a href="{base}/car" class="health-badge health-badge-link" style="color: {overallColors[overallHealth]}">
					{overallHealth === 'okay' ? 'Attention' : 'Overdue'}
				</a>
			{/if}
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
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="odometer" onclick={startOdoEdit}>
					<span class="odo-value">
						{$latestOdometer.source === 'estimated' ? '~' : ''}{$latestOdometer.km.toLocaleString()}{$latestOdometer.source === 'event' ? '+' : ''}
					</span>
					<span class="odo-unit">km</span>
				</div>
			{/if}
			{#if $latestOdometer.source === 'manual'}
				<span class="odo-source">Tap to set km</span>
			{:else if $latestOdometer.source === 'estimated' && $dailyAverageKm > 0}
				<span class="odo-source">Estimated · {$dailyAverageKm} km/day avg</span>
			{:else if $latestOdometer.source === 'event'}
				<span class="odo-source">Based on last completed event</span>
			{:else}
				<span class="odo-source">Tap to set km</span>
			{/if}
			<p class="health-summary">{healthSummary}</p>
		</div>

		<!-- 3. Next Milestone -->
		<h3 class="section-title">Next Milestone</h3>
		<a href="{base}/timeline" class="here-card">
			{#if nextMilestone?.type === 'km'}
				{@const remaining = nextMilestone.ms.km - $latestOdometer.km}
				{#if remaining > 0}
					<span class="here-label">In {remaining.toLocaleString()} km</span>
					<span class="here-action">{milestoneActionText(nextMilestone.ms.tasks)}</span>
				{:else}
					<span class="here-overdue">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
				{/if}
			{:else if nextMilestone?.type === 'time'}
				{@const dueDate = new Date(nextMilestone.tm.dueDate + '-01T00:00:00')}
				<span class="here-label">{dueDate.getFullYear()} {dueDate.toLocaleString('en', { month: 'long' })}</span>
				<span class="here-action">{capitalizeTask(nextMilestone.tm.task)}</span>
			{:else}
				<span class="here-label">You are here</span>
			{/if}
		</a>

		<!-- 4. Upcoming Milestone -->
		<h3 class="section-title">Upcoming Milestone</h3>
		{#if nextMilestoneCard?.type === 'km'}
			{@const ms = nextMilestoneCard.ms}
			{@const stats = milestoneTaskStatuses(ms, $events, $latestOdometer.km, serviceIntervals)}
			{@const cardStatus = milestoneCardStatus(stats)}
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
						{@const worst = stats.reduce((a, b) => b.overdueKm > a.overdueKm ? b : a)}
						<span class="ms-status-label" style="color: {cardStatus === 'red' ? '#ff3b30' : '#ff9500'}">Overdue {worst.overdueKm.toLocaleString()} km</span>
					{/if}
				</div>
				<span class="ms-km-label">{ms.km.toLocaleString()} km</span>
				<div class="ms-task-list">
					{#each stats as ts}
						<span class="ms-task-item ms-task-{ts.status}">{ts.task}</span>
					{/each}
				</div>
				{#if ms.km > $latestOdometer.km && $dailyAverageKm > 0}
					{@const daysAway = (ms.km - $latestOdometer.km) / $dailyAverageKm}
					{@const est = new Date(Date.now() + daysAway * 86400000)}
					<span class="ms-estimate">~{est.getFullYear()} {est.toLocaleString('en', { month: 'long' })}</span>
				{/if}
			</a>
		{:else if nextMilestoneCard?.type === 'time'}
			{@const tm = nextMilestoneCard.tm}
			{@const dueDate = new Date(tm.dueDate + '-01T00:00:00')}
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
				<span class="ms-km-label">~{tm.estimatedKm.toLocaleString()} km</span>
				<div class="ms-task-list">
					<span class="ms-task-item ms-task-scheduled">{tm.task}</span>
				</div>
				<span class="ms-estimate">{dueDate.getFullYear()} {dueDate.toLocaleString('en', { month: 'long' })}</span>
			</div>
		{/if}

		<!-- 5. Next Scheduled -->
		{#if $nextScheduledEvent}
			{@const nse = $nextScheduledEvent}
			{@const nseStatus = deriveStatus(nse, $latestOdometer.km)}
			{@const nseText = smartStatusText(nse, nseStatus, $latestOdometer.km)}
			<section class="section">
				<h3 class="section-title">Next Scheduled</h3>
				<a href="{base}/timeline/{nse.id}" class="event-card">
					<div class="event-header">
						<span
						class="category-label"
						style="color: {categoryColor(eventCategory(nse.event, nse.category))}"
					>
						{categoryLabel(eventCategory(nse.event, nse.category))}
						</span>
						<span class="status-text" style="color: {statusColor(nseStatus)}">
							{nseText}
						</span>
					</div>
					<h3 class="event-title">{nse.event}</h3>
					<div class="event-meta">
						{#if nse.km}
							<span class="meta-item">{nse.km.toLocaleString()} km</span>
						{/if}
						{#if nse.provider}
							<span class="meta-item">{nse.provider}</span>
						{/if}
						{#if nse.cost > 0}
							<span class="meta-cost">{formatCost(nse.cost)}</span>
						{/if}
					</div>
					{#if $latestOdometer.km > 0 && nse.km}
						{@const remaining = nse.km - $latestOdometer.km}
						{@const totalWindow = nse.km - $lastCompletedKm}
						{@const driven = $latestOdometer.km - $lastCompletedKm}
						{#if remaining > 0}
							{@const remainPct = totalWindow > 0 ? Math.max(0, 1 - driven / totalWindow) : 0.95}
							<div class="km-remaining">
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {remainPct * 100}%; background: {remainPct > 0.3 ? '#34c759' : remainPct > 0.1 ? '#ff9500' : '#ff3b30'}"
									></div>
								</div>
								<span class="remaining-text">{remaining.toLocaleString()} km remaining</span>
							</div>
						{:else}
							<span class="overdue-text">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
						{/if}
					{/if}
				</a>
			</section>
		{/if}

		<!-- 6. Upcoming Services batch -->
		{#if $nextBatchEvents.length > 0}
			<section class="section">
				<h3 class="section-title">Upcoming Services — {$nextBatchEvents[0].km?.toLocaleString()} km</h3>
				<div class="card-list">
					{#each $nextBatchEvents as evt}
						{@const evtStatus = deriveStatus(evt, $latestOdometer.km)}
						{@const evtText = smartStatusText(evt, evtStatus, $latestOdometer.km)}
						<a href="{base}/timeline/{evt.id}" class="event-card">
							<div class="event-header">
								<span
								class="category-label"
								style="color: {categoryColor(eventCategory(evt.event, evt.category))}"
							>
								{categoryLabel(eventCategory(evt.event, evt.category))}
								</span>
								<span class="status-text" style="color: {statusColor(evtStatus)}">
									{evtText}
								</span>
							</div>
							<h3 class="event-title">{evt.event}</h3>
							<div class="event-meta">
								{#if evt.km}
									<span class="meta-item">{evt.km.toLocaleString()} km</span>
								{/if}
								{#if evt.provider}
									<span class="meta-item">{evt.provider}</span>
								{/if}
								{#if evt.cost > 0}
									<span class="meta-cost">{formatCost(evt.cost)}</span>
								{/if}
							</div>
							{#if $latestOdometer.km > 0 && evt.km}
								{@const remaining = evt.km - $latestOdometer.km}
								{@const totalWindow = evt.km - $lastCompletedKm}
								{@const driven = $latestOdometer.km - $lastCompletedKm}
								{#if remaining > 0}
									{@const remainPct = totalWindow > 0 ? Math.max(0, 1 - driven / totalWindow) : 0.95}
									<div class="km-remaining">
										<div class="progress-bar">
											<div
												class="progress-fill"
												style="width: {remainPct * 100}%; background: {remainPct > 0.3 ? '#34c759' : remainPct > 0.1 ? '#ff9500' : '#ff3b30'}"
											></div>
										</div>
										<span class="remaining-text">{remaining.toLocaleString()} km remaining</span>
									</div>
								{:else}
									<span class="overdue-text">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
								{/if}
							{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- 7. Cost Breakdown -->
		{#if $costByCategory.length > 0 || $totalPlanned > 0}
			<section class="section">
				<h3 class="section-title">Cost Breakdown</h3>
				<div class="breakdown-list">
					{#each $costByCategory as cat}
						<div class="breakdown-row">
							<span class="breakdown-name">{cat.name}</span>
							<span class="breakdown-value">{formatCost(cat.total)}</span>
						</div>
					{/each}
					{#if $totalPlanned > 0}
						<div class="breakdown-row planned">
							<span class="breakdown-name">Planned (upcoming)</span>
							<span class="breakdown-value">{formatCost($totalPlanned)}</span>
						</div>
					{/if}
					<div class="breakdown-row total-row">
						<span class="breakdown-name">Total Spent</span>
						<span class="breakdown-value">{formatCost($totalSpent)}</span>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	/* Vehicle hero card */
	.hero-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 20px 16px 16px;
		text-align: center;
		margin-bottom: 12px;
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

	.vehicle-tech {
		display: block;
		font-size: 11px;
		color: var(--color-text-secondary);
		opacity: 0.7;
		margin-top: 1px;
	}

	.health-badge {
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
		text-decoration: none;
		flex-shrink: 0;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.health-summary {
		margin-top: 10px;
		font-size: 13px;
		line-height: 1.4;
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
		border-bottom: 2px solid var(--color-accent);
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

	/* You are here card */
	.here-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin-bottom: 12px;
		text-decoration: none;
		color: inherit;
	}

	.here-header {
		margin-bottom: 2px;
	}

	.here-km {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-secondary);
	}

	.here-label {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text);
	}

	.here-action {
		font-size: 12px;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.here-overdue {
		font-size: 12px;
		color: var(--color-danger);
		font-weight: 600;
	}

	.here-tap-hint {
		display: block;
		margin-top: 8px;
		font-size: 11px;
		color: var(--color-accent);
		opacity: 0.7;
	}

	/* Milestone card */
	.ms-card {
		display: block;
		background: transparent;
		border: 1px dashed #c7c7cc;
		border-radius: var(--radius-md);
		padding: 12px 14px;
		margin-bottom: 24px;
		text-decoration: none;
		color: var(--color-text);
		transition: background 0.15s;
	}

	.ms-card:active {
		background: rgba(142, 142, 147, 0.1);
	}

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

	.ms-km-label {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 4px;
		display: block;
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
	.ms-task-amber { color: #f59e0b; }
	.ms-task-red { color: #ff3b30; }

	.ms-estimate {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.ms-overdue-amber { color: #f59e0b; }
	.ms-overdue-red { color: #ff3b30; }

	/* Sections */
	.section {
		margin-bottom: 24px;
	}

	.section-title {
		font-size: 15px;
		font-weight: 700;
		margin-bottom: 10px;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.event-card {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		text-decoration: none;
		color: var(--color-text);
		transition: box-shadow 0.2s;
	}

	.event-card:active {
		box-shadow: var(--shadow-md);
	}

	.event-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.category-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.status-text {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	.event-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 6px;
	}

	.event-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		font-size: 13px;
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

	.km-remaining {
		margin-top: 8px;
	}

	.progress-bar {
		height: 4px;
		background: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 4px;
	}

	.progress-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.3s;
	}

	.remaining-text {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.overdue-text {
		font-size: 12px;
		color: var(--color-danger);
		font-weight: 600;
		margin-top: 4px;
		display: block;
	}

	.card-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.breakdown-list {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.breakdown-row {
		display: flex;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-border);
		font-size: 14px;
	}

	.breakdown-row:last-child {
		border-bottom: none;
	}

	.breakdown-name {
		color: var(--color-text-secondary);
	}

	.breakdown-value {
		font-weight: 600;
	}

	.breakdown-row.planned {
		opacity: 0.7;
		font-style: italic;
	}

	.breakdown-row.total-row {
		background: var(--color-surface-raised);
		font-weight: 700;
	}

	.breakdown-row.total-row .breakdown-name {
		color: var(--color-text);
		font-weight: 700;
	}

	.loading {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
