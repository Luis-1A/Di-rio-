import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserProfile,
  DiaryRecord,
  MemoryItem,
  TimeCapsule,
} from './types';
import {
  subscribeToRecords,
  subscribeToMemories,
  flushSyncQueue,
  mergeRecords,
  fetchRecordsDirectly,
} from './lib/firestoreService';
import { subscribeToAuth } from './lib/authService';
import {
  subscribeToTimeCapsules,
  getLocalCachedCapsules,
} from './lib/timeCapsuleService';
import { calculateMilestones } from './lib/milestoneEngine';
import { generateMonthlyRetrospective } from './lib/retrospectiveEngine';

import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ArchiveView } from './components/ArchiveView';
import { RecordEditor } from './components/RecordEditor';
import { TimelineView } from './components/TimelineView';
import { CalendarLifeView } from './components/CalendarLifeView';
import { ProfileView } from './components/ProfileView';
import { CinematicSplash } from './components/CinematicSplash';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { PDFViewerModal } from './components/PDFViewerModal';
import { RecordDetailView } from './components/RecordDetailView';
import { PhotoEditorModal } from './components/PhotoEditorModal';
import { TimeCapsuleModal } from './components/TimeCapsuleModal';
import { MonthlyRetrospectiveModal } from './components/MonthlyRetrospectiveModal';
import { MilestonesModal } from './components/MilestonesModal';
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
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [returnTab, setReturnTab] = useState<string>('dashboard');
  const [viewingRecord, setViewingRecord] = useState<DiaryRecord | null>(null);
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState<DiaryRecord | null>(null);
  const [newRecordType, setNewRecordType] = useState<any>('text');
  const [newRecordPrompt, setNewRecordPrompt] = useState<string>('');

  // Modals
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [timeCapsuleModalOpen, setTimeCapsuleModalOpen] = useState(false);
  const [retrospectiveModalOpen, setRetrospectiveModalOpen] = useState(false);
  const [milestonesModalOpen, setMilestonesModalOpen] = useState(false);
  const [showCinematicSplash, setShowCinematicSplash] = useState<boolean>(() => {
    return localStorage.getItem('diario_100_has_seen_intro') !== 'true';
  });

  // Computed Milestones & Retrospective
  const milestones = useMemo(() => calculateMilestones(records, capsules), [records, capsules]);
  const retrospective = useMemo(() => generateMonthlyRetrospective(records), [records]);

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

  // Photo Editor Modal State
  const [photoEditorData, setPhotoEditorData] = useState<{
    isOpen: boolean;
    record: DiaryRecord | null;
    imageUrl: string;
  }>({
    isOpen: false,
    record: null,
    imageUrl: '',
  });

  const handleOpenPhotoEditor = (record: DiaryRecord, imageUrl: string) => {
    setPhotoEditorData({
      isOpen: true,
      record,
      imageUrl,
    });
  };

  const handlePhotoEditorSaved = (newRecord: DiaryRecord) => {
    setRecords((prev) => [newRecord, ...prev.filter((r) => r.id !== newRecord.id)]);
    // Also display the new record
    setViewingRecord(newRecord);
    setActiveTab('view-record');
  };

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
        const cachedCapsules = getLocalCachedCapsules(user.uid);
        if (cachedCapsules.length > 0) {
          setCapsules(cachedCapsules);
        }
        flushSyncQueue(user.uid).catch((err) =>
          console.warn('Queue flush initial attempt:', err)
        );
      } else {
        setCurrentUser(null);
        setRecords([]);
        setMemories([]);
        setCapsules([]);
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

    const unsubCapsules = subscribeToTimeCapsules(
      uid,
      (list) => setCapsules(list),
      (err) => console.warn('Capsules sub err:', err)
    );

    return () => {
      unsubRecords();
      unsubMemories();
      unsubCapsules();
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
  const handleOpenRecordForView = (rec: DiaryRecord) => {
    setViewingRecord(rec);
    setReturnTab(activeTab === 'view-record' || activeTab === 'edit' || activeTab === 'new' ? 'dashboard' : activeTab);
    setActiveTab('view-record');
  };

  const handleStartEditFromView = (rec: DiaryRecord) => {
    setSelectedRecordForEdit(rec);
    setActiveTab('edit');
  };

  const handleStartNewRecord = (type: any = 'text', prompt: string = '') => {
    setSelectedRecordForEdit(null);
    setViewingRecord(null);
    setNewRecordType(type);
    setNewRecordPrompt(prompt);
    setReturnTab(activeTab === 'view-record' || activeTab === 'edit' || activeTab === 'new' ? 'dashboard' : activeTab);
    setActiveTab('new');
  };

  const handleRecordUpdated = (updatedRecord: DiaryRecord) => {
    if (currentUser?.uid && updatedRecord) {
      setRecords((prev) => {
        const merged = mergeRecords(prev, [updatedRecord]);
        saveLocalCachedRecords(currentUser.uid, merged);
        return merged;
      });
      if (viewingRecord?.id === updatedRecord.id) {
        setViewingRecord(updatedRecord);
      }
    }
  };

  const handleRecordSaved = (savedRecord: DiaryRecord) => {
    if (currentUser?.uid && savedRecord) {
      setRecords((prev) => {
        const merged = mergeRecords(prev, [savedRecord]);
        saveLocalCachedRecords(currentUser.uid, merged);
        return merged;
      });
    }
    // Return to clean read-only view with freshly saved data
    setViewingRecord(savedRecord);
    setSelectedRecordForEdit(null);
    setActiveTab('view-record');
  };

  const handleRecordDeleted = (deletedId: string) => {
    if (currentUser?.uid) {
      setRecords((prev) => {
        const updated = prev.filter((r) => r.id !== deletedId);
        saveLocalCachedRecords(currentUser.uid, updated);
        return updated;
      });
    }
    setViewingRecord(null);
    setSelectedRecordForEdit(null);
    setActiveTab(returnTab || 'dashboard');
  };

  const handleCancelEdit = () => {
    setSelectedRecordForEdit(null);
    if (viewingRecord) {
      setActiveTab('view-record');
    } else {
      setActiveTab(returnTab || 'dashboard');
    }
  };

  const handleBackFromView = () => {
    setViewingRecord(null);
    setActiveTab(returnTab || 'dashboard');
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
        setActiveTab={(tab) => {
          if (tab !== 'view-record') {
            setViewingRecord(null);
            setSelectedRecordForEdit(null);
          }
          setActiveTab(tab);
        }}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        onOpenSearch={() => {
          setViewingRecord(null);
          setActiveTab('archive');
        }}
        onOpenTimeCapsules={() => setTimeCapsuleModalOpen(true)}
        onOpenRetrospective={() => setRetrospectiveModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {activeTab === 'dashboard' && (
          <DashboardView
            user={currentUser}
            records={records}
            memories={memories}
            capsules={capsules}
            onNewRecord={handleStartNewRecord}
            onSelectRecord={handleOpenRecordForView}
            onViewAllRecords={() => setActiveTab('archive')}
            onOpenPdf={handleOpenPdf}
            onEditPhoto={handleOpenPhotoEditor}
            onOpenTimeCapsules={() => setTimeCapsuleModalOpen(true)}
            onOpenRetrospective={() => setRetrospectiveModalOpen(true)}
            onOpenMilestones={() => setMilestonesModalOpen(true)}
            onOpenCalendar={() => setActiveTab('calendar')}
            onRecordUpdated={handleRecordUpdated}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarLifeView
            user={currentUser}
            records={records}
            onSelectRecord={handleOpenRecordForView}
            onNewRecord={handleStartNewRecord}
            onOpenPdf={handleOpenPdf}
            onEditPhoto={handleOpenPhotoEditor}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveView
            user={currentUser}
            records={records}
            onSelectRecord={handleOpenRecordForView}
            onNewRecord={handleStartNewRecord}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'view-record' && viewingRecord && (
          <RecordDetailView
            user={currentUser}
            record={viewingRecord}
            onBack={handleBackFromView}
            onEdit={handleStartEditFromView}
            onDeleted={handleRecordDeleted}
            onOpenPdf={handleOpenPdf}
            onEditPhoto={handleOpenPhotoEditor}
            onRecordUpdated={handleRecordUpdated}
          />
        )}

        {(activeTab === 'new' || activeTab === 'edit') && (
          <RecordEditor
            user={currentUser}
            initialRecord={selectedRecordForEdit}
            initialType={newRecordType}
            initialPrompt={newRecordPrompt}
            onSaved={handleRecordSaved}
            onCancel={handleCancelEdit}
            onOpenPdf={handleOpenPdf}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineView
            user={currentUser}
            records={records}
            onSelectRecord={handleOpenRecordForView}
            onNewRecord={handleStartNewRecord}
            onOpenPdf={handleOpenPdf}
            onEditPhoto={handleOpenPhotoEditor}
          />
        )}

        {activeTab === 'profile' && currentUser && (
          <ProfileView
            user={currentUser}
            records={records}
            capsules={capsules}
            milestones={milestones}
            onShowIntro={() => setShowCinematicSplash(true)}
            onOpenDiagnostics={() => setDiagnosticsOpen(true)}
            onSelectCollection={() => {
              setActiveTab('archive');
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab !== 'view-record') {
            setViewingRecord(null);
            setSelectedRecordForEdit(null);
          }
          setActiveTab(tab);
        }}
      />

      {/* In-App PDF Viewer Modal */}
      <PDFViewerModal
        isOpen={pdfModalData.isOpen}
        onClose={() => setPdfModalData((prev) => ({ ...prev, isOpen: false }))}
        title={pdfModalData.title}
        pdfUrl={pdfModalData.url}
        fileName={pdfModalData.fileName}
        fileSize={pdfModalData.fileSize}
      />

      {/* Integrated Photo Editor Modal */}
      {photoEditorData.record && (
        <PhotoEditorModal
          isOpen={photoEditorData.isOpen}
          onClose={() => setPhotoEditorData((prev) => ({ ...prev, isOpen: false }))}
          record={photoEditorData.record}
          sourceRecord={photoEditorData.record}
          imageUrl={photoEditorData.imageUrl}
          initialImageUrl={photoEditorData.imageUrl}
          user={currentUser}
          currentUser={currentUser}
          onSavedNewPhoto={handlePhotoEditorSaved}
        />
      )}

      {/* Time Capsule Modal */}
      <TimeCapsuleModal
        isOpen={timeCapsuleModalOpen}
        onClose={() => setTimeCapsuleModalOpen(false)}
        user={currentUser}
        capsules={capsules}
        onCapsulesChanged={() => {
          if (currentUser?.uid) {
            const updated = getLocalCachedCapsules(currentUser.uid);
            setCapsules(updated);
          }
        }}
      />

      {/* Monthly Retrospective Modal (Wrapped Style) */}
      <MonthlyRetrospectiveModal
        isOpen={retrospectiveModalOpen}
        onClose={() => setRetrospectiveModalOpen(false)}
        retrospective={retrospective}
        onOpenRecord={handleOpenRecordForView}
      />

      {/* Milestones & Meaningful Gamification Modal */}
      <MilestonesModal
        isOpen={milestonesModalOpen}
        onClose={() => setMilestonesModalOpen(false)}
        milestones={milestones}
      />

      {/* System Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />

      {/* Cinematic Splash Screen */}
      {showCinematicSplash && (
        <CinematicSplash
          onStart={() => {
            localStorage.setItem('diario_100_has_seen_intro', 'true');
            setShowCinematicSplash(false);
          }}
          canDismiss={localStorage.getItem('diario_100_has_seen_intro') === 'true'}
        />
      )}
    </div>
  );
}
