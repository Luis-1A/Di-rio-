import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  DiaryRecord,
  MemoryItem,
} from './types';
import {
  subscribeToRecords,
  subscribeToMemories,
  flushSyncQueue,
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
import { BookOpen, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App Data States (Real Firestore Collections)
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

  // 2. Real-time Firestore Subscriptions for user data
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubRecords = subscribeToRecords(
      currentUser.uid,
      (list) => setRecords(list),
      (err) => console.warn('Records sub err:', err)
    );

    const unsubMemories = subscribeToMemories(
      currentUser.uid,
      (list) => setMemories(list),
      (err) => console.warn('Memories sub err:', err)
    );

    return () => {
      unsubRecords();
      unsubMemories();
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
            onSaved={() => {
              setSelectedRecordForEdit(null);
              setActiveTab('dashboard');
            }}
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

      {/* System Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
    </div>
  );
}
