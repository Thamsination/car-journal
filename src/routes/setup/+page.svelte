<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { token, repoOwner, repoName } from '$lib/stores';
	import { validateToken } from '$lib/github';

	let inputToken = $state('');
	let inputOwner = $state($repoOwner);
	let inputRepo = $state($repoName);
	let validating = $state(false);
	let validationError = $state('');

	async function handleSubmit() {
		if (!inputToken.trim()) {
			validationError = 'Please enter a token';
			return;
		}

		validating = true;
		validationError = '';

		$token = inputToken.trim();
		$repoOwner = inputOwner.trim();
		$repoName = inputRepo.trim();

		const result = await validateToken();
		if (result.ok) {
			goto(`${base}/`);
		} else {
			validationError = result.error || 'Could not access the repository.';
			$token = '';
		}
		validating = false;
	}
</script>

<svelte:head>
	<title>Setup — G31 Journal</title>
</svelte:head>

<div class="container setup-page">
	<div class="setup-card">
		<div class="setup-header">
			<h2>Welcome</h2>
			<p>Connect to your GitHub repository to get started.</p>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			<div class="field">
				<label for="owner">Repository Owner</label>
				<input id="owner" type="text" bind:value={inputOwner} placeholder="Thamsination" />
			</div>

			<div class="field">
				<label for="repo">Repository Name</label>
				<input id="repo" type="text" bind:value={inputRepo} placeholder="car-journal" />
			</div>

			<div class="field">
				<label for="token">Personal Access Token</label>
				<input
					id="token"
					type="password"
					bind:value={inputToken}
					placeholder="github_pat_..."
					autocomplete="off"
				/>
				<p class="field-hint">
					Create a <a
						href="https://github.com/settings/tokens?type=beta"
						target="_blank"
						rel="noopener">fine-grained token</a
					> with <strong>Contents: Read and write</strong> permission for this repo only.
				</p>
			</div>

			{#if validationError}
				<p class="error-msg">{validationError}</p>
			{/if}

			<button type="submit" class="submit-btn" disabled={validating}>
				{validating ? 'Validating...' : 'Connect'}
			</button>
		</form>
	</div>
</div>

<style>
	.setup-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 80dvh;
	}

	.setup-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 32px 24px;
		width: 100%;
		max-width: 400px;
	}

	.setup-header {
		text-align: center;
		margin-bottom: 24px;
	}

	.setup-header h2 {
		font-size: 24px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.setup-header p {
		color: var(--color-text-secondary);
		font-size: 14px;
	}

	.field {
		margin-bottom: 16px;
	}

	.field label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 6px;
		color: var(--color-text-secondary);
	}

	.field-hint {
		font-size: 12px;
		color: var(--color-text-secondary);
		margin-top: 6px;
		line-height: 1.4;
	}

	.error-msg {
		color: var(--color-danger);
		font-size: 14px;
		margin-bottom: 12px;
		text-align: center;
	}

	.submit-btn {
		width: 100%;
		padding: 12px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 16px;
		font-weight: 600;
		transition: background 0.2s;
	}

	.submit-btn:hover {
		background: var(--color-accent-hover);
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
