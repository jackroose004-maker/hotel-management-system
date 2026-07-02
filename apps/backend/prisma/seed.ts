import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Unsplash image URLs — distinct photo IDs per dish category
const IMG = {
  // Breakfast — South Indian dishes
  puttu:       'https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&q=80',  // puttu
  appam:       'https://images.unsplash.com/photo-1606471191009-63994c53433b?w=600&q=80',  // appam / hoppers
  idli:        'https://images.unsplash.com/photo-1589301775032-f2b2ef98b1db?w=600&q=80',  // idli sambar
  dosa:        'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80',  // dosa
  upma:        'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&q=80',  // upma
  pongal:      'https://images.unsplash.com/photo-1643282081930-c1d86a6b0873?w=600&q=80',  // pongal bowl
  vada:        'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',  // vada
  idiyappam:   'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&q=80',  // string hoppers
  // Meals
  keralaMeals: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80',  // Kerala sadya
  fishMeals:   'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600&q=80',  // fish on plate
  chickenMeals:'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80', // chicken curry plate
  // Curries
  fishCurry:   'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&q=80',  // fish curry
  chickenCurry:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&q=80',  // chicken curry bowl
  muttonCurry: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80',  // mutton curry
  eggRoast:    'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=80',  // egg curry
  dal:         'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=600&q=80',  // dal tadka
  avial:       'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80',  // mixed veg
  sambar:      'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80',  // sambar
  // Biriyani — distinct per type
  chickenBiriyani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',  // chicken biriyani
  muttonBiriyani:  'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&q=80',  // mutton biriyani
  fishBiriyani:    'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600&q=80',     // fish biriyani
  prawnBiriyani:   'https://images.unsplash.com/photo-1643282023282-2c8d5ca65e0d?w=600&q=80',  // prawn biriyani
  vegBiriyani:     'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&q=80',  // veg rice
  gheeRice:        'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=600&q=80',  // ghee rice
  // Breads — distinct
  parota:      'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80',  // parota
  chapati:     'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80',  // chapati
  naan:        'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80',  // naan
  // Snacks — distinct
  chicken65:   'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=600&q=80',  // chicken 65
  fishFry:     'https://images.unsplash.com/photo-1611171711791-7b6eea9a0680?w=600&q=80',  // fried fish
  prawnFry:    'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80',  // prawn fry
  samosa:      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',  // samosa
  kothuParota: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80',  // kothu parota
  // Beverages — distinct
  chai:        'https://images.unsplash.com/photo-1567708904284-9aa74d5f5ce4?w=600&q=80',  // masala chai
  coffee:      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80',  // filter coffee
  coconutWater:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',     // coconut water
  lassi:       'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&q=80',  // lassi
  lime:        'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80',  // lime soda
  softDrink:   'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=600&q=80',  // soft drink
  // Desserts — distinct
  payasam:     'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80',  // payasam
  halwa:       'https://images.unsplash.com/photo-1593394776691-19aa3f4b3a56?w=600&q=80',  // halwa
  iceCream:    'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600&q=80',
}

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
    create: { name: 'Rajan Manager', email: 'manager@hotel.com', passwordHash: await bcrypt.hash('manager123', 10), role: 'MANAGER' },
  })
  await prisma.user.upsert({
    where: { email: 'kitchen@hotel.com' },
    update: {},
    create: { name: 'Kitchen Staff', email: 'kitchen@hotel.com', passwordHash: await bcrypt.hash('kitchen123', 10), role: 'STAFF' },
  })
  await prisma.user.upsert({
    where: { email: 'waiter@hotel.com' },
    update: {},
    create: { name: 'Waiter Staff', email: 'waiter@hotel.com', passwordHash: await bcrypt.hash('waiter123', 10), role: 'STAFF' },
  })
  console.log('✅ Staff accounts seeded')

  // ── Default settings ──────────────────────────────────────────────────
  const existingSettings = await prisma.restaurantSettings.findFirst()
  if (!existingSettings) {
    await prisma.restaurantSettings.create({
      data: {
        restaurantName:      'Al Manzil',
        tagline:             'Authentic Kerala & South Indian Cuisine',
        phone:               '+971 4 000 0000',
        address:             'Al Quoz, Dubai, UAE',
        openTime:            '07:00',
        closeTime:           '23:00',
        totalTables:         12,
        defaultCapacity:     4,
        vatRate:             0.05,
        currency:            'AED',
        defaultPrepTimeMins: 15,
        bookingsEnabled:     true,
        slotDurationMins:    30,
        walkInBuffer:        3,
        peakHoursEnabled:    true,
        peakStart:           '19:00',
        peakEnd:             '22:00',
        noShowWindowOffPeak: 20,
        noShowWindowPeak:    5,
        maxBookingDaysAhead: 7,
        requireLoginToBook:  true,
        remindersEnabled:    false,
        reminderMinsBefore:  60,
      },
    })
    console.log('✅ Default restaurant settings seeded')
  }

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
  ]
  for (const cat of catData) {
    await prisma.menuCategory.upsert({ where: { id: cat.id }, update: cat, create: cat })
  }
  console.log('✅ Categories seeded')

  // ── Menu items with images ────────────────────────────────────────────
  await prisma.menuItem.deleteMany({})

  const items = [
    // BREAKFAST
    { categoryId: 'breakfast', name: 'Puttu & Kadala Curry',     price: 22, prepTimeMins: 12, imageUrl: IMG.puttu,       description: 'Steamed rice cylinders with spiced black chickpea curry — a Kerala classic' },
    { categoryId: 'breakfast', name: 'Appam & Vegetable Stew',   price: 24, prepTimeMins: 15, imageUrl: IMG.appam,       description: 'Lacy hoppers with creamy coconut vegetable stew' },
    { categoryId: 'breakfast', name: 'Appam & Egg Curry',        price: 26, prepTimeMins: 15, imageUrl: IMG.appam,       description: 'Soft appam with spiced egg curry' },
    { categoryId: 'breakfast', name: 'Idli Sambar (3 pcs)',      price: 18, prepTimeMins: 10, imageUrl: IMG.idli,        description: 'Steamed rice cakes with lentil sambar and coconut chutney' },
    { categoryId: 'breakfast', name: 'Masala Dosa',              price: 22, prepTimeMins: 12, imageUrl: IMG.dosa,        description: 'Crispy crepe with spiced potato filling, sambar, chutneys' },
    { categoryId: 'breakfast', name: 'Plain Dosa',               price: 16, prepTimeMins: 10, imageUrl: IMG.dosa,        description: 'Thin crispy crepe with sambar and coconut chutney' },
    { categoryId: 'breakfast', name: 'Rava Upma',                price: 16, prepTimeMins: 10, imageUrl: IMG.upma,        description: 'Semolina porridge with vegetables and mustard tempering' },
    { categoryId: 'breakfast', name: 'Pongal & Sambar',          price: 18, prepTimeMins: 10, imageUrl: IMG.pongal,      description: 'Savory rice-lentil porridge with ghee and pepper' },
    { categoryId: 'breakfast', name: 'Vada (2 pcs)',             price: 16, prepTimeMins: 10, imageUrl: IMG.vada,        description: 'Crispy lentil fritters with coconut chutney and sambar' },
    { categoryId: 'breakfast', name: 'Idiyappam & Coconut Milk', price: 20, prepTimeMins: 12, imageUrl: IMG.idiyappam,   description: 'String hoppers with sweet coconut milk — Kerala breakfast favourite' },

    // KERALA MEALS
    { categoryId: 'meals', name: 'Full Kerala Meals',  price: 45, prepTimeMins: 10, imageUrl: IMG.keralaMeals,  description: 'Rice, sambar, rasam, 2 curries, thoran, papadom, pickle & payasam' },
    { categoryId: 'meals', name: 'Mini Kerala Meals',  price: 32, prepTimeMins: 10, imageUrl: IMG.keralaMeals,  description: 'Rice, sambar, 1 curry, thoran, papadom & pickle' },
    { categoryId: 'meals', name: 'Fish Meals',         price: 55, prepTimeMins: 12, imageUrl: IMG.fishMeals,    description: 'Full meals with Kerala fish curry & fried fish' },
    { categoryId: 'meals', name: 'Chicken Meals',      price: 50, prepTimeMins: 12, imageUrl: IMG.chickenMeals, description: 'Full meals with Kerala chicken curry & sides' },

    // CURRIES
    { categoryId: 'curries', name: 'Kerala Fish Curry',    price: 52, prepTimeMins: 20, imageUrl: IMG.fishCurry,    description: 'Kodampuli based red fish curry — authentic Kerala style' },
    { categoryId: 'curries', name: 'Meen Moilee',          price: 55, prepTimeMins: 22, imageUrl: IMG.fishCurry,    description: 'Mild coconut milk fish curry with turmeric' },
    { categoryId: 'curries', name: 'Nadan Chicken Curry',  price: 48, prepTimeMins: 22, imageUrl: IMG.chickenCurry, description: 'Kerala style chicken curry with roasted coconut gravy' },
    { categoryId: 'curries', name: 'Chicken Mappas',       price: 50, prepTimeMins: 22, imageUrl: IMG.chickenCurry, description: 'Creamy coconut chicken curry with whole spices' },
    { categoryId: 'curries', name: 'Mutton Curry',         price: 62, prepTimeMins: 30, imageUrl: IMG.muttonCurry,  description: 'Slow cooked mutton in Kerala spices' },
    { categoryId: 'curries', name: 'Beef Ularthiyathu',    price: 58, prepTimeMins: 30, imageUrl: IMG.muttonCurry,  description: 'Dry roasted beef with coconut and spices — Kerala special' },
    { categoryId: 'curries', name: 'Egg Roast',            price: 32, prepTimeMins: 15, imageUrl: IMG.eggRoast,     description: 'Hard boiled eggs in spiced onion-tomato masala' },
    { categoryId: 'curries', name: 'Dal Tadka',            price: 28, prepTimeMins: 15, imageUrl: IMG.dal,          description: 'Yellow lentils with ghee tadka and cumin' },
    { categoryId: 'curries', name: 'Avial',                price: 30, prepTimeMins: 18, imageUrl: IMG.avial,        description: 'Mixed vegetables in coconut-yogurt gravy — Kerala classic' },
    { categoryId: 'curries', name: 'Sambar',               price: 20, prepTimeMins: 10, imageUrl: IMG.sambar,       description: 'South Indian lentil-vegetable stew' },
    { categoryId: 'curries', name: 'Kadala Curry',         price: 26, prepTimeMins: 18, imageUrl: IMG.avial,        description: 'Black chickpea curry in roasted coconut gravy' },

    // BIRIYANI & RICE
    { categoryId: 'biriyani', name: 'Malabar Chicken Biriyani', price: 52, prepTimeMins: 25, imageUrl: IMG.chickenBiriyani, description: 'Fragrant kaima rice biriyani with tender chicken, fried onions & raita' },
    { categoryId: 'biriyani', name: 'Malabar Mutton Biriyani',  price: 65, prepTimeMins: 28, imageUrl: IMG.muttonBiriyani,  description: 'Slow cooked mutton Malabar-style with kaima rice' },
    { categoryId: 'biriyani', name: 'Fish Biriyani',            price: 58, prepTimeMins: 28, imageUrl: IMG.fishBiriyani,    description: 'Delicate fish pieces layered in spiced basmati' },
    { categoryId: 'biriyani', name: 'Prawn Biriyani',           price: 68, prepTimeMins: 28, imageUrl: IMG.prawnBiriyani,   description: 'Jumbo prawns in aromatic Malabar spiced rice' },
    { categoryId: 'biriyani', name: 'Veg Biriyani',             price: 38, prepTimeMins: 22, imageUrl: IMG.vegBiriyani,     description: 'Mixed vegetables and paneer in fragrant basmati' },
    { categoryId: 'biriyani', name: 'Ghee Rice',                price: 28, prepTimeMins: 12, imageUrl: IMG.gheeRice,        description: 'Aromatic kaima rice cooked in ghee with whole spices' },

    // BREADS
    { categoryId: 'breads', name: 'Kerala Parota',   price: 8,  prepTimeMins: 10, imageUrl: IMG.parota,  description: 'Layered flaky flatbread — pairs best with beef or chicken curry' },
    { categoryId: 'breads', name: 'Chapati (2 pcs)', price: 10, prepTimeMins: 8,  imageUrl: IMG.chapati, description: 'Whole wheat flatbread' },
    { categoryId: 'breads', name: 'Naan',            price: 12, prepTimeMins: 10, imageUrl: IMG.naan,    description: 'Soft leavened bread from the tandoor' },
    { categoryId: 'breads', name: 'Garlic Naan',     price: 14, prepTimeMins: 10, imageUrl: IMG.naan,    description: 'Buttered naan topped with fresh garlic' },
    { categoryId: 'breads', name: 'Puttu (2 pcs)',   price: 16, prepTimeMins: 12, imageUrl: IMG.puttu,   description: 'Steamed rice cylinders with coconut — order with kadala curry' },

    // SNACKS & STARTERS
    { categoryId: 'snacks', name: 'Chicken 65',          price: 38, prepTimeMins: 15, imageUrl: IMG.chicken65,   description: 'Spicy deep-fried chicken bites — South Indian bar classic' },
    { categoryId: 'snacks', name: 'Fish Fry',            price: 42, prepTimeMins: 15, imageUrl: IMG.fishFry,     description: 'Marinated fish slices fried in Kerala spices' },
    { categoryId: 'snacks', name: 'Prawn Fry',           price: 52, prepTimeMins: 15, imageUrl: IMG.prawnFry,    description: 'Crispy prawns marinated in chilli and turmeric' },
    { categoryId: 'snacks', name: 'Parippu Vada (3 pcs)',price: 14, prepTimeMins: 10, imageUrl: IMG.vada,        description: 'Crispy chana dal fritters — Kerala tea-time snack' },
    { categoryId: 'snacks', name: 'Banana Bajji (4 pcs)',price: 16, prepTimeMins: 12, imageUrl: IMG.vada,        description: 'Raw banana slices in spiced batter, deep fried' },
    { categoryId: 'snacks', name: 'Unniyappam (4 pcs)',  price: 18, prepTimeMins: 15, imageUrl: IMG.payasam,     description: 'Sweet rice and banana balls fried in ghee' },
    { categoryId: 'snacks', name: 'Samosa (2 pcs)',      price: 14, prepTimeMins: 10, imageUrl: IMG.samosa,      description: 'Crispy pastry with spiced potato filling' },
    { categoryId: 'snacks', name: 'Kothu Parota',        price: 38, prepTimeMins: 18, imageUrl: IMG.kothuParota, description: 'Shredded parota stir fried with egg, onion and masala' },

    // BEVERAGES
    { categoryId: 'beverages', name: 'Sulaimani Chai',        price: 10, prepTimeMins: 5, imageUrl: IMG.chai,        description: 'Malabar black tea with lemon and spices — the Kerala staple' },
    { categoryId: 'beverages', name: 'Karak Chai',            price: 10, prepTimeMins: 5, imageUrl: IMG.chai,        description: 'Strong milk tea with cardamom' },
    { categoryId: 'beverages', name: 'Filter Coffee',         price: 12, prepTimeMins: 5, imageUrl: IMG.coffee,      description: 'South Indian drip coffee with frothy milk' },
    { categoryId: 'beverages', name: 'Tender Coconut Water',  price: 18, prepTimeMins: 2, imageUrl: IMG.coconutWater,description: 'Fresh coconut water — chilled' },
    { categoryId: 'beverages', name: 'Mango Lassi',           price: 18, prepTimeMins: 5, imageUrl: IMG.lassi,       description: 'Sweet mango blended yogurt drink' },
    { categoryId: 'beverages', name: 'Buttermilk (Sambaram)', price: 12, prepTimeMins: 3, imageUrl: IMG.lassi,       description: 'Salted spiced buttermilk with ginger and curry leaves' },
    { categoryId: 'beverages', name: 'Fresh Lime Soda',       price: 12, prepTimeMins: 3, imageUrl: IMG.lime,        description: 'Fresh lime with soda — sweet, salt or masala' },
    { categoryId: 'beverages', name: 'Soft Drinks',           price: 8,  prepTimeMins: 1, imageUrl: IMG.softDrink,   description: 'Pepsi, 7Up, Miranda' },

    // DESSERTS
    { categoryId: 'desserts', name: 'Semiya Payasam',      price: 22, prepTimeMins: 5, imageUrl: IMG.payasam, description: 'Vermicelli pudding in sweetened milk with cardamom' },
    { categoryId: 'desserts', name: 'Palada Payasam',      price: 25, prepTimeMins: 5, imageUrl: IMG.payasam, description: 'Rice ada in thick sweetened milk — sadya classic' },
    { categoryId: 'desserts', name: 'Kerala Halwa',        price: 20, prepTimeMins: 5, imageUrl: IMG.halwa,   description: 'Kozhikodan wheat halwa — rich and chewy' },
    { categoryId: 'desserts', name: 'Banana Halwa',        price: 18, prepTimeMins: 5, imageUrl: IMG.halwa,   description: 'Nendran banana cooked in ghee and jaggery' },
    { categoryId: 'desserts', name: 'Ice Cream (2 scoops)',price: 18, prepTimeMins: 2, imageUrl: IMG.iceCream,description: 'Vanilla, Mango, or Strawberry' },
  ]

  for (const item of items) {
    await prisma.menuItem.create({ data: item })
  }
  console.log(`✅ Menu seeded — ${items.length} items with images`)

  console.log('\n🔑 Staff Accounts:')
  console.log('   Owner:   owner@hotel.com   / owner123')
  console.log('   Manager: manager@hotel.com / manager123')
  console.log('   Kitchen: kitchen@hotel.com / kitchen123')
  console.log('   Waiter:  waiter@hotel.com  / waiter123')
}

main().catch(console.error).finally(() => prisma.$disconnect())
