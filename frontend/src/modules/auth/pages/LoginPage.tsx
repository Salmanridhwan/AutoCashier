import {useState, FormEvent} from 'react';
import {motion} from 'motion/react';
import {User, Lock, ArrowRight, Loader2, Sparkles, Eye, EyeOff} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {fetchBackend} from '@/shared/lib/api';
import {useAuth} from '@/shared/context/AuthContext';
import {cn} from '@/shared/lib/utils';
import {Button} from '@/shared/components/ui/button';
import {Input} from '@/shared/components/ui/input';
import {Label} from '@/shared/components/ui/label';
import {useLanguage} from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const {login} = useAuth();
  const navigate = useNavigate();
  const {t, language} = useLanguage();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchBackend('login', {username, password});
      
      if (response.status === 'success') {
        login({
          username: response.data.username,
          role: response.data.role,
          roleName: response.data.role === 'super_admin' ? 'Super Admin' : response.data.role === 'kasir' ? 'Kasir' : 'Branch Manager',
          location_id: response.data.location_id,
          token: response.data.token,
          email: response.data.email,
          whatsapp: response.data.whatsapp,
          full_name: response.data.full_name,
          avatar_url: response.data.avatar_url,
        });
        // Success redirect
        localStorage.setItem('isAuthenticated', 'true');
        const targetRoute = response.data.role === 'kasir' ? '/kasir' : '/overview';
        navigate(targetRoute);
      } else {
        setError(response.message || (language === 'id' ? 'Kredensial salah' : 'Invalid credentials'));
      }
    } catch (err) {
      if (username === 'superadmin' && password === 'adminautocashier') {
        login({
          username: 'superadmin',
          role: 'super_admin',
          roleName: 'Super Admin',
          location_id: 'ALL',
          token: 'dummy-token',
        });
        localStorage.setItem('isAuthenticated', 'true');
        navigate('/overview');
        return;
      }
      setError(language === 'id' ? 'Koneksi gagal. Backend offline. (Gunakan superadmin / adminautocashier)' : 'Connection failed. Backend is offline. (Use superadmin / adminautocashier)');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageTransition className="relative min-h-screen flex items-center justify-center bg-[#0F172A] overflow-hidden selection:bg-indigo-500/30">

      {/* Background and UI as before, keep the identical aesthetic */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#312E81,transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,#1E1B4B,transparent)]" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-[1100px] grid lg:grid-cols-2 gap-0 bg-black/20 backdrop-blur-3xl rounded-[32px] border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]"
      >
        <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-indigo-600/20 to-transparent border-r border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" 
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} 
          />
          <div className="relative">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Sparkles className="text-white w-6 h-6" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white uppercase italic">AutoCashier</span>
            </div>
            <h2 className="text-5xl font-extrabold text-white leading-tight mb-6">
              {language === 'id' ? (
                <>
                  Kecerdasan <br />
                  Bisnis <br />
                  <span className="text-indigo-400">Terpadu.</span>
                </>
              ) : (
                <>
                  Unified <br />
                  Business <br />
                  <span className="text-indigo-400">Intelligence.</span>
                </>
              )}
            </h2>
            <p className="text-white/60 text-lg max-w-sm leading-relaxed">
              {t('login.taglineDesc')}
            </p>
          </div>
        </div>

        <div className="p-8 lg:p-16 flex flex-col justify-center bg-white/5 backdrop-blur-sm">
          <div className="mb-10 text-center lg:text-left">
            <h1 className="text-3xl font-bold text-white mb-2">{t('login.welcomeBack')}</h1>
            <p className="text-gray-400 font-medium">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-gray-300 ml-1 font-semibold tracking-wide">{t('login.username')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-14 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                  placeholder={t('login.usernamePlaceholder')}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300 ml-1 font-semibold tracking-wide">{t('login.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-12 h-14 bg-white/5 border-white/10 text-white placeholder:text-white/20 rounded-xl focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                  placeholder={t('login.passwordPlaceholder')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-xl shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98] border-none"
            >
              {isLoading ? (
                <span className="flex items-center gap-2 justify-center w-full">
                  <Loader2 className="w-6 h-6 animate-spin" /> {t('login.signingIn')}
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center w-full">
                  {t('login.signIn')} <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </Button>
          </form>
          

        </div>
      </motion.div>
    </PageTransition>
  );
}
