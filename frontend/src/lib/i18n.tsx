import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Bilingual UI (English / Gujarati).
 *
 * The programmes are Gujarati-medium and most parents read Gujarati at home,
 * so the parent portal is the primary target; the staff shell is translated for
 * the same reason. Pages migrate incrementally: `t('key')` falls back to English
 * and then to the key itself, so an untranslated string never breaks a screen.
 *
 * Usage:
 *   const { t, lang, setLang } = useI18n();
 *   <h1>{t('nav.dashboard')}</h1>
 */

export type Lang = 'en' | 'gu';

const STORAGE_KEY = 'bb_lang';

const en = {
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.search': 'Search anything…',
  'common.language': 'Language',
  'common.signOut': 'Sign out',
  'common.retry': 'Try again',

  'nav.dashboard': 'Dashboard',
  'nav.leads': 'First Buzz',
  'nav.admissions': 'Admissions',
  'nav.students': 'Students',
  'nav.attendance': 'Attendance',
  'nav.fees': 'Fees',
  'nav.comms': 'Comms',
  'nav.lifecycle': 'Student Lifecycle',
  'nav.certificates': 'Certificates',
  'nav.academic': 'Academic Planning',
  'nav.inventory': 'Inventory',
  'nav.ptm': 'PTM',
  'nav.evening': 'Evening Centre',
  'nav.hr': 'HR & Payroll',
  'nav.analytics': 'Analytics',
  'nav.units': 'Units & Batches',
  'nav.settings': 'Settings',

  'login.welcome': 'Welcome back',
  'login.subtitle': 'Sign in to the BumbleB Kidz ERP',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.busy': 'Signing in…',
  'login.demo': 'Demo accounts — one click',
  'login.failed': 'Login failed',

  'parent.title': 'Parent Portal',
  'parent.subtitle': 'Sign in with your registered mobile number',
  'parent.phone': 'Mobile number',
  'parent.admissionNo': 'Admission no.',
  'parent.enter': 'Enter the hive',
  'parent.checking': 'Checking…',
  'parent.today': 'In school today',
  'parent.leave': 'On leave today',
  'parent.home': 'At home today',
  'parent.attendance': 'Attendance',
  'parent.fees': 'Fees',
  'parent.documents': 'Documents',
  'parent.messages': 'Messages',
  'parent.downloadPdf': 'Download PDF',
  'parent.install': 'Add to home screen',

  'ptm.title': 'Parent–teacher meetings',
  'ptm.subtitle': 'Timetable · attendance · signed form · teacher notes',
  'ptm.schedule': 'Schedule PTM',
  'ptm.slots': 'Slots',
  'ptm.hideSlots': 'Hide slots',
  'ptm.free': 'free',
  'ptm.booked': 'booked',
  'ptm.bookFor': 'Book for',
  'ptm.release': 'Release slot',
  'ptm.count': 'Slots',
  'ptm.minutes': 'Minutes',
  'ptm.generate': 'Generate slots',
  'ptm.noSlots': 'No slots yet — pick a count and length above.',
  'ptm.families': 'families',
  'ptm.attended': 'Attended',
  'ptm.markAttended': 'Mark attended',
  'ptm.notes': 'Notes',
  'ptm.notesHint': 'These notes are shared with the family.',
  'ptm.parentNames': 'Parent names',
  'ptm.teacherNotes': 'Teacher notes',
  'ptm.meetingTitle': 'Meeting title',
  'ptm.dateTime': 'Date & time',
  'ptm.create': 'Create & populate roster',
  'ptm.empty': 'No meetings scheduled yet.',

  'parent.ptm': 'Parent–teacher meeting',
  'parent.book': 'Book this slot',
  'parent.release': 'Cancel booking',
  'parent.mySlot': 'Your time',
  'parent.noPtm': 'No meeting has been scheduled yet',
  'parent.teacherNotes': 'Teacher notes',

  'theme.choose': 'Choose appearance',
  'theme.label': 'Theme',
};

export type TKey = keyof typeof en;

const gu: Partial<Record<TKey, string>> = {
  'common.loading': 'લોડ થઈ રહ્યું છે…',
  'common.save': 'સાચવો',
  'common.cancel': 'રદ કરો',
  'common.search': 'શોધો…',
  'common.language': 'ભાષા',
  'common.signOut': 'લોગ આઉટ',
  'common.retry': 'ફરી પ્રયાસ કરો',

  'nav.dashboard': 'ડેશબોર્ડ',
  'nav.leads': 'ફર્સ્ટ બઝ',
  'nav.admissions': 'એડમિશન',
  'nav.students': 'વિદ્યાર્થીઓ',
  'nav.attendance': 'હાજરી',
  'nav.fees': 'ફી',
  'nav.comms': 'સંદેશ',
  'nav.lifecycle': 'વિદ્યાર્થી પ્રોફાઇલ',
  'nav.certificates': 'પ્રમાણપત્રો',
  'nav.academic': 'શૈક્ષણિક આયોજન',
  'nav.inventory': 'માલ-સામાન',
  'nav.ptm': 'વાલી મુલાકાત',
  'nav.evening': 'સાંજ કેન્દ્ર',
  'nav.hr': 'માનવ સંસાધન અને પગાર',
  'nav.analytics': 'વિશ્લેષણ',
  'nav.units': 'યુનિટ અને બેચ',
  'nav.settings': 'સેટિંગ્સ',

  'login.welcome': 'પાછા આવવા બદલ સ્વાગત',
  'login.subtitle': 'બંબલબી કિડ્ઝ ERP માં લોગિન કરો',
  'login.email': 'ઈમેલ',
  'login.password': 'પાસવર્ડ',
  'login.submit': 'લોગિન',
  'login.busy': 'લોગિન થઈ રહ્યું છે…',
  'login.demo': 'ડેમો ખાતાં — એક ક્લિક',
  'login.failed': 'લોગિન નિષ્ફળ',

  'parent.title': 'વાલી પોર્ટલ',
  'parent.subtitle': 'તમારા નોંધાયેલા મોબાઈલ નંબરથી લોગિન કરો',
  'parent.phone': 'મોબાઈલ નંબર',
  'parent.admissionNo': 'એડમિશન નંબર',
  'parent.enter': 'અંદર પ્રવેશ કરો',
  'parent.checking': 'તપાસી રહ્યું છે…',
  'parent.today': 'આજે શાળામાં છે',
  'parent.leave': 'આજે રજા પર છે',
  'parent.home': 'આજે ઘરે છે',
  'parent.attendance': 'હાજરી',
  'parent.fees': 'ફી',
  'parent.documents': 'દસ્તાવેજો',
  'parent.messages': 'સંદેશા',
  'parent.downloadPdf': 'PDF ડાઉનલોડ કરો',
  'parent.install': 'હોમ સ્ક્રીન પર ઉમેરો',

  'ptm.title': 'વાલી-શિક્ષક મુલાકાત',
  'ptm.subtitle': 'સમયપત્રક · હાજરી · સહી કરેલું ફોર્મ · શિક્ષકની નોંધ',
  'ptm.schedule': 'મુલાકાત ગોઠવો',
  'ptm.slots': 'સ્લોટ',
  'ptm.hideSlots': 'સ્લોટ છુપાવો',
  'ptm.free': 'ખાલી',
  'ptm.booked': 'બુક થયેલ',
  'ptm.bookFor': 'બુક કરો',
  'ptm.release': 'સ્લોટ પાછો લો',
  'ptm.count': 'સ્લોટ',
  'ptm.minutes': 'મિનિટ',
  'ptm.generate': 'સ્લોટ બનાવો',
  'ptm.noSlots': 'હજી કોઈ સ્લોટ બન્યા નથી — ઉપર સંખ્યા અને મિનિટ પસંદ કરો.',
  'ptm.families': 'પરિવાર',
  'ptm.attended': 'હાજર',
  'ptm.markAttended': 'હાજર નોંધો',
  'ptm.notes': 'નોંધ',
  'ptm.notesHint': 'આ નોંધ પરિવાર સાથે શેર થાય છે.',
  'ptm.parentNames': 'વાલીનાં નામ',
  'ptm.teacherNotes': 'શિક્ષકની નોંધ',
  'ptm.meetingTitle': 'મુલાકાતનું નામ',
  'ptm.dateTime': 'તારીખ અને સમય',
  'ptm.create': 'બનાવો અને યાદી ભરો',
  'ptm.empty': 'હજી કોઈ મુલાકાત ગોઠવાઈ નથી.',

  'parent.ptm': 'વાલી-શિક્ષક મુલાકાત',
  'parent.book': 'આ સ્લોટ બુક કરો',
  'parent.release': 'બુકિંગ રદ કરો',
  'parent.mySlot': 'તમારો સમય',
  'parent.noPtm': 'હજી કોઈ મુલાકાત ગોઠવાઈ નથી',
  'parent.teacherNotes': 'શિક્ષકની નોંધ',

  'theme.choose': 'દેખાવ પસંદ કરો',
  'theme.label': 'થીમ',
};

const DICTIONARIES: Record<Lang, Partial<Record<TKey, string>>> = { en, gu };

export const LANGUAGES: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
];

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'gu') return stored;
  } catch {
    /* storage blocked — fall through to browser preference */
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('gu')) {
    return 'gu';
  }
  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setLang(lang === 'en' ? 'gu' : 'en'), [lang, setLang]);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      const text = DICTIONARIES[lang]?.[key] ?? en[key] ?? key;
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, toggle, t }), [lang, setLang, toggle, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Compact EN / ગુ switch used in the shell header and the parent portal. */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={`flex items-center overflow-hidden rounded-xl ${className}`}
      role="group"
      aria-label={t('common.language')}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          title={l.label}
          className={
            'px-2 py-1 text-[11px] font-bold transition ' +
            (lang === l.id ? 'text-[color:var(--accent)]' : 'text-[color:var(--txt3)]')
          }
        >
          {l.id === 'en' ? 'EN' : 'ગુ'}
        </button>
      ))}
    </div>
  );
}
