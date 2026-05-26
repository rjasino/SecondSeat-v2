import { cache } from 'react';
import { User } from '@secondseat/db';
import { ensureDb } from '@/lib/db';

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  role: 'user' | 'author' | 'admin';
}

export const getUserById = cache(async (userId: string): Promise<UserProfile | null> => {
  await ensureDb();
  const doc = await User.findById(userId).select('name email role').lean();
  if (!doc) return null;
  return {
    userId: doc._id.toString(),
    name: doc.name as string,
    email: doc.email as string,
    role: doc.role as 'user' | 'author' | 'admin',
  };
});
