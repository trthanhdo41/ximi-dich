// Bộ icon của app: dùng Lucide (lucide.dev) – nét mảnh, hiện đại, đồng bộ. Không dùng emoji trong giao diện.
// Giữ tên cũ (MicIcon, CopyIcon…) để các màn hình không phải đổi cách gọi.

import {
  AlarmClock,
  ArrowDown,
  AudioLines,
  BadgeCheck,
  Bell,
  BellRing,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Copy,
  Download,
  FileText,
  Globe,
  Heart,
  Languages,
  Lightbulb,
  Lock,
  Maximize2,
  MessageCircle,
  MessagesSquare,
  Mic,
  NotebookText,
  Moon,
  Package,
  Pause,
  Pencil,
  Pilcrow,
  Percent,
  Plus,
  RefreshCw,
  ScrollText,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Sun,
  Target,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  Wallet,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

type P = { className?: string };

const wrap = (Icon: LucideIcon, strokeWidth = 1.9) =>
  function AppIcon({ className }: P) {
    return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
  };

export const MicIcon = wrap(Mic);
export const StopIcon = ({ className }: P) => <Square className={className} fill="currentColor" strokeWidth={0} aria-hidden />;
export const CopyIcon = wrap(Copy);
export const CheckIcon = wrap(Check, 2.4);
export const SpeakerIcon = wrap(Volume2);
export const SpeakerOffIcon = wrap(VolumeX);
export const SettingsIcon = wrap(SlidersHorizontal);
export const PlusIcon = wrap(Plus, 2.2);
export const ArrowDownIcon = wrap(ArrowDown, 2.2);
export const WifiOffIcon = wrap(WifiOff);
export const LockIcon = wrap(Lock);
export const SparkleIcon = wrap(Sparkles);
export const NotebookIcon = wrap(NotebookText);
export const RefreshIcon = wrap(RefreshCw);
export const LightbulbIcon = wrap(Lightbulb);
export const ExpandIcon = wrap(Maximize2);
export const PencilIcon = wrap(Pencil, 2.2);
export const ClockIcon = wrap(Clock);
export const ChevronLeftIcon = wrap(ChevronLeft, 2.2);
export const ChevronDownIcon = wrap(ChevronDown, 2.2);
export const GlobeIcon = wrap(Globe);
export const ShareIcon = wrap(Share2);
export const DownloadIcon = wrap(Download);
export const TrashIcon = wrap(Trash2);
export const BellIcon = wrap(Bell);
export const BellRingIcon = wrap(BellRing, 2.1);
export const BotIcon = wrap(Bot);
export const HeartIcon = ({ className }: P) => <Heart className={className} fill="currentColor" strokeWidth={0} aria-hidden />;
export const CalendarIcon = wrap(CalendarDays, 2.1);
export const AlarmIcon = wrap(AlarmClock, 2.1);
export const WalletIcon = wrap(Wallet, 2.1);
export const PackageIcon = wrap(Package, 2.1);
export const PercentIcon = wrap(Percent, 2.2);
export const TimerIcon = wrap(Timer);
export const ChatIcon = wrap(MessageCircle);
export const ChatsIcon = wrap(MessagesSquare);
export const LanguagesIcon = wrap(Languages);
export const VerifiedIcon = wrap(BadgeCheck, 2.1);
export const ScriptIcon = wrap(ScrollText);
export const FileTextIcon = wrap(FileText);
export const PauseIcon = wrap(Pause);
export const TargetIcon = wrap(Target);
export const MoonIcon = wrap(Moon);
export const SunIcon = wrap(Sun);
export const WaveIcon = wrap(AudioLines);
export const PinyinIcon = wrap(Pilcrow);
export const StarIcon = ({ className, filled }: P & { filled?: boolean }) => (
  <Star className={className} fill={filled ? "currentColor" : "none"} strokeWidth={1.9} aria-hidden />
);
