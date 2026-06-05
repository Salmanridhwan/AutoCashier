import {createContext, useContext, useState, ReactNode, useEffect} from 'react';
import {LocationID, MOCK_LOCATIONS, fetchBackend} from '@/shared/lib/api';
import {useAuth} from './AuthContext';

interface Branch {
  id: string;
  name: string;
}

interface LocationContextType {
  currentLocation: LocationID;
  setCurrentLocation: (id: LocationID) => void;
  locationName: string;
  allBranches: Branch[];
  loading: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({children}: {children: ReactNode}) {
  const {user} = useAuth();
  const [branches, setBranches] = useState<Branch[]>(MOCK_LOCATIONS);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<LocationID>(() => {
    const saved = localStorage.getItem('active_location_id');
    return (saved as LocationID) || 'ALL';
  });

  const loadBranches = async () => {
    try {
      const res = await fetchBackend('getBranches');
      if (res.status === 'success') {
        const branchList = [{ id: 'ALL', name: 'All Branches' }, ...res.data];
        setBranches(branchList);
      }
    } catch (err) {
      console.error('[LocationContext] Failed to load branches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (user) {
      if (user.role === 'super_admin') {
        const saved = localStorage.getItem('active_location_id');
        if (!saved) {
           setCurrentLocation('ALL');
        }
      } else if (user.location_id && user.location_id !== 'ALL') {
        setCurrentLocation(user.location_id as LocationID);
      }
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('active_location_id', currentLocation);
  }, [currentLocation]);

  const locationName = branches.find(l => l.id === currentLocation)?.name || 'All Branches';

  return (
    <LocationContext.Provider value={{
      currentLocation,
      setCurrentLocation,
      locationName,
      allBranches: branches,
      loading
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
