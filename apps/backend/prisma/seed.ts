import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()


async function main() {
  // ── Staff accounts ──────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'owner@hotel.com' },
    update: {},
    create: { name: 'Hotel Owner', email: 'owner@hotel.com', passwordHash: await bcrypt.hash('owner123', 10), role: 'OWNER' },
  })
  await prisma.user.upsert({
    where: { email: 'manager@hotel.com' },
    update: {},
    create: { name: 'Rajan Manager', email: 'manager@hotel.com', passwordHash: await bcrypt.hash('manager123', 10), role: 'STAFF' },
  })
  await prisma.user.upsert({
    where: { email: 'staff@hotel.com' },
    update: {},
    create: { name: 'Ahmed Staff', email: 'staff@hotel.com', passwordHash: await bcrypt.hash('staff123', 10), role: 'STAFF' },
  })
  await prisma.user.upsert({
    where: { email: 'chef@hotel.com' },
    update: {},
    create: { name: 'Chef Ali', email: 'chef@hotel.com', passwordHash: await bcrypt.hash('chef123', 10), role: 'STAFF' },
  })
  console.log('✅ Staff accounts seeded')

  // ── Default staff roles ──────────────────────────────────────────────────
  const defaultRoles = [
    { name: 'Manager',  color: '#818cf8', permissions: ['dashboard','orders','tables','bookings','bills','menu','analytics','team'], isSystem: true },
    { name: 'Waiter',   color: '#34d399', permissions: ['dashboard','orders','tables','bookings'], isSystem: true },
    { name: 'Cashier',  color: '#f59e0b', permissions: ['dashboard','bills','orders'], isSystem: true },
    { name: 'Chef',     color: '#f97316', permissions: ['kitchen'], isSystem: true },
  ]
  for (const r of defaultRoles) {
    await prisma.staffRole.upsert({
      where: { name: r.name },
      update: { permissions: r.permissions, color: r.color },
      create: r,
    })
  }
  console.log('✅ Default staff roles seeded')

  // ── Default settings ──────────────────────────────────────────────────
  const existingSettings = await prisma.restaurantSettings.findFirst()
  if (!existingSettings) {
    await prisma.restaurantSettings.create({
      data: {
        // ── Identity (EN + AR) ──
        restaurantName:           'Al Manzil',
        restaurantNameAr:         'المنزل',
        tagline:                  'Authentic Kerala & South Indian Cuisine',
        taglineAr:                'مأكولات كيرالا وجنوب الهند الأصيلة',
        // ── Contact ──
        phone:                    '+971 4 000 0000',
        address:                  'Al Quoz, Dubai, UAE',
        supportEmail:             'support@almanzil.ae',
        supportPhone:             '+971 4 000 0000',
        // ── Locale & currency ──
        timezone:                 'Asia/Dubai',
        currency:                 'AED',
        currencySymbol:           'AED',
        showLanguageToggle:       true,
        // ── Operating hours (legacy flat fields — weeklySchedule is canonical) ──
        openTime:                 '07:00',
        closeTime:                '23:00',
        weeklySchedule: {
          MON: { open: true, shifts: [{ openTime: '07:00', closeTime: '23:00' }] },
          TUE: { open: true, shifts: [{ openTime: '07:00', closeTime: '23:00' }] },
          WED: { open: true, shifts: [{ openTime: '07:00', closeTime: '23:00' }] },
          THU: { open: true, shifts: [{ openTime: '07:00', closeTime: '23:00' }] },
          FRI: { open: true, shifts: [{ openTime: '12:00', closeTime: '23:59' }] },
          SAT: { open: true, shifts: [{ openTime: '07:00', closeTime: '23:00' }] },
          SUN: { open: true, shifts: [{ openTime: '07:00', closeTime: '23:00' }] },
        },
        // ── Dining defaults ──
        defaultCapacity:          4,
        defaultPrepTimeMins:      15,
        // ── Financials ──
        vatRate:                  0.05,
        vatNumber:                '',
        serviceChargeRate:        0,
        // ── Bookings ──
        bookingsEnabled:          true,
        slotDurationMins:         30,
        expectedDiningMins:       90,
        tableReleaseWindowMins:   60,
        sameDayCutoffMins:        15,
        peakHoursEnabled:         true,
        peakRanges:               [{ start: '19:00', end: '22:00' }],
        noShowGracePeriodOffPeak: 20,
        noShowGracePeriodPeak:    5,
        maxBookingDaysAhead:      7,
        requireLoginToBook:       true,
        remindersEnabled:         false,
        reminderMinsBefore:       60,
        preOrderEnabled:          true,
        // ── Bill / payment features ──
        splitPaymentEnabled:      true,
        tipEnabled:               true,
        discountEnabled:          true,
        // ── Kitchen ──
        kdsEnabled:               false,
        thermalEnabled:           false,
        thermalPrinterPort:       9100,
        // ── Brand ──
        brandColor:               '#c0392b',
        brandPreset:              'red',
        // ── Email sender identity ──
        emailFromName:            'Al Manzil',
        emailReplyTo:             'noreply@almanzil.ae',
        // ── Social links ──
        socialLinks: {
          instagram: '',
          whatsapp:  '',
        },
      },
    })
    console.log('✅ Default restaurant settings seeded')
  } else {
    // Backfill new fields for existing installs (idempotent — only sets fields that are null/missing)
    await prisma.restaurantSettings.update({
      where: { id: existingSettings.id },
      data: {
        restaurantNameAr:     existingSettings.restaurantNameAr     ?? 'المنزل',
        taglineAr:            existingSettings.taglineAr             ?? 'مأكولات كيرالا وجنوب الهند الأصيلة',
        splitPaymentEnabled:  existingSettings.splitPaymentEnabled   ?? true,
        tipEnabled:           existingSettings.tipEnabled            ?? true,
        discountEnabled:      existingSettings.discountEnabled       ?? true,
        preOrderEnabled:      existingSettings.preOrderEnabled       ?? true,
        emailFromName:        existingSettings.emailFromName         ?? 'Al Manzil',
        showLanguageToggle:   existingSettings.showLanguageToggle    ?? true,
      },
    })
    console.log('✅ Existing settings backfilled')
  }

  // ── Email templates ───────────────────────────────────────────────────
  const emailTemplates = [
    {
      key:           'booking_confirmation',
      name:          'Booking Confirmation',
      subject:       'Your table at {{restaurantName}} is confirmed — {{slotDate}}',
      bgColor:       '#f0f0f0',
      cardTheme:     'light',
      enabled:       true,
      localeEnabled: true,                           // show EN/AR toggle in settings
      greeting:      'Dear {{name}},',
      greetingAr:    'عزيزي {{name}}،',
      footerNoReply:   'This is an automated message. Please do not reply.',
      footerNoReplyAr: 'هذه رسالة آلية. يرجى عدم الرد عليها.',
    },
    {
      key:           'booking_cancelled',
      name:          'Booking Cancelled',
      subject:       'Your booking at {{restaurantName}} has been cancelled — Ref #{{ref}}',
      bgColor:       '#f0f0f0',
      cardTheme:     'light',
      enabled:       true,
      localeEnabled: true,
      greeting:      'Dear {{name}},',
      greetingAr:    'عزيزي {{name}}،',
      footerNoReply:   'This is an automated message. Please do not reply.',
      footerNoReplyAr: 'هذه رسالة آلية. يرجى عدم الرد عليها.',
    },
    {
      key:           'order_cancelled',
      name:          'Order Cancelled',
      subject:       'Your order #{{ref}} has been cancelled — {{restaurantName}}',
      bgColor:       '#f0f0f0',
      cardTheme:     'light',
      enabled:       true,
      localeEnabled: false,
      greeting:      'Dear {{name}},',
      greetingAr:    'عزيزي {{name}}،',
      footerNoReply:   'This is an automated message. Please do not reply.',
      footerNoReplyAr: 'هذه رسالة آلية. يرجى عدم الرد عليها.',
    },
    {
      key:           'otp',
      name:          'OTP / Verification',
      subject:       'Your {{restaurantName}} verification code',
      bgColor:       '#f0f0f0',
      cardTheme:     'light',
      enabled:       true,
      localeEnabled: false,
      greeting:      'Hello {{name}},',
      greetingAr:    'مرحباً {{name}}،',
      footerNoReply:   'This is an automated message. Please do not reply.',
      footerNoReplyAr: 'هذه رسالة آلية. يرجى عدم الرد عليها.',
    },
    {
      key:           'welcome',
      name:          'Welcome',
      subject:       'Welcome to {{restaurantName}}',
      bgColor:       '#f0f0f0',
      cardTheme:     'light',
      enabled:       true,
      localeEnabled: true,
      greeting:      'Welcome, {{name}}!',
      greetingAr:    'أهلاً وسهلاً، {{name}}!',
      footerNoReply:   'This is an automated message. Please do not reply.',
      footerNoReplyAr: 'هذه رسالة آلية. يرجى عدم الرد عليها.',
    },
  ]
  for (const tpl of emailTemplates) {
    await prisma.emailTemplate.upsert({
      where:  { key: tpl.key },
      update: {
        // On re-seed update subject/greetings but don't overwrite user-customised fields
        subject:         tpl.subject,
        greeting:        tpl.greeting,
        greetingAr:      tpl.greetingAr,
        footerNoReply:   tpl.footerNoReply,
        footerNoReplyAr: tpl.footerNoReplyAr,
        localeEnabled:   tpl.localeEnabled,
      },
      create: tpl,
    })
  }
  console.log('✅ Email templates seeded')

  // ── Tables with QR codes ──────────────────────────────────────────────
  for (let i = 1; i <= 12; i++) {
    await prisma.restaurantTable.upsert({
      where:  { tableNumber: i },
      update: { qrCode: `table-${i}` },
      create: { tableNumber: i, capacity: i <= 8 ? 4 : 6, qrCode: `table-${i}` },
    })
  }
  console.log('✅ Tables seeded (table-1 to table-12)')

  // ── Menu categories ───────────────────────────────────────────────────
  const catData = [
    { id: 'breakfast', name: 'Breakfast',        nameAr: 'إفطار',           sortOrder: 1 },
    { id: 'meals',     name: 'Kerala Meals',      nameAr: 'وجبات كيرالا',    sortOrder: 2 },
    { id: 'curries',   name: 'Curries',           nameAr: 'مرق',             sortOrder: 3 },
    { id: 'biriyani',  name: 'Biriyani & Rice',   nameAr: 'برياني وأرز',     sortOrder: 4 },
    { id: 'breads',    name: 'Breads & Rotis',    nameAr: 'خبز',             sortOrder: 5 },
    { id: 'snacks',    name: 'Snacks & Starters', nameAr: 'وجبات خفيفة',    sortOrder: 6 },
    { id: 'beverages', name: 'Beverages',         nameAr: 'مشروبات',         sortOrder: 7 },
    { id: 'desserts',  name: 'Desserts',          nameAr: 'حلويات',          sortOrder: 8 },
    { id: 'faloda',    name: 'Falooda',            nameAr: 'فالودة',          sortOrder: 9 },
    { id: 'charcoal',  name: 'Charcoal Grills',    nameAr: 'مشويات الفحم',    sortOrder: 10 },
    { id: 'pizza',     name: 'Pizza',              nameAr: 'بيتزا',           sortOrder: 11 },
  ]
  for (const cat of catData) {
    await prisma.menuCategory.upsert({ where: { id: cat.id }, update: cat, create: cat })
  }
  console.log('✅ Categories seeded')

  // ── Menu items — exact IDs & real images from live data ───────────────
  await prisma.feedback.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
  await prisma.menuItem.deleteMany({})

  const items = [
    // BREAKFAST
    { id: 'fd7d67c9-c188-42df-bf70-36098dd33bc6', categoryId: 'breakfast', name: 'Puttu & Kadala Curry',     nameAr: 'بوتو وكاري الحمص الأسود',     price: 22, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTs4J31cb-jbUvSSg5NkdG6LhwL5x0BC3hkuXCQD-IGuQ&s=10', description: 'Steamed rice cylinders with spiced black chickpea curry — a Kerala classic', descriptionAr: 'أسطوانات الأرز المطهوة على البخار مع كاري الحمص الأسود — من أشهر أطباق كيرالا' },
    { id: 'dc1969e8-6b48-41d9-97fa-cd0a0df57e62', categoryId: 'breakfast', name: 'Appam & Vegetable Stew',   nameAr: 'أبم مع يخنة الخضار',            price: 24, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRK9dQdWWZWSosf2rjMBE_fldrJv84rEoOVvAMl1hwqvA&s=10', description: 'Lacy hoppers with creamy coconut vegetable stew', descriptionAr: 'خبز الأبم المقرمش مع يخنة خضار بجوز الهند الكريمية' },
    { id: '6750b6ed-be6c-46b5-8ae2-728b3e92b6de', categoryId: 'breakfast', name: 'Appam & Egg Curry',        nameAr: 'أبم مع كاري البيض',             price: 26, prepTimeMins: 15, imageUrl: 'https://www.foodiaq.com/wp-content/uploads/2024/11/appam-with-egg.jpg', description: 'Soft appam with spiced egg curry', descriptionAr: 'أبم طري مع كاري البيض المتبل' },
    { id: '90e163fc-8fb8-4cae-89d1-2fac32ebfb48', categoryId: 'breakfast', name: 'Idli Sambar (3 pcs)',      nameAr: 'إيدلي سامبار (3 قطع)',          price: 18, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1741376509253-221ac18fac0f?q=80&w=2070&auto=format&fit=crop', description: 'Steamed rice cakes with lentil sambar and coconut chutney', descriptionAr: 'كعك الأرز المطهو بالبخار مع شوربة العدس وصلصة جوز الهند' },
    { id: 'ba6905bc-7cd4-40e3-a30a-f537f7be53db', categoryId: 'breakfast', name: 'Masala Dosa',              nameAr: 'دوسا بالمسالا',                  price: 22, prepTimeMins: 12, imageUrl: 'https://images.unsplash.com/photo-1727404496374-21f174663abb?w=900&auto=format&fit=crop&q=60', description: 'Crispy crepe with spiced potato filling, sambar, chutneys', descriptionAr: 'كريب مقرمش محشو بالبطاطس المتبلة مع سامبار والصلصات' },
    { id: '57162b73-70e3-4a7e-b414-5eeaa0897412', categoryId: 'breakfast', name: 'Plain Dosa',               nameAr: 'دوسا سادة',                      price: 16, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=900&auto=format&fit=crop&q=60', description: 'Thin crispy crepe with sambar and coconut chutney', descriptionAr: 'كريب رفيع مقرمش مع سامبار وصلصة جوز الهند' },
    { id: '0b98ebd8-aabb-47f5-9221-aa990996a1d0', categoryId: 'breakfast', name: 'Rava Upma',                nameAr: 'راڤا أبما',                      price: 16, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSvuh-gsL3LC_D8oCt_n4m1O_3uNVVDbCqEh50tQZhBA&s=10', description: 'Semolina porridge with vegetables and mustard tempering', descriptionAr: 'عصيدة السميد بالخضار وبذور الخردل' },
    { id: '4a6b4077-8a15-4afa-a23e-cabdde9ba5a3', categoryId: 'breakfast', name: 'Pongal & Sambar',          nameAr: 'بونغال مع سامبار',               price: 18, prepTimeMins: 10, imageUrl: 'https://media.istockphoto.com/id/1256048247/photo/south-indian-breakfast-pongal-ven-pongal-with-coconut-chutney-red-chutney-and-sambar-served.webp?a=1&b=1&s=612x612&w=0&k=20&c=se73LXWg-H4mC8iWA_ZmpMdCsxEJVyMFRsY4o6giT_Q=', description: 'Savory rice-lentil porridge with ghee and pepper', descriptionAr: 'عريسة الأرز والعدس المالحة بالسمن والفلفل' },
    { id: 'deb036fc-f368-4b96-abe6-b7516c225c1d', categoryId: 'breakfast', name: 'Vada (2 pcs)',             nameAr: 'ڤادا (قطعتان)',                  price: 16, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQeXs6x6RSOgKFhPX-W0uFBRMpiYKrfQ3h8NIKvRqNvLQ&s=10', description: 'Crispy lentil fritters with coconut chutney and sambar', descriptionAr: 'عجة العدس المقرمشة مع صلصة جوز الهند والسامبار' },
    { id: 'b15abe50-818c-4146-9132-a7b86137adf6', categoryId: 'breakfast', name: 'Idiyappam & Coconut Milk', nameAr: 'إيدياباّم مع حليب جوز الهند',   price: 20, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWb1O2_M6S-Ju4RcE5ZZuJK0XRMk75QcgrEJyYEB76Ew&s=10', description: 'String hoppers with sweet coconut milk — Kerala breakfast favourite', descriptionAr: 'شعيرية الأرز المطهوة مع حليب جوز الهند الحلو — وجبة فطور كيرالا المفضلة' },

    // KERALA MEALS
    { id: 'd20b4509-cc60-4b24-bb16-8aca91d40eec', categoryId: 'meals', name: 'Full Kerala Meals',  nameAr: 'وجبة كيرالا الكاملة',  price: 45, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTUz7Cbu3y5ovv9HG6Utp20jLIPBSklkCslnKL8S7Oe2Q&s=10', description: 'Rice, sambar, rasam, 2 curries, thoran, papadom, pickle & payasam', descriptionAr: 'أرز وسامبار وراسام وكاريان وثوران وباباد ومخلل وباياسام' },
    { id: '77dbc727-31bf-4a21-80a2-1a7944e07787', categoryId: 'meals', name: 'Mini Kerala Meals',  nameAr: 'وجبة كيرالا الصغيرة',  price: 32, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxOm1UcEd3gTSJl08dGBgB2acMiILgiG-s_bhGseak4g&s=10', description: 'Rice, sambar, 1 curry, thoran, papadom & pickle', descriptionAr: 'أرز وسامبار وكاري وثوران وباباد ومخلل' },
    { id: '0f8409e1-def3-44cc-a3d6-86bcc548d7ec', categoryId: 'meals', name: 'Fish Meals',         nameAr: 'وجبة السمك',           price: 55, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS2Y3snNZfWgDYs7FCOgpjOjVTOOc4w9iZsDfI3_ebmPQ&s=10', description: 'Full meals with Kerala fish curry & fried fish', descriptionAr: 'وجبة كاملة مع كاري السمك الكيرالي والسمك المقلي' },
    { id: '0cb75d12-b0e1-46c8-9e6c-046241de9ed7', categoryId: 'meals', name: 'Chicken Meals',      nameAr: 'وجبة الدجاج',          price: 50, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHlp3YelCTF-5tdKP1HYf-E9E2ObG1_W-p1fVPADH1DA&s=10', description: 'Full meals with Kerala chicken curry & sides', descriptionAr: 'وجبة كاملة مع كاري الدجاج الكيرالي والمقبلات' },

    // CURRIES
    { id: '3267629a-50eb-4a5f-a08d-3291802d7d61', categoryId: 'curries', name: 'Kerala Fish Curry',   nameAr: 'كاري السمك الكيرالي',   price: 52, prepTimeMins: 20, imageUrl: 'https://media.istockphoto.com/id/1480338622/photo/homemade-kerala-fish-curry.jpg?b=1&s=612x612&w=0&k=20&c=PN7wliedzCTszXiqIlv20KD5Cjx6BqfEI3Ch0MLJzfw=', description: 'Kodampuli based red fish curry — authentic Kerala style', descriptionAr: 'كاري السمك الأحمر بالكودامبولي — على الطريقة الكيرالية الأصيلة' },
    { id: '26b78619-65b2-42fe-bf71-ac8a746471b0', categoryId: 'curries', name: 'Meen Moilee',         nameAr: 'مين موليي',             price: 55, prepTimeMins: 22, imageUrl: 'https://images.boldsky.com/webp/img/2014/03/07-meen-moilee.jpg', description: 'Mild coconut milk fish curry with turmeric', descriptionAr: 'كاري سمك خفيف بحليب جوز الهند والكركم' },
    { id: '9fb355e4-acd2-43c3-9b8f-6ee1ca6e24df', categoryId: 'curries', name: 'Nadan Chicken Curry', nameAr: 'كاري الدجاج النادان',   price: 48, prepTimeMins: 22, imageUrl: 'https://images.pexels.com/photos/35629938/pexels-photo-35629938.jpeg', description: 'Kerala style chicken curry with roasted coconut gravy', descriptionAr: 'كاري دجاج كيرالي بصلصة جوز الهند المحمص' },
    { id: 'f8d5a98d-88ab-420d-9c04-06e62bdad903', categoryId: 'curries', name: 'Chicken Mappas',      nameAr: 'دجاج مابّاس',           price: 50, prepTimeMins: 22, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQUKr5CVkNpvRbMN6KgbfNN--zEAbI3mDiZ8i9cTEeB1Q&s=10', description: 'Creamy coconut chicken curry with whole spices', descriptionAr: 'كاري دجاج كريمي بجوز الهند والبهارات الكاملة' },
    { id: '4f9e4a17-ea99-4c7a-9784-7362f3dae336', categoryId: 'curries', name: 'Mutton Curry',        nameAr: 'كاري الضأن',            price: 62, prepTimeMins: 30, imageUrl: 'https://images.pexels.com/photos/9609846/pexels-photo-9609846.jpeg', description: 'Slow cooked mutton in Kerala spices', descriptionAr: 'لحم ضأن يُطهى ببطء في بهارات كيرالا' },
    { id: '5778bf16-5795-4a14-9086-7b7a73a2ca2e', categoryId: 'curries', name: 'Beef Ularthiyathu',   nameAr: 'لحم بقر أولارثياثو',   price: 58, prepTimeMins: 30, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJC---sx5_pntoYvyKXuvsW7HiimR-53V1oTka-ut2Xw&s=10', description: 'Dry roasted beef with coconut and spices — Kerala special', descriptionAr: 'لحم بقر مشوي جاف بجوز الهند والبهارات — تخصص كيرالا' },
    { id: 'b86d8230-96ef-461d-9346-c3f2f05df651', categoryId: 'curries', name: 'Egg Roast',           nameAr: 'بيض مشوي',             price: 32, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=80', description: 'Hard boiled eggs in spiced onion-tomato masala', descriptionAr: 'بيض مسلوق في ماسالا البصل والطماطم المتبل' },
    { id: '5bf248f1-4734-49b3-89d5-8bdfe21e0734', categoryId: 'curries', name: 'Dal Tadka',           nameAr: 'دال تاداكا',           price: 28, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-D4_4ZywCYKa8ar2QHEmCQvAVJdrbmq-I3sDTpf2umw&s=10', description: 'Yellow lentils with ghee tadka and cumin', descriptionAr: 'عدس أصفر مع تتبيلة السمن والكمون' },
    { id: 'acd22b0a-7ab2-4938-a6dd-443a69427841', categoryId: 'curries', name: 'Avial',               nameAr: 'أڤيال',               price: 30, prepTimeMins: 18, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzq54y5VLEl7vHdQA3PPQ9LKf-pZqbKOA5ov9i2jab7g&s=10', description: 'Mixed vegetables in coconut-yogurt gravy — Kerala classic', descriptionAr: 'خضار مشكلة في صلصة جوز الهند واللبن — طبق كيرالا الكلاسيكي' },
    { id: 'a6e5583e-c5a9-4504-9e1d-78176da08ea0', categoryId: 'curries', name: 'Sambar',              nameAr: 'سامبار',              price: 20, prepTimeMins: 10, imageUrl: 'https://media.istockphoto.com/id/1280359179/photo/sambar-south-indian-lentil-stew-with-vegetables-and-curry-leaves.jpg?b=1&s=612x612&w=0&k=20&c=HPWLc-nTC0wbZ3kQ54f5U0aZ4fm9T1SgmfVFXgfBJ9s=', description: 'South Indian lentil-vegetable stew', descriptionAr: 'يخنة العدس والخضار الجنوب هندية' },
    { id: '2cd6ebe7-0aba-4cad-b4ff-c41f5d2dc4af', categoryId: 'curries', name: 'Kadala Curry',        nameAr: 'كاري الكادالا',       price: 26, prepTimeMins: 18, imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80', description: 'Black chickpea curry in roasted coconut gravy', descriptionAr: 'كاري الحمص الأسود في صلصة جوز الهند المحمص' },

    // BIRIYANI & RICE
    { id: '7596ccf0-de43-4992-88f8-8177ea168b99', categoryId: 'biriyani', name: 'Malabar Chicken Biriyani', nameAr: 'برياني دجاج مالابار',  price: 52, prepTimeMins: 25, imageUrl: 'https://images.pexels.com/photos/35071812/pexels-photo-35071812.jpeg', description: 'Fragrant kaima rice biriyani with tender chicken, fried onions & raita', descriptionAr: 'برياني أرز كيما عطر مع دجاج طري وبصل مقلي وريتا' },
    { id: '4f0a675d-4003-4cf4-8cda-853a1dbdf3bc', categoryId: 'biriyani', name: 'Malabar Mutton Biriyani',  nameAr: 'برياني لحم مالابار',   price: 65, prepTimeMins: 28, imageUrl: 'https://images.pexels.com/photos/18698232/pexels-photo-18698232.jpeg', description: 'Slow cooked mutton Malabar-style with kaima rice', descriptionAr: 'لحم ضأن يُطهى ببطء على الطريقة المالابارية مع أرز كيما' },
    { id: '8207c181-f5e9-418e-9a17-e2c867e5fc72', categoryId: 'biriyani', name: 'Fish Biriyani',            nameAr: 'برياني السمك',        price: 58, prepTimeMins: 28, imageUrl: 'https://images.pexels.com/photos/17649369/pexels-photo-17649369.jpeg', description: 'Delicate fish pieces layered in spiced basmati', descriptionAr: 'قطع سمك لطيفة مطبقة في البسمتي المتبل' },
    { id: '37bb84ed-f48a-4787-a0ed-6fbce6314e18', categoryId: 'biriyani', name: 'Prawn Biriyani',           nameAr: 'برياني الجمبري',      price: 68, prepTimeMins: 28, imageUrl: 'https://images.pexels.com/photos/34217290/pexels-photo-34217290.jpeg', description: 'Jumbo prawns in aromatic Malabar spiced rice', descriptionAr: 'جمبري كبير في أرز مالابار المعطر بالبهارات' },
    { id: '451d71f9-26aa-411a-8d21-5579da10bd4b', categoryId: 'biriyani', name: 'Veg Biriyani',             nameAr: 'برياني خضار',         price: 38, prepTimeMins: 22, imageUrl: 'https://images.pexels.com/photos/7593267/pexels-photo-7593267.jpeg', description: 'Mixed vegetables and paneer in fragrant basmati', descriptionAr: 'خضار مشكلة وجبن البانير في بسمتي عطر' },
    { id: '4c003a13-da59-42ee-8018-e82b1a037cd3', categoryId: 'biriyani', name: 'Ghee Rice',                nameAr: 'أرز السمن',           price: 28, prepTimeMins: 12, imageUrl: 'https://images.pexels.com/photos/35267286/pexels-photo-35267286.jpeg', description: 'Aromatic kaima rice cooked in ghee with whole spices', descriptionAr: 'أرز كيما عطر مطهو بالسمن والبهارات الكاملة' },

    // BREADS
    { id: 'b10bb144-9e76-4a11-b321-345d9ae6f226', categoryId: 'breads', name: 'Kerala Parota',   nameAr: 'باروتا كيرالا',  price: 8,  prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Layered flaky flatbread — pairs best with beef or chicken curry', descriptionAr: 'خبز رقائقي متعدد الطبقات — يتناسب مع كاري اللحم أو الدجاج' },
    { id: '1918e4a0-cab3-49f4-a73d-6af434410eb5', categoryId: 'breads', name: 'Chapati (2 pcs)', nameAr: 'شاباتي (قطعتان)', price: 10, prepTimeMins: 8,  imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80', description: 'Whole wheat flatbread', descriptionAr: 'خبز القمح الكامل المسطح' },
    { id: '7a65662e-47b3-47cf-b4de-f7c09fd43c4b', categoryId: 'breads', name: 'Naan',            nameAr: 'نان',            price: 12, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Soft leavened bread from the tandoor', descriptionAr: 'خبز طري مخمر من التنور' },
    { id: '39ffd033-b787-46bc-b5fd-9b0ac1bddd1b', categoryId: 'breads', name: 'Garlic Naan',     nameAr: 'نان بالثوم',     price: 14, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Buttered naan topped with fresh garlic', descriptionAr: 'نان بالزبدة مع الثوم الطازج' },
    { id: '2c23b47c-250d-4224-b423-e7214b51fea1', categoryId: 'breads', name: 'Puttu (2 pcs)',   nameAr: 'بوتو (قطعتان)', price: 16, prepTimeMins: 12, imageUrl: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&q=80', description: 'Steamed rice cylinders with coconut — order with kadala curry', descriptionAr: 'أسطوانات الأرز المطهوة بجوز الهند — يُقدم مع كاري الكادالا' },

    // SNACKS & STARTERS
    { id: '8be4a1ec-ea67-4762-9294-174e53f6bcf8', categoryId: 'snacks', name: 'Chicken 65',           nameAr: 'دجاج 65',                price: 38, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=600&q=80', description: 'Spicy deep-fried chicken bites — South Indian bar classic', descriptionAr: 'قطع دجاج حارة مقلية — من كلاسيكيات جنوب الهند' },
    { id: '8fce55e7-3f1b-4d37-b674-f2857b353359', categoryId: 'snacks', name: 'Fish Fry',             nameAr: 'سمك مقلي',               price: 42, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1611171711791-7b6eea9a0680?w=600&q=80', description: 'Marinated fish slices fried in Kerala spices', descriptionAr: 'شرائح سمك متبلة مقلية ببهارات كيرالا' },
    { id: 'ef36eded-0b52-4dda-851f-668b64e415ae', categoryId: 'snacks', name: 'Prawn Fry',             nameAr: 'جمبري مقلي',             price: 52, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80', description: 'Crispy prawns marinated in chilli and turmeric', descriptionAr: 'جمبري مقرمش متبل بالفلفل الحار والكركم' },
    { id: '6293ec2d-2de4-4d3c-a3b7-f3942538729a', categoryId: 'snacks', name: 'Parippu Vada (3 pcs)', nameAr: 'باريبو ڤادا (3 قطع)',    price: 14, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', description: 'Crispy chana dal fritters — Kerala tea-time snack', descriptionAr: 'فطائر العدس المقرمشة — وجبة شاي كيرالا' },
    { id: '3ebb99a4-609c-49e5-a3fb-8008e92585c0', categoryId: 'snacks', name: 'Banana Bajji (4 pcs)', nameAr: 'باجي الموز (4 قطع)',     price: 16, prepTimeMins: 12, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', description: 'Raw banana slices in spiced batter, deep fried', descriptionAr: 'شرائح الموز الأخضر في عجينة متبلة مقلية' },
    { id: '76baa148-1ab7-4a98-9e97-4e96aed9df1c', categoryId: 'snacks', name: 'Unniyappam (4 pcs)',   nameAr: 'أونياباّم (4 قطع)',     price: 18, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80', description: 'Sweet rice and banana balls fried in ghee', descriptionAr: 'كرات الأرز والموز الحلوة المقلية بالسمن' },
    { id: '1d051c44-18ed-4d50-bb38-3db3d82f1998', categoryId: 'snacks', name: 'Samosa (2 pcs)',       nameAr: 'سمبوسة (قطعتان)',       price: 14, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', description: 'Crispy pastry with spiced potato filling', descriptionAr: 'معجنات مقرمشة محشوة بالبطاطس المتبلة' },
    { id: '3cc51672-9268-4b89-86d7-1ba1c3df7537', categoryId: 'snacks', name: 'Kothu Parota',         nameAr: 'كوثو باروتا',           price: 38, prepTimeMins: 18, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Shredded parota stir fried with egg, onion and masala', descriptionAr: 'باروتا مفروم مقلي مع البيض والبصل والماسالا' },

    // BEVERAGES
    { id: '9ab6b351-ad52-4a68-844f-8d61f3f9b20f', categoryId: 'beverages', name: 'Sulaimani Chai',        nameAr: 'شاي سليماني',           price: 10, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1567708904284-9aa74d5f5ce4?w=600&q=80', description: 'Malabar black tea with lemon and spices — the Kerala staple', descriptionAr: 'شاي أسود مالابار بالليمون والبهارات — المشروب الأساسي في كيرالا' },
    { id: 'fb8e0d9f-91e7-494c-99c5-4218497c5a02', categoryId: 'beverages', name: 'Karak Chai',            nameAr: 'شاي كرك',               price: 10, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1567708904284-9aa74d5f5ce4?w=600&q=80', description: 'Strong milk tea with cardamom', descriptionAr: 'شاي حليب قوي بالهيل' },
    { id: '190532f2-3327-4a4a-9571-20ac82dfd357', categoryId: 'beverages', name: 'Filter Coffee',         nameAr: 'قهوة فلتر',             price: 12, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80', description: 'South Indian drip coffee with frothy milk', descriptionAr: 'قهوة جنوب هندية بالتقطير مع الحليب المرغي' },
    { id: '6b10f191-72a6-4835-a067-691e7c49b363', categoryId: 'beverages', name: 'Tender Coconut Water',  nameAr: 'ماء جوز الهند الطازج',  price: 18, prepTimeMins: 2, imageUrl: 'https://images.unsplash.com/photo-1582556573559-a8a1b8b0cde6?w=600&q=80', description: 'Fresh coconut water — chilled', descriptionAr: 'ماء جوز الهند الطازج — مبرد' },
    { id: '57dbfbbf-70f2-47e8-999d-49fa8fe0ea3a', categoryId: 'beverages', name: 'Mango Lassi',           nameAr: 'لاسي المانجو',          price: 18, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&q=80', description: 'Sweet mango blended yogurt drink', descriptionAr: 'مشروب اللبن بالمانجو الحلو' },
    { id: '4ae52a3b-401b-41e3-a215-a0673bfccdd3', categoryId: 'beverages', name: 'Buttermilk (Sambaram)', nameAr: 'لبن رائب (سامبارام)',   price: 12, prepTimeMins: 3, imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&q=80', description: 'Salted spiced buttermilk with ginger and curry leaves', descriptionAr: 'لبن رائب مملح متبل بالزنجبيل وأوراق الكاري' },
    { id: '5415503a-fc28-495a-9f19-a3d2f25c2f85', categoryId: 'beverages', name: 'Fresh Lime Soda',       nameAr: 'صودا الليمون الطازج',  price: 12, prepTimeMins: 3, imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80', description: 'Fresh lime with soda — sweet, salt or masala', descriptionAr: 'ليمون طازج مع صودا — حلو أو مملح أو بالماسالا' },
    { id: '3a00c0ad-2943-4e0e-8a05-576b86a11349', categoryId: 'beverages', name: 'Soft Drinks',           nameAr: 'مشروبات غازية',        price: 8,  prepTimeMins: 1, imageUrl: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=600&q=80', description: 'Pepsi, 7Up, Miranda', descriptionAr: 'بيبسي، سفن أب، ميراندا' },

    // DESSERTS
    { id: 'e8743f03-61b7-412e-a93c-16deed18e746', categoryId: 'desserts', name: 'Semiya Payasam',      nameAr: 'سيميا باياسام',        price: 22, prepTimeMins: 5, imageUrl: 'https://media.istockphoto.com/id/692446072/photo/most-famous-indian-sweet-pudding-kheer-or-semiya-khir-in-a-bowl-selective-focus.jpg?b=1&s=612x612&w=0&k=20&c=YKas7wiEdCXkFJYmzpBDaFLTLYQaneUNOy1mH-g2Ec8=', description: 'Vermicelli pudding in sweetened milk with cardamom', descriptionAr: 'بودينغ الشعيرية في الحليب المحلى بالهيل' },
    { id: '8c622f17-901a-41db-92ef-858984806ef0', categoryId: 'desserts', name: 'Palada Payasam',      nameAr: 'بالادا باياسام',       price: 25, prepTimeMins: 5, imageUrl: 'https://images.pexels.com/photos/31109623/pexels-photo-31109623.jpeg', description: 'Rice ada in thick sweetened milk — sadya classic', descriptionAr: 'خبز الأرز في الحليب الكثيف المحلى — كلاسيكي السادية' },
    { id: 'ef938650-14e5-4409-ad29-bfc0a6c93b0e', categoryId: 'desserts', name: 'Kerala Halwa',        nameAr: 'حلوى كيرالا',          price: 20, prepTimeMins: 5, imageUrl: 'https://media.istockphoto.com/id/479875468/photo/sliced-black-halwa.jpg?b=1&s=612x612&w=0&k=20&c=RsEzpJLkMre0jRNjpdkl-VlsZSsVHbq4yIMbt057o5o=', description: 'Kozhikodan wheat halwa — rich and chewy', descriptionAr: 'حلوى القمح الكوزيكودية — غنية ومطاطة' },
    { id: '4b13c4c1-bdb7-4ba7-9668-c0e46144fdd3', categoryId: 'desserts', name: 'Banana Halwa',        nameAr: 'حلوى الموز',           price: 18, prepTimeMins: 5, imageUrl: 'https://images.pexels.com/photos/8820715/pexels-photo-8820715.jpeg', description: 'Nendran banana cooked in ghee and jaggery', descriptionAr: 'موز ناندران مطهو بالسمن والجاغري' },
    { id: 'a2c20837-72e9-4829-98e5-d1bdc63369e0', categoryId: 'desserts', name: 'Ice Cream (2 scoops)', nameAr: 'آيس كريم (كرتان)',     price: 18, prepTimeMins: 2, imageUrl: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600&q=80', description: 'Vanilla, Mango, or Strawberry', descriptionAr: 'فانيلا، مانجو، أو فراولة' },
    { id: 'bacb749f-4a5a-4b82-bd46-a21f0ccfcf10', categoryId: 'desserts', name: 'Elanir Payasam',      nameAr: 'إيلانير باياسام',      price: 20, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSidgav71TxS14jZw3swgnY90wL7MNNkjKCuYPosvUr9Q&s=10', description: 'Tender coconut payasam — rich, cooling and lightly sweet South Indian dessert', descriptionAr: 'باياسام جوز الهند الطري — غني ومنعش وحلو خفيف' },

    // FALOODA
    { id: 'e02e31b3-43ea-4b47-91f6-0d6ac3c8dbb0', categoryId: 'faloda', name: 'Royal Falooda',     nameAr: 'فالودة رويال',       price: 10, prepTimeMins: 15, imageUrl: 'https://res.cloudinary.com/k6ywmnqi/image/upload/v1783020223/almanzil/menu/zwk8xbtuokkvnjsr59vl.jpg', description: 'Traditional falooda with rose syrup, vermicelli, basil seeds (sabja), milk, ice cream, dry fruits, and jelly.', descriptionAr: 'فالودة تقليدية بشراب الورد والشعيرية وبذور الريحان والحليب والآيس كريم والفواكه المجففة والجيلي' },
    { id: '8cbdc9cb-13d7-492a-a52d-48bbecf062b4', categoryId: 'faloda', name: 'Chocolate Falooda', nameAr: 'فالودة الشوكولاتة',  price: 20, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRtf1sW79ikFRvngjRXLZCoWp26zi9an0VNjT7fvAvoLA&s=10', description: 'Chocolate syrup, chilled milk, vermicelli, basil seeds, chocolate ice cream, brownie pieces or chocolate chips, topped with whipped cream.', descriptionAr: 'شراب شوكولاتة وحليب بارد وشعيرية وبذور ريحان وآيس كريم شوكولاتة وبراوني وكريمة مخفوقة' },
    { id: 'ebee2d34-75cc-427b-b6b7-123a734a8d3e', categoryId: 'faloda', name: 'Panni Poori',        nameAr: 'باني بوري',          price: 10, prepTimeMins: 15, imageUrl: 'https://res.cloudinary.com/k6ywmnqi/image/upload/v1783178089/almanzil/menu/nylo12q5fkv0hf785pad.jpg', description: 'Fresh mango puree blended with milk, vermicelli, basil seeds, vanilla ice cream, and mango chunks.', descriptionAr: 'هريس المانجو الطازج مع الحليب والشعيرية وبذور الريحان وآيس كريم الفانيلا وقطع المانجو' },

    // CHARCOAL GRILLS
    { id: 'cc001000-0000-0000-0000-000000000001', categoryId: 'charcoal', name: 'Charcoal Chicken (Full)',  nameAr: 'دجاج فحم (كامل)',        price: 75,  prepTimeMins: 35, imageUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=600&q=80', description: 'Whole chicken marinated in Kerala spices, slow-grilled over charcoal. Served with garlic sauce, pita and salad.', descriptionAr: 'دجاج كامل متبل ببهارات كيرالا، مشوي على الفحم. يُقدم مع صلصة الثوم والخبز والسلطة' },
    { id: 'cc001000-0000-0000-0000-000000000002', categoryId: 'charcoal', name: 'Charcoal Chicken (Half)', nameAr: 'دجاج فحم (نصف)',         price: 42,  prepTimeMins: 30, imageUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=600&q=80', description: 'Half chicken marinated in Kerala spices, slow-grilled over charcoal. Served with garlic sauce and salad.', descriptionAr: 'نصف دجاج متبل ببهارات كيرالا، مشوي على الفحم. يُقدم مع صلصة الثوم والسلطة' },
    { id: 'cc001000-0000-0000-0000-000000000003', categoryId: 'charcoal', name: 'Charcoal Fish',            nameAr: 'سمك فحم',               price: 65,  prepTimeMins: 25, imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80', description: 'Whole pomfret or kingfish marinated in turmeric and chilli, grilled on charcoal. Served with lemon and salad.', descriptionAr: 'سمك كامل (زبيدي أو كنعد) متبل بالكركم والفلفل، مشوي على الفحم. يُقدم مع الليمون والسلطة' },
    { id: 'cc001000-0000-0000-0000-000000000004', categoryId: 'charcoal', name: 'Charcoal Prawns',          nameAr: 'جمبري فحم',             price: 80,  prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80', description: 'Jumbo prawns with Kerala masala, char-grilled and served with garlic butter and wedges.', descriptionAr: 'جمبري كبير بماسالا كيرالا، مشوي على الفحم مع زبدة الثوم والبطاطس' },
    { id: 'cc001000-0000-0000-0000-000000000005', categoryId: 'charcoal', name: 'Charcoal Mutton Chops',    nameAr: 'ضلوع ضأن فحم',         price: 95,  prepTimeMins: 35, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80', description: 'Tender lamb chops marinated overnight in Kerala spices, grilled over live charcoal.', descriptionAr: 'ضلوع لحم طرية متبلة طوال الليل ببهارات كيرالا، مشوية على الفحم المتقد' },
    { id: 'cc001000-0000-0000-0000-000000000006', categoryId: 'charcoal', name: 'Charcoal Mixed Grill',     nameAr: 'مشاوي مشكلة فحم',      price: 120, prepTimeMins: 40, imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&q=80', description: 'Platter of charcoal chicken, mutton chops, seekh kebab and prawns. Serves 2.', descriptionAr: 'طبق مشاوي فحم: دجاج وضلوع ضأن وسيخ كباب وجمبري. يكفي شخصين' },
    { id: 'cc001000-0000-0000-0000-000000000007', categoryId: 'charcoal', name: 'Seekh Kebab (4 pcs)',      nameAr: 'سيخ كباب (4 قطع)',     price: 45,  prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80', description: 'Minced lamb and beef with spices, skewered and charcoal grilled. Served with mint chutney.', descriptionAr: 'لحم ضأن وبقر مفروم مع البهارات على السيخ، مشوي بالفحم. يُقدم مع صلصة النعناع' },
    { id: 'cc001000-0000-0000-0000-000000000008', categoryId: 'charcoal', name: 'Charcoal Veg Platter',     nameAr: 'طبق خضار فحم',         price: 48,  prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80', description: 'Grilled paneer tikka, mushrooms, bell peppers and corn on the cob, spiced and charcoal grilled.', descriptionAr: 'تيكا البانير والفطر والفلفل الرومي والذرة المتبلة المشوية على الفحم' },

    // PIZZA
    { id: 'pz000000-0000-0000-0000-000000000001', categoryId: 'pizza', name: 'Margherita',      nameAr: 'مارغريتا',      price: 42, prepTimeMins: 18, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=60', description: 'San Marzano tomato, fresh mozzarella, basil', descriptionAr: 'طماطم سان مارتسانو وموتزاريلا طازجة وريحان' },
    { id: 'pz000000-0000-0000-0000-000000000002', categoryId: 'pizza', name: 'Pepperoni',       nameAr: 'بيبروني',       price: 52, prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=60', description: 'Double pepperoni, mozzarella, tomato sauce', descriptionAr: 'بيبروني مضاعف وموتزاريلا وصلصة طماطم' },
    { id: 'pz000000-0000-0000-0000-000000000003', categoryId: 'pizza', name: 'BBQ Chicken',     nameAr: 'دجاج باربيكيو', price: 55, prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=60', description: 'Grilled chicken, BBQ sauce, red onion, peppers', descriptionAr: 'دجاج مشوي وصلصة باربيكيو وبصل أحمر وفلفل' },
    { id: 'pz000000-0000-0000-0000-000000000004', categoryId: 'pizza', name: 'Veggie Supreme',  nameAr: 'خضار سوبريم',   price: 48, prepTimeMins: 18, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=60', description: 'Roasted peppers, mushrooms, olives, onion, mozzarella', descriptionAr: 'فلفل مشوي وفطر وزيتون وبصل وموتزاريلا' },
    { id: 'pz000000-0000-0000-0000-000000000005', categoryId: 'pizza', name: 'Four Cheese',     nameAr: 'أربعة أجبان',   price: 58, prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=60', description: 'Mozzarella, cheddar, gouda, parmesan', descriptionAr: 'موتزاريلا وشيدر وجودة وبارميزان' },
    { id: 'pz000000-0000-0000-0000-000000000006', categoryId: 'pizza', name: 'Prawn & Garlic',  nameAr: 'جمبري وثوم',    price: 65, prepTimeMins: 22, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&auto=format&fit=crop&q=60', description: 'Tiger prawns, garlic cream, mozzarella, herbs', descriptionAr: 'جمبري نمر وكريمة ثوم وموتزاريلا وأعشاب' },
  ]

  for (const item of items) {
    await prisma.menuItem.create({ data: item })
  }
  console.log(`✅ Menu seeded — ${items.length} items with real images`)

  // ── Modifier groups & options ─────────────────────────────────────────
  const modifiers: Array<{
    menuItemId: string
    name: string
    nameAr?: string
    required: boolean
    minSelect: number
    maxSelect: number
    sortOrder: number
    options: Array<{ name: string; nameAr?: string; priceAdd: number; isDefault: boolean; sortOrder: number }>
  }> = [
    // ── Biriyani: Portion size (required) ──
    {
      menuItemId: '7596ccf0-de43-4992-88f8-8177ea168b99', // Malabar Chicken Biriyani
      name: 'Portion Size', nameAr: 'حجم الحصة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Half', nameAr: 'نصف',   priceAdd: 0,   isDefault: true,  sortOrder: 0 },
        { name: 'Full', nameAr: 'كامل',  priceAdd: 15,  isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: '4f0a675d-4003-4cf4-8cda-853a1dbdf3bc', // Malabar Mutton Biriyani
      name: 'Portion Size', nameAr: 'حجم الحصة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Half', nameAr: 'نصف',   priceAdd: 0,   isDefault: true,  sortOrder: 0 },
        { name: 'Full', nameAr: 'كامل',  priceAdd: 20,  isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: '8207c181-f5e9-418e-9a17-e2c867e5fc72', // Fish Biriyani
      name: 'Portion Size', nameAr: 'حجم الحصة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Half', nameAr: 'نصف',   priceAdd: 0,   isDefault: true,  sortOrder: 0 },
        { name: 'Full', nameAr: 'كامل',  priceAdd: 18,  isDefault: false, sortOrder: 1 },
      ],
    },

    // ── Beverages: Size ──
    {
      menuItemId: '9ab6b351-ad52-4a68-844f-8d61f3f9b20f', // Sulaimani Chai
      name: 'Size', nameAr: 'الحجم', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Regular', nameAr: 'عادي',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Large',   nameAr: 'كبير',  priceAdd: 4,  isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: 'fb8e0d9f-91e7-494c-99c5-4218497c5a02', // Karak Chai
      name: 'Size', nameAr: 'الحجم', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Regular', nameAr: 'عادي',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Large',   nameAr: 'كبير',  priceAdd: 4,  isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: '190532f2-3327-4a4a-9571-20ac82dfd357', // Filter Coffee
      name: 'Size', nameAr: 'الحجم', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Regular', nameAr: 'عادي',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Large',   nameAr: 'كبير',  priceAdd: 4,  isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: '57dbfbbf-70f2-47e8-999d-49fa8fe0ea3a', // Mango Lassi
      name: 'Size', nameAr: 'الحجم', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Regular', nameAr: 'عادي',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Large',   nameAr: 'كبير',  priceAdd: 5,  isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: '5415503a-fc28-495a-9f19-a3d2f25c2f85', // Fresh Lime Soda
      name: 'Flavour', nameAr: 'النكهة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Sweet',  nameAr: 'حلو',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Salt',   nameAr: 'مالح',  priceAdd: 0, isDefault: false, sortOrder: 1 },
        { name: 'Masala', nameAr: 'مزيج',  priceAdd: 0, isDefault: false, sortOrder: 2 },
      ],
    },

    // ── Curries & Snacks: Spice Level ──
    {
      menuItemId: '9fb355e4-acd2-43c3-9b8f-6ee1ca6e24df', // Nadan Chicken Curry
      name: 'Spice Level', nameAr: 'مستوى الحرارة', required: false, minSelect: 0, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Mild',   nameAr: 'خفيف',  priceAdd: 0, isDefault: false, sortOrder: 0 },
        { name: 'Medium', nameAr: 'متوسط', priceAdd: 0, isDefault: true,  sortOrder: 1 },
        { name: 'Hot',    nameAr: 'حار',   priceAdd: 0, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: '8be4a1ec-ea67-4762-9294-174e53f6bcf8', // Chicken 65
      name: 'Spice Level', nameAr: 'مستوى الحرارة', required: false, minSelect: 0, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Medium', nameAr: 'متوسط', priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Extra Hot', nameAr: 'حار جداً', priceAdd: 0, isDefault: false, sortOrder: 1 },
      ],
    },

    // ── Ice Cream: Flavour ──
    {
      menuItemId: 'a2c20837-72e9-4829-98e5-d1bdc63369e0', // Ice Cream
      name: 'Flavour', nameAr: 'النكهة', required: true, minSelect: 1, maxSelect: 2, sortOrder: 0,
      options: [
        { name: 'Vanilla',    nameAr: 'فانيليا',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Mango',      nameAr: 'مانجو',     priceAdd: 0, isDefault: false, sortOrder: 1 },
        { name: 'Strawberry', nameAr: 'فراولة',    priceAdd: 0, isDefault: false, sortOrder: 2 },
        { name: 'Chocolate',  nameAr: 'شوكولاتة',  priceAdd: 0, isDefault: false, sortOrder: 3 },
      ],
    },

    // ── Falooda: Toppings (extras, optional multi-select) ──
    {
      menuItemId: 'e02e31b3-43ea-4b47-91f6-0d6ac3c8dbb0', // Royal Falooda
      name: 'Extra Toppings', nameAr: 'إضافات', required: false, minSelect: 0, maxSelect: 3, sortOrder: 0,
      options: [
        { name: 'Extra Ice Cream', nameAr: 'مثلجات إضافية', priceAdd: 5, isDefault: false, sortOrder: 0 },
        { name: 'Extra Jelly',     nameAr: 'جيلي إضافي',    priceAdd: 3, isDefault: false, sortOrder: 1 },
        { name: 'Dry Fruits',      nameAr: 'فواكه مجففة',   priceAdd: 4, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: '8cbdc9cb-13d7-492a-a52d-48bbecf062b4', // Chocolate Falooda
      name: 'Extra Toppings', nameAr: 'إضافات', required: false, minSelect: 0, maxSelect: 3, sortOrder: 0,
      options: [
        { name: 'Extra Ice Cream',   nameAr: 'مثلجات إضافية', priceAdd: 5, isDefault: false, sortOrder: 0 },
        { name: 'Brownie Pieces',    nameAr: 'قطع براوني',    priceAdd: 5, isDefault: false, sortOrder: 1 },
        { name: 'Whipped Cream',     nameAr: 'كريمة مخفوقة', priceAdd: 3, isDefault: false, sortOrder: 2 },
      ],
    },

    // ── Charcoal Grills: Portion + Sides ──
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000003', // Charcoal Fish
      name: 'Fish Type', nameAr: 'نوع السمك', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Pomfret',   nameAr: 'الزبيدي',   priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Kingfish',  nameAr: 'كنعد',       priceAdd: 10, isDefault: false, sortOrder: 1 },
        { name: 'Hammour',   nameAr: 'هامور',      priceAdd: 20, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000003', // Charcoal Fish
      name: 'Sides', nameAr: 'الإضافات', required: false, minSelect: 0, maxSelect: 2, sortOrder: 1,
      options: [
        { name: 'Extra Garlic Sauce', nameAr: 'صلصة ثوم إضافية', priceAdd: 3, isDefault: false, sortOrder: 0 },
        { name: 'Extra Salad',        nameAr: 'سلطة إضافية',     priceAdd: 5, isDefault: false, sortOrder: 1 },
        { name: 'Pita Bread',         nameAr: 'خبز بيتا',        priceAdd: 4, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000001', // Charcoal Chicken Full
      name: 'Marinade', nameAr: 'نوع التتبيلة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Kerala Spice',   nameAr: 'بهارات كيرالا',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Lemon Herb',     nameAr: 'ليمون وأعشاب',   priceAdd: 0, isDefault: false, sortOrder: 1 },
        { name: 'Peri Peri',      nameAr: 'بيري بيري',      priceAdd: 0, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000001', // Charcoal Chicken Full
      name: 'Sides', nameAr: 'الإضافات', required: false, minSelect: 0, maxSelect: 3, sortOrder: 1,
      options: [
        { name: 'Garlic Sauce',   nameAr: 'صلصة ثوم',        priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Extra Pita',     nameAr: 'خبز بيتا إضافي',  priceAdd: 4, isDefault: false, sortOrder: 1 },
        { name: 'French Fries',   nameAr: 'بطاطس مقلية',     priceAdd: 8, isDefault: false, sortOrder: 2 },
        { name: 'Coleslaw',       nameAr: 'سلطة كولسلو',     priceAdd: 6, isDefault: false, sortOrder: 3 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000002', // Charcoal Chicken Half
      name: 'Marinade', nameAr: 'نوع التتبيلة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Kerala Spice',   nameAr: 'بهارات كيرالا',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Lemon Herb',     nameAr: 'ليمون وأعشاب',   priceAdd: 0, isDefault: false, sortOrder: 1 },
        { name: 'Peri Peri',      nameAr: 'بيري بيري',      priceAdd: 0, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000002', // Charcoal Chicken Half
      name: 'Sides', nameAr: 'الإضافات', required: false, minSelect: 0, maxSelect: 2, sortOrder: 1,
      options: [
        { name: 'Garlic Sauce',   nameAr: 'صلصة ثوم',       priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'French Fries',   nameAr: 'بطاطس مقلية',    priceAdd: 8, isDefault: false, sortOrder: 1 },
        { name: 'Pita Bread',     nameAr: 'خبز بيتا',       priceAdd: 4, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000007', // Seekh Kebab
      name: 'Meat Mix', nameAr: 'نوع اللحم', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Lamb & Beef',  nameAr: 'لحم ضأن وبقر',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Chicken Only', nameAr: 'دجاج فقط',      priceAdd: -5, isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000007', // Seekh Kebab
      name: 'Extras', nameAr: 'إضافات', required: false, minSelect: 0, maxSelect: 2, sortOrder: 1,
      options: [
        { name: 'Extra Mint Chutney', nameAr: 'شتني نعناع إضافي', priceAdd: 2, isDefault: false, sortOrder: 0 },
        { name: 'Pita Bread (2 pcs)', nameAr: 'خبز بيتا (٢ قطع)', priceAdd: 5, isDefault: false, sortOrder: 1 },
      ],
    },

    // ── Breads: Quantity ──
    {
      menuItemId: 'b10bb144-9e76-4a11-b321-345d9ae6f226', // Kerala Parota
      name: 'Quantity', nameAr: 'الكمية', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: '1 piece',  nameAr: 'قطعة',       priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: '3 pieces', nameAr: '٣ قطع',      priceAdd: 16, isDefault: false, sortOrder: 1 },
        { name: '5 pieces', nameAr: '٥ قطع',      priceAdd: 28, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: '7a65662e-47b3-47cf-b4de-f7c09fd43c4b', // Naan
      name: 'Quantity', nameAr: 'الكمية', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: '1 piece',  nameAr: 'قطعة',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: '3 pieces', nameAr: '٣ قطع', priceAdd: 22, isDefault: false, sortOrder: 1 },
      ],
    },

    // ── Pizza: Size, Crust, Extra Toppings (all 6 items) ──
    ...(['pz000000-0000-0000-0000-000000000001', 'pz000000-0000-0000-0000-000000000002', 'pz000000-0000-0000-0000-000000000003', 'pz000000-0000-0000-0000-000000000004', 'pz000000-0000-0000-0000-000000000005', 'pz000000-0000-0000-0000-000000000006'] as const).flatMap((menuItemId) => [
      {
        menuItemId,
        name: 'Size', nameAr: 'الحجم', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
        options: [
          { name: '10" Personal', nameAr: 'شخصي ١٠ بوصة',   priceAdd: 0,  isDefault: true,  sortOrder: 0 },
          { name: '12" Medium',   nameAr: 'متوسط ١٢ بوصة',  priceAdd: 12, isDefault: false, sortOrder: 1 },
          { name: '14" Large',    nameAr: 'كبير ١٤ بوصة',   priceAdd: 22, isDefault: false, sortOrder: 2 },
        ],
      },
      {
        menuItemId,
        name: 'Crust', nameAr: 'نوع العجينة', required: true, minSelect: 1, maxSelect: 1, sortOrder: 1,
        options: [
          { name: 'Thin Crust',    nameAr: 'عجينة رقيقة',        priceAdd: 0, isDefault: true,  sortOrder: 0 },
          { name: 'Thick Crust',   nameAr: 'عجينة سميكة',        priceAdd: 0, isDefault: false, sortOrder: 1 },
          { name: 'Stuffed Crust', nameAr: 'عجينة محشوة بالجبن', priceAdd: 8, isDefault: false, sortOrder: 2 },
        ],
      },
      {
        menuItemId,
        name: 'Extra Toppings', nameAr: 'إضافات', required: false, minSelect: 0, maxSelect: 4, sortOrder: 2,
        options: [
          { name: 'Extra Cheese', nameAr: 'جبن إضافي',   priceAdd: 5, isDefault: false, sortOrder: 0 },
          { name: 'Jalapeños',    nameAr: 'هالابينيو',   priceAdd: 3, isDefault: false, sortOrder: 1 },
          { name: 'Olives',       nameAr: 'زيتون',       priceAdd: 3, isDefault: false, sortOrder: 2 },
          { name: 'Mushrooms',    nameAr: 'فطر',         priceAdd: 4, isDefault: false, sortOrder: 3 },
        ],
      },
    ]),
  ]

  for (const group of modifiers) {
    const { options, ...groupData } = group
    await prisma.menuModifierGroup.create({
      data: {
        ...groupData,
        options: { create: options },
      },
    })
  }
  console.log(`✅ Modifier groups seeded — ${modifiers.length} groups`)

}

main().catch(console.error).finally(() => prisma.$disconnect())
