import React, { useEffect, useState } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, deleteDoc, doc, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthProvider';
import { Post } from '../types';
import { Edit2, Trash2, Calendar, Tag, Eye, EyeOff, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

interface BlogListProps {
  onEdit: (postId: string) => void;
}

const BlogList: React.FC<BlogListProps> = ({ onEdit }) => {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const postsRef = collection(db, 'posts');
    const q = query(
      postsRef,
      where('authorId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleDelete = async (postId: string) => {
    setPostToDelete(postId);
  };

  const confirmDelete = async () => {
    if (!postToDelete) return;
    try {
      await deleteDoc(doc(db, 'posts', postToDelete));
      setPostToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${postToDelete}`);
    }
  };

  if (loading) return <div className="text-center py-20 text-stone-500">جاري تحميل المقالات...</div>;

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {postToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPostToDelete(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white p-6 rounded-3xl max-w-sm w-full shadow-2xl text-right"
              dir="rtl"
            >
              <h3 className="text-xl font-bold text-stone-900 mb-4">حذف المقال؟</h3>
              <p className="text-stone-600 mb-8">هل أنت متأكد من حذف هذا المقال؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-2xl font-bold transition-colors"
                >
                  حذف
                </button>
                <button
                  onClick={() => setPostToDelete(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-900 py-3 rounded-2xl font-bold transition-colors border border-stone-200"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-stone-900">مقالاتي</h2>
        <div className="text-sm text-stone-500">{posts.length} مقال</div>
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-3xl p-20 text-center">
          <p className="text-stone-500 mb-4">لا توجد مقالات بعد.</p>
          <p className="text-stone-400 text-sm">ابدأ بكتابة مقالك الأول باستخدام الذكاء الاصطناعي.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <div key={post.id} className="bg-white border border-stone-200 rounded-3xl overflow-hidden hover:shadow-lg transition-shadow group">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                    post.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {post.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {post.isPublished ? 'منشور' : 'مسودة'}
                  </span>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(post.id!)} className="p-2 hover:bg-stone-100 rounded-full text-stone-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(post.id!)} className="p-2 hover:bg-red-50 rounded-full text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-stone-900 mb-2 line-clamp-2">{post.title}</h3>
                <p className="text-stone-600 text-sm mb-4 line-clamp-3">{post.content.replace(/[#*`]/g, '')}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {post.tags.map(tag => (
                    <span key={tag} className="text-[10px] uppercase tracking-wider font-bold text-stone-400 bg-stone-50 px-2 py-1 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(post.createdAt.toDate(), 'd MMMM yyyy', { locale: ar })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BlogList;
