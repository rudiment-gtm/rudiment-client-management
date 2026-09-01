import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadSharedRoute } from '@/lib/shareRoute';
import { useAppStore } from '@/store/appStore';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function SharedRouteLanding() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const loadRouteFromSnapshot = useAppStore((s) => s.loadRouteFromSnapshot);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!code) {
        navigate('/', { replace: true });
        return;
      }
      try {
        const snap = await loadSharedRoute(code);
        if (!snap) {
          setStatus('error');
          toast.error('Route not found or expired.');
          setTimeout(() => navigate('/', { replace: true }), 1500);
          return;
        }
        loadRouteFromSnapshot(snap.stops);
        toast.success(`Loaded ${snap.stops.length} stop${snap.stops.length !== 1 ? 's' : ''}.`);
        navigate('/', { replace: true });
      } catch (e) {
        console.error(e);
        setStatus('error');
        toast.error('Could not load that route.');
        setTimeout(() => navigate('/', { replace: true }), 1500);
      }
    })();
  }, [code, loadRouteFromSnapshot, navigate]);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-background text-foreground">
      {status === 'loading' ? (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading shared route…</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Route not available. Returning to the map…</p>
      )}
    </div>
  );
}
