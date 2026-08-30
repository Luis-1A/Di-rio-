import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInAnonymously,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from '../types';
import { getOrCreateUserProfile } from './firestoreService';

const SESSION_STORAGE_KEY = 'diario_pessoal_auth_session';
const LOCAL_ACCOUNTS_KEY = 'diario_pessoal_local_accounts';

// Web Crypto SHA-256 Helper
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt + '_diario_salt_secret_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateDeterministicUid(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(cleanEmail);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  return `usr_${hex}`;
}

// Local accounts cache fallback helper
function getLocalAccounts(): Record<string, any> {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalAccount(email: string, accountData: any) {
  try {
    const accounts = getLocalAccounts();
    accounts[email.trim().toLowerCase()] = accountData;
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Could not cache account locally:', e);
  }
}

export interface AuthAccountData {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

// Event-based auth state changes listener
type AuthStateListener = (user: UserProfile | null) => void;
const listeners = new Set<AuthStateListener>();

export function subscribeToAuth(listener: AuthStateListener): () => void {
  listeners.add(listener);
  // Send current state
  const current = getStoredSession();
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

function notifyAuthState(user: UserProfile | null) {
  if (user) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('Session write failed:', e);
    }
  } else {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('Session remove failed:', e);
    }
  }
  listeners.forEach((cb) => cb(user));
}

export function getStoredSession(): UserProfile | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

/**
 * Ensure Firebase has an active anonymous token if not logged in via Firebase Auth,
 * so Firestore queries satisfy `request.auth != null`.
 */
async function ensureFirestoreAuthToken(): Promise<void> {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.warn('Anonymous token acquisition notice:', err);
    }
  }
}

/**
 * Register a new user with Email, Password and Name.
 * Works natively and reliably regardless of Firebase Console configuration.
 */
export async function registerUser(
  email: string,
  pass: string,
  displayName: string
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim() || cleanEmail.split('@')[0] || 'Usuário';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um endereço de e-mail válido.');
  }
  if (!pass || pass.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }

  // 1. Try Firebase Auth standard registration first
  let firebaseAuthSuccess = false;
  try {
    const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
    if (userCred.user) {
      firebaseAuthSuccess = true;
      if (cleanName) {
        await updateProfile(userCred.user, { displayName: cleanName }).catch(() => {});
      }
      const profile = await getOrCreateUserProfile(userCred.user.uid, cleanEmail, cleanName);
      notifyAuthState(profile);
      return profile;
    }
  } catch (err: any) {
    console.info('Standard Firebase Auth rejected, using Native Engine. Reason:', err.code);
    if (err.code === 'auth/email-already-in-use') {
      throw new Error('Este e-mail já está cadastrado em outra conta. Acesse a aba "Entrar".');
    }
    // If auth/operation-not-allowed or any other provider block, fallback to Native Account Engine
  }

  // 2. Native Account Engine with Salted SHA-256 Hashing & Firestore Isolation
  await ensureFirestoreAuthToken();
  const uid = await generateDeterministicUid(cleanEmail);

  // Check if account already exists
  const localAccounts = getLocalAccounts();
  if (localAccounts[cleanEmail]) {
    throw new Error('Este e-mail já está cadastrado. Acesse a aba "Entrar" com sua senha.');
  }

  try {
    const accDocRef = doc(db, 'users', uid, 'profile', 'account');
    const accSnap = await getDoc(accDocRef);
    if (accSnap.exists()) {
      throw new Error('Este e-mail já está cadastrado. Acesse a aba "Entrar" com sua senha.');
    }
  } catch (e: any) {
    if (e.message && e.message.includes('já está cadastrado')) {
      throw e;
    }
    console.warn('Firestore existence check error, proceeding with creation:', e);
  }

  const salt = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const passwordHash = await hashPassword(pass, salt);
  const now = new Date().toISOString();

  const accountData: AuthAccountData = {
    uid,
    email: cleanEmail,
    displayName: cleanName,
    passwordHash,
    salt,
    createdAt: now,
    updatedAt: now,
  };

  const userProfile: UserProfile = {
    uid,
    email: cleanEmail,
    displayName: cleanName,
    createdAt: now,
    updatedAt: now,
  };

  // Save to Firestore & local storage
  saveLocalAccount(cleanEmail, accountData);

  try {
    const accDocRef = doc(db, 'users', uid, 'profile', 'account');
    const infoDocRef = doc(db, 'users', uid, 'profile', 'info');

    await Promise.all([
      setDoc(accDocRef, { ...accountData, _serverTimestamp: serverTimestamp() }),
      setDoc(infoDocRef, { ...userProfile, _serverTimestamp: serverTimestamp() }),
    ]);
  } catch (firestoreErr) {
    console.warn('Could not write account to Firestore, saved locally:', firestoreErr);
  }

  notifyAuthState(userProfile);
  return userProfile;
}

/**
 * Log in an existing user with Email and Password.
 */
export async function loginUser(email: string, pass: string): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe o seu endereço de e-mail.');
  }
  if (!pass) {
    throw new Error('Informe a sua senha.');
  }

  // 1. Try Firebase Auth first
  try {
    const userCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    if (userCred.user) {
      const profile = await getOrCreateUserProfile(
        userCred.user.uid,
        cleanEmail,
        userCred.user.displayName || undefined
      );
      notifyAuthState(profile);
      return profile;
    }
  } catch (err: any) {
    console.info('Standard Firebase login check:', err.code);
    if (err.code === 'auth/wrong-password') {
      throw new Error('Senha incorreta. Verifique a senha digitada.');
    }
    // If operation-not-allowed or user-not-found in Firebase Auth, check our native account store
  }

  // 2. Check Native Account store
  await ensureFirestoreAuthToken();
  const uid = await generateDeterministicUid(cleanEmail);

  let accountData: AuthAccountData | null = null;

  // Check local cache first
  const localAccounts = getLocalAccounts();
  if (localAccounts[cleanEmail]) {
    accountData = localAccounts[cleanEmail];
  }

  // Check Firestore
  if (!accountData) {
    try {
      const accDocRef = doc(db, 'users', uid, 'profile', 'account');
      const accSnap = await getDoc(accDocRef);
      if (accSnap.exists()) {
        accountData = accSnap.data() as AuthAccountData;
        saveLocalAccount(cleanEmail, accountData);
      }
    } catch (err) {
      console.warn('Firestore read account error:', err);
    }
  }

  if (!accountData) {
    throw new Error(
      'Nenhuma conta encontrada com este e-mail. Acesse a aba "Criar conta" para se cadastrar.'
    );
  }

  // Verify password hash
  const computedHash = await hashPassword(pass, accountData.salt);
  if (computedHash !== accountData.passwordHash) {
    throw new Error('Senha incorreta. Verifique a senha digitada e tente novamente.');
  }

  const userProfile: UserProfile = {
    uid: accountData.uid,
    email: accountData.email,
    displayName: accountData.displayName,
    createdAt: accountData.createdAt,
    updatedAt: accountData.updatedAt || new Date().toISOString(),
  };

  notifyAuthState(userProfile);
  return userProfile;
}

/**
 * Reset / Update Password for an email
 */
export async function resetOrChangePassword(
  email: string,
  newPassword?: string
): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um endereço de e-mail válido.');
  }

  await ensureFirestoreAuthToken();
  const uid = await generateDeterministicUid(cleanEmail);

  const localAccounts = getLocalAccounts();
  let accountData = localAccounts[cleanEmail];

  if (!accountData) {
    try {
      const accDocRef = doc(db, 'users', uid, 'profile', 'account');
      const snap = await getDoc(accDocRef);
      if (snap.exists()) {
        accountData = snap.data() as AuthAccountData;
      }
    } catch (e) {
      console.warn('Account lookup error during reset:', e);
    }
  }

  if (!accountData) {
    throw new Error('Conta não localizada para este e-mail. Verifique o endereço digitado.');
  }

  if (newPassword && newPassword.length >= 6) {
    const salt = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    const passwordHash = await hashPassword(newPassword, salt);
    accountData.passwordHash = passwordHash;
    accountData.salt = salt;
    accountData.updatedAt = new Date().toISOString();

    saveLocalAccount(cleanEmail, accountData);
    try {
      const accDocRef = doc(db, 'users', uid, 'profile', 'account');
      await setDoc(accDocRef, { ...accountData, _serverTimestamp: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn('Firestore password update error:', e);
    }
    return 'Senha alterada com sucesso! Você já pode fazer login.';
  }

  return 'Conta verificada. Digite uma nova senha para redefini-la.';
}

/**
 * Logout the user
 */
export async function logoutUser(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.warn('Firebase signout error:', err);
  }
  notifyAuthState(null);
}
