/**
 * Time Capsule Service (Cápsula do Tempo)
 * Safely persists time capsules to Cloud Firestore and local device storage.
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { TimeCapsule } from '../types';
import { sanitizeForFirestore } from './firestoreService';

const CAPSULES_CACHE_KEY_PREFIX = 'diario_time_capsules_';

export function getLocalCachedCapsules(userId: string): TimeCapsule[] {
  try {
    const raw = localStorage.getItem(`${CAPSULES_CACHE_KEY_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[CAPSULES] Read error:', e);
  }
  return [];
}

export function saveLocalCachedCapsules(userId: string, capsules: TimeCapsule[]) {
  try {
    localStorage.setItem(
      `${CAPSULES_CACHE_KEY_PREFIX}${userId}`,
      JSON.stringify(capsules)
    );
  } catch (e) {
    console.warn('[CAPSULES] Cache save error:', e);
  }
}

/**
 * Subscribe to real-time Time Capsules in Firestore
 */
export function subscribeToTimeCapsules(
  userId: string,
  onUpdate: (capsules: TimeCapsule[]) => void,
  onError?: (err: any) => void
) {
  try {
    const collRef = collection(db, 'users', userId, 'capsules');
    return onSnapshot(
      collRef,
      (snapshot) => {
        const list: TimeCapsule[] = [];
        snapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            list.push(docSnap.data() as TimeCapsule);
          }
        });
        // Sort: unopened first by unlockDate asc, then opened by openedAt desc
        list.sort((a, b) => {
          if (a.isOpened !== b.isOpened) {
            return a.isOpened ? 1 : -1;
          }
          return new Date(a.unlockDate).getTime() - new Date(b.unlockDate).getTime();
        });
        saveLocalCachedCapsules(userId, list);
        onUpdate(list);
      },
      (err) => {
        console.warn('[CAPSULES] Subscription warning, fallback to cache:', err);
        const cached = getLocalCachedCapsules(userId);
        onUpdate(cached);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[CAPSULES] Sub init warning:', err);
    const cached = getLocalCachedCapsules(userId);
    onUpdate(cached);
    return () => {};
  }
}

/**
 * Create and seal a new time capsule
 */
export async function createTimeCapsule(
  userId: string,
  capsule: Omit<TimeCapsule, 'id' | 'userId' | 'createdAt' | 'isOpened'>
): Promise<TimeCapsule> {
  const id = `capsule_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const newCapsule: TimeCapsule = {
    ...capsule,
    id,
    userId,
    createdAt: new Date().toISOString(),
    isOpened: false,
  };

  // Optimistically update local cache
  const cached = getLocalCachedCapsules(userId);
  saveLocalCachedCapsules(userId, [newCapsule, ...cached]);

  // Persist to Firestore
  try {
    const docRef = doc(db, 'users', userId, 'capsules', id);
    await setDoc(docRef, sanitizeForFirestore({
      ...newCapsule,
      _serverTimestamp: serverTimestamp(),
    }));
  } catch (e) {
    console.warn('[CAPSULES] Error saving to cloud (saved locally):', e);
  }

  return newCapsule;
}

/**
 * Open / unlock a time capsule and optionally record future reply
 */
export async function unlockTimeCapsule(
  userId: string,
  capsuleId: string,
  futureReply?: string
): Promise<void> {
  const cached = getLocalCachedCapsules(userId);
  const nowStr = new Date().toISOString();
  const updated = cached.map((c) => {
    if (c.id === capsuleId) {
      return {
        ...c,
        isOpened: true,
        openedAt: nowStr,
        futureReply: futureReply !== undefined ? futureReply : c.futureReply,
      };
    }
    return c;
  });
  saveLocalCachedCapsules(userId, updated);

  try {
    const docRef = doc(db, 'users', userId, 'capsules', capsuleId);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        isOpened: true,
        openedAt: nowStr,
        ...(futureReply ? { futureReply } : {}),
        updatedAt: nowStr,
        _serverTimestamp: serverTimestamp(),
      }),
      { merge: true }
    );
  } catch (e) {
    console.warn('[CAPSULES] Cloud update failed (updated locally):', e);
  }
}

/**
 * Delete a time capsule
 */
export async function deleteTimeCapsule(userId: string, capsuleId: string): Promise<void> {
  const cached = getLocalCachedCapsules(userId);
  saveLocalCachedCapsules(userId, cached.filter((c) => c.id !== capsuleId));

  try {
    const docRef = doc(db, 'users', userId, 'capsules', capsuleId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('[CAPSULES] Cloud delete error:', e);
  }
}
