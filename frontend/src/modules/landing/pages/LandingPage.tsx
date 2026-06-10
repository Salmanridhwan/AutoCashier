import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import autoCashierLogo from '../../../../assets/2.png';
import smartSnackPhoto from '../../../../assets/smart_snack.png';
import freshDrinkPhoto from '../../../../assets/fresh_drink.png';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Gift,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Menu,
  PackageCheck,
  Phone,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  Twitter,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';

const featureCards = [
  {
    icon: ScanLine,
    title: 'Scan dalam Sekejap',
    description: 'Cukup arahkan produk ke kamera. AutoCashier mengenalinya dan memasukkannya ke keranjang Anda.',
  },
  {
    icon: Tags,
    title: 'Harga Selalu Jelas',
    description: 'Lihat nama, harga, jumlah, promo, dan total belanja secara langsung sebelum Anda membayar.',
  },
  {
    icon: Zap,
    title: 'Tanpa Antre Panjang',
    description: 'Kurangi waktu menunggu di kasir dan selesaikan belanja dengan alur checkout yang praktis.',
  },
  {
    icon: CreditCard,
    title: 'Pembayaran Fleksibel',
    description: 'Pilih metode pembayaran yang tersedia dan cek kembali total Anda sebelum transaksi selesai.',
  },
  {
    icon: Gift,
    title: 'Promo dan Poin Member',
    description: 'Nikmati promo yang berlaku dan kumpulkan manfaat member setiap kali Anda berbelanja.',
  },
  {
    icon: ShieldCheck,
    title: 'Transaksi Lebih Aman',
    description: 'Setiap produk dan total belanja dapat Anda periksa sendiri sebelum melakukan pembayaran.',
  },
];

const workflow = [
  {
    number: '01',
    icon: ScanLine,
    title: 'Arahkan produk',
    description: 'Kamera membaca produk di area scan yang sudah ditentukan.',
  },
  {
    number: '02',
    icon: Sparkles,
    title: 'Produk dikenali',
    description: 'AutoCashier menampilkan nama dan harga produk secara otomatis.',
  },
  {
    number: '03',
    icon: ShoppingCart,
    title: 'Periksa keranjang',
    description: 'Atur jumlah dan pastikan seluruh belanjaan Anda sudah sesuai.',
  },
  {
    number: '04',
    icon: CreditCard,
    title: 'Bayar dengan mudah',
    description: 'Pilih metode pembayaran, selesaikan transaksi, lalu ambil struk Anda.',
  },
];

const stats = [
  { value: '< 2s', label: 'Produk dikenali', icon: Clock3 },
  { value: '4 langkah', label: 'Dari scan ke bayar', icon: ShoppingCart },
  { value: '100%', label: 'Total transparan', icon: ReceiptText },
  { value: 'Real-time', label: 'Promo dan harga', icon: Zap },
];

const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const reduceMotion = useReducedMotion();
  const { isAuthenticated, user } = useAuth();
  const primaryPath = user?.role === 'kasir' ? '/kasir' : '/overview';
  const primaryLabel = user?.role === 'kasir' ? 'Buka Scanner' : (isAuthenticated ? 'Buka Dashboard' : 'Mulai Belanja');

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const PrimaryAction = ({ className }: { className: string }) => {
    const content = (
      <>
        {primaryLabel}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </>
    );

    return (
      <Link to={isAuthenticated ? primaryPath : '/kasir'} className={className}>{content}</Link>
    );
  };

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-gray-50 text-gray-900 selection:bg-indigo-200">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-gray-200/80 bg-white/85 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="group flex items-center gap-2.5" aria-label="AutoCashier home">
            <span className="relative flex size-11 items-center justify-center overflow-hidden rounded-2xl bg-violet-700 shadow-lg shadow-indigo-500/25 ring-1 ring-violet-500/20">
              <img
                src={autoCashierLogo}
                alt=""
                className="absolute left-1/2 top-1/2 w-[132px] max-w-none -translate-x-1/2 -translate-y-[40%] transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-0 translate-y-full bg-white/10 transition-transform duration-500 group-hover:translate-y-0" />
            </span>
            <span>
              <span className="block text-lg font-black tracking-tight">AutoCashier</span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.28em] text-indigo-600">Smart Shopping</span>
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Link
                to={primaryPath}
                className="group flex h-10 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                {user?.role === 'kasir' ? (
                  <ScanLine className="size-4" />
                ) : null}
                {primaryLabel}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="group flex h-10 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                Login
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className="min-w-0">
        <section className="relative isolate flex min-h-screen items-center overflow-hidden pb-20 pt-30">
          <div className="landing-grid absolute inset-0 opacity-35" />
          <div className="landing-aurora landing-aurora-one absolute -left-40 top-16 size-[32rem] rounded-full bg-indigo-300/45 blur-[100px]" />
          <div className="landing-aurora landing-aurora-two absolute -right-48 top-28 size-[34rem] rounded-full bg-cyan-200/45 blur-[110px]" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-gray-50 to-transparent" />

          <div className="relative mx-auto grid min-w-0 w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-16 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:px-8">
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, x: -36 }}
              animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 min-w-0 text-center lg:text-left"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700 shadow-sm">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                Pengalaman Belanja Masa Kini
              </div>

              <h1 className="mx-auto max-w-full text-balance text-[2.65rem] font-black leading-[1.02] tracking-[-0.055em] text-gray-950 sm:text-6xl lg:mx-0 lg:text-7xl">
                Scan sendiri.
                <span className="mt-2 block bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent">
                  Bayar tanpa ribet.
                </span>
              </h1>

              <p className="mx-auto mt-7 max-w-xl text-balance text-sm leading-7 text-gray-600 sm:text-lg sm:leading-8 lg:mx-0">
                Nikmati pengalaman belanja yang lebih cepat dan nyaman. Arahkan produk ke kamera, periksa
                keranjang Anda, lalu selesaikan pembayaran tanpa antre panjang.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <PrimaryAction
                  className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-7 text-sm font-bold text-white shadow-xl shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40 sm:w-auto"
                />
                <button
                  type="button"
                  onClick={() => scrollTo('cara-kerja')}
                  className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-7 text-sm font-bold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 sm:w-auto"
                >
                  Lihat Cara Belanja <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-gray-500 sm:text-xs lg:justify-start">
                {['Harga transparan', 'Promo otomatis', 'Checkout lebih cepat'].map(item => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-emerald-400" /> {item}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, scale: 0.88, y: 24 }}
              animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto min-w-0 w-full max-w-2xl"
            >
              <div className="landing-orbit absolute left-1/2 top-1/2 hidden size-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-300/35 sm:block" />
              <div className="landing-orbit landing-orbit-delayed absolute left-1/2 top-1/2 hidden size-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/35 sm:block" />

              <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white/90 p-2 shadow-[0_30px_80px_rgba(79,70,229,0.18)] backdrop-blur-2xl sm:p-3">
                <div className="overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-rose-400" />
                      <span className="size-2.5 rounded-full bg-amber-400" />
                      <span className="size-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-300" /> Scanner Siap
                    </div>
                  </div>

                  <div className="grid min-h-[20rem] gap-3 p-3 sm:min-h-[24rem] sm:grid-cols-[1fr_0.42fr] sm:p-4">
                    <div className="relative flex min-h-[17rem] items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-800 to-slate-950 text-white sm:min-h-[19rem]">
                      <div className="landing-camera-noise absolute inset-0 opacity-20" />
                      <div className="absolute inset-7 rounded-3xl border border-white/5 bg-white/[0.025]" />
                      <div className="landing-scan-line absolute inset-x-10 top-1/2 z-20 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_18px_3px_rgba(103,232,249,0.7)]" />

                      <img
                        src={smartSnackPhoto}
                        alt="Smart Snack"
                        className="relative z-10 h-44 w-28 rotate-[-5deg] rounded-xl border border-indigo-200/70 object-cover shadow-2xl shadow-indigo-500/30"
                      />

                      <div className="absolute inset-x-[24%] inset-y-[15%] rounded-2xl border-2 border-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.28)] sm:inset-x-[28%] sm:inset-y-[17%]">
                        {[
                          'left-[-2px] top-[-2px] border-l-4 border-t-4 rounded-tl-xl',
                          'right-[-2px] top-[-2px] border-r-4 border-t-4 rounded-tr-xl',
                          'bottom-[-2px] left-[-2px] border-b-4 border-l-4 rounded-bl-xl',
                          'bottom-[-2px] right-[-2px] border-b-4 border-r-4 rounded-br-xl',
                        ].map(corner => <span key={corner} className={`absolute size-6 border-emerald-200 ${corner}`} />)}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-400 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-950">
                          98.7% Match
                        </span>
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 backdrop-blur-xl">
                        <span className="text-[10px] font-semibold text-slate-300">AI Vision aktif</span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                          <Check className="size-3" /> Produk dikenali
                        </span>
                      </div>
                    </div>

                    <div className="hidden flex-col gap-3 sm:flex">
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Keranjang</p>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <img src={smartSnackPhoto} alt="Smart Snack" className="size-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">Smart Snack</p>
                            <p className="text-[9px] text-gray-400">1 x Rp 12.500</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">Total transaksi</p>
                        <p className="mt-2 text-xl font-black tracking-tight">Rp 12.500</p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                          <div className="landing-progress h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300" />
                        </div>
                      </div>
                      <div className="mt-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-3 text-white shadow-lg shadow-indigo-600/20">
                        <ShoppingCart className="size-5" />
                        <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-100">Siap checkout</p>
                        <p className="mt-1 text-sm font-black">Cepat dan akurat</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <motion.div
                animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -left-3 top-18 hidden rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl sm:block lg:-left-10"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                    <Gift className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[9px] font-semibold text-gray-400">Promo member</span>
                    <span className="block text-xs font-black text-rose-500">Hemat Rp 5.000</span>
                  </span>
                </div>
              </motion.div>

              <motion.div
                animate={reduceMotion ? undefined : { y: [0, 9, 0] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="absolute -bottom-5 right-2 hidden rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl sm:block lg:-right-6"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <ReceiptText className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[9px] font-semibold text-gray-400">Total belanja</span>
                    <span className="block text-xs font-black">Jelas & transparan</span>
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-gray-200 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-gray-200 px-4 sm:px-6 md:grid-cols-4 md:divide-y-0 lg:px-8">
            {stats.map(({ value, label, icon: Icon }, index) => (
              <motion.div
                key={label}
                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: index * 0.08 }}
                className="flex items-center gap-3 px-3 py-6 sm:px-6"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-indigo-600">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-lg font-black sm:text-xl">{value}</span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:text-xs">{label}</span>
                </span>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="fitur" className="relative overflow-hidden bg-gray-50 py-24 sm:py-30">
          <div className="landing-grid absolute inset-0 opacity-20" />
          <div className="landing-aurora absolute -left-44 top-24 size-96 rounded-full bg-indigo-200/50 blur-[110px]" />
          <div className="landing-aurora landing-aurora-two absolute -right-44 bottom-12 size-96 rounded-full bg-cyan-200/50 blur-[110px]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
            <motion.div
              variants={reveal}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col justify-between rounded-[2rem] border border-gray-200 bg-white/85 p-6 sm:p-8 shadow-[0_24px_70px_rgba(79,70,229,0.1)] backdrop-blur-xl h-full w-full"
            >
              <div>
                <p className="flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
                  <span className="size-1.5 rounded-full bg-emerald-400" /> Dibuat untuk pembeli
                </p>
                <h2 className="mt-5 text-balance text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                  Lebih sedikit menunggu. Lebih banyak kendali.
                </h2>
                <p className="mt-6 leading-7 text-gray-600">
                  Kami merapikan bagian yang biasanya memperlambat proses kasir, lalu membuat setiap keputusan
                  tetap terlihat jelas di layar Anda.
                </p>
                <div className="mt-10 border-l-2 border-indigo-600 pl-5">
                  <p className="text-sm font-bold leading-6 text-gray-800">
                    Tidak perlu menghafal cara pakai. Arahkan produk, lalu ikuti layar.
                  </p>
                </div>
              </div>

              <div className="relative mt-9 overflow-hidden rounded-2xl bg-slate-950 p-4 text-white">
                <div className="landing-camera-noise absolute inset-0 opacity-20" />
                <div className="relative flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
                    <ScanLine className="size-3.5 text-cyan-300" /> Scanner aktif
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-300" /> Siap
                  </span>
                </div>
                <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="landing-progress h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300" />
                </div>
              </div>
            </motion.div>

            <div className="overflow-hidden rounded-[2rem] border border-gray-200 bg-white/85 px-6 py-2 shadow-[0_24px_70px_rgba(79,70,229,0.1)] backdrop-blur-xl sm:px-8">
              {featureCards.map(({ icon: Icon, title, description }, index) => (
                <motion.article
                  key={title}
                  initial={reduceMotion ? undefined : { opacity: 0, x: 24 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.45 }}
                  transition={{ duration: 0.5, delay: (index % 3) * 0.06 }}
                  className="group relative grid gap-5 border-b border-gray-200 py-7 last:border-b-0 sm:grid-cols-[48px_1fr_auto] sm:items-start"
                >
                  <span className="absolute inset-y-4 -left-5 w-1 rounded-r-full bg-gradient-to-b from-indigo-500 to-cyan-400 opacity-0 transition-opacity group-hover:opacity-100 sm:-left-7" />
                  <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 transition-all group-hover:border-indigo-600 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo-200">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-lg font-black tracking-tight">{title}</span>
                    <span className="mt-2 block max-w-xl text-sm leading-7 text-gray-600">{description}</span>
                  </span>
                  <span className="hidden font-mono text-xs font-bold text-gray-400 sm:block">0{index + 1}</span>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="cara-kerja" className="relative overflow-hidden border-y border-gray-200 bg-white py-24 sm:py-30">
          <div className="landing-grid absolute inset-0 opacity-20" />
          <div className="absolute -left-32 bottom-8 size-80 rounded-full bg-cyan-100/70 blur-[100px]" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              variants={reveal}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6 }}
              className="grid gap-6 border-b border-gray-300 pb-10 lg:grid-cols-[1fr_0.7fr] lg:items-end"
            >
              <span>
                <p className="flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
                  <Sparkles className="size-3.5" /> Cara belanja
                </p>
                <h2 className="mt-5 text-balance text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                  Empat langkah. Tidak ada yang disembunyikan.
                </h2>
              </span>
              <p className="max-w-xl leading-7 text-gray-600 lg:justify-self-end">
                Setiap langkah menampilkan apa yang sedang terjadi dan apa yang perlu Anda lakukan berikutnya.
              </p>
            </motion.div>

            <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-gray-200 bg-white/85 px-5 shadow-[0_24px_70px_rgba(79,70,229,0.1)] backdrop-blur sm:px-8">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />
              {workflow.map(({ number, icon: Icon, title, description }, index) => (
                <motion.article
                  key={number}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="group relative grid gap-4 border-b border-gray-200 py-8 last:border-b-0 sm:grid-cols-[80px_1fr_1.2fr] sm:items-center"
                >
                  <span className="font-mono text-3xl font-black text-indigo-200 transition-colors group-hover:text-indigo-600">{number}</span>
                  <span className="flex items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                      <Icon className="size-4" />
                    </span>
                    <span className="font-black">{title}</span>
                  </span>
                  <p className="text-sm leading-7 text-gray-600">{description}</p>
                  <span className="absolute bottom-0 left-0 h-px w-0 bg-indigo-500 transition-all duration-500 group-hover:w-full" />
                </motion.article>
              ))}
            </div>

            <button type="button" onClick={() => scrollTo('platform')} className="group mt-8 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-100">
              Lihat tampilan checkout <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </section>

        <section id="platform" className="relative overflow-hidden bg-gray-50 py-24 sm:py-30">
          <div className="landing-grid absolute inset-0 opacity-20" />
          <div className="landing-aurora absolute -left-40 bottom-0 size-96 rounded-full bg-indigo-200/50 blur-[110px]" />
          <div className="landing-aurora landing-aurora-two absolute -right-40 top-0 size-96 rounded-full bg-cyan-200/50 blur-[110px]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, x: -28 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.65 }}
            >
              <p className="flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
                <ShieldCheck className="size-3.5" /> Sebelum membayar
              </p>
              <h2 className="mt-4 text-balance text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                Angka yang Anda lihat adalah angka yang Anda bayar.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-gray-500 sm:text-base">
                AutoCashier menampilkan isi keranjang, promo, potongan, dan total akhir secara jelas. Tidak ada
                kejutan saat checkout.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  'Ubah jumlah atau hapus produk sebelum membayar',
                  'Promo yang berlaku langsung terlihat di keranjang',
                  'Terima ringkasan transaksi yang mudah diperiksa',
                ].map((item, index) => (
                  <motion.div
                    key={item}
                    initial={reduceMotion ? undefined : { opacity: 0, x: -22 }}
                    whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.7 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 rounded-xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-emerald-300 text-emerald-600">
                      <Check className="size-3.5" />
                    </span>
                    <p className="text-sm font-semibold leading-6 text-gray-700">{item}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, x: 28 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.65 }}
              className="relative"
            >
              <div className="landing-orbit absolute left-1/2 top-1/2 hidden size-[112%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-300/35 sm:block" />
              <div className="landing-orbit landing-orbit-delayed absolute left-1/2 top-1/2 hidden size-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/35 sm:block" />
              <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white/90 p-4 shadow-[0_30px_80px_rgba(79,70,229,0.18)] backdrop-blur-xl">
                <div className="absolute inset-x-0 top-0 h-1 bg-indigo-600" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">Checkout aman</p>
                    <p className="mt-1 text-lg font-black">Keranjang Anda</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <ShoppingCart className="size-5" />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {[
                    { name: 'Smart Snack', detail: '2 x Rp 12.500', price: 'Rp 25.000', img: smartSnackPhoto },
                    { name: 'Fresh Drink', detail: '1 x Rp 8.000', price: 'Rp 8.000', img: freshDrinkPhoto },
                  ].map(({ name, detail, price, img }, index) => (
                    <motion.div
                      key={name}
                      initial={reduceMotion ? undefined : { opacity: 0, x: 24 }}
                      whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + index * 0.15 }}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <img src={img} alt={name} className="size-full object-cover" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{name}</span>
                        <span className="block text-[10px] font-semibold text-gray-400">{detail}</span>
                      </span>
                      <span className="text-xs font-black text-gray-700">{price}</span>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                      <Gift className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-black text-emerald-800">Promo member diterapkan</span>
                      <span className="block text-[10px] font-semibold text-emerald-600">Anda hemat Rp 5.000</span>
                    </span>
                    <BadgeCheck className="size-5 text-emerald-600" />
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="space-y-2 text-xs font-semibold text-gray-500">
                    <div className="flex justify-between"><span>Subtotal</span><span>Rp 33.000</span></div>
                    <div className="flex justify-between text-emerald-600"><span>Promo member</span><span>- Rp 5.000</span></div>
                  </div>
                  <div className="my-3 h-px bg-gray-200" />
                  <div className="flex items-end justify-between">
                    <span className="text-xs font-bold text-gray-500">Total pembayaran</span>
                    <span className="text-2xl font-black tracking-tight text-indigo-700">Rp 28.000</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { icon: Zap, label: 'QRIS' },
                    { icon: CreditCard, label: 'Kartu' },
                    { icon: CircleDollarSign, label: 'Tunai' },
                  ].map(({ icon: MethodIcon, label }) => (
                    <div key={label} className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-3 text-[10px] font-black text-gray-600">
                      <MethodIcon className="size-3.5 text-indigo-600" /> {label}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg bg-indigo-600 p-4 text-white">
                  <span className="flex items-center gap-2 text-xs font-bold">
                    <ShieldCheck className="size-4" /> Siap menyelesaikan pembayaran
                  </span>
                  <ArrowRight className="size-4" />
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-white px-4 py-24 sm:px-6 sm:py-30 lg:px-8">
          <div className="landing-grid absolute inset-0 opacity-20" />
          <div className="landing-aurora absolute -left-36 top-10 size-80 rounded-full bg-indigo-200/45 blur-[100px]" />
          <div className="landing-aurora landing-aurora-two absolute -right-36 bottom-0 size-80 rounded-full bg-cyan-200/45 blur-[100px]" />
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7 }}
            className="relative mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-[2rem] border border-indigo-200 bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-14 text-white shadow-[0_30px_90px_rgba(79,70,229,0.24)] sm:px-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-center"
          >
            <div className="landing-grid absolute inset-0 opacity-20" />
            <div>
              <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-indigo-100">Siap mencoba?</p>
              <h2 className="relative mt-5 max-w-3xl text-balance text-4xl font-black tracking-[-0.05em] sm:text-5xl">
                Ambil produk Anda. AutoCashier menangani sisanya.
              </h2>
            </div>
            <div className="relative lg:justify-self-end">
              <p className="max-w-md text-sm leading-7 text-indigo-100/85 sm:text-base">
                Mulai dari satu produk dan lihat sendiri bagaimana proses checkout menjadi lebih singkat dan mudah diperiksa.
              </p>
              <PrimaryAction
                className="group mt-7 flex h-12 w-fit items-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-indigo-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50"
              />
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white pt-16 pb-8 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="mx-auto max-w-7xl">
          {/* Main Grid */}
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5 pb-12">
            {/* Column 1: Brand & Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-xl bg-violet-700 shadow-md">
                  <img src={autoCashierLogo} alt="" className="absolute left-1/2 top-1/2 w-30 max-w-none -translate-x-1/2 -translate-y-[40%]" />
                </span>
                <div>
                  <span className="block text-lg font-black tracking-tight text-gray-900">AutoCashier</span>
                  <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-600">Smart Shopping</span>
                </div>
              </div>
              <p className="text-sm leading-6 text-gray-500 max-w-sm">
                AutoCashier menghadirkan teknologi kasir pintar berbasis AI Vision untuk belanja mandiri yang cepat, akurat, dan tanpa antrean.
              </p>
              
              {/* System Status */}
              <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-100 bg-emerald-50/50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Semua Sistem Operasional
              </div>

              {/* Social Media */}
              <div className="flex items-center gap-4 pt-2">
                {[
                  { icon: Instagram, href: 'https://instagram.com/autocashier', label: 'Instagram' },
                  { icon: Twitter, href: 'https://twitter.com/autocashier', label: 'Twitter' },
                  { icon: Linkedin, href: 'https://linkedin.com/company/autocashier', label: 'LinkedIn' },
                  { icon: Github, href: 'https://github.com/autocashier', label: 'GitHub' },
                ].map(({ icon: Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 shadow-sm"
                    aria-label={label}
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Column 2: Fitur & Solusi */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Fitur & Solusi</h3>
              <ul className="space-y-3 text-sm">
                {[
                  { label: 'Scanner AI Vision', href: '#fitur' },
                  { label: 'Alur Pembayaran QRIS', href: '#platform' },
                  { label: 'Integrasi POS Toko', href: '#platform' },
                  { label: 'Dashboard Analisis', href: '#platform' },
                  { label: 'Poin & Promo Member', href: '#fitur' },
                ].map(link => (
                  <li key={link.label}>
                    <button
                      type="button"
                      onClick={() => scrollTo(link.href.substring(1))}
                      className="text-gray-500 transition hover:text-indigo-600 hover:translate-x-0.5 inline-block text-left cursor-pointer"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Perusahaan */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Perusahaan</h3>
              <ul className="space-y-3 text-sm">
                {[
                  { label: 'Tentang Kami', href: '#' },
                  { label: 'Hubungi Kami', href: '#' },
                  { label: 'Karir', href: '#', badge: 'Kami Merekrut!' },
                  { label: 'Blog & Rilis', href: '#' },
                  { label: 'Kebijakan Privasi', href: '#' },
                ].map(link => (
                  <li key={link.label}>
                    <a href={link.href} className="text-gray-500 transition hover:text-indigo-600 flex items-center gap-2">
                      {link.label}
                      {link.badge && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600 border border-indigo-100">
                          {link.badge}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 4: Kontak & Portal */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Dukungan & Kontak</h3>
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="mailto:support@autocashier.id" className="flex items-center gap-2.5 text-gray-500 transition hover:text-indigo-600">
                    <Mail className="size-4 text-gray-400" />
                    support@autocashier.id
                  </a>
                </li>
                <li>
                  <a href="tel:+62215550199" className="flex items-center gap-2.5 text-gray-500 transition hover:text-indigo-600">
                    <Phone className="size-4 text-gray-400" />
                    +62 (21) 555-0199
                  </a>
                </li>
                <li className="flex items-start gap-2.5 text-gray-500">
                  <MapPin className="size-4 text-gray-400 mt-0.5 shrink-0" />
                  <span>Gedung Smart Retail Lt. 4, Jakarta Selatan</span>
                </li>
              </ul>
              

            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-8" />

          {/* Footer Bottom */}
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} AutoCashier. Hak Cipta Dilindungi.
            </p>
            <div className="flex items-center gap-6 text-xs text-gray-400">
              <a href="#" className="hover:text-indigo-600 transition">Syarat & Ketentuan</a>
              <span>&middot;</span>
              <a href="#" className="hover:text-indigo-600 transition">Kebijakan Privasi</a>
              <span>&middot;</span>
              <div className="flex items-center gap-1.5">
                <Globe className="size-3.5" />
                <span>Bahasa Indonesia</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
