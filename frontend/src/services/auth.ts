import type { User, UserRole } from '@/types/auth';

/**
 * Determine user role from username.
 *
 * Mock implementation: usernames starting with "admin" get admin role.
 * This function is the ONLY thing to remove when backend auth is integrated —
 * the backend will return the role directly.
 */
export function resolveUserRole(username: string): UserRole {
  return username.toLowerCase().startsWith('admin') ? 'admin' : 'user';
}

/**
 * Mock login — accepts any username/password combination.
 *
 * Replace this function with a real API call in Milestone 9 (Backend Integration).
 * The return type stays the same: a User object.
 */
export function mockLogin(username: string, _password: string): User {
  const role = resolveUserRole(username);
  return {
    id: crypto.randomUUID(),
    name: username,
    email: `${username}@servicedesk.local`,
    role,
  };
}
