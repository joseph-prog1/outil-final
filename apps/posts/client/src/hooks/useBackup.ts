import type { CharlieBackup } from '../types/index';

// Export / import JSON de toute la base IndexedDB (bibliothèque +
// apprentissage + banque de hooks). L'import fusionne par id: il
// n'écrase jamais silencieusement une base existante.

const DB_NAME = 'charlie-reformulator';
const DB_VERSION = 3;
const ALL_STORES = ['hooks', 'winning_posts', 'hook_entries', 'lessons', 'library'];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const store of ALL_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
  });
}

function readStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as unknown[]);
  });
}

function writeStore(db: IDBDatabase, storeName: string, items: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    for (const item of items) {
      if (item && typeof item === 'object' && 'id' in (item as Record<string, unknown>)) {
        store.put(item);
      }
    }
  });
}

export function useBackup() {
  const exportAll = async (): Promise<void> => {
    const db = await openDatabase();
    const stores: Record<string, unknown[]> = {};
    for (const name of ALL_STORES) {
      stores[name] = await readStore(db, name);
    }

    const backup: CharlieBackup = {
      type: 'charlie-backup',
      version: 1,
      date: new Date().toISOString(),
      stores,
    };

    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `charlie-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Fusionne le fichier dans la base (par id) et renvoie le nombre
  // d'éléments importés par store
  const importAll = async (file: File): Promise<Record<string, number>> => {
    const text = await file.text();
    let parsed: CharlieBackup;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Fichier illisible: ce n’est pas du JSON valide.');
    }
    if (parsed?.type !== 'charlie-backup' || !parsed.stores) {
      throw new Error('Ce fichier n’est pas une sauvegarde Charlie.');
    }

    const db = await openDatabase();
    const counts: Record<string, number> = {};
    for (const name of ALL_STORES) {
      const items = Array.isArray(parsed.stores[name]) ? parsed.stores[name] : [];
      if (items.length > 0) {
        await writeStore(db, name, items);
      }
      counts[name] = items.length;
    }
    return counts;
  };

  return { exportAll, importAll };
}
