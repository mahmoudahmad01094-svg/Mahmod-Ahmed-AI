import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { signInWithPopup, signInAnonymously, googleProvider, signOut, auth, db, deleteDoc } from './firebase';
import { LogIn, LogOut, Plus, MessageSquare, Mic, LayoutDashboard, Settings, Menu, X, Sparkles, History, Loader2, Trash2, User, ArrowRight } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, getDocFromServer, doc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
import { motion, AnimatePresence } from 'motion/react';
import ChatInterface from './components/ChatInterface';
import SplashScreen from './components/SplashScreen';

const LiveAudioInterface = React.lazy(() => import('./components/LiveAudioInterface'));

type View = 'chat' | 'live' | 'settings';

const AppContent = () => {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [showSplash, setShowSplash] = useState(true);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('userId', '==', user.uid),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSessions(sessionsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => unsubscribe();
  }, [user]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setChatKey(prev => prev + 1);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setCurrentView('chat');
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    
    try {
      await deleteDoc(doc(db, 'chats', sessionToDelete));
      if (currentSessionId === sessionToDelete) {
        setCurrentSessionId(null);
        setChatKey(prev => prev + 1);
      }
      setSessionToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${sessionToDelete}`);
    }
  };

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black overflow-hidden relative font-sans" dir="rtl">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
              x: [0, 100, 0],
              y: [0, -50, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] bg-blue-600/20 blur-[120px] rounded-full"
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
              x: [0, -100, 0],
              y: [0, 50, 0]
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] bg-purple-600/20 blur-[120px] rounded-full"
          />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl w-full text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
              className="w-24 h-24 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-blue-500/20"
            >
              <Sparkles className="w-12 h-12 text-white" />
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-5xl sm:text-7xl font-black text-white mb-6 tracking-tight"
            >
              Mahmoud Ai
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-stone-400 text-xl sm:text-2xl mb-12 leading-relaxed max-w-lg mx-auto"
            >
              اكتشف قوة الذكاء الاصطناعي في التدوين والإبداع. ابدأ رحلتك الآن.
            </motion.p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-bold text-lg hover:bg-stone-200 transition-all shadow-xl shadow-white/10"
              >
                <LogIn className="w-6 h-6" />
                تسجيل الدخول بجوجل
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => signInAnonymously(auth)}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white/5 text-white border border-white/10 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/10 transition-all backdrop-blur-md"
              >
                <User className="w-6 h-6" />
                الدخول كزائر
              </motion.button>
            </div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-20 pt-8 border-t border-white/5"
            >
              <p className="text-stone-500 font-medium">
                تصميم م/محمود احمد 01094271617
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex font-sans" dir="rtl">
      {/* Sidebar - Persistent on Desktop, Overlay on Mobile */}
      <aside 
        className={`fixed inset-y-0 right-0 z-[70] w-full sm:w-[320px] bg-[#131314] border-l border-[#282a2d] transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) lg:relative lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <span className="font-medium">Mahmoud Ai</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)} 
              className="p-2 hover:bg-white/5 rounded-full lg:hidden"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto scrollbar-hide">
            <section>
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4 px-2">Gems</h3>
              <div className="space-y-1">
                <SidebarItem 
                  icon={<MessageSquare />} 
                  label="المساعد الذكي" 
                  active={currentView === 'chat' && !currentSessionId} 
                  onClick={() => { setCurrentSessionId(null); setCurrentView('chat'); setIsSidebarOpen(false); }} 
                />
                <SidebarItem 
                  icon={<Mic />} 
                  label="المساعد الصوتي" 
                  active={currentView === 'live'} 
                  onClick={() => { setCurrentView('live'); setIsSidebarOpen(false); }} 
                />
              </div>
            </section>

            <section>
              <div className="space-y-1">
                <SidebarItem 
                  icon={<Plus />} 
                  label="محادثة جديدة" 
                  active={false} 
                  onClick={handleNewChat} 
                />
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4 px-2">السجل</h3>
              <div className="space-y-1">
                {sessions.length === 0 ? (
                  <p className="text-xs text-stone-600 px-4">لا توجد محادثات محفوظة</p>
                ) : (
                  sessions.map(session => (
                    <SidebarItem 
                      key={session.id}
                      icon={<History className="w-4 h-4" />} 
                      label={session.title || 'محادثة بدون عنوان'} 
                      active={currentSessionId === session.id} 
                      onClick={() => handleSelectSession(session.id)} 
                      onDelete={(e) => handleDeleteSession(e, session.id)}
                    />
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="pt-6 border-t border-white/5 space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center overflow-hidden border border-white/10">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-6 h-6 text-blue-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{profile?.displayName || (user.isAnonymous ? 'زائر' : 'مستخدم')}</p>
                <p className="text-xs text-stone-500 truncate">{profile?.email || 'بدون بريد إلكتروني'}</p>
              </div>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 p-3 text-red-400 hover:bg-red-400/10 rounded-2xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              {user.isAnonymous ? 'إنهاء الجلسة' : 'تسجيل الخروج'}
            </button>
            
            <div className="pt-4 text-center bg-blue-500/5 rounded-xl p-2 border border-blue-500/10">
              <p className="text-[11px] text-blue-400 font-bold">
                تصميم م/محمود احمد 01094271617
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {sessionToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSessionToDelete(null)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-stone-900 border border-white/10 p-6 rounded-3xl max-w-sm w-full shadow-2xl text-right"
                dir="rtl"
              >
                <h3 className="text-xl font-bold text-white mb-4">حذف المحادثة؟</h3>
                <p className="text-stone-400 mb-8">هل أنت متأكد من حذف هذه المحادثة؟ لا يمكن التراجع عن هذا الإجراء.</p>
                <div className="flex gap-3">
                  <button
                    onClick={confirmDeleteSession}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-2xl font-bold transition-colors"
                  >
                    حذف
                  </button>
                  <button
                    onClick={() => setSessionToDelete(null)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-2xl font-bold transition-colors border border-white/10"
                  >
                    إلغاء
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Top Header */}
        <header className="h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0 bg-black/50 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50">
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button 
              onClick={handleNewChat}
              className="p-2 hover:bg-white/10 rounded-full transition-colors lg:hidden"
              aria-label="New chat"
            >
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400 sm:hidden" />
              <span className="text-lg sm:text-xl font-bold tracking-tight text-blue-400">Mahmoud Ai</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4">
            {currentSessionId && (
              <button
                onClick={(e) => handleDeleteSession(e, currentSessionId)}
                className="p-2 hover:bg-red-500/10 text-stone-400 hover:text-red-400 rounded-full transition-colors"
                title="حذف المحادثة الحالية"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-white">{profile?.displayName?.split(' ')[0] || (user.isAnonymous ? 'زائر' : 'مستخدم')}</p>
              <p className="text-[10px] text-stone-500">{user.isAnonymous ? 'جلسة مؤقتة' : 'نسخة مجانية'}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center overflow-hidden border border-white/10">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-4 h-4 text-blue-400" />
              )}
            </div>
          </div>
        </header>
        
        {/* Main Viewport */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col h-full overflow-hidden"
            >
              {currentView === 'chat' && (
                <ChatInterface 
                  key={currentSessionId || chatKey} 
                  sessionId={currentSessionId} 
                  onSessionCreated={(id) => setCurrentSessionId(id)}
                />
              )}
              {currentView === 'live' && (
                <React.Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>}>
                  <LiveAudioInterface />
                </React.Suspense>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick, onDelete }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, onDelete?: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all group relative ${
      active ? 'bg-white/10 text-white font-medium' : 'text-stone-400 hover:bg-white/5'
    }`}
  >
    <div className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-400' : 'text-stone-500'}`}>
      {icon}
    </div>
    <span className="text-sm truncate flex-1 text-right">{label}</span>
    
    {onDelete && (
      <div 
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-stone-500 hover:text-red-400 rounded-lg transition-all"
      >
        <Trash2 className="w-4 h-4" />
      </div>
    )}
  </button>
);

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
