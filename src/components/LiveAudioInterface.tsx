import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, Volume2, VolumeX, Bot, Sparkles } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { MODELS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';

const LiveAudioInterface: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcription, setTranscription] = useState<string[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);

  const startSession = async () => {
    setStatus('connecting');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const session = await ai.live.connect({
        model: MODELS.NATIVE_AUDIO,
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
            startMic();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcmData = new Int16Array(bytes.buffer);
              audioQueue.current.push(pcmData);
              if (!isPlaying.current) playNextChunk();
            }

            if (message.serverContent?.interrupted) {
              audioQueue.current = [];
              isPlaying.current = false;
            }

            if (message.serverContent?.modelTurn?.parts[0]?.text) {
              setTranscription(prev => [...prev.slice(-4), `AI: ${message.serverContent?.modelTurn?.parts[0]?.text}`]);
            }
          },
          onclose: () => stopSession(),
          onerror: (err) => {
            console.error('Live API Error:', err);
            setStatus('error');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "أنت مساعد صوتي ذكي لمدونة تقنية. تحدث باللغة العربية بأسلوب ودود ومحترف.",
        },
      });
      sessionRef.current = session;
    } catch (error) {
      console.error('Failed to connect:', error);
      setStatus('error');
    }
  };

  const startMic = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        if (isMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        sessionRef.current?.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };
    } catch (error) {
      console.error('Mic error:', error);
      setStatus('error');
      alert('تعذر الوصول إلى الميكروفون. يرجى التأكد من منح الإذن للمتصفح. إذا كنت تستخدم المعاينة داخل إطار (iframe)، قد تحتاج إلى فتح التطبيق في نافذة جديدة.');
      stopSession();
    }
  };

  const playNextChunk = async () => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const pcmData = audioQueue.current.shift()!;
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = playNextChunk;
    source.start();
  };

  const stopSession = () => {
    sessionRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    setIsActive(false);
    setStatus('idle');
    setTranscription([]);
  };

  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-12 px-4">
      <div className="bg-[#131314] rounded-3xl border border-white/5 shadow-2xl overflow-hidden text-center p-6 sm:p-12">
        <div className="mb-8">
          <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full mx-auto flex items-center justify-center transition-all duration-500 ${
            isActive ? 'bg-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.2)] scale-110' : 'bg-white/5'
          }`}>
            {isActive ? (
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Bot className="w-12 h-12 sm:w-16 sm:h-16 text-white" />
              </motion.div>
            ) : (
              <Bot className="w-12 h-12 sm:w-16 sm:h-16 text-stone-600" />
            )}
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">المساعد الصوتي المباشر</h2>
        <p className="text-stone-400 mb-8 sm:text-lg">تحدث مع المدون الذكي في الوقت الفعلي. اسأل عن أفكار للمقالات أو اطلب المساعدة في البحث.</p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          {!isActive ? (
            <button
              onClick={startSession}
              disabled={status === 'connecting'}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white text-black rounded-2xl font-bold hover:bg-stone-200 transition-all shadow-lg active:scale-95"
            >
              {status === 'connecting' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mic className="w-6 h-6" />}
              {status === 'connecting' ? 'جاري الاتصال...' : 'بدء المحادثة'}
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-5 sm:p-6 rounded-2xl transition-all active:scale-95 ${
                  isMuted ? 'bg-red-500/10 text-red-500' : 'bg-white/5 text-stone-300'
                }`}
              >
                {isMuted ? <MicOff className="w-7 h-7 sm:w-8 sm:h-8" /> : <Mic className="w-7 h-7 sm:w-8 sm:h-8" />}
              </button>
              <button
                onClick={stopSession}
                className="w-full sm:w-auto px-8 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
              >
                إنهاء المكالمة
              </button>
            </>
          )}
        </div>

        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-12 p-4 sm:p-6 bg-white/5 rounded-2xl text-right space-y-2 min-h-[150px] border border-white/5"
            >
              <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">
                <Sparkles className="w-3 h-3" />
                النص المباشر
              </div>
              {transcription.map((t, i) => (
                <p key={i} className="text-stone-300 text-sm leading-relaxed">{t}</p>
              ))}
              {transcription.length === 0 && <p className="text-stone-500 italic text-sm">أنا أستمع إليك...</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LiveAudioInterface;
