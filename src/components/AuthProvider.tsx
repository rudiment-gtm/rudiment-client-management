import { createContext, useContext, ReactNode } from 'react';
import { useAuth, Profile } from '@/hooks/useAuth';
import { useFilterPersistence } from '@/hooks/useFilterPersistence';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<{ error: any }>;
  updateProfile: (updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>) => Promise<{ data?: any; error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function FilterPersistenceMount() {
  useFilterPersistence();
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      <FilterPersistenceMount />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
