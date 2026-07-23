import { useState, useEffect } from 'react';
import type { HookDocument } from '../types/index';

const DB_NAME = 'charlie-reformulator';
// Version et stores partagés avec useLearningDB et useLibraryDB: les hooks
// ouvrent la même base, la migration doit donc créer tous les stores quel
// que soit celui qui s'exécute en premier
const DB_VERSION = 3;
const STORE_NAME = 'hooks';
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

export function useIndexedDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);

  useEffect(() => {
    openDatabase().then(setDb).catch(console.error);
  }, []);

  const saveHook = async (hook: HookDocument): Promise<void> => {
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(hook);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const getHooks = async (): Promise<HookDocument[]> => {
    if (!db) return [];
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as HookDocument[]);
    });
  };

  const deleteHook = async (id: string): Promise<void> => {
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const clearAll = async (): Promise<void> => {
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  return { saveHook, getHooks, deleteHook, clearAll };
}
