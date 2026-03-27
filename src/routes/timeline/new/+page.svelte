<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { events, latestOdometer, healthIntervals, componentHealthMap } from '$lib/stores';
	import type { ComponentHealth } from '$lib/stores';
	import { saveEvents, loadEvents, loadHealthConfig } from '$lib/github';
	import { generateId, formatDateISO, allCategories, eventCategory, getEventTasks, buildEventString } from '$lib/utils';
	import { isOnline, queueWrite } from '$lib/offline';
	import type { CarEvent, EventCategory } from '$lib/types';

	const prefillKm = $derived(Number($page.url.searchParams.get('km')) || null);

	let saving = $state(false);
	let saveError = $state('');
	let customTask = $state('');
	let selectedTasks = $state<string[]>([]);
	let providerMode = $state<'select' | 'custom'>('select');
	let providerSelect = $state('');
	let customProvider = $state('');

	let form = $state<CarEvent>({
		id: generateId('evt'),
		km: null,
		date: formatDateISO(new Date()),
		event: '',
		cost: 0,
		currency: 'DKK',
		provider: '',
		notes: '',
		completed: false,
		invoiceNr: ''
	});

	$effect(() => {
		if (prefillKm !== null && form.km === null) {
			form.km = prefillKm;
		}
	});

	onMount(async () => {
		if ($healthIntervals.length === 0) {
			try {
				const config = await loadHealthConfig();
				$healthIntervals = config.intervals;
			} catch { /* health data optional here */ }
		}
	});

	let selectedCategory = $state<EventCategory | ''>('');
	let costInput = $state('');

	function taskHealth(task: string): ComponentHealth | undefined {
		const key = task.toLowerCase().trim();
		for (const [match, health] of $componentHealthMap) {
			if (key.includes(match)) return health;
		}
		return undefined;
	}

	const SERVICE_CATEGORIES: EventCategory[] = ['official-service', 'other-service'];

	const taskSuggestions = $derived.by(() => {
		if (!selectedCategory) return [];
		const tasks = new Set<string>();

		const isService = SERVICE_CATEGORIES.includes(selectedCategory);
		for (const evt of $events) {
			const cat = eventCategory(evt.event, evt.category);
			if (isService ? SERVICE_CATEGORIES.includes(cat) : cat === selectedCategory) {
				for (const t of getEventTasks(evt)) {
					tasks.add(t);
				}
			}
		}

		for (const [match, health] of $componentHealthMap) {
			if (health === 'warning' || health === 'overdue') {
				tasks.add(match);
			}
		}

		const needsAttention = [...tasks].filter((t) => {
			const h = taskHealth(t);
			return h === 'warning' || h === 'overdue';
		});
		const rest = [...tasks].filter((t) => {
			const h = taskHealth(t);
			return h !== 'warning' && h !== 'overdue';
		});

		needsAttention.sort((a, b) => {
			const sa = taskHealth(a) === 'overdue' ? 0 : 1;
			const sb = taskHealth(b) === 'overdue' ? 0 : 1;
			if (sa !== sb) return sa - sb;
			return a.localeCompare(b, undefined, { sensitivity: 'base' });
		});
		rest.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

		return [...needsAttention, ...rest];
	});

	const providers = $derived.by(() => {
		const set = new Set<string>();
		for (const evt of $events) {
			if (evt.provider.trim()) set.add(evt.provider.trim());
		}
		return [...set].sort((a, b) => a.localeCompare(b));
	});

	function syncFormEvent() {
		const all = [...selectedTasks];
		if (customTask.trim()) all.push(customTask.trim());
		form.tasks = all.length > 0 ? all : undefined;
		form.event = buildEventString(all);
	}

	function toggleTask(task: string) {
		if (selectedTasks.includes(task)) {
			selectedTasks = selectedTasks.filter(t => t !== task);
		} else {
			selectedTasks = [...selectedTasks, task];
		}
		syncFormEvent();
	}

	function applyCustomTask() {
		syncFormEvent();
	}

	function resolveProvider(): string {
		if (providerMode === 'custom') return customProvider;
		return providerSelect;
	}

	async function handleSave() {
		if (!form.event.trim()) {
			saveError = 'Task description is required';
			return;
		}

		saving = true;
		saveError = '';

		try {
			form.cost = Math.round(parseFloat(costInput.replace(/[^0-9.,\-]/g, '').replace(',', '.')) || 0);
			if (selectedCategory) form.category = selectedCategory;
			form.provider = resolveProvider();
			syncFormEvent();
			const updated = [...$events, { ...form }];

			if (isOnline()) {
				await loadEvents();
				await saveEvents(updated, `Add: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Add: ${form.event}`);
			}

			$events = updated;
			goto(`${base}/timeline`);
		} catch (e: unknown) {
			saveError = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>New Entry — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<button class="back-btn" onclick={() => history.back()}>← Back</button>
		<h2>New Entry</h2>
	</div>

	<form class="event-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
		<div class="field">
			<label for="category">Category</label>
			<select id="category" bind:value={selectedCategory}>
				<option value="">Select category...</option>
				{#each allCategories() as cat}
					<option value={cat.value}>{cat.label}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="task">Task(s)</label>
			{#if selectedCategory && taskSuggestions.length > 0}
				<div class="task-chips">
					{#each taskSuggestions as task}
						{@const health = taskHealth(task)}
						<button
							type="button"
							class="task-chip"
							class:selected={selectedTasks.includes(task)}
							class:chip-amber={health === 'warning' && !selectedTasks.includes(task)}
							class:chip-red={health === 'overdue' && !selectedTasks.includes(task)}
							onclick={() => toggleTask(task)}
						>
							{task}
						</button>
					{/each}
				</div>
			{/if}
			<input
				id="task"
				type="text"
				bind:value={customTask}
				oninput={applyCustomTask}
				placeholder={selectedTasks.length ? 'Add another task...' : (selectedCategory ? 'Or type a custom task...' : 'Select a category first, or type here')}
			/>
			{#if form.event}
				<span class="selected-task">{form.event}</span>
			{/if}
		</div>

		<div class="field-row">
			<div class="field">
				<label for="date">Date</label>
				<input id="date" type="date" bind:value={form.date} />
			</div>
			<div class="field">
				<label for="km">Odometer (km)</label>
				<input id="km" type="number" bind:value={form.km} placeholder="187000" />
			</div>
		</div>

		<div class="field">
			<label for="cost">Cost (DKK)</label>
			<input id="cost" type="text" bind:value={costInput} placeholder="3,600" inputmode="decimal" />
		</div>

		<div class="field">
			<label for="provider">Provider</label>
			{#if providerMode === 'select'}
				<select id="provider" bind:value={providerSelect} onchange={(e) => {
					if ((e.target as HTMLSelectElement).value === '__custom__') {
						providerMode = 'custom';
						providerSelect = '';
					}
				}}>
					<option value="">Select provider...</option>
					{#each providers as p}
						<option value={p}>{p}</option>
					{/each}
					<option value="__custom__">Other...</option>
				</select>
			{:else}
				<div class="custom-provider-row">
					<input
						id="provider-custom"
						type="text"
						bind:value={customProvider}
						placeholder="Enter provider name"
					/>
					<button type="button" class="provider-back-btn" onclick={() => { providerMode = 'select'; customProvider = ''; }}>
						Cancel
					</button>
				</div>
			{/if}
		</div>

		<div class="field">
			<label for="notes">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="3" placeholder="Additional details..."></textarea>
		</div>

		{#if saveError}
			<p class="error-msg">{saveError}</p>
		{/if}

		<button type="submit" class="submit-btn" disabled={saving}>
			{saving ? 'Saving...' : 'Save Entry'}
		</button>
	</form>
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}

	.page-header h2 {
		font-size: 20px;
		font-weight: 700;
	}

	.back-btn {
		font-size: 14px;
		color: var(--color-accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.event-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.field label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 6px;
		color: var(--color-text-secondary);
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.task-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	.task-chip {
		padding: 6px 12px;
		border-radius: 16px;
		font-size: 13px;
		font-weight: 500;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: all 0.15s;
	}

	.task-chip.selected {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}

	.task-chip.chip-amber {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.12);
		color: #b45309;
	}

	.task-chip.chip-red {
		border-color: #ef4444;
		background: rgba(239, 68, 68, 0.12);
		color: #b91c1c;
	}

	.task-chip:active {
		transform: scale(0.95);
	}

	.selected-task {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: var(--color-accent);
		font-weight: 500;
	}

	.custom-provider-row {
		display: flex;
		gap: 8px;
	}

	.custom-provider-row input {
		flex: 1;
	}

	.provider-back-btn {
		padding: 8px 14px;
		font-size: 13px;
		font-weight: 500;
		background: var(--color-surface-raised);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	textarea {
		resize: vertical;
		min-height: 60px;
	}

	.error-msg {
		color: var(--color-danger);
		font-size: 14px;
		text-align: center;
	}

	.submit-btn {
		width: 100%;
		padding: 14px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 16px;
		font-weight: 600;
		margin-top: 4px;
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
