import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  DiaryRecord,
  MemoryItem,
  ChatMessage,
  IAUProfileSettings,
} from './types';
import {
  getIAUSettings,
  defaultIAUSettings,
  subscribeToRecords,
  subscribeToMemories,
  subscribeToMessages,
  flushSyncQueue,
} from './lib/firestoreService';
import { subscribeToAuth } from './lib/authService';

import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ArchiveView } from './components/ArchiveView';
import { RecordEditor } from './components/RecordEditor';
import { ChatView } from './components/ChatView';
import { TimelineView } from './components/TimelineView';
import { MemoriesView } from './components/MemoriesView';
import { IAUProfileView } from './components/IAUProfileView';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { BookOpen, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App Data States (Real Firestore Collections)
  const [records, setRecords] = useState<DiaryRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [iauSettings, setIauSettings] = useState<IAUProfileSettings>(defaultIAUSettings);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState<DiaryRecord | null>(null);

  // Diagnostics Modal
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // 1. Unified Auth state listener
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user: UserProfile | null) => {
      if (user) {
        try {
          const settings = await getIAUSettings(user.uid);
          setCurrentUser(user);
          setIauSettings(settings);
          // Try flushing any pending offline sync queue
          flushSyncQueue(user.uid).catch((err) =>
            console.warn('Queue flush initial attempt:', err)
          );
        } catch (err) {
          console.error('Error loading settings after auth:', err);
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(null);
        setRecords([]);
        setMemories([]);
        setMessages([]);
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

    const unsubMessages = subscribeToMessages(
      currentUser.uid,
      (list) => setMessages(list),
      (err) => console.warn('Messages sub err:', err)
    );

    return () => {
      unsubRecords();
      unsubMemories();
      unsubMessages();
    };
  }, [currentUser?.uid]);

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-stone-100 p-4">
        <div className="w-16 h-16 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
          <BookOpen className="w-8 h-8 animate-pulse" />
        </div>
        <h2 className="text-lg font-serif font-bold text-stone-200">Diário Pessoal</h2>
        <div className="flex items-center gap-2 text-xs text-stone-500 mt-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
          <span>Conectando ao Firebase...</span>
        </div>
      </div>
    );
  }

  // Not Logged In -> Show Auth Screen (Login / Register / Forgot Password)
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

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans pb-20 md:pb-6 selection:bg-amber-600/30 selection:text-amber-200">
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
            onOpenChat={() => setActiveTab('chat')}
            onSelectRecord={handleOpenRecordForEdit}
            onViewAllRecords={() => setActiveTab('archive')}
            onViewAllMemories={() => setActiveTab('memories')}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveView
            user={currentUser}
            records={records}
            onSelectRecord={handleOpenRecordForEdit}
            onNewRecord={handleStartNewRecord}
          />
        )}

        {(activeTab === 'new' || activeTab === 'edit') && (
          <RecordEditor
            user={currentUser}
            initialRecord={selectedRecordForEdit}
            onSaved={() => {
              setSelectedRecordForEdit(null);
              setActiveTab('archive');
            }}
            onCancel={() => {
              setSelectedRecordForEdit(null);
              setActiveTab('dashboard');
            }}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView
            user={currentUser}
            messages={messages}
            records={records}
            memories={memories}
            iauSettings={iauSettings}
            onSelectRecord={handleOpenRecordForEdit}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineView
            user={currentUser}
            records={records}
            memories={memories}
            messages={messages}
            onSelectRecord={handleOpenRecordForEdit}
            onOpenChat={() => setActiveTab('chat')}
          />
        )}

        {activeTab === 'memories' && (
          <MemoriesView user={currentUser} memories={memories} />
        )}

        {activeTab === 'profile' && (
          <IAUProfileView
            user={currentUser}
            settings={iauSettings}
            onSettingsUpdated={(updated) => setIauSettings(updated)}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* System Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
    </div>
  );
}
