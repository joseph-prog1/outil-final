import { useRef } from 'react';
import type { LibraryEntry } from '../types/index';

const DB_NAME = 'charlie-reformulator';
const DB_VERSION = 3;
const LIBRARY_STORE = 'library';
// Stores des autres hooks, créés ici aussi pour que la migration laisse
// la base complète quel que soit le hook qui l'ouvre en premier
const ALL_STORES = ['hooks', 'winning_posts', 'hook_entries', 'lessons', 'library'];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
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

  return dbPromise;
}

export function useLibraryDB() {
  const dbRef = useRef<Promise<IDBDatabase>>(openDatabase());

  const getEntries = async (): Promise<LibraryEntry[]> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LIBRARY_STORE], 'readonly');
      const request = tx.objectStore(LIBRARY_STORE).getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entries = request.result as LibraryEntry[];
        entries.sort(
          (a, b) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime()
        );
        resolve(entries);
      };
    });
  };

  const getEntry = async (id: string): Promise<LibraryEntry | undefined> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LIBRARY_STORE], 'readonly');
      const request = tx.objectStore(LIBRARY_STORE).get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as LibraryEntry | undefined);
    });
  };

  const putEntry = async (entry: LibraryEntry): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LIBRARY_STORE], 'readwrite');
      const request = tx.objectStore(LIBRARY_STORE).put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  // Mise à jour partielle sûre: relit l'entrée puis applique le patch,
  // pour ne pas écraser des champs modifiés entre-temps
  const updateEntry = async (
    id: string,
    patch: Partial<LibraryEntry>
  ): Promise<LibraryEntry | undefined> => {
    const existing = await getEntry(id);
    if (!existing) return undefined;
    const updated: LibraryEntry = {
      ...existing,
      ...patch,
      id,
      date_updated: new Date().toISOString(),
    };
    await putEntry(updated);
    return updated;
  };

  const deleteEntry = async (id: string): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LIBRARY_STORE], 'readwrite');
      const request = tx.objectStore(LIBRARY_STORE).delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  return { getEntries, getEntry, putEntry, updateEntry, deleteEntry };
}
