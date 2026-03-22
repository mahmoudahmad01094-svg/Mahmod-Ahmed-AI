import React, { useState, useEffect } from 'react';
import { db, doc, getDoc, setDoc, addDoc, collection, Timestamp, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthProvider';
import { Post } from '../types';
import { Save, Sparkles, X, Tag as TagIcon, Loader2, Wand2, Plus } from 'lucide-react';
import { generateBlogContent } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface BlogEditorProps {
  postId: string | null;
  onSaved: () => void;
}

const BlogEditor: React.FC<BlogEditorProps> = ({ postId, onSaved }) => {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (postId) {
      const fetchPost = async () => {
        setLoading(true);
        try {
          const postDoc = await getDoc(doc(db, 'posts', postId));
          if (postDoc.exists()) {
            const data = postDoc.data() as Post;
            setTitle(data.title);
            setContent(data.content);
            setTags(data.tags);
            setIsPublished(data.isPublished);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `posts/${postId}`);
        }
        setLoading(false);
      };
      fetchPost();
    }
  }, [postId]);

  const handleSave = async () => {
    if (!profile || !title || !content) return;
    setLoading(true);
    try {
      const postData: Omit<Post, 'id'> = {
        title,
        content,
        authorId: profile.uid,
        authorName: profile.displayName || 'Anonymous',
        createdAt: postId ? (await getDoc(doc(db, 'posts', postId))).data()?.createdAt : Timestamp.now(),
        updatedAt: Timestamp.now(),
        tags,
        isPublished,
      };

      if (postId) {
        await setDoc(doc(db, 'posts', postId), postData);
      } else {
        await addDoc(collection(db, 'posts'), postData);
      }
      onSaved();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, postId ? `posts/${postId}` : 'posts');
    }
    setLoading(false);
  };

  const handleAiGenerate = async () => {
    if (!title) {
      alert('يرجى كتابة عنوان أو فكرة للمقال أولاً');
      return;
    }
    setAiLoading(true);
    try {
      const generated = await generateBlogContent(title);
      if (generated) setContent(generated);
    } catch (error) {
      console.error('AI Generation error:', error);
    }
    setAiLoading(false);
  };

  const addTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  if (loading && postId) return <div className="text-center py-20">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-stone-900">{postId ? 'تعديل المقال' : 'مقال جديد'}</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPreview(!preview)}
            className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
          >
            {preview ? 'تعديل' : 'معاينة'}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ المقال
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <input
              type="text"
              placeholder="عنوان المقال..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-3xl font-bold border-none focus:ring-0 placeholder-stone-300 mb-6"
            />
            
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleAiGenerate}
                disabled={aiLoading}
                className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 text-sm"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                توليد المحتوى بالذكاء الاصطناعي
              </button>
            </div>

            {preview ? (
              <div className="prose prose-stone max-w-none min-h-[400px] p-4 bg-stone-50 rounded-2xl">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                placeholder="ابدأ الكتابة هنا... يمكنك استخدام Markdown"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full min-h-[500px] border-none focus:ring-0 text-stone-700 leading-relaxed resize-none"
              />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <TagIcon className="w-4 h-4 text-stone-400" />
              الوسوم
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-600 rounded-lg text-sm">
                  {tag}
                  <button onClick={() => removeTag(tag)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="أضف وسم..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                className="flex-1 bg-stone-50 border-stone-200 rounded-xl text-sm focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button onClick={addTag} className="p-2 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <h3 className="font-bold mb-4">الإعدادات</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-5 h-5 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
              />
              <span className="text-stone-700">نشر المقال للعامة</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogEditor;
