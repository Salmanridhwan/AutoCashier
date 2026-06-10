import {useState, useEffect} from 'react';
import {Card, CardContent} from '@/shared/components/ui/card';
import {Button} from '@/shared/components/ui/button';
import {Input} from '@/shared/components/ui/input';
import {
  Search,
  Bell,
  Clock,
  ChevronRight,
  Inbox,
  CheckCircle2,
  Calendar,
  X,
  Sparkles,
  Loader2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {cn} from '@/shared/lib/utils';
import {motion, AnimatePresence} from 'motion/react';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';
import { fetchBackend } from '@/shared/lib/api';

function getRelativeTime(dateString: string, lang: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return lang === 'id' ? 'Baru saja' : 'Just now';
  }
  if (diffMins < 60) {
    return lang === 'id' ? `${diffMins} menit lalu` : `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return lang === 'id' ? `${diffHours} jam lalu` : `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return lang === 'id' ? 'Kemarin' : 'Yesterday';
  }
  return lang === 'id' ? `${diffDays} hari lalu` : `${diffDays}d ago`;
}

export default function BroadcastInboxPage() {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const res = await fetchBackend('getBroadcasts');
      if (res.status === 'success' && Array.isArray(res.data)) {
        const readMessageIds = JSON.parse(localStorage.getItem('read_broadcasts') || '[]');
        
        const mapped = res.data.map((item: any) => {
          const dateObj = new Date(item.created_at);
          const formattedDate = dateObj.toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          
          return {
            id: String(item.id),
            title: item.subject || 'No Subject',
            preview: item.body ? (item.body.substring(0, 120) + (item.body.length > 120 ? '...' : '')) : '',
            body: item.body || '',
            time: getRelativeTime(item.created_at, language),
            date: formattedDate,
            status: readMessageIds.includes(String(item.id)) ? 'read' : 'unread',
            tags: [item.audience ? item.audience.toUpperCase() : 'ALL']
          };
        });
        setMessages(mapped);
      }
    } catch (err) {
      console.error('Failed to load broadcasts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [language]);

  const filteredMessages = messages.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenMessage = (msg: any) => {
    setSelectedMessage(msg);
    if (msg.status === 'unread') {
      const readMessageIds = JSON.parse(localStorage.getItem('read_broadcasts') || '[]');
      if (!readMessageIds.includes(msg.id)) {
        const updatedReadIds = [...readMessageIds, msg.id];
        localStorage.setItem('read_broadcasts', JSON.stringify(updatedReadIds));
      }
      setMessages(prev => prev.map(m => m.id === msg.id ? {...m, status: 'read' as const} : m));
    }
  };

  return (
    <PageTransition className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div>
          <h2 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tighter uppercase leading-none">
            {language === 'id' ? 'Kotak Masuk Broadcast' : 'Broadcast Inbox'}
          </h2>
          <p className="text-gray-500 font-medium tracking-tight mt-2 italic">
            {language === 'id' ? 'Pusat komunikasi pusat untuk semua pengumuman enterprise.' : 'Central communication node for all enterprise announcements.'}
          </p>
        </div>
        
        <div className="relative group flex-1 md:max-w-sm">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
           <Input 
             placeholder={language === 'id' ? 'Cari pengumuman...' : 'Search announcements...'}
             className="pl-12 h-14 rounded-2xl bg-white border-none shadow-sm focus:ring-4 focus:ring-indigo-100 transition-all font-bold"
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
           />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-24">
           <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <StaggerList className="space-y-4">
          {filteredMessages.length > 0 ? (
            filteredMessages.map((msg, index) => (
              <StaggerItem
                key={msg.id}
              >
                <Card 
                  className={cn(
                    "rounded-[32px] border-none shadow-sm group hover:shadow-xl hover:shadow-indigo-600/5 transition-all cursor-pointer overflow-hidden",
                    msg.status === 'unread' ? "bg-white ring-2 ring-indigo-50" : "bg-white/80"
                  )}
                  onClick={() => handleOpenMessage(msg)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch min-h-[110px]">
                       {/* Blue Indicator Line */}
                       <div className={cn(
                         "w-1.5 shrink-0 transition-opacity duration-500",
                         msg.status === 'unread' ? "bg-indigo-600" : "bg-transparent"
                       )} />
                       
                       <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
                          <div className="flex items-center gap-4 shrink-0">
                             <div className={cn(
                               "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                               msg.status === 'unread' ? "bg-indigo-50 text-indigo-600" : "bg-gray-50 text-gray-400"
                             )}>
                                <Bell className="w-5 h-5" />
                             </div>
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                             <div className="flex items-center gap-2">
                                {msg.status === 'unread' && (
                                  <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                )}
                                <h3 className={cn(
                                  "text-lg font-black tracking-tight truncate group-hover:text-indigo-600 transition-colors",
                                  msg.status === 'unread' ? "text-gray-900" : "text-gray-500"
                                )}>
                                  {msg.title}
                                </h3>
                             </div>
                             <p className="text-gray-400 text-xs font-bold leading-relaxed truncate md:whitespace-normal line-clamp-1">
                                {msg.preview}
                             </p>
                          </div>

                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 md:pl-6 md:border-l border-gray-100">
                             <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-full">
                                <Clock className="w-3 h-3" />
                                {msg.time}
                             </div>
                             <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                          </div>
                       </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))
          ) : (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
               <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                  <Inbox className="w-10 h-10" />
               </div>
               <div>
                  <p className="text-gray-900 font-black tracking-tighter text-xl capitalize">
                    {language === 'id' ? 'Frekuensi Bersih' : 'Clear Frequencies'}
                  </p>
                  <p className="text-gray-400 font-medium text-sm">
                    {language === 'id' ? 'Tidak ada pengumuman yang cocok dengan pencarian Anda.' : 'No announcements matching your search filters.'}
                  </p>
               </div>
               <Button variant="ghost" onClick={() => setSearchQuery('')} className="text-indigo-600 font-bold uppercase text-[10px] tracking-widest">
                  {language === 'id' ? 'Reset Pencarian' : 'Reset Search'}
               </Button>
            </div>
          )}
        </StaggerList>
      )}

      {/* Message Detail Modal */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="rounded-[40px] sm:max-w-[650px] p-0 overflow-hidden border-none shadow-2xl font-sans">
           {selectedMessage && (
             <>
               <div className="bg-[#0F172A] p-10 text-white relative">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/20 blur-[100px] rounded-full -mr-20 -mt-20" />
                  <div className="flex justify-between items-start mb-8 relative z-10">
                     <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">
                          {language === 'id' ? 'Broadcast Terverifikasi' : 'Verified Broadcast'}
                        </span>
                     </div>
                     <div className="flex items-center gap-3">
                        <div className="text-right">
                           <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200/50">
                             {language === 'id' ? 'Tanggal Pengiriman' : 'Origin Date'}
                           </p>
                           <p className="text-sm font-black tracking-tight">{selectedMessage.date}</p>
                        </div>
                        <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center">
                           <Calendar className="w-4 h-4 text-white/40" />
                        </div>
                     </div>
                  </div>
                  <DialogTitle className="text-3xl font-black tracking-tighter leading-tight relative z-10">
                     {selectedMessage.title}
                  </DialogTitle>
                  <div className="flex flex-wrap gap-2 mt-6 relative z-10">
                     {selectedMessage.tags.map(tag => (
                        <span key={tag} className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold tracking-widest text-white/50 uppercase border border-white/5">
                           #{tag}
                        </span>
                     ))}
                  </div>
               </div>
               
               <div className="p-10 bg-white max-h-[50vh] overflow-y-auto scrollbar-hide">
                  <div className="prose prose-indigo max-w-none">
                     <p className="text-gray-600 font-medium leading-relaxed whitespace-pre-wrap">
                        {selectedMessage.body}
                     </p>
                  </div>
               </div>

               <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                        <Sparkles className="w-5 h-5" />
                     </div>
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">
                          {language === 'id' ? 'Pengirim' : 'Dispatcher'}
                        </span>
                        <span className="text-xs font-bold text-gray-900 tracking-tight">
                          {language === 'id' ? 'Otoritas Sistem 01' : 'System Authority 01'}
                        </span>
                     </div>
                  </div>
                  <Button 
                    onClick={() => setSelectedMessage(null)}
                    className="bg-[#0F172A] hover:bg-black text-white h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] border-none shadow-xl shadow-indigo-600/10 transition-all hover:scale-[1.02]"
                  >
                    {language === 'id' ? 'Tutup Log' : 'Close Log'}
                  </Button>
               </div>
             </>
           )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
