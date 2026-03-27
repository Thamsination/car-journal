<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { token } from '$lib/stores';
	import { getPendingWrites, flushPendingWrites } from '$lib/offline';

	let { children } = $props();
	let pendingCount = $state(0);
	let syncing = $state(false);

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

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {});
		}

		checkPending();
		const interval = setInterval(checkPending, 10000);

		const handleOnline = () => {
			if (pendingCount > 0) syncNow();
		};
		window.addEventListener('online', handleOnline);

		return () => {
			clearInterval(interval);
			window.removeEventListener('online', handleOnline);
		};
	});

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

<div class="app-shell">
	<header class="top-bar">
		<div class="container top-bar-inner">
			<h1 class="app-title">G31 Journal</h1>
			{#if $token}
				<a href="{base}/settings" class="settings-btn" aria-label="Settings">⚙︎</a>
			{/if}
		</div>
	</header>

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

	.app-title {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.3px;
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
