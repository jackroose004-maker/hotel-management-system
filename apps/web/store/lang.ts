import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Lang = 'en' | 'ar'

interface LangStore {
  lang: Lang
  setLang: (l: Lang) => void
}

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      lang: 'en',
      setLang: (lang) => {
        set({ lang })
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang
          document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
        }
      },
    }),
    { name: 'almanzil-lang' }
  )
)

export function applyLangDir(lang: Lang) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

// Flat translation keys
const translations: Record<Lang, Record<string, string>> = {
  en: {
    'nav.menu': 'Menu',
    'nav.book': 'Book a Table',
    'nav.signIn': 'Sign In',
    'nav.signOut': 'Sign out',
    'nav.myAccount': 'My Account',
    'nav.orderNow': 'Order Now',
    'home.orderFood': 'Order Food',
    'home.browseMenu': 'Browse full menu',
    'home.reserveTable': 'Reserve Table',
    'home.pickDateTime': 'Pick date & time',
    'home.mustTry': 'Must Try',
    'home.viewAll': 'View all',
    'home.quickActions': 'Quick Actions',
    'menu.search': 'Search dishes…',
    'menu.addToCart': 'Add',
    'menu.cart': 'Cart',
    'login.welcomeBack': 'Welcome back',
    'login.createAccount': 'Create your account',
    'login.signIn': 'Sign In',
    'login.signUp': 'Sign Up',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.fullName': 'Full Name',
    'login.phone': 'Phone',
    'login.continueGoogle': 'Continue with Google',
    'login.orEmail': 'or continue with email',
    'login.staffPortalTitle': 'Staff account detected',
    'login.staffPortalMsg': 'This email is registered as a staff member. Please use the Staff Portal to sign in.',
    'login.goStaffPortal': 'Go to Staff Portal →',
  },
  ar: {
    'nav.menu': 'القائمة',
    'nav.book': 'احجز طاولة',
    'nav.signIn': 'تسجيل الدخول',
    'nav.signOut': 'تسجيل الخروج',
    'nav.myAccount': 'حسابي',
    'nav.orderNow': 'اطلب الآن',
    'home.orderFood': 'اطلب الطعام',
    'home.browseMenu': 'تصفح القائمة الكاملة',
    'home.reserveTable': 'احجز طاولة',
    'home.pickDateTime': 'اختر التاريخ والوقت',
    'home.mustTry': 'يجب تجربته',
    'home.viewAll': 'عرض الكل',
    'home.quickActions': 'إجراءات سريعة',
    'menu.search': 'ابحث عن الأطباق…',
    'menu.addToCart': 'أضف',
    'menu.cart': 'السلة',
    'login.welcomeBack': 'مرحباً بعودتك',
    'login.createAccount': 'إنشاء حساب جديد',
    'login.signIn': 'تسجيل الدخول',
    'login.signUp': 'إنشاء حساب',
    'login.email': 'البريد الإلكتروني',
    'login.password': 'كلمة المرور',
    'login.fullName': 'الاسم الكامل',
    'login.phone': 'رقم الهاتف',
    'login.continueGoogle': 'المتابعة مع Google',
    'login.orEmail': 'أو المتابعة بالبريد الإلكتروني',
    'login.staffPortalTitle': 'تم اكتشاف حساب موظف',
    'login.staffPortalMsg': 'هذا البريد مسجل كموظف. يرجى استخدام بوابة الموظفين لتسجيل الدخول.',
    'login.goStaffPortal': 'الذهاب إلى بوابة الموظفين ←',
  },
}

export function t(lang: Lang, key: string): string {
  return translations[lang]?.[key] ?? translations['en'][key] ?? key
}
