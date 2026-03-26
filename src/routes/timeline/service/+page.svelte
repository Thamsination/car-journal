<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { events } from '$lib/stores';
	import { computeMfrMilestones, computeRecMilestones, milestoneId, SERVICE_NOTES } from '$lib/utils';
	import type { ServiceMilestone } from '$lib/types';

	const kind = $derived($page.url.searchParams.get('kind') as 'mfr' | 'rec' | null);
	const km = $derived(Number($page.url.searchParams.get('km')) || 0);

	const milestone = $derived.by(() => {
		if (!kind || !km) return null;
		const all = kind === 'mfr'
			? computeMfrMilestones($events)
			: computeRecMilestones($events);
		return all.find((ms) => ms.km === km) ?? null;
	});

	const kindLabel = $derived(kind === 'mfr' ? 'Manufacturer' : 'Recommended');
	const kindBadge = $derived(kind === 'mfr' ? 'MFR' : 'REC');
</script>

<svelte:head>
	<title>{kindBadge} Service — {km.toLocaleString()} km</title>
</svelte:head>

<div class="container">
	<div class="top-bar">
		<button class="back-btn" onclick={() => history.back()}>← Back</button>
	</div>

	{#if !milestone}
		<div class="empty-state">Milestone not found</div>
	{:else}
		<div class="detail-header">
			<span class="badge badge-{kind}">{kindBadge}</span>
			<h1>{km.toLocaleString()} km</h1>
			<p class="subtitle">{kindLabel} service milestone</p>
		</div>

		<div class="task-list">
			{#each milestone.tasks as task}
				<div class="task-card">
					<h2 class="task-name">{task}</h2>
					{#if SERVICE_NOTES[task]}
						<p class="task-note">{SERVICE_NOTES[task]}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 600px;
		margin: 0 auto;
		padding: 1rem;
		padding-bottom: 5rem;
	}
	.top-bar {
		margin-bottom: 1rem;
	}
	.back-btn {
		background: none;
		border: none;
		font-size: 1rem;
		color: var(--accent, #3b82f6);
		cursor: pointer;
		padding: 0.25rem 0;
	}
	.detail-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}
	.detail-header h1 {
		margin: 0.5rem 0 0.25rem;
		font-size: 1.6rem;
	}
	.subtitle {
		color: #888;
		font-size: 0.9rem;
		margin: 0;
	}
	.badge {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.6rem;
		border-radius: 4px;
		text-transform: uppercase;
	}
	.badge-mfr {
		background: #e0e7ff;
		color: #4338ca;
	}
	.badge-rec {
		background: #fef3c7;
		color: #92400e;
	}
	.task-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.task-card {
		background: var(--card-bg, #1e1e2e);
		border-radius: 12px;
		padding: 1rem 1.2rem;
		border: 1px solid var(--border, #333);
	}
	.task-name {
		font-size: 1.05rem;
		margin: 0 0 0.5rem;
		text-transform: capitalize;
	}
	.task-note {
		font-size: 0.88rem;
		color: #aaa;
		line-height: 1.5;
		margin: 0;
	}
	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: #888;
	}
</style>
