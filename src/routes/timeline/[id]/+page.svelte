<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { events, latestOdometer } from '$lib/stores';
	import { saveEvents, loadEvents, uploadReceipt, deleteReceipt, receiptUrl } from '$lib/github';
	import { formatCost, deriveStatus, statusLabel, statusColor, eventCategory, categoryLabel, categoryColor, allCategories, getEventTasks, buildEventString } from '$lib/utils';
	import { isOnline, queueWrite } from '$lib/offline';
	import type { CarEvent, EventCategory } from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<CarEvent | null>(null);
	let editing = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let saveError = $state('');
	let costInput = $state('');
	let selectedCategory = $state<EventCategory | ''>('');
	let customTask = $state('');
	let selectedTasks = $state<string[]>([]);
	let providerMode = $state<'select' | 'custom'>('select');
	let providerSelect = $state('');
	let customProvider = $state('');

	let showCompleteModal = $state(false);
	let completeKmInput = $state('');
	let completing = $state(false);

	let uploading = $state(false);
	let uploadError = $state('');
	let lightboxSrc = $state('');
	let showLightbox = $state(false);

	let form = $state<CarEvent>({
		id: '',
		km: null,
		date: '',
		event: '',
		cost: 0,
		currency: 'DKK',
		provider: '',
		notes: '',
		completed: false,
		invoiceNr: ''
	});

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
		return [...tasks].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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

	function startEditing() {
		editing = true;
		selectedCategory = event!.category || '';
		customTask = '';
		selectedTasks = getEventTasks(event!);
		const existingProvider = event!.provider;
		if (existingProvider && providers.includes(existingProvider)) {
			providerMode = 'select';
			providerSelect = existingProvider;
			customProvider = '';
		} else if (existingProvider) {
			providerMode = 'custom';
			customProvider = existingProvider;
			providerSelect = '';
		} else {
			providerMode = 'select';
			providerSelect = '';
			customProvider = '';
		}
	}

	onMount(() => {
		const id = $page.params.id;
		const found = $events.find((e) => e.id === id);
		if (found) {
			event = found;
			form = { ...found };
			costInput = found.cost > 0 ? found.cost.toString() : '';
			selectedCategory = found.category || '';
		}
	});

	async function handleSave() {
		if (!form.event.trim()) {
			saveError = 'Task description is required';
			return;
		}
		saving = true;
		saveError = '';
		try {
			form.cost = Math.round(parseFloat(costInput.replace(/[^0-9.,\-]/g, '').replace(',', '.')) || 0);
			form.category = selectedCategory || undefined;
			form.provider = resolveProvider();
			syncFormEvent();
			const updated = $events.map((e) => (e.id === form.id ? { ...form } : e));

			if (isOnline()) {
				try {
					await loadEvents();
				} catch {
					await loadEvents();
				}
				await saveEvents(updated, `Update: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Update: ${form.event}`);
			}

			$events = updated;
			event = { ...form };
			editing = false;
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			saveError = msg.includes('API error') ? 'Save failed — please try again' : msg;
		} finally {
			saving = false;
		}
	}

	function openCompleteModal() {
		completeKmInput = event?.km?.toString() || '';
		showCompleteModal = true;
	}

	async function confirmComplete() {
		completing = true;
		saveError = '';
		try {
			const km = completeKmInput ? parseInt(completeKmInput, 10) : null;
			const updated = $events.map((e) =>
				e.id === form.id ? { ...e, completed: true, km: km ?? e.km } : e
			);

			if (isOnline()) {
				try {
					await loadEvents();
				} catch {
					await loadEvents();
				}
				await saveEvents(updated, `Complete: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Complete: ${form.event}`);
			}
			$events = updated;
			showCompleteModal = false;
			goto(`${base}/timeline`);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			saveError = msg.includes('API error') ? 'Failed to complete — please try again' : msg;
		} finally {
			completing = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Delete this event permanently?')) return;
		deleting = true;
		try {
			const updated = $events.filter((e) => e.id !== form.id);

			if (isOnline()) {
				try {
					await loadEvents();
				} catch {
					await loadEvents();
				}
				await saveEvents(updated, `Delete: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Delete: ${form.event}`);
			}
			$events = updated;
			goto(`${base}/timeline`);
		} catch (e: unknown) {
			saveError = e instanceof Error ? e.message : 'Failed to delete';
		} finally {
			deleting = false;
		}
	}

	function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const img = new Image();
				img.onload = () => {
					const scale = img.width > maxWidth ? maxWidth / img.width : 1;
					const w = Math.round(img.width * scale);
					const h = Math.round(img.height * scale);
					const canvas = document.createElement('canvas');
					canvas.width = w;
					canvas.height = h;
					const ctx = canvas.getContext('2d')!;
					ctx.drawImage(img, 0, 0, w, h);
					const dataUrl = canvas.toDataURL('image/jpeg', quality);
					resolve(dataUrl.split(',')[1]);
				};
				img.onerror = reject;
				img.src = reader.result as string;
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(',')[1]);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	async function handleReceiptUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0 || !event) return;

		uploading = true;
		uploadError = '';

		try {
			const currentReceipts = event.receipts ? [...event.receipts] : [];

			for (const file of files) {
				const idx = currentReceipts.length + 1;
				const isPdf = file.type === 'application/pdf';
				const ext = isPdf ? 'pdf' : 'jpg';
				const filename = `${event.id}_${idx}.${ext}`;

				let base64: string;
				if (isPdf) {
					base64 = await fileToBase64(file);
				} else {
					base64 = await compressImage(file, 1600, 0.85);
				}

				await uploadReceipt(filename, base64, `Receipt: ${filename}`);
				currentReceipts.push(filename);
			}

			const updated = $events.map((ev) =>
				ev.id === event!.id ? { ...ev, receipts: currentReceipts } : ev
			);
			await loadEvents();
			await saveEvents(updated, `Add receipt(s) to ${event.event}`);
			$events = updated;
			event = { ...event, receipts: currentReceipts };
			form = { ...event };
		} catch (err: unknown) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	async function handleDeleteReceipt(filename: string) {
		if (!confirm('Delete this receipt?') || !event) return;
		uploading = true;
		uploadError = '';
		try {
			await deleteReceipt(filename, `Delete receipt: ${filename}`);
			const newReceipts = (event.receipts || []).filter((r) => r !== filename);
			const updated = $events.map((ev) =>
				ev.id === event!.id ? { ...ev, receipts: newReceipts.length > 0 ? newReceipts : undefined } : ev
			);
			await loadEvents();
			await saveEvents(updated, `Remove receipt from ${event.event}`);
			$events = updated;
			event = { ...event, receipts: newReceipts.length > 0 ? newReceipts : undefined };
			form = { ...event };
		} catch (err: unknown) {
			uploadError = err instanceof Error ? err.message : 'Delete failed';
		} finally {
			uploading = false;
		}
	}

	function openLightbox(filename: string) {
		lightboxSrc = receiptUrl(filename);
		showLightbox = true;
	}

	function isPdf(filename: string): boolean {
		return filename.toLowerCase().endsWith('.pdf');
	}
</script>

<svelte:head>
	<title>{event?.event ?? 'Entry'} — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<button class="back-btn" onclick={() => history.back()}>← Back</button>
		<h2>{editing ? 'Edit Entry' : (event?.event ?? 'Entry Details')}</h2>
	</div>

	{#if !event}
		<div class="empty-state">Event not found</div>
	{:else if editing}
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
							<button
								type="button"
								class="task-chip"
								class:selected={selectedTasks.includes(task)}
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
					<input id="km" type="number" bind:value={form.km} />
				</div>
			</div>

			<div class="field">
				<label for="cost">Cost (DKK)</label>
				<input id="cost" type="text" bind:value={costInput} inputmode="decimal" />
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
				<textarea id="notes" bind:value={form.notes} rows="3"></textarea>
			</div>

			{#if saveError}
				<p class="error-msg">{saveError}</p>
			{/if}

			<div class="button-row">
				<button type="button" class="cancel-btn" onclick={() => { editing = false; form = { ...event! }; selectedCategory = event!.category || ''; }}>
					Cancel
				</button>
				<button type="submit" class="submit-btn" disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</form>
	{:else}
		{@const cat = eventCategory(event.event, event.category)}
		{@const status = deriveStatus(event, $latestOdometer.km)}
		<div class="detail-card">
			<div class="detail-row">
				<span class="detail-label">Category</span>
				<span class="detail-value">
					<span class="category-dot" style="background: {categoryColor(cat)}"></span>
					{categoryLabel(cat)}
				</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Status</span>
				<span class="detail-value">
					<span class="status-dot" style="background: {statusColor(status)}"></span>
					{statusLabel(status)}
				</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Date</span>
				<span class="detail-value">{event.date || '—'}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Odometer</span>
				<span class="detail-value">{event.km ? `${event.km.toLocaleString()} km` : '—'}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Cost</span>
				<span class="detail-value">{event.cost > 0 ? formatCost(event.cost) : '—'}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Provider</span>
				<span class="detail-value">{event.provider || '—'}</span>
			</div>
			{#if event.notes}
				<div class="detail-row">
					<span class="detail-label">Notes</span>
					<span class="detail-value">{event.notes}</span>
				</div>
			{/if}
			<div class="detail-row">
				<span class="detail-label">Entry ID</span>
				<span class="detail-value entry-id">{event.id}</span>
			</div>
		</div>

		<section class="receipts-section">
			<h3 class="receipts-title">Receipts</h3>
			{#if event.receipts && event.receipts.length > 0}
				<div class="receipt-grid">
					{#each event.receipts as filename}
						<div class="receipt-item">
							{#if isPdf(filename)}
								<a href={receiptUrl(filename)} target="_blank" rel="noopener" class="receipt-thumb pdf-thumb">
									<span class="pdf-icon">PDF</span>
									<span class="receipt-name">{filename}</span>
								</a>
							{:else}
								<button class="receipt-thumb" onclick={() => openLightbox(filename)}>
									<img src={receiptUrl(filename)} alt={filename} loading="lazy" />
								</button>
							{/if}
							<button
								class="receipt-delete"
								onclick={() => handleDeleteReceipt(filename)}
								disabled={uploading}
								aria-label="Delete receipt"
							>×</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="no-receipts">No receipts attached</p>
			{/if}

			<label class="upload-btn" class:disabled={uploading}>
				<input
					type="file"
					accept="image/*,.pdf"
					multiple
					onchange={handleReceiptUpload}
					disabled={uploading}
					hidden
				/>
				{uploading ? 'Uploading...' : 'Add Receipt'}
			</label>

			{#if uploadError}
				<p class="error-msg" style="margin-top: 8px">{uploadError}</p>
			{/if}
		</section>

		{#if !event.completed}
			<button class="complete-btn" onclick={openCompleteModal}>
				Completed
			</button>
		{/if}

		{#if saveError}
			<p class="error-msg" style="margin-top: 12px">{saveError}</p>
		{/if}

		<div class="button-row">
			<button class="edit-btn" onclick={startEditing}>Edit</button>
			<button class="delete-btn" onclick={handleDelete} disabled={deleting}>
				{deleting ? 'Deleting...' : 'Delete'}
			</button>
		</div>
	{/if}
</div>

{#if showCompleteModal}
	<div class="modal-overlay" onclick={() => (showCompleteModal = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Confirm completion" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') showCompleteModal = false; }}>
			<h3 class="modal-title">Confirm Completion</h3>
			<p class="modal-desc">Enter the odometer reading at the time of completion.</p>
			<div class="field">
				<label for="complete-km">Odometer (km)</label>
				<input
					id="complete-km"
					type="number"
					bind:value={completeKmInput}
					placeholder="e.g. 187045"
					inputmode="numeric"
				/>
			</div>
			<div class="modal-buttons">
				<button class="cancel-btn" onclick={() => (showCompleteModal = false)}>Cancel</button>
				<button class="confirm-btn" onclick={confirmComplete} disabled={completing}>
					{completing ? 'Saving...' : 'Confirm'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showLightbox}
	<div class="lightbox-overlay" onclick={() => (showLightbox = false)} role="presentation" onkeydown={(e) => { if (e.key === 'Escape') showLightbox = false; }}>
		<button class="lightbox-close" onclick={() => (showLightbox = false)} aria-label="Close">×</button>
		<img src={lightboxSrc} alt="Receipt" class="lightbox-img" onclick={(e) => e.stopPropagation()} />
	</div>
{/if}

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
		padding: 0;
		cursor: pointer;
	}

	.category-dot, .status-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 4px;
		vertical-align: middle;
	}

	.detail-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 20px;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-border);
	}

	.detail-row:last-of-type {
		border-bottom: none;
	}

	.detail-label {
		font-size: 14px;
		color: var(--color-text-secondary);
		flex-shrink: 0;
		margin-right: 16px;
	}

	.detail-value {
		font-size: 14px;
		font-weight: 500;
		text-align: right;
	}

	.entry-id {
		font-family: monospace;
		font-size: 12px;
		color: var(--color-text-secondary);
		font-weight: 400;
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

	.button-row {
		display: flex;
		gap: 12px;
		margin-top: 16px;
	}

	.complete-btn {
		width: 100%;
		padding: 12px;
		background: var(--color-success);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
		margin-top: 16px;
	}

	.edit-btn,
	.submit-btn {
		flex: 1;
		padding: 12px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
	}

	.cancel-btn {
		flex: 1;
		padding: 12px;
		background: var(--color-surface-raised);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 500;
	}

	.delete-btn {
		flex: 1;
		padding: 12px;
		background: none;
		color: var(--color-danger);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 500;
	}

	.submit-btn:disabled,
	.delete-btn:disabled,
	.complete-btn:disabled,
	.confirm-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 20px;
	}

	.modal {
		background: var(--color-bg);
		border-radius: var(--radius-lg);
		padding: 24px;
		width: 100%;
		max-width: 360px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-title {
		font-size: 18px;
		font-weight: 700;
		margin-bottom: 6px;
	}

	.modal-desc {
		font-size: 13px;
		color: var(--color-text-secondary);
		margin-bottom: 16px;
		line-height: 1.4;
	}

	.modal-buttons {
		display: flex;
		gap: 10px;
		margin-top: 16px;
	}

	.confirm-btn {
		flex: 1;
		padding: 12px;
		background: var(--color-success);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
	}

	.receipts-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-top: none;
		padding: 16px 20px;
	}

	.receipts-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 12px;
	}

	.receipt-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
		gap: 10px;
		margin-bottom: 12px;
	}

	.receipt-item {
		position: relative;
	}

	.receipt-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		overflow: hidden;
		cursor: pointer;
		background: var(--color-input-bg);
		padding: 0;
	}

	.receipt-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.pdf-thumb {
		flex-direction: column;
		gap: 4px;
		text-decoration: none;
		color: var(--color-text);
	}

	.pdf-icon {
		font-size: 20px;
		font-weight: 800;
		color: var(--color-danger);
	}

	.receipt-name {
		font-size: 9px;
		color: var(--color-text-secondary);
		text-align: center;
		word-break: break-all;
		padding: 0 4px;
		line-height: 1.2;
	}

	.receipt-delete {
		position: absolute;
		top: -6px;
		right: -6px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--color-danger);
		color: white;
		font-size: 14px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--color-surface);
		cursor: pointer;
		line-height: 1;
	}

	.receipt-delete:disabled {
		opacity: 0.5;
	}

	.no-receipts {
		font-size: 13px;
		color: var(--color-text-secondary);
		margin-bottom: 12px;
	}

	.upload-btn {
		display: block;
		width: 100%;
		padding: 10px;
		text-align: center;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.upload-btn.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.lightbox-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 300;
		padding: 20px;
		cursor: pointer;
	}

	.lightbox-close {
		position: absolute;
		top: env(safe-area-inset-top, 16px);
		right: 16px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.15);
		color: white;
		font-size: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 301;
	}

	.lightbox-img {
		max-width: 100%;
		max-height: 90vh;
		object-fit: contain;
		border-radius: var(--radius-sm);
		cursor: default;
	}
</style>
