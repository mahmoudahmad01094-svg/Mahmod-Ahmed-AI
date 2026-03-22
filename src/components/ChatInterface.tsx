import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, User, Bot, Loader2, Search, MapPin, Sparkles, 
  Image as ImageIcon, Mic, Plus, History, Lightbulb, 
  Code, PenTool, Video, FilePlus, ImagePlus, Camera, X,
  ChevronDown
} from 'lucide-react';
import { createChat, getSearchGroundedResponse, getMapsGroundedResponse, generateImage, generateFreeImage, generateVideo } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';

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

interface Message {
  role: 'user' | 'model';
  content: string;
  type?: 'text' | 'search' | 'maps' | 'chat' | 'image' | 'free_image' | 'video';
  sources?: any[];
  generatedUrl?: string;
}

const SUGGESTIONS = [
  { icon: "🍌", text: "إنشاء صورة" },
  { icon: "🎸", text: "إنشاء موسيقى" },
  { icon: "💡", text: "بناء فكرة" },
  { icon: "✍️", text: "كتابة أي شيء" },
  { icon: "🎬", text: "أنشئ فيديو" },
];

const PLUS_MENU_ITEMS = [
  { icon: <Sparkles className="w-5 h-5 text-blue-400" />, label: "دردشة ذكية", mode: 'chat' as const },
  { icon: <ImageIcon className="w-5 h-5 text-indigo-400" />, label: "أنشأ صور", mode: 'image' as const },
  { icon: <Sparkles className="w-5 h-5 text-cyan-400" />, label: "أنشأ صور مجانا", mode: 'free_image' as const },
  { icon: <Code className="w-5 h-5 text-emerald-400" />, label: "كود برمجي", mode: 'chat' as const },
  { icon: <Video className="w-5 h-5 text-red-400" />, label: "أنشأ فيديو", mode: 'video' as const },
  { icon: <Search className="w-5 h-5 text-purple-400" />, label: "بحث صور", mode: 'search' as const },
  { icon: <MapPin className="w-5 h-5 text-yellow-400" />, label: "خرائط", mode: 'maps' as const },
];

const IMAGE_MENU_ITEMS = [
  { icon: <FilePlus className="w-5 h-5 text-orange-400" />, label: "إضافة ملفات", type: 'file' },
  { icon: <ImagePlus className="w-5 h-5 text-pink-400" />, label: "صور", type: 'image' },
  { icon: <Camera className="w-5 h-5 text-yellow-400" />, label: "كاميرا", type: 'camera' },
];

interface ChatInterfaceProps {
  sessionId?: string | null;
  onSessionCreated?: (id: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ sessionId, onSessionCreated }) => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'chat' | 'search' | 'maps' | 'image' | 'free_image' | 'video'>('chat');
  const [selectedPlusItem, setSelectedPlusItem] = useState<typeof PLUS_MENU_ITEMS[0] | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const imageMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!chatRef.current) {
      chatRef.current = createChat();
    }

    const checkApiKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkApiKey();

    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setIsPlusMenuOpen(false);
      }
      if (imageMenuRef.current && !imageMenuRef.current.contains(event.target as Node)) {
        setIsImageMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!sessionId || !user) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', sessionId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => doc.data() as Message);
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${sessionId}/messages`);
    });

    return () => unsubscribe();
  }, [sessionId, user]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, loading]);

  const handleFileAction = (type: string) => {
    setIsImageMenuOpen(false);
    if (type === 'file') fileInputRef.current?.click();
    if (type === 'image') imageInputRef.current?.click();
    if (type === 'camera') cameraInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // For now, we just log it and show a message. 
      // In a real app, you'd upload this to storage.
      const userMessage: Message = { 
        role: 'user', 
        content: `تم اختيار ملف: ${file.name} (${(file.size / 1024).toFixed(2)} KB)` 
      };
      setMessages(prev => [...prev, userMessage]);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || loading || !user) return;

    if ((mode === 'image' || mode === 'video') && !hasApiKey) {
      if (window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      }
      return;
    }

    let currentSid = sessionId;
    if (!currentSid) {
      try {
        const sessionDoc = await addDoc(collection(db, 'chats'), {
          userId: user.uid,
          title: textToSend.substring(0, 30) + (textToSend.length > 30 ? '...' : ''),
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp()
        });
        currentSid = sessionDoc.id;
        if (onSessionCreated) onSessionCreated(currentSid);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'chats');
      }
    }

    const userMessage: Message = { role: 'user', content: textToSend };
    try {
      await addDoc(collection(db, 'chats', currentSid!, 'messages'), {
        role: userMessage.role,
        content: userMessage.content,
        sessionId: currentSid,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'chats', currentSid!), {
        lastMessageAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${currentSid}/messages`);
    }

    if (!sessionId) {
      setMessages(prev => [...prev, userMessage]);
    }
    
    setInput('');
    setLoading(true);

    try {
      let responseText = '';
      let sources: any[] = [];
      let generatedUrl = '';

      if (mode === 'search') {
        const result = await getSearchGroundedResponse(textToSend);
        responseText = result.text;
        sources = result.sources;
      } else if (mode === 'maps') {
        let location = undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch (e) {
          console.warn('Location access denied');
        }
        const result = await getMapsGroundedResponse(textToSend, location);
        responseText = result.text;
        sources = result.sources;
      } else if (mode === 'image') {
        generatedUrl = await generateImage(textToSend);
        responseText = "تم توليد الصورة بناءً على طلبك.";
      } else if (mode === 'free_image') {
        generatedUrl = await generateFreeImage(textToSend);
        responseText = "تم توليد الصورة المجانية بناءً على طلبك.";
      } else if (mode === 'video') {
        generatedUrl = await generateVideo(textToSend);
        responseText = "تم توليد الفيديو بناءً على طلبك.";
      } else {
        const result = await chatRef.current.sendMessage({ message: textToSend });
        responseText = result.text;
      }

      const modelMessageData: any = { 
        role: 'model', 
        content: responseText, 
        sessionId: currentSid,
        createdAt: serverTimestamp()
      };

      if (mode !== 'chat') modelMessageData.type = mode;
      if (sources && sources.length > 0) modelMessageData.sources = sources;
      if (generatedUrl) modelMessageData.generatedUrl = generatedUrl;

      try {
        await addDoc(collection(db, 'chats', currentSid!, 'messages'), modelMessageData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `chats/${currentSid}/messages`);
      }

      if (!sessionId) {
        setMessages(prev => [...prev, {
          role: 'model',
          content: responseText,
          type: mode,
          sources,
          generatedUrl
        }]);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      let errorMessage = 'عذراً، حدث خطأ ما أثناء معالجة طلبك.';
      
      if (error.message?.includes('403') || error.message?.includes('PERMISSION_DENIED')) {
        errorMessage = 'خطأ في الصلاحيات (403): يبدو أن مفتاح API المستخدم لا يمتلك صلاحية الوصول لهذا الموديل. يرجى التأكد من استخدام مفتاح API مدفوع أو تفعيل الموديل في إعدادات Google Cloud.';
      } else if (error.message?.includes('quota')) {
        errorMessage = 'تم تجاوز الحصة المسموح بها (Quota Exceeded). يرجى المحاولة لاحقاً.';
      }

      const errorMsgData: any = { 
        role: 'model', 
        content: errorMessage,
        sessionId: currentSid,
        createdAt: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'chats', currentSid!, 'messages'), errorMsgData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `chats/${currentSid}/messages`);
      }

      if (!sessionId) {
        setMessages(prev => [...prev, {
          role: 'model',
          content: errorMessage
        }]);
      }
    }
    setLoading(false);
  };

  const handlePlusItemSelect = (item: typeof PLUS_MENU_ITEMS[0]) => {
    setSelectedPlusItem(item);
    setMode(item.mode);
    setIsPlusMenuOpen(false);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full bg-black">
      {/* Hidden Inputs */}
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleFileChange} />
      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} className="hidden" onChange={handleFileChange} />

      {/* Messages Area */}
      <div 
        ref={scrollRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-10 scrollbar-hide"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center sm:items-end justify-center space-y-8 sm:space-y-12 px-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center sm:text-right space-y-2"
            >
              <h1 className="text-3xl sm:text-4xl font-medium text-white">
                مرحباً {profile?.displayName?.split(' ')[0] || 'GTX'}
              </h1>
              <h2 className="text-3xl sm:text-4xl font-medium text-white">من أين نبدأ؟</h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => handleSend(s.text)}
                  className="gemini-pill flex items-center justify-between gap-3 hover:bg-white/5 w-full text-right"
                >
                  <span className="text-white font-medium text-sm sm:text-base">{s.text}</span>
                  <span className="text-xl">{s.icon}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8 sm:space-y-12 pb-24">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 sm:gap-6 group"
              >
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-stone-800 text-white' : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User className="w-5 h-5 sm:w-6 sm:h-6" /> : <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />}
                </div>
                <div className="flex-1 pt-0.5 sm:pt-1 min-w-0">
                  <div className={`prose prose-sm sm:prose-base prose-invert max-w-none ${msg.role === 'model' ? 'text-stone-200' : 'text-stone-400'}`}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  
                  {msg.generatedUrl && (
                    <div className="mt-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl max-w-lg">
                      {(msg.type === 'image' || msg.type === 'free_image') ? (
                        <img src={msg.generatedUrl} alt="Generated" className="w-full h-auto" referrerPolicy="no-referrer" />
                      ) : (
                        <video src={msg.generatedUrl} controls className="w-full h-auto" />
                      )}
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      {msg.sources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.web?.uri || source.maps?.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-[#1e1f20] rounded-full text-xs text-stone-300 hover:bg-stone-800 transition-colors border border-white/5"
                        >
                          <Search className="w-3 h-3" />
                          {source.web?.title || source.maps?.title || 'رابط المصدر'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex gap-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 animate-pulse">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 space-y-4 pt-4">
                  <div className="h-2 bg-stone-800 rounded-full w-3/4 animate-pulse" />
                  <div className="h-2 bg-stone-800 rounded-full w-1/2 animate-pulse" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={scrollToBottom}
            className="fixed bottom-24 sm:bottom-32 left-1/2 -translate-x-1/2 p-2 bg-white/10 backdrop-blur-md border border-white/10 rounded-full text-white shadow-xl hover:bg-white/20 transition-all z-50"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="px-2 sm:px-4 pb-4 sm:pb-6 sticky bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-10">
        <div className="max-w-3xl mx-auto">
          <div className="bg-[#1e1f20] rounded-[2rem] sm:rounded-[2.5rem] p-1 sm:p-2 shadow-2xl border border-white/5">
            <div className="flex items-end p-1 sm:p-2 gap-1 sm:gap-2 relative">
              <div className="flex items-center gap-0.5 sm:gap-1 pl-1 sm:pl-2 pb-1">
                {/* Plus Menu */}
                <div className="relative" ref={plusMenuRef}>
                  <button 
                    onClick={() => { setIsPlusMenuOpen(!isPlusMenuOpen); setIsImageMenuOpen(false); }}
                    className={`p-2 sm:p-3 hover:text-white hover:bg-white/5 rounded-full transition-all ${isPlusMenuOpen ? 'text-white bg-white/10 rotate-45' : 'text-stone-400'}`}
                  >
                    {selectedPlusItem ? selectedPlusItem.icon : <Plus className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </button>
                  
                  <AnimatePresence>
                    {isPlusMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed sm:absolute bottom-24 sm:bottom-16 left-4 right-4 sm:left-auto sm:right-0 sm:w-56 bg-[#131314] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden z-[100] py-2"
                      >
                        <div className="px-4 py-2 border-b border-white/5 mb-2 sm:hidden">
                          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">اختر وضع الدردشة</p>
                        </div>
                        {PLUS_MENU_ITEMS.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => handlePlusItemSelect(item)}
                            className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3 hover:bg-white/5 text-stone-300 hover:text-white transition-colors text-right"
                            dir="rtl"
                          >
                            <div className="flex-shrink-0 scale-100">{item.icon}</div>
                            <span className="text-sm font-medium">{item.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Image Menu */}
                <div className="relative" ref={imageMenuRef}>
                  <button 
                    onClick={() => { setIsImageMenuOpen(!isImageMenuOpen); setIsPlusMenuOpen(false); }}
                    className={`p-2 sm:p-3 hover:text-white hover:bg-white/5 rounded-full transition-all ${isImageMenuOpen ? 'text-white bg-white/10' : 'text-stone-400'}`}
                  >
                    <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>

                  <AnimatePresence>
                    {isImageMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed sm:absolute bottom-24 sm:bottom-16 left-4 right-4 sm:left-auto sm:right-0 sm:w-56 bg-[#131314] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden z-[100] py-2"
                      >
                        <div className="px-4 py-2 border-b border-white/5 mb-2 sm:hidden">
                          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">إضافة وسائط</p>
                        </div>
                        {IMAGE_MENU_ITEMS.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleFileAction(item.type)}
                            className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3 hover:bg-white/5 text-stone-300 hover:text-white transition-colors text-right"
                            dir="rtl"
                          >
                            <div className="flex-shrink-0 scale-100">{item.icon}</div>
                            <span className="text-sm font-medium">{item.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder="اسأل Gemini"
                className="flex-1 bg-transparent border-none focus:ring-0 text-base sm:text-lg py-2 sm:py-3 px-1 sm:px-2 resize-none max-h-40 scrollbar-hide text-right"
                rows={1}
                dir="rtl"
              />
              
              <div className="flex items-center gap-0.5 sm:gap-1 pr-1 sm:pr-2 pb-1">
                <button className="p-2 sm:p-3 text-stone-400 hover:text-white hover:bg-white/5 rounded-full transition-colors">
                  <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  className={`p-2 sm:p-3 rounded-full transition-all ${
                    input.trim() && !loading 
                      ? 'bg-white text-black shadow-lg scale-105 sm:scale-110' 
                      : 'text-stone-600'
                  }`}
                >
                  <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>
          </div>
          <p className="text-center text-[10px] text-stone-500 mt-3">
            قد يعرض AI Blogger معلومات غير دقيقة، لذا تحقق من ردوده. <a href="#" className="underline">خصوصيتك وتطبيقات Gemini</a>
          </p>
          <p className="text-center text-[11px] text-blue-400 font-bold mt-2">
            تصميم م/محمود احمد 01094271617
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
