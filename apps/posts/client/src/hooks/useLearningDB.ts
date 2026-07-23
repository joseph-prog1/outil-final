import { useRef } from 'react';
import type { WinningPost, HookEntry, Lesson } from '../types/index';

const DB_NAME = 'charlie-reformulator';
const DB_VERSION = 3;
const WINNING_POSTS_STORE = 'winning_posts';
const HOOKS_STORE = 'hook_entries';
const LESSONS_STORE = 'lessons';
// Stores des autres hooks, créés ici aussi pour que la migration laisse
// la base complète quel que soit le hook qui l'ouvre en premier
const OTHER_STORES = ['hooks', 'library'];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      console.log('IndexedDB opened successfully');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const store of [WINNING_POSTS_STORE, HOOKS_STORE, LESSONS_STORE, ...OTHER_STORES]) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
  });

  return dbPromise;
}

export function useLearningDB() {
  const dbRef = useRef<Promise<IDBDatabase>>(openDatabase());

  const getWinningPosts = async (): Promise<WinningPost[]> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([WINNING_POSTS_STORE], 'readonly');
      const store = tx.objectStore(WINNING_POSTS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as WinningPost[]);
    });
  };

  const addWinningPost = async (post: WinningPost): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([WINNING_POSTS_STORE], 'readwrite');
      const store = tx.objectStore(WINNING_POSTS_STORE);
      const request = store.put(post);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const deleteWinningPost = async (id: string): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([WINNING_POSTS_STORE], 'readwrite');
      const store = tx.objectStore(WINNING_POSTS_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const getHooks = async (): Promise<HookEntry[]> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([HOOKS_STORE], 'readonly');
      const store = tx.objectStore(HOOKS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as HookEntry[]);
    });
  };

  const addHook = async (hook: HookEntry): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([HOOKS_STORE], 'readwrite');
      const store = tx.objectStore(HOOKS_STORE);
      const request = store.put(hook);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const deleteHook = async (id: string): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([HOOKS_STORE], 'readwrite');
      const store = tx.objectStore(HOOKS_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const getLessons = async (): Promise<Lesson[]> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LESSONS_STORE], 'readonly');
      const store = tx.objectStore(LESSONS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as Lesson[]);
    });
  };

  const putLesson = async (lesson: Lesson): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LESSONS_STORE], 'readwrite');
      const store = tx.objectStore(LESSONS_STORE);
      const request = store.put(lesson);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  const deleteLesson = async (id: string): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LESSONS_STORE], 'readwrite');
      const store = tx.objectStore(LESSONS_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  // Remplace toute la mémoire de leçons d'un coup (après consolidation LLM)
  const replaceLessons = async (lessons: Lesson[]): Promise<void> => {
    const db = await dbRef.current;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LESSONS_STORE], 'readwrite');
      const store = tx.objectStore(LESSONS_STORE);

      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        for (const lesson of lessons) {
          store.put(lesson);
        }
      };
    });
  };

  const getRecentWinningPosts = async (limit: number = 5): Promise<WinningPost[]> => {
    const posts = await getWinningPosts();
    return posts
      .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
      .slice(0, limit);
  };

  const getRecentHooks = async (limit: number = 5): Promise<HookEntry[]> => {
    const hooks = await getHooks();
    return hooks
      .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
      .slice(0, limit);
  };

  return {
    addWinningPost,
    getWinningPosts,
    deleteWinningPost,
    getRecentWinningPosts,
    addHook,
    getHooks,
    deleteHook,
    getRecentHooks,
    getLessons,
    putLesson,
    deleteLesson,
    replaceLessons,
  };
}
