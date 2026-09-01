import React, { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  DiaryRecord,
  MemoryItem,
} from './types';
import {
  subscribeToRecords,
  subscribeToMemories,
  flushSyncQueue,
  mergeRecords,
  fetchRecordsDirectly,
} from './lib/firestoreService';
import { subscribeToAuth } from './lib/authService';

import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ArchiveView } from './components/ArchiveView';
import { RecordEditor } from './components/RecordEditor';
import { TimelineView } from './components/TimelineView';
import { IAUProfileView } from './components/IAUProfileView';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { PDFViewerModal } from './components/PDFViewerModal';
import { GlobalSyncIndicator } from './components/GlobalSyncIndicator';
import { processBackgroundUploadQueue } from './lib/backgroundUploadManager';
import { BookOpen, Loader2 } from 'lucide-react';

const RECORDS_CACHE_KEY_PREFIX = 'diario_pessoal_records_cache_';

function getLocalCachedRecords(uid: string): DiaryRecord[] {
  try {
    const raw = localStorage.getItem(`${RECORDS_CACHE_KEY_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[CACHE] Read records error:', e);
  }
  return [];
}

function saveLocalCachedRecords(uid: string, records: DiaryRecord[]) {
  try {
    localStorage.setItem(
      `${RECORDS_CACHE_KEY_PREFIX}${uid}`,
      JSON.stringify(records)
    );
  } catch (e) {
    console.warn('[CACHE] Write records error:', e);
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App Data States (Real Firestore Collections with Persistent ID Merging)
  const [records, setRecords] = useState<DiaryRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState<DiaryRecord | null>(null);

  // Diagnostics Modal
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // PDF Viewer Modal State
  const [pdfModalData, setPdfModalData] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
    fileName?: string;
    fileSize?: number;
  }>({
    isOpen: false,
    url: '',
    title: '',
  });

  // 1. Unified Auth state listener
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user: UserProfile | null) => {
      if (user) {
        setCurrentUser(user);
        // Instant load from cache to prevent empty screen flashes
        const cached = getLocalCachedRecords(user.uid);
        if (cached.length > 0) {
          setRecords(cached);
        }
        flushSyncQueue(user.uid).catch((err) =>
          console.warn('Queue flush initial attempt:', err)
        );
      } else {
        setCurrentUser(null);
        setRecords([]);
        setMemories([]);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore Subscriptions with Merge-by-ID and Empty Protection
  useEffect(() => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;

    const unsubRecords = subscribeToRecords(
      uid,
      (incomingServerList) => {
        setRecords((prevRecords) => {
          // If server returned records, merge them cleanly by ID
          if (incomingServerList.length > 0) {
            const merged = mergeRecords(prevRecords, incomingServerList);
            saveLocalCachedRecords(uid, merged);
            return merged;
          }

          // Protection against empty read:
          // If Firestore returns [] but we already have confirmed records,
          // do NOT wipe them out blindly!
          if (prevRecords.length > 0) {
            // Verify asynchronously if server collection is genuinely empty
            fetchRecordsDirectly(uid).then((directList) => {
              if (directList.length === 0 && prevRecords.every(r => r.syncStatus === 'synced')) {
                // If direct server fetch also confirms 0 records and no pending items, update
                setRecords([]);
                saveLocalCachedRecords(uid, []);
              }
            });
            return prevRecords;
          }

          saveLocalCachedRecords(uid, []);
          return [];
        });
      },
      (err) => console.warn('[FIRESTORE SUB WARNING] Records subscription error:', err)
    );

    const unsubMemories = subscribeToMemories(
      uid,
      (list) => setMemories(list),
      (err) => console.warn('Memories sub err:', err)
    );

    return () => {
      unsubRecords();
      unsubMemories();
    };
  }, [currentUser?.uid]);

  // 3. Periodic 30-second Reconciliation & Online Auto-Sync Mechanism
  useEffect(() => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;

    const runReconciliation = async () => {
      try {
        const serverList = await fetchRecordsDirectly(uid);
        if (serverList.length > 0) {
          setRecords((prev) => {
            const merged = mergeRecords(prev, serverList);
            saveLocalCachedRecords(uid, merged);
            return merged;
          });
        }
        await flushSyncQueue(uid);
        await processBackgroundUploadQueue(uid);
      } catch (err) {
        console.warn('[RECONCILIATION] Background check warning:', err);
      }
    };

    const handleOnline = () => {
      console.log('[NETWORK] Conexão restabelecida. Sincronizando fila pendente...');
      runReconciliation();
    };

    window.addEventListener('online', handleOnline);
    const reconciliationInterval = setInterval(runReconciliation, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(reconciliationInterval);
    };
  }, [currentUser?.uid]);

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center text-stone-800 p-4">
        <div className="w-16 h-16 rounded-2xl bg-white border border-stone-200/80 flex items-center justify-center text-orange-600 mb-4 shadow-sm">
          <BookOpen className="w-8 h-8 animate-pulse" />
        </div>
        <h2 className="text-lg font-semibold text-stone-800">Diário Pessoal</h2>
        <div className="flex items-center gap-2 text-xs text-stone-500 mt-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
          <span>Carregando seu espaço...</span>
        </div>
      </div>
    );
  }

  // Not Logged In -> Show Auth Screen
  if (!currentUser) {
    return <AuthScreen />;
  }

  // Navigation handlers
  const handleOpenRecordForEdit = (rec: DiaryRecord) => {
    setSelectedRecordForEdit(rec);
    setActiveTab('edit');
  };

  const handleStartNewRecord = () => {
    setSelectedRecordForEdit(null);
    setActiveTab('new');
  };

  const handleRecordSaved = (savedRecord: DiaryRecord) => {
    if (currentUser?.uid && savedRecord) {
      setRecords((prev) => {
        const merged = mergeRecords(prev, [savedRecord]);
        saveLocalCachedRecords(currentUser.uid, merged);
        return merged;
      });
    }
    setSelectedRecordForEdit(null);
    setActiveTab('dashboard');
  };

  const handleOpenPdf = (
    url: string,
    title: string,
    fileName?: string,
    size?: number
  ) => {
    setPdfModalData({
      isOpen: true,
      url,
      title,
      fileName,
      fileSize: size,
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-800 flex flex-col font-sans pb-24 md:pb-8 selection:bg-orange-100 selection:text-orange-900">
      {/* Top Header */}
      <Header
        user={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        onOpenSearch={() => setActiveTab('archive')}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {activeTab === 'dashboard' && (
          <DashboardView
            user={currentUser}
            records={records}
            memories={memories}
            onNewRecord={handleStartNewRecord}
            onSelectRecord={handleOpenRecordForEdit}
            onViewAllRecords={() => setActiveTab('archive')}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveView
            user={currentUser}
            records={records}
            onSelectRecord={handleOpenRecordForEdit}
            onNewRecord={handleStartNewRecord}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {(activeTab === 'new' || activeTab === 'edit') && (
          <RecordEditor
            user={currentUser}
            initialRecord={selectedRecordForEdit}
            onSaved={handleRecordSaved}
            onCancel={() => {
              setSelectedRecordForEdit(null);
              setActiveTab('dashboard');
            }}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineView
            user={currentUser}
            records={records}
            onSelectRecord={handleOpenRecordForEdit}
            onNewRecord={handleStartNewRecord}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'profile' && (
          <IAUProfileView user={currentUser} />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* In-App PDF Viewer Modal */}
      <PDFViewerModal
        isOpen={pdfModalData.isOpen}
        onClose={() => setPdfModalData((prev) => ({ ...prev, isOpen: false }))}
        title={pdfModalData.title}
        pdfUrl={pdfModalData.url}
        fileName={pdfModalData.fileName}
        fileSize={pdfModalData.fileSize}
      />

      {/* Global Background Upload & Sync Indicator */}
      {currentUser && <GlobalSyncIndicator userId={currentUser.uid} />}

      {/* System Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
    </div>
  );
}
