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
  'nav.me': 'My Space',
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

  'me.title': 'My Space',
  'me.subtitle': 'Your profile, payslips, attendance and leave',
  'me.profile': 'My profile',
  'me.name': 'Name',
  'me.employeeNo': 'Employee no.',
  'me.payslips': 'Payslips',
  'me.noPayslips': 'Payslips appear once payroll is approved.',
  'me.leave': 'Leave',
  'me.leaveType': 'Type',
  'me.from': 'From',
  'me.to': 'To',
  'me.reason': 'Reason',
  'me.applyLeave': 'Apply for leave',
  'me.attendance': 'My attendance',
  'me.month': 'Month',
  'me.daysPresent': 'days present',
  'me.noAttendance': 'No attendance imported for this month.',

  'academic.title': 'Academic planning',
  'academic.subtitle': 'HO-authored Yearly Goals · Big Rocks · Calendar · Log Plan',
  'academic.newPlan': 'New plan',
  'academic.today': 'Today’s plan',
  'academic.nothingToday': 'Nothing planned for this day.',
  'academic.calendar': 'Calendar',
  'academic.logPlan': 'Log Plan',
  'academic.derivedHint':
    'Derived from the Calendar and the Log Plan — there is no second copy to fall out of date.',
  'academic.overlay': 'Unit overlay',
  'academic.approve': 'Approve',
  'academic.lock': 'Lock',
  'academic.unlock': 'Unlock',
  'academic.adapt': 'Adapt for my unit',
  'academic.adaptHint':
    'Adapt this locked Head Office plan for your unit. The master stays unchanged.',
  'academic.empty': 'Nothing planned yet for this section.',
  'academic.titleField': 'Title',
  'academic.description': 'Description',
  'academic.start': 'Starts',
  'academic.end': 'Ends',
  'academic.saveDraft': 'Save draft',
  'academic.kind.YEARLY_GOAL': 'Yearly Goals',
  'academic.kind.BIG_ROCK': 'Big Rocks',
  'academic.kind.CALENDAR': 'Calendar',
  'academic.kind.LOG_PLAN': 'Log Plan',

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
  'ptm.history': 'Meeting history',
  'ptm.viewHistory': 'History',
  'ptm.historyEmpty': 'This family has not been part of a meeting yet.',
  'ptm.invited': 'meetings',
  'ptm.upcomingSlot': 'Next slot',
  'ptm.noUpcomingSlot': 'No slot booked',
  'ptm.signedForm': 'Signed form on file',

  'parent.payNow': 'Pay online',
  'parent.paying': 'Opening gateway…',
  'parent.paySoon':
    'Online payment starts once the centre activates Razorpay — pay at your centre for now.',
  'parent.ptm': 'Parent–teacher meeting',
  'parent.book': 'Book this slot',
  'parent.release': 'Cancel booking',
  'parent.mySlot': 'Your time',
  'parent.noPtm': 'No meeting has been scheduled yet',
  'parent.teacherNotes': 'Teacher notes',

  'theme.choose': 'Choose appearance',
  'theme.label': 'Theme',
  // ── staff page chrome (English) ──
  'dashboard.goodMorning': 'Good morning',
  'dashboard.goodAfternoon': 'Good afternoon',
  'dashboard.goodEvening': 'Good evening',
  'dashboard.activeStudents': 'Active Students',
  'dashboard.openLeads': 'Open Leads',
  'dashboard.todayAttendance': "Today's Attendance",
  'dashboard.feesCollected': 'Fees Collected',
  'dashboard.funnel': 'Admission Funnel — First Buzz Pipeline',
  'dashboard.byProgramme': 'Students by Programme',
  'dashboard.recentInquiries': 'Recent Inquiries',
  'dashboard.viewCrm': 'View CRM',
  'leads.title': 'First Buzz CRM',
  'leads.subtitle': '9-stage inquiry pipeline · central hub routing to 3 units',
  'leads.pipeline': 'Lead Pipeline',
  'admissions.title': 'Admissions',
  'admissions.subtitle': 'Stage-2 registration → Discovery Flight → CH approval → confirmation',
  'admissions.pipeline': 'Admission Pipeline',
  'students.title': 'Students',
  'students.register': 'Student Register',
  'attendance.title': 'Attendance',
  'attendance.subtitle':
    'Default is ABSENT — teachers actively mark Present · auto-lock at start + 30 min · post-lock edits need Centre Head override',
  'attendance.today': 'today',
  'fees.title': 'Fees & Receipts',
  'fees.subtitle':
    'Dual ledger (preschool annual · evening monthly, never merged) · auto receipt numbering · sibling concessions · reminder queue',
  'fees.ledger': 'Student fee ledger',
  'fees.structures': 'Fee structures · AY 2026-27',
  'comms.title': 'Communication',
  'comms.subtitle':
    'One outbox for every parent-facing message · WhatsApp BSP connects via .env keys (running in sandbox mode)',
  'comms.outbox': 'Message outbox',
  'comms.newAnnouncement': 'New announcement',
  'comms.dispatch': 'Dispatch queue',
  'lifecycle.title': 'Student Lifecycle',
  'lifecycle.subtitle': 'Complete 18-tab profile · visibility rules enforced by the API',
  'lifecycle.addRecord': 'Add record',
  'certificates.title': 'Certificates',
  'certificates.subtitle':
    '7 Head-Office-locked templates · serial-numbered · TC requires cleared fees + No-Dues confirmation',
  'certificates.issued': 'Issued certificates',
  'inventory.title': 'Inventory',
  'inventory.subtitle': '8-category SKU master · PRF → PO → GRN · petty cash · 10 reports',
  'inventory.newSku': 'New SKU',
  'evening.title': 'Evening Activity Centre',
  'evening.subtitle': 'Separate enrolment and fee ledger — never merged with preschool fees',
  'evening.newActivity': 'New activity',
  'hr.title': 'HR & Payroll',
  'hr.subtitle': 'Employee master · reporting hierarchy · effective-dated employment history',
  'hr.master': 'Employee master',
  'hr.addEmployee': 'Add employee',
  'analytics.title': 'Analytics',
  'analytics.subtitle': 'Cross-module operational intelligence',
  'analytics.loading': 'Loading analytics…',
  'units.title': 'Units & Batches',
  'units.subtitle': '3 company-owned units · Rajkot · franchise layer arrives in Phase 3',
  'units.batches': 'Batches — AY 2026-27',
  'settings.title': 'Settings',
  'settings.subtitle': 'Team, batch masters, unit settings & audit trail — every change is logged',
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
  'nav.me': 'મારી જગ્યા',
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

  'me.title': 'મારી જગ્યા',
  'me.subtitle': 'તમારી પ્રોફાઇલ, પગારપત્રક, હાજરી અને રજા',
  'me.profile': 'મારી પ્રોફાઇલ',
  'me.name': 'નામ',
  'me.employeeNo': 'કર્મચારી નંબર',
  'me.payslips': 'પગારપત્રક',
  'me.noPayslips': 'પગાર મંજૂર થતાં પગારપત્રક દેખાશે.',
  'me.leave': 'રજા',
  'me.leaveType': 'પ્રકાર',
  'me.from': 'થી',
  'me.to': 'સુધી',
  'me.reason': 'કારણ',
  'me.applyLeave': 'રજા માટે અરજી કરો',
  'me.attendance': 'મારી હાજરી',
  'me.month': 'મહિનો',
  'me.daysPresent': 'દિવસ હાજર',
  'me.noAttendance': 'આ મહિનાની હાજરી નથી.',

  'academic.title': 'શૈક્ષણિક આયોજન',
  'academic.subtitle': 'HO આયોજિત વાર્ષિક લક્ષ્યો · મોટા પડાવ · કેલેન્ડર · લોગ પ્લાન',
  'academic.newPlan': 'નવો પ્લાન',
  'academic.today': 'આજનો પ્લાન',
  'academic.nothingToday': 'આ દિવસ માટે કંઈ આયોજિત નથી.',
  'academic.calendar': 'કેલેન્ડર',
  'academic.logPlan': 'લોગ પ્લાન',
  'academic.derivedHint': 'કેલેન્ડર અને લોગ પ્લાન પરથી બનેલો — અલગ નકલ રાખવાની જરૂર નથી.',
  'academic.overlay': 'યુનિટ ઓવરલે',
  'academic.approve': 'મંજૂર કરો',
  'academic.lock': 'લોક કરો',
  'academic.unlock': 'અનલોક કરો',
  'academic.adapt': 'મારા યુનિટ માટે અનુકૂળ કરો',
  'academic.adaptHint': 'આ લોક થયેલો HO પ્લાન તમારા યુનિટ માટે અનુકૂળ કરો. મૂળ પ્લાન બદલાશે નહીં.',
  'academic.empty': 'આ વિભાગ માટે હજી કંઈ આયોજિત નથી.',
  'academic.titleField': 'શીર્ષક',
  'academic.description': 'વર્ણન',
  'academic.start': 'શરૂ',
  'academic.end': 'પૂર્ણ',
  'academic.saveDraft': 'ડ્રાફ્ટ સાચવો',
  'academic.kind.YEARLY_GOAL': 'વાર્ષિક લક્ષ્યો',
  'academic.kind.BIG_ROCK': 'મોટા પડાવ',
  'academic.kind.CALENDAR': 'કેલેન્ડર',
  'academic.kind.LOG_PLAN': 'લોગ પ્લાન',

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
  'ptm.history': 'મુલાકાતનો ઇતિહાસ',
  'ptm.viewHistory': 'ઇતિહાસ',
  'ptm.historyEmpty': 'આ પરિવાર હજી કોઈ મુલાકાતમાં આવ્યો નથી.',
  'ptm.invited': 'મુલાકાત',
  'ptm.upcomingSlot': 'આગળનો સ્લોટ',
  'ptm.noUpcomingSlot': 'કોઈ સ્લોટ બુક નથી',
  'ptm.signedForm': 'સહી કરેલું ફોર્મ સંગ્રહિત છે',

  'parent.payNow': 'ઓનલાઈન ચૂકવો',
  'parent.paying': 'ગેટવે ખૂલી રહ્યું છે…',
  'parent.paySoon':
    'કેન્દ્ર દ્વારા Razorpay ચાલુ થતાં જ ઓનલાઈન ચુકવણી શરૂ થશે — હાલ કેન્દ્રમાં ચૂકવો.',
  'parent.ptm': 'વાલી-શિક્ષક મુલાકાત',
  'parent.book': 'આ સ્લોટ બુક કરો',
  'parent.release': 'બુકિંગ રદ કરો',
  'parent.mySlot': 'તમારો સમય',
  'parent.noPtm': 'હજી કોઈ મુલાકાત ગોઠવાઈ નથી',
  'parent.teacherNotes': 'શિક્ષકની નોંધ',

  'theme.choose': 'દેખાવ પસંદ કરો',
  'theme.label': 'થીમ',
  // ── staff page chrome (Gujarati) ──
  'dashboard.goodMorning': 'સુપ્રભાત',
  'dashboard.goodAfternoon': 'શુભ બપોર',
  'dashboard.goodEvening': 'શુભ સાંજ',
  'dashboard.activeStudents': 'સક્રિય વિદ્યાર્થીઓ',
  'dashboard.openLeads': 'ખુલ્લી પૂછપરછ',
  'dashboard.todayAttendance': 'આજની હાજરી',
  'dashboard.feesCollected': 'વસૂલ થયેલી ફી',
  'dashboard.funnel': 'પ્રવેશ ફનલ — ફર્સ્ટ બઝ પાઇપલાઇન',
  'dashboard.byProgramme': 'કાર્યક્રમ પ્રમાણે વિદ્યાર્થીઓ',
  'dashboard.recentInquiries': 'તાજી પૂછપરછ',
  'dashboard.viewCrm': 'CRM જુઓ',
  'leads.title': 'ફર્સ્ટ બઝ CRM',
  'leads.subtitle': '9-તબક્કાની પૂછપરછ પાઇપલાઇન · કેન્દ્રીય હબથી 3 યુનિટમાં રૂટિંગ',
  'leads.pipeline': 'લીડ પાઇપલાઇન',
  'admissions.title': 'પ્રવેશ',
  'admissions.subtitle': 'તબક્કો-2 નોંધણી → ડિસ્કવરી ફ્લાઇટ → સેન્ટર હેડ મંજૂરી → પ્રવેશ પુષ્ટિ',
  'admissions.pipeline': 'પ્રવેશ પાઇપલાઇન',
  'students.title': 'વિદ્યાર્થીઓ',
  'students.register': 'વિદ્યાર્થી રજિસ્ટર',
  'attendance.title': 'હાજરી',
  'attendance.subtitle':
    'મૂળભૂત રીતે ગેરહાજર — શિક્ષક જ હાજર નોંધે · શરૂ થવાના 30 મિનિટ પછી લોક · લોક પછીના ફેરફાર માટે સેન્ટર હેડની મંજૂરી જરૂરી',
  'attendance.today': 'આજે',
  'fees.title': 'ફી અને રસીદો',
  'fees.subtitle':
    'બે અલગ ખાતાં (પ્રીસ્કૂલ વાર્ષિક · સાંજ માસિક, કદી ભેળવવા નહીં) · આપોઆપ રસીદ નંબર · ભાઈ-બહેન રાહત · રિમાઇન્ડર કતાર',
  'fees.ledger': 'વિદ્યાર્થી ફી ખાતું',
  'fees.structures': 'ફી માળખું · શૈક્ષણિક વર્ષ 2026-27',
  'comms.title': 'સંચાર',
  'comms.subtitle':
    'વાલીને મોકલાતા દરેક સંદેશ માટે એક જ આઉટબોક્સ · WhatsApp BSP .env કી ઉમેરતાં ચાલુ થશે (હાલ સેન્ડબોક્સ મોડ)',
  'comms.outbox': 'સંદેશ આઉટબોક્સ',
  'comms.newAnnouncement': 'નવી જાહેરાત',
  'comms.dispatch': 'કતાર મોકલો',
  'lifecycle.title': 'વિદ્યાર્થી જીવનચક્ર',
  'lifecycle.subtitle': '18-ટૅબની સંપૂર્ણ પ્રોફાઇલ · દૃશ્યતાના નિયમો API લાગુ કરે છે',
  'lifecycle.addRecord': 'નોંધ ઉમેરો',
  'certificates.title': 'પ્રમાણપત્રો',
  'certificates.subtitle':
    '7 હેડ ઓફિસ-લોક કરેલા નમૂના · ક્રમિક નંબર · TC માટે ફી ચૂકતે + નો-ડ્યુઝ પુષ્ટિ જરૂરી',
  'certificates.issued': 'જારી કરેલાં પ્રમાણપત્રો',
  'inventory.title': 'માલસામાન',
  'inventory.subtitle': '8-શ્રેણીનું SKU માસ્ટર · PRF → PO → GRN · પેટી કેશ · 10 રિપોર્ટ',
  'inventory.newSku': 'નવો SKU',
  'evening.title': 'સાંજનું પ્રવૃત્તિ કેન્દ્ર',
  'evening.subtitle': 'અલગ નોંધણી અને ફી ખાતું — પ્રીસ્કૂલ ફી સાથે કદી ભેળવવું નહીં',
  'evening.newActivity': 'નવી પ્રવૃત્તિ',
  'hr.title': 'માનવ સંસાધન અને પગાર',
  'hr.subtitle': 'કર્મચારી માસ્ટર · રિપોર્ટિંગ ક્રમ · અમલ તારીખ સાથેનો રોજગાર ઇતિહાસ',
  'hr.master': 'કર્મચારી માસ્ટર',
  'hr.addEmployee': 'કર્મચારી ઉમેરો',
  'analytics.title': 'વિશ્લેષણ',
  'analytics.subtitle': 'તમામ વિભાગોની કાર્યક્ષમતાનું વિશ્લેષણ',
  'analytics.loading': 'વિશ્લેષણ લોડ થઈ રહ્યું છે…',
  'units.title': 'યુનિટ અને બેચ',
  'units.subtitle': '3 કંપની-માલિકીના યુનિટ · રાજકોટ · ફ્રેન્ચાઇઝી તબક્કો 3 માં',
  'units.batches': 'બેચ — શૈક્ષણિક વર્ષ 2026-27',
  'settings.title': 'સેટિંગ્સ',
  'settings.subtitle': 'ટીમ, બેચ માસ્ટર, યુનિટ સેટિંગ્સ અને ઓડિટ ટ્રેલ — દરેક ફેરફાર નોંધાય છે',
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
