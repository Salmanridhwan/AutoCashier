import {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import {LocationID} from '@/shared/lib/api';

interface User {
  username: string;
  roleName: string;
  role: 'super_admin' | 'branch_admin' | 'admin';
  location_id: LocationID;
  email?: string;
  whatsapp?: string;
  full_name?: string;
  token?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('autocashier_user');
    const authStatus = localStorage.getItem('isAuthenticated');
    
    if (savedUser && authStatus === 'true') {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (!parsedUser.token) {
          throw new Error('Invalid session: missing token');
        }
        // Decode token to check if branch_id is included (new format)
        // If it's a branch_admin token missing branch_id, force re-login
        try {
          const payloadB64 = parsedUser.token.split('.')[1];
          if (payloadB64) {
            const payload = JSON.parse(atob(payloadB64));
            if (parsedUser.role === 'branch_admin' && !payload.branch_id) {
              throw new Error('Session outdated: missing branch_id. Please log in again.');
            }
          }
        } catch (tokenErr: any) {
          if (tokenErr.message.includes('branch_id')) throw tokenErr;
          // Ignore other decode errors
        }
        setUser(parsedUser);
      } catch (e) {
        localStorage.removeItem('autocashier_user');
        localStorage.removeItem('isAuthenticated');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('autocashier_user', JSON.stringify(userData));
    localStorage.setItem('isAuthenticated', 'true');
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('autocashier_user');
    localStorage.setItem('isAuthenticated', 'false');
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0F172A]">
        <div className="h-12 w-12 animate-spin rounded-2xl border-4 border-indigo-600 border-t-transparent shadow-xl shadow-indigo-500/20"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user, 
      login, 
      logout, 
      isAuthenticated: !!user
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
