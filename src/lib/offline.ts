const DB_NAME = 'car-journal-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'pending-writes';

interface PendingWrite {
	id: string;
	timestamp: number;
	type: 'events' | 'parts';
	data: unknown;
	commitMessage: string;
}

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(QUEUE_STORE)) {
				db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function queueWrite(
	type: 'events' | 'parts',
	data: unknown,
	commitMessage: string
): Promise<void> {
	const db = await openDB();
	const tx = db.transaction(QUEUE_STORE, 'readwrite');
	const store = tx.objectStore(QUEUE_STORE);

	const entry: PendingWrite = {
		id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
		timestamp: Date.now(),
		type,
		data,
		commitMessage
	};

	store.put(entry);
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getPendingWrites(): Promise<PendingWrite[]> {
	const db = await openDB();
	const tx = db.transaction(QUEUE_STORE, 'readonly');
	const store = tx.objectStore(QUEUE_STORE);
	const request = store.getAll();

	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function removePendingWrite(id: string): Promise<void> {
	const db = await openDB();
	const tx = db.transaction(QUEUE_STORE, 'readwrite');
	tx.objectStore(QUEUE_STORE).delete(id);

	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function flushPendingWrites(): Promise<number> {
	const { saveEvents, saveParts } = await import('./data');
	const pending = await getPendingWrites();
	let flushed = 0;

	for (const write of pending.sort((a, b) => a.timestamp - b.timestamp)) {
		try {
			if (write.type === 'events') {
				await saveEvents(
					write.data as import('./types').CarEvent[],
					write.commitMessage
				);
			} else if (write.type === 'parts') {
				await saveParts(
					write.data as import('./types').Part[],
					write.commitMessage
				);
			}
			await removePendingWrite(write.id);
			flushed++;
		} catch {
			break;
		}
	}

	return flushed;
}

export function isOnline(): boolean {
	return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
