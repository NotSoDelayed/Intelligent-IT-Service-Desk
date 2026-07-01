export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** Shape of session data stored in localStorage */
export interface StoredSession {
  user: User;
  expiresAt: number;
}
