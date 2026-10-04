import { useTheme } from '../ui/ThemeContext';

/**
 * Localization resource file (§13). Every user-facing string for the auth
 * surfaces lives here, in Bengali and English, so nothing is hard-coded in JSX.
 */

export type Lang = 'en' | 'bn';

type Dict = Record<string, string>;

const en: Dict = {
  'app.tagline': 'Fast, secure GitHub login — no secret in the app.',
  'login.title': 'Login with GitHub',
  'login.subtitle': 'Sign in with GitHub to manage your repositories.',
  'login.button': 'Login with GitHub',
  'login.pat': 'Login with a Personal Access Token',
  'login.privacy': 'Privacy Policy',
  'login.terms': 'Terms',
  'login.requesting': 'Requesting a code…',
  'login.codeTitle': 'Enter this code on GitHub',
  'login.codeHint': 'Open GitHub and enter the code below to authorize Gitufy.',
  'login.copy': 'Copy code',
  'login.copied': 'Copied',
  'login.open': 'Open GitHub',
  'login.qrSection': 'Approve on another device',
  'login.qrHint': 'Scan this QR with a phone or open the link on any device.',
  'login.waiting': 'Waiting for approval…',
  'login.cancel': 'Cancel',
  'login.expiresIn': 'Expires in',
  'login.wrongAccount': 'Wrong account? Start again',
  'login.resumed': 'Restored your previous session — waiting for approval…',
  'login.success': 'Signed in',
  'login.welcome': 'Welcome',
  'login.offline': 'Offline — we will continue when you are back online.',
  'login.securityNotice':
    'Only approve the code when you started this login in the Gitufy app yourself. Do not approve if someone else asked you to type this code.',

  'error.E_NET': 'No internet connection.',
  'error.E_CODE_EXPIRED': 'The code has expired.',
  'error.E_DENIED': 'You cancelled the authorization.',
  'error.E_RATE': 'Too many attempts. Please try again a little later.',
  'error.E_CONFIG': 'There is a problem with the app configuration.',
  'error.E_SESSION': 'Your session has ended.',
  'error.E_ORG': 'This organization has restricted Gitufy access.',
  'error.E_SCOPE': 'This action needs additional permission.',
  'error.E_UNKNOWN': 'Something went wrong.',
  'action.retry': 'Try again',
  'action.new_code': 'Get a new code',
  'action.login': 'Log in',
  'action.pat': 'Log in with PAT',
  'action.report': 'Send report',
  'action.grant': 'Grant permission',
  'action.fix_org': 'How to fix this',
  'action.open_apps': 'Open GitHub apps',

  'pat.title': 'Personal Access Token',
  'pat.hint': 'Paste a classic or fine-grained token with repo and workflow scopes.',
  'pat.placeholder': 'ghp_xxxxxxxxxxxx',
  'pat.verify': 'Verify & sign in',
  'pat.generate': 'Generate a token on GitHub',

  'perm.title': 'Permissions',
  'perm.subtitle': 'What Gitufy can do, and why.',
  'perm.granted': 'Granted',
  'perm.notGranted': 'Not granted',
  'perm.add': 'Grant permission',
  'perm.usedFor': 'Used for',

  'accounts.title': 'Accounts',
  'accounts.add': 'Add account',
  'accounts.manage': 'Manage',
  'accounts.switch': 'Switch account',
  'accounts.logoutOne': 'Log out of this account',
  'accounts.logoutAll': 'Log out of all accounts',
  'accounts.signedInOn': 'Signed in',

  'settings.authSection': 'GitHub Authentication',
  'settings.connected': 'Connected',
  'settings.notConnected': 'Not connected',
  'settings.appLock': 'App lock',
  'settings.appLockAlways': 'Always',
  'settings.appLock1m': 'After 1 minute',
  'settings.appLock5m': 'After 5 minutes',
  'settings.appLockOff': 'Off',
  'settings.flagSecure': 'Hide in Recents',
  'settings.removeAccess': 'Remove access on GitHub',
  'settings.diagnostics': 'Login diagnostics',
  'settings.advanced': 'Advanced',
  'settings.webFlow': 'Fast login (experimental)',
  'settings.clearData': 'Delete all account data',

  'lock.title': 'Unlock Gitufy',
  'lock.subtitle': 'Confirm your identity to continue.',
  'lock.unlock': 'Unlock',
  'lock.failed': 'Could not verify. Try again.',

  'logout.done': 'Everything has been wiped from your device.',
  'logout.githubHint': 'You can also remove Gitufy access from GitHub.',

  'diag.title': 'Login diagnostics',
  'diag.lastValidated': 'Last session check',
  'diag.scopes': 'Granted scopes',
  'diag.rate': 'Rate limit remaining',
  'diag.transport': 'OAuth transport',
  'diag.storage': 'Secure storage',
  'diag.client': 'Client configured',
  'diag.never': 'Never',
  'diag.yes': 'Yes',
  'diag.no': 'No',

  'login.or': 'or',
  'login.google': 'Log in with Google',
  'login.patShort': 'Login with PAT',
  'chooser.title': 'Choose an account',
  'chooser.subtitle': 'to continue to Gitufy',
  'chooser.useAnother': 'Use another account',
  'chooser.hint': 'Accounts you have signed in with on this device.',
};

const bn: Dict = {
  'app.tagline': 'দ্রুত, নিরাপদ GitHub লগইন — অ্যাপে কোনো সিক্রেট নেই।',
  'login.title': 'GitHub দিয়ে লগইন',
  'login.subtitle': 'আপনার রিপোজিটরি ম্যানেজ করতে GitHub দিয়ে সাইন ইন করুন।',
  'login.button': 'GitHub দিয়ে লগইন',
  'login.pat': 'PAT দিয়ে লগইন',
  'login.privacy': 'প্রাইভেসি পলিসি',
  'login.terms': 'শর্তাবলী',
  'login.requesting': 'কোড চাওয়া হচ্ছে…',
  'login.codeTitle': 'GitHub-এ এই কোডটি দিন',
  'login.codeHint': 'Gitufy অনুমোদন করতে GitHub খুলে নিচের কোডটি দিন।',
  'login.copy': 'কোড কপি করুন',
  'login.copied': 'কপি হয়েছে',
  'login.open': 'GitHub খুলুন',
  'login.qrSection': 'অন্য ডিভাইসে অনুমোদন করুন',
  'login.qrHint': 'যেকোনো ডিভাইসে এই QR স্ক্যান করুন বা লিংক খুলুন।',
  'login.waiting': 'অনুমোদনের অপেক্ষায়…',
  'login.cancel': 'বাতিল',
  'login.expiresIn': 'মেয়াদ শেষ',
  'login.wrongAccount': 'ভুল অ্যাকাউন্ট? আবার শুরু করুন',
  'login.resumed': 'আগের সেশন পুনরুদ্ধার হয়েছে — অনুমোদনের অপেক্ষায়…',
  'login.success': 'সাইন ইন সম্পন্ন',
  'login.welcome': 'স্বাগতম',
  'login.offline': 'অফলাইন — ফিরলে চালিয়ে যাব।',
  'login.securityNotice':
    'শুধুমাত্র তখনই কোড দিয়ে অনুমোদন করুন যখন আপনি নিজে এই অ্যাপে লগইন শুরু করেছেন। অন্য কেউ আপনাকে কোড টাইপ করতে বললে অনুমোদন দেবেন না।',

  'error.E_NET': 'ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না।',
  'error.E_CODE_EXPIRED': 'কোডের মেয়াদ শেষ হয়ে গেছে।',
  'error.E_DENIED': 'আপনি অনুমোদন বাতিল করেছেন।',
  'error.E_RATE': 'অনেকবার চেষ্টা করা হয়েছে, একটু পরে চেষ্টা করুন।',
  'error.E_CONFIG': 'অ্যাপের কনফিগারেশনে সমস্যা হয়েছে।',
  'error.E_SESSION': 'সেশন শেষ হয়েছে।',
  'error.E_ORG': 'এই সংগঠন Gitufy-র অ্যাক্সেস সীমিত করেছে।',
  'error.E_SCOPE': 'এই কাজের জন্য অতিরিক্ত অনুমতি দরকার।',
  'error.E_UNKNOWN': 'কিছু একটা ভুল হয়েছে।',
  'action.retry': 'আবার চেষ্টা',
  'action.new_code': 'নতুন কোড নিন',
  'action.login': 'লগইন করুন',
  'action.pat': 'PAT দিয়ে লগইন',
  'action.report': 'রিপোর্ট পাঠান',
  'action.grant': 'অনুমতি দিন',
  'action.fix_org': 'কীভাবে ঠিক করবেন',
  'action.open_apps': 'GitHub অ্যাপ খুলুন',

  'pat.title': 'পার্সোনাল অ্যাক্সেস টোকেন',
  'pat.hint': 'repo ও workflow স্কোপসহ ক্লাসিক বা ফাইন-গ্রেইনড টোকেন পেস্ট করুন।',
  'pat.placeholder': 'ghp_xxxxxxxxxxxx',
  'pat.verify': 'যাচাই করে সাইন ইন',
  'pat.generate': 'GitHub-এ টোকেন তৈরি করুন',

  'perm.title': 'অনুমতি',
  'perm.subtitle': 'Gitufy কী করতে পারে, এবং কেন।',
  'perm.granted': 'অনুমোদিত',
  'perm.notGranted': 'অনুমোদিত নয়',
  'perm.add': 'অনুমতি দিন',
  'perm.usedFor': 'যেসব কাজে লাগে',

  'accounts.title': 'অ্যাকাউন্ট',
  'accounts.add': 'অ্যাকাউন্ট যোগ করুন',
  'accounts.manage': 'ম্যানেজ',
  'accounts.switch': 'অ্যাকাউন্ট সুইচ',
  'accounts.logoutOne': 'এই অ্যাকাউন্ট থেকে লগআউট',
  'accounts.logoutAll': 'সব অ্যাকাউন্ট থেকে লগআউট',
  'accounts.signedInOn': 'লগইনের তারিখ',

  'settings.authSection': 'GitHub অথেন্টিকেশন',
  'settings.connected': 'সংযুক্ত',
  'settings.notConnected': 'সংযুক্ত নয়',
  'settings.appLock': 'অ্যাপ লক',
  'settings.appLockAlways': 'সবসময়',
  'settings.appLock1m': '১ মিনিট পরে',
  'settings.appLock5m': '৫ মিনিট পরে',
  'settings.appLockOff': 'বন্ধ',
  'settings.flagSecure': 'Recents-এ লুকান',
  'settings.removeAccess': 'GitHub থেকে অ্যাক্সেস মুছুন',
  'settings.diagnostics': 'লগইন ডায়াগনস্টিক',
  'settings.advanced': 'অ্যাডভান্সড',
  'settings.webFlow': 'দ্রুত লগইন (পরীক্ষামূলক)',
  'settings.clearData': 'সব অ্যাকাউন্ট ডেটা মুছুন',

  'lock.title': 'Gitufy আনলক করুন',
  'lock.subtitle': 'চালিয়ে যেতে আপনার পরিচয় নিশ্চিত করুন।',
  'lock.unlock': 'আনলক',
  'lock.failed': 'যাচাই করা যায়নি। আবার চেষ্টা করুন।',

  'logout.done': 'আপনার ডিভাইস থেকে সব মুছে ফেলা হয়েছে।',
  'logout.githubHint': 'চাইলে GitHub থেকেও Gitufy-র অ্যাক্সেস সরিয়ে দিন।',

  'diag.title': 'লগইন ডায়াগনস্টিক',
  'diag.lastValidated': 'সর্বশেষ সেশন যাচাই',
  'diag.scopes': 'প্রাপ্ত স্কোপ',
  'diag.rate': 'বাকি রেট লিমিট',
  'diag.transport': 'OAuth ট্রান্সপোর্ট',
  'diag.storage': 'নিরাপদ স্টোরেজ',
  'diag.client': 'ক্লায়েন্ট কনফিগার',
  'diag.never': 'কখনো নয়',
  'diag.yes': 'হ্যাঁ',
  'diag.no': 'না',

  'login.or': 'অথবা',
  'login.google': 'Google দিয়ে লগইন',
  'login.patShort': 'PAT দিয়ে লগইন',
  'chooser.title': 'একটি অ্যাকাউন্ট বেছে নিন',
  'chooser.subtitle': 'Gitufy-তে চালিয়ে যেতে',
  'chooser.useAnother': 'অন্য অ্যাকাউন্ট ব্যবহার করুন',
  'chooser.hint': 'এই ডিভাইসে আগে যেসব অ্যাকাউন্টে লগইন করেছেন।',
};

export const STRINGS: Record<Lang, Dict> = { en, bn };

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = STRINGS[lang] ?? en;
  let out = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const { settings } = useTheme();
  const lang = (settings.language ?? 'en') as Lang;
  return (key, vars) => translate(lang, key, vars);
}
