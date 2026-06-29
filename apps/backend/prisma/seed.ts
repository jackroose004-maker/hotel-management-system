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

  // ── Tables with QR codes ─────────────────────────────────────────────────
  // QR code format: "table-{n}" → maps to URL /order/table-{n}
  for (let i = 1; i <= 12; i++) {
    await prisma.restaurantTable.upsert({
      where: { tableNumber: i },
      update: { qrCode: `table-${i}` },
      create: {
        tableNumber: i,
        capacity: i <= 8 ? 4 : 6,
        qrCode: `table-${i}`,
      },
    })
  }
  console.log('✅ Tables seeded (QR: table-1 to table-12)')
  console.log('   Demo URL: http://localhost:3000/order/table-1')

  // ── Menu categories ───────────────────────────────────────────────────────
  const catData = [
    { id: 'breakfast',   name: 'Breakfast',         nameAr: 'إفطار',            sortOrder: 1 },
    { id: 'meals',       name: 'Kerala Meals',       nameAr: 'وجبات كيرالا',     sortOrder: 2 },
    { id: 'curries',     name: 'Curries',            nameAr: 'مرق',              sortOrder: 3 },
    { id: 'biriyani',    name: 'Biriyani & Rice',    nameAr: 'برياني وأرز',      sortOrder: 4 },
    { id: 'breads',      name: 'Breads & Rotis',     nameAr: 'خبز',              sortOrder: 5 },
    { id: 'snacks',      name: 'Snacks & Starters',  nameAr: 'وجبات خفيفة',     sortOrder: 6 },
    { id: 'beverages',   name: 'Beverages',          nameAr: 'مشروبات',          sortOrder: 7 },
    { id: 'desserts',    name: 'Desserts',           nameAr: 'حلويات',           sortOrder: 8 },
  ]

  for (const cat of catData) {
    await prisma.menuCategory.upsert({ where: { id: cat.id }, update: cat, create: cat })
  }
  console.log('✅ Categories seeded')

  // ── Menu items ────────────────────────────────────────────────────────────
  await prisma.menuItem.deleteMany({})

  const items = [
    // ── BREAKFAST ──
    { categoryId: 'breakfast', name: 'Puttu & Kadala Curry',    price: 22, prepTimeMins: 12, description: 'Steamed rice cylinders with spiced black chickpea curry — a Kerala classic' },
    { categoryId: 'breakfast', name: 'Appam & Vegetable Stew',  price: 24, prepTimeMins: 15, description: 'Lacy hoppers with creamy coconut vegetable stew' },
    { categoryId: 'breakfast', name: 'Appam & Egg Curry',       price: 26, prepTimeMins: 15, description: 'Soft appam with spiced egg curry' },
    { categoryId: 'breakfast', name: 'Idli Sambar (3 pcs)',     price: 18, prepTimeMins: 10, description: 'Steamed rice cakes with lentil sambar and coconut chutney' },
    { categoryId: 'breakfast', name: 'Masala Dosa',             price: 22, prepTimeMins: 12, description: 'Crispy crepe with spiced potato filling, sambar, chutneys' },
    { categoryId: 'breakfast', name: 'Plain Dosa',              price: 16, prepTimeMins: 10, description: 'Thin crispy crepe with sambar and coconut chutney' },
    { categoryId: 'breakfast', name: 'Rava Upma',               price: 16, prepTimeMins: 10, description: 'Semolina porridge with vegetables and mustard tempering' },
    { categoryId: 'breakfast', name: 'Pongal & Sambar',         price: 18, prepTimeMins: 10, description: 'Savory rice-lentil porridge with ghee and pepper' },
    { categoryId: 'breakfast', name: 'Vada (2 pcs)',            price: 16, prepTimeMins: 10, description: 'Crispy lentil fritters with coconut chutney and sambar' },
    { categoryId: 'breakfast', name: 'Idiyappam & Coconut Milk',price: 20, prepTimeMins: 12, description: 'String hoppers with sweet coconut milk — Kerala breakfast favourite' },

    // ── KERALA MEALS ──
    { categoryId: 'meals', name: 'Full Kerala Meals',           price: 45, prepTimeMins: 10, description: 'Rice, sambar, rasam, 2 curries, thoran, papadom, pickle & payasam' },
    { categoryId: 'meals', name: 'Mini Kerala Meals',           price: 32, prepTimeMins: 10, description: 'Rice, sambar, 1 curry, thoran, papadom & pickle' },
    { categoryId: 'meals', name: 'Fish Meals',                  price: 55, prepTimeMins: 12, description: 'Full meals with Kerala fish curry & fried fish' },
    { categoryId: 'meals', name: 'Chicken Meals',               price: 50, prepTimeMins: 12, description: 'Full meals with Kerala chicken curry & sides' },

    // ── CURRIES ──
    { categoryId: 'curries', name: 'Kerala Fish Curry',         price: 52, prepTimeMins: 20, description: 'Kodampuli (gamboge) based red fish curry — authentic Kerala style' },
    { categoryId: 'curries', name: 'Meen Moilee',               price: 55, prepTimeMins: 22, description: 'Mild coconut milk fish curry with turmeric' },
    { categoryId: 'curries', name: 'Nadan Chicken Curry',       price: 48, prepTimeMins: 22, description: 'Kerala style chicken curry with roasted coconut gravy' },
    { categoryId: 'curries', name: 'Chicken Mappas',            price: 50, prepTimeMins: 22, description: 'Creamy coconut chicken curry with whole spices' },
    { categoryId: 'curries', name: 'Mutton Curry',              price: 62, prepTimeMins: 30, description: 'Slow cooked mutton in Kerala spices' },
    { categoryId: 'curries', name: 'Beef Ularthiyathu',         price: 58, prepTimeMins: 30, description: 'Dry roasted beef with coconut and spices — Kerala special' },
    { categoryId: 'curries', name: 'Egg Roast',                 price: 32, prepTimeMins: 15, description: 'Hard boiled eggs in spiced onion-tomato masala' },
    { categoryId: 'curries', name: 'Dal Tadka',                 price: 28, prepTimeMins: 15, description: 'Yellow lentils with ghee tadka and cumin' },
    { categoryId: 'curries', name: 'Avial',                     price: 30, prepTimeMins: 18, description: 'Mixed vegetables in coconut-yogurt gravy — Kerala classic' },
    { categoryId: 'curries', name: 'Sambar',                    price: 20, prepTimeMins: 10, description: 'South Indian lentil-vegetable stew' },
    { categoryId: 'curries', name: 'Kadala Curry',              price: 26, prepTimeMins: 18, description: 'Black chickpea curry in roasted coconut gravy' },

    // ── BIRIYANI & RICE ──
    { categoryId: 'biriyani', name: 'Malabar Chicken Biriyani', price: 52, prepTimeMins: 25, description: 'Fragrant kaima rice biriyani with tender chicken, fried onions & raita' },
    { categoryId: 'biriyani', name: 'Malabar Mutton Biriyani',  price: 65, prepTimeMins: 28, description: 'Slow cooked mutton Malabar-style with kaima rice' },
    { categoryId: 'biriyani', name: 'Fish Biriyani',            price: 58, prepTimeMins: 28, description: 'Delicate fish pieces layered in spiced basmati' },
    { categoryId: 'biriyani', name: 'Prawn Biriyani',           price: 68, prepTimeMins: 28, description: 'Jumbo prawns in aromatic Malabar spiced rice' },
    { categoryId: 'biriyani', name: 'Veg Biriyani',             price: 38, prepTimeMins: 22, description: 'Mixed vegetables and paneer in fragrant basmati' },
    { categoryId: 'biriyani', name: 'Ghee Rice',                price: 28, prepTimeMins: 12, description: 'Aromatic kaima rice cooked in ghee with whole spices' },

    // ── BREADS ──
    { categoryId: 'breads', name: 'Kerala Parota',              price: 8,  prepTimeMins: 10, description: 'Layered flaky flatbread — pairs best with beef or chicken curry' },
    { categoryId: 'breads', name: 'Chapati (2 pcs)',            price: 10, prepTimeMins: 8,  description: 'Whole wheat flatbread' },
    { categoryId: 'breads', name: 'Naan',                       price: 12, prepTimeMins: 10, description: 'Soft leavened bread from the tandoor' },
    { categoryId: 'breads', name: 'Garlic Naan',                price: 14, prepTimeMins: 10, description: 'Buttered naan topped with fresh garlic' },
    { categoryId: 'breads', name: 'Puttu (2 pcs)',              price: 16, prepTimeMins: 12, description: 'Steamed rice cylinders with coconut — order with kadala curry' },

    // ── SNACKS & STARTERS ──
    { categoryId: 'snacks', name: 'Chicken 65',                 price: 38, prepTimeMins: 15, description: 'Spicy deep-fried chicken bites — South Indian bar classic' },
    { categoryId: 'snacks', name: 'Fish Fry',                   price: 42, prepTimeMins: 15, description: 'Marinated fish slices fried in Kerala spices' },
    { categoryId: 'snacks', name: 'Prawn Fry',                  price: 52, prepTimeMins: 15, description: 'Crispy prawns marinated in chilli and turmeric' },
    { categoryId: 'snacks', name: 'Parippu Vada (3 pcs)',       price: 14, prepTimeMins: 10, description: 'Crispy chana dal fritters — Kerala tea-time snack' },
    { categoryId: 'snacks', name: 'Banana Bajji (4 pcs)',       price: 16, prepTimeMins: 12, description: 'Raw banana slices in spiced batter, deep fried' },
    { categoryId: 'snacks', name: 'Unniyappam (4 pcs)',         price: 18, prepTimeMins: 15, description: 'Sweet rice and banana balls fried in ghee' },
    { categoryId: 'snacks', name: 'Samosa (2 pcs)',             price: 14, prepTimeMins: 10, description: 'Crispy pastry with spiced potato filling' },
    { categoryId: 'snacks', name: 'Kothu Parota',               price: 38, prepTimeMins: 18, description: 'Shredded parota stir fried with egg, onion and masala' },

    // ── BEVERAGES ──
    { categoryId: 'beverages', name: 'Sulaimani Chai',          price: 10, prepTimeMins: 5,  description: 'Malabar black tea with lemon and spices — the Kerala staple' },
    { categoryId: 'beverages', name: 'Karak Chai',              price: 10, prepTimeMins: 5,  description: 'Strong milk tea with cardamom' },
    { categoryId: 'beverages', name: 'Filter Coffee',           price: 12, prepTimeMins: 5,  description: 'South Indian drip coffee with frothy milk' },
    { categoryId: 'beverages', name: 'Tender Coconut Water',    price: 18, prepTimeMins: 2,  description: 'Fresh coconut water — chilled' },
    { categoryId: 'beverages', name: 'Mango Lassi',             price: 18, prepTimeMins: 5,  description: 'Sweet mango blended yogurt drink' },
    { categoryId: 'beverages', name: 'Buttermilk (Sambaram)',   price: 12, prepTimeMins: 3,  description: 'Salted spiced buttermilk with ginger and curry leaves' },
    { categoryId: 'beverages', name: 'Fresh Lime Soda',         price: 12, prepTimeMins: 3,  description: 'Fresh lime with soda — sweet, salt or masala' },
    { categoryId: 'beverages', name: 'Soft Drinks',             price: 8,  prepTimeMins: 1,  description: 'Pepsi, 7Up, Miranda' },

    // ── DESSERTS ──
    { categoryId: 'desserts', name: 'Semiya Payasam',           price: 22, prepTimeMins: 5,  description: 'Vermicelli pudding in sweetened milk with cardamom' },
    { categoryId: 'desserts', name: 'Palada Payasam',           price: 25, prepTimeMins: 5,  description: 'Rice ada in thick sweetened milk — sadya classic' },
    { categoryId: 'desserts', name: 'Kerala Halwa',             price: 20, prepTimeMins: 5,  description: 'Kozhikodan wheat halwa — rich and chewy' },
    { categoryId: 'desserts', name: 'Banana Halwa',             price: 18, prepTimeMins: 5,  description: 'Nendran banana cooked in ghee and jaggery' },
    { categoryId: 'desserts', name: 'Ice Cream (2 scoops)',     price: 18, prepTimeMins: 2,  description: 'Vanilla, Mango, or Strawberry' },
  ]

  for (const item of items) {
    await prisma.menuItem.create({ data: item })
  }

  console.log(`✅ Menu seeded — ${items.length} Kerala & South Indian items across 8 categories`)

  console.log('\n🔑 Staff Accounts:')
  console.log('   Owner:   owner@hotel.com / owner123')
  console.log('   Manager: manager@hotel.com / manager123')
  console.log('   Kitchen: kitchen@hotel.com / kitchen123')
  console.log('   Waiter:  waiter@hotel.com / waiter123')

  console.log('\n📱 QR Code URLs (use these in QR generator):')
  for (let i = 1; i <= 12; i++) {
    console.log(`   Table ${i.toString().padStart(2)}: http://YOUR_DOMAIN/order/table-${i}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
