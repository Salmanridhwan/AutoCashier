import {useState, useEffect} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/shared/components/ui/card';
import {Button} from '@/shared/components/ui/button';
import {Input} from '@/shared/components/ui/input';
import {Label} from '@/shared/components/ui/label';
import {Textarea} from '@/shared/components/ui/textarea';
import {Megaphone, Send, Users, History, AlertTriangle, Target, MapPin, Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useLocation } from '@/shared/context/LocationContext';
import { fetchBackend } from '@/shared/lib/api';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';

export default function BroadcastPage() {
  const { allBranches } = useLocation();
  const { t, language } = useLanguage();
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [audience, setAudience] = useState('ALL_BRANCHES');
  const [scopeBranch, setScopeBranch] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const hRes = await fetchBackend('getBroadcasts');
      if (hRes.status === 'success') setHistory(hRes.data);
    } catch (err) {
      console.error('Failed to load broadcast data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSend = async () => {
    if (!message || !subject) {
      toast.error(t('broadcast.fillAllFields'));
      return;
    }
    
    setIsSending(true);
    try {
      const res = await fetchBackend('sendBroadcast', {
        subject,
        message,
        audience,
        targetId: audience === 'SPECIFIC_BRANCH' ? scopeBranch : null
      });

      if (res.status === 'success') {
        toast.success(t('broadcast.successSent'));
        setMessage('');
        setSubject('');
        loadData();
      } else {
        toast.error(res.message || (language === 'id' ? 'Gagal mengirim broadcast' : 'Failed to dispatch broadcast'));
      }
    } catch (err) {
      toast.error(language === 'id' ? 'Kesalahan sinkronisasi jaringan' : 'Network synchronization error');
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
         <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
         <p className="text-gray-400 font-black uppercase tracking-widest text-[10px]">{t('broadcast.loadingHub')}</p>
      </div>
    );
  }

  const activeBranches = allBranches.filter((b: any) => b.id !== 'ALL');

  return (
    <PageTransition className="space-y-8 pb-12">
      
      {/* ── HEADER ROW ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-100 pb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{language === 'id' ? 'Pusat Siaran' : 'Broadcast Center'}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t('broadcast.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Compose Message */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-[32px] border border-gray-100 shadow-sm bg-white p-8 group transition-all duration-300 hover:shadow-md">
            <CardHeader className="px-0 pt-0 pb-8">
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                     <Megaphone className="w-6 h-6" />
                  </div>
                  <CardTitle className="text-2xl font-black tracking-tighter text-gray-900">{t('broadcast.composeMessage')}</CardTitle>
               </div>
            </CardHeader>
            
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t('broadcast.targetAudience')}</Label>
                     <div className="relative">
                        {/* Elegant Indigo Pill Icon Capsule */}
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 absolute left-2.5 top-1/2 -translate-y-1/2 z-10 shadow-sm border border-indigo-100/50">
                           <Target className="w-4 h-4" />
                        </div>
                        <Select value={audience} onValueChange={(v) => setAudience(v as string)}>
                           <SelectTrigger className="rounded-full h-13 pl-12 pr-4 bg-white hover:bg-gray-50 border border-gray-200/80 font-black text-gray-800 focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-400 transition-all text-xs tracking-wide shadow-sm flex justify-between items-center w-full">
                              <SelectValue placeholder={t('broadcast.selectAudience')}>
                                 {audience === 'ALL_BRANCHES' ? t('broadcast.allBranches') : audience === 'SPECIFIC_BRANCH' ? t('broadcast.specificBranch') : t('broadcast.allMembers')}
                              </SelectValue>
                           </SelectTrigger>
                           <SelectContent className="rounded-2xl border border-gray-100 shadow-2xl p-2 font-sans bg-white">
                              <SelectItem value="ALL_BRANCHES" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('broadcast.allBranches')}</SelectItem>
                              <SelectItem value="SPECIFIC_BRANCH" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('broadcast.specificBranch')}</SelectItem>
                              <SelectItem value="ALL_MEMBERS" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('broadcast.allMembers')}</SelectItem>
                           </SelectContent>
                        </Select>
                     </div>
                  </div>
                  
                  {audience === 'SPECIFIC_BRANCH' && (
                     <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t('broadcast.selectBranch')}</Label>
                        <div className="relative">
                           {/* Elegant Violet Pill Icon Capsule */}
                           <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 absolute left-2.5 top-1/2 -translate-y-1/2 z-10 shadow-sm border border-violet-100/50">
                              <MapPin className="w-4 h-4" />
                           </div>
                           <Select value={scopeBranch} onValueChange={(v) => setScopeBranch(v as string)}>
                              <SelectTrigger className="rounded-full h-13 pl-12 pr-4 bg-white hover:bg-gray-50 border border-gray-200/80 font-black text-gray-800 focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-400 transition-all text-xs tracking-wide shadow-sm flex justify-between items-center w-full">
                                 <SelectValue placeholder={t('broadcast.targetBranch')}>
                                    {scopeBranch ? activeBranches.find((b: any) => b.id === scopeBranch)?.name : t('broadcast.targetBranch')}
                                 </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border border-gray-100 shadow-2xl p-2 font-sans bg-white">
                                 {activeBranches.map((branch: any) => (
                                    <SelectItem key={branch.id} value={branch.id} className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">
                                       {branch.name}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                     </div>
                  )}
               </div>

                <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t('broadcast.subjectHeader')}</Label>
                   <Input 
                     placeholder={t('broadcast.subjectPlaceholder')}
                     className="rounded-2xl h-14 bg-gray-50/50 border border-gray-200/60 px-6 font-bold focus:bg-white focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-400 transition-all text-sm" 
                     value={subject}
                     onChange={e => setSubject(e.target.value)}
                   />
                </div>
                
                <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">{t('broadcast.messageBody')}</Label>
                   <Textarea 
                     placeholder={t('broadcast.messagePlaceholder')}
                     className="rounded-2xl min-h-[220px] bg-gray-50/50 border border-gray-200/60 p-6 font-medium focus:bg-white focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-400 transition-all text-sm leading-relaxed"
                     value={message}
                     onChange={e => setMessage(e.target.value)}
                   />
                </div>
                
                <div className="flex items-center gap-4 p-5 bg-amber-50/60 rounded-2xl border border-amber-100/80 shadow-sm">
                   <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                   <p className="text-xs text-amber-900 font-bold leading-relaxed">
                     {audience === 'ALL_MEMBERS' 
                       ? t('broadcast.warningAllMembers') 
                       : audience === 'SPECIFIC_BRANCH' 
                         ? t('broadcast.warningSpecificBranch').replace('{branch}', activeBranches.find(b => b.id === scopeBranch)?.name || '')
                         : t('broadcast.warningAllBranches')}
                   </p>
                </div>
                
                <Button 
                 onClick={handleSend}
                 disabled={isSending}
                 className="w-full bg-indigo-600 hover:bg-indigo-700 h-14 rounded-2xl shadow-xl shadow-indigo-600/20 font-black uppercase tracking-widest text-xs gap-3 group transition-all hover:scale-[1.02] flex items-center justify-center border-none text-white"
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />} 
                  {isSending ? t('broadcast.sending') : t('broadcast.dispatch')}
                </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Information & History */}
        <div className="space-y-6">
           {/* Dark Premium Card */}
           <Card className="rounded-[32px] border border-slate-800 shadow-2xl bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-white p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-600/10 blur-[80px] rounded-full" />
              <div className="relative z-10 space-y-6">
                 <div className="w-12 h-12 bg-white/5 border border-white/10 flex items-center justify-center rounded-2xl">
                    <Users className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black tracking-tighter uppercase">{t('broadcast.recipients')}</h4>
                    <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mt-2">
                       {t('broadcast.target')}: <span className="text-indigo-400 font-bold">
                         {audience === 'ALL_MEMBERS' ? t('broadcast.allMembersLabel') : audience === 'SPECIFIC_BRANCH' ? t('broadcast.branchAdminLabel') : t('broadcast.allBranchAdmins')}
                       </span>
                    </p>
                  </div>
                  
                  <div className="space-y-4 pt-2">
                     <div className="flex justify-between items-center text-sm border-b border-white/5 pb-4">
                        <span className="text-white/40 font-bold uppercase text-[10px] tracking-widest">{t('broadcast.targetScope')}</span>
                        <span className="font-mono font-black text-xl text-indigo-200">
                           {audience === 'ALL_MEMBERS' ? t('broadcast.global') : audience === 'SPECIFIC_BRANCH' ? t('broadcast.local') : t('broadcast.network')}
                        </span>
                     </div>
                     <div className="flex justify-between items-center text-sm pt-1">
                        <span className="text-white/40 font-bold uppercase text-[10px] tracking-widest">
                           {t('broadcast.integrityStatus')}
                        </span>
                        <span className="font-mono font-black text-xl text-emerald-400">
                           {t('broadcast.active')}
                        </span>
                     </div>
                  </div>
              </div>
           </Card>

           {/* History List Card */}
           <Card className="rounded-3xl border border-gray-100 shadow-sm bg-white p-8">
              <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4">
                  <History className="w-5 h-5 text-gray-400" />
                  <h4 className="font-black text-gray-900 tracking-tighter uppercase text-sm">{t('broadcast.recentHistory')}</h4>
              </div>
              
              <StaggerList className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length > 0 ? history.map((item) => (
                     <StaggerItem key={item.id}>
                     <div className="p-5 rounded-2xl bg-gray-50/50 border border-gray-100 flex flex-col gap-2.5 group hover:bg-indigo-50/10 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-600/[0.02] transition-all duration-300 cursor-pointer relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-2xl opacity-0 group-hover:opacity-100 transition-all duration-300" />
                        
                        <div className="flex items-center justify-between">
                           <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest leading-none bg-indigo-50 px-2.5 py-1.5 rounded-lg font-mono">
                              {new Date(item.created_at).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                           </span>
                            {(() => {
                               if (item.audience === 'ALL_MEMBERS') {
                                  return (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-indigo-600 uppercase tracking-widest leading-none bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                                      <Users className="w-2.5 h-2.5" />
                                      {language === 'id' ? 'Semua Member' : 'All Members'}
                                    </span>
                                  );
                               }
                               if (item.audience === 'ALL_BRANCHES') {
                                  return (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none bg-emerald-50 px-2.5 py-1.5 rounded-lg">
                                      <Target className="w-2.5 h-2.5" />
                                      {language === 'id' ? 'Semua Cabang' : 'All Branches'}
                                    </span>
                                  );
                               }
                               if (item.audience === 'SPECIFIC_BRANCH') {
                                  const branchName = allBranches.find((b: any) => b.id === item.target_id)?.name || item.target_id || 'Branch';
                                  return (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase tracking-widest leading-none bg-amber-50 px-2.5 py-1.5 rounded-lg">
                                      <MapPin className="w-2.5 h-2.5" />
                                      {branchName}
                                    </span>
                                  );
                               }
                               return null;
                            })()}
                        </div>
                        <span className="text-sm font-black text-gray-900 leading-tight group-hover:text-indigo-600 transition-colors">{item.subject}</span>
                        <p className="text-[11px] text-gray-400 leading-relaxed font-medium line-clamp-2">{item.body}</p>
                     </div>
                  </StaggerItem>
                  )) : (
                     <div className="text-center py-12">
                        <p className="text-gray-400 text-xs font-bold">{t('broadcast.noHistory')}</p>
                     </div>
                  )}
              </StaggerList>
           </Card>
        </div>
      </div>
    </PageTransition>
  );
}
