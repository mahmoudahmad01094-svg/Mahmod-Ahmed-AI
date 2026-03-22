import { Timestamp } from './firebase';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role: 'admin' | 'user';
  createdAt: Timestamp;
}

export interface Post {
  id?: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  tags: string[];
  isPublished: boolean;
}

export interface ChatSession {
  id?: string;
  userId: string;
  title: string;
  createdAt: Timestamp;
  lastMessageAt: Timestamp;
}

export interface ChatMessage {
  id?: string;
  sessionId: string;
  role: 'user' | 'model';
  content: string;
  createdAt: Timestamp;
}
