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
    { id: 'faloda',    name: 'Falooda',            nameAr: 'فالودة',          sortOrder: 9 },
    { id: 'charcoal',  name: 'Charcoal Grills',    nameAr: 'مشويات الفحم',    sortOrder: 10 },
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
    { id: 'fd7d67c9-c188-42df-bf70-36098dd33bc6', categoryId: 'breakfast', name: 'Puttu & Kadala Curry',     price: 22, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTs4J31cb-jbUvSSg5NkdG6LhwL5x0BC3hkuXCQD-IGuQ&s=10', description: 'Steamed rice cylinders with spiced black chickpea curry — a Kerala classic' },
    { id: 'dc1969e8-6b48-41d9-97fa-cd0a0df57e62', categoryId: 'breakfast', name: 'Appam & Vegetable Stew',   price: 24, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRK9dQdWWZWSosf2rjMBE_fldrJv84rEoOVvAMl1hwqvA&s=10', description: 'Lacy hoppers with creamy coconut vegetable stew' },
    { id: '6750b6ed-be6c-46b5-8ae2-728b3e92b6de', categoryId: 'breakfast', name: 'Appam & Egg Curry',        price: 26, prepTimeMins: 15, imageUrl: 'https://www.foodiaq.com/wp-content/uploads/2024/11/appam-with-egg.jpg', description: 'Soft appam with spiced egg curry' },
    { id: '90e163fc-8fb8-4cae-89d1-2fac32ebfb48', categoryId: 'breakfast', name: 'Idli Sambar (3 pcs)',      price: 18, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1741376509253-221ac18fac0f?q=80&w=2070&auto=format&fit=crop', description: 'Steamed rice cakes with lentil sambar and coconut chutney' },
    { id: 'ba6905bc-7cd4-40e3-a30a-f537f7be53db', categoryId: 'breakfast', name: 'Masala Dosa',              price: 22, prepTimeMins: 12, imageUrl: 'https://images.unsplash.com/photo-1727404496374-21f174663abb?w=900&auto=format&fit=crop&q=60', description: 'Crispy crepe with spiced potato filling, sambar, chutneys' },
    { id: '57162b73-70e3-4a7e-b414-5eeaa0897412', categoryId: 'breakfast', name: 'Plain Dosa',               price: 16, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=900&auto=format&fit=crop&q=60', description: 'Thin crispy crepe with sambar and coconut chutney' },
    { id: '0b98ebd8-aabb-47f5-9221-aa990996a1d0', categoryId: 'breakfast', name: 'Rava Upma',                price: 16, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSvuh-gsL3LC_D8oCt_n4m1O_3uNVVDbCqEh50tQZhBA&s=10', description: 'Semolina porridge with vegetables and mustard tempering' },
    { id: '4a6b4077-8a15-4afa-a23e-cabdde9ba5a3', categoryId: 'breakfast', name: 'Pongal & Sambar',          price: 18, prepTimeMins: 10, imageUrl: 'https://media.istockphoto.com/id/1256048247/photo/south-indian-breakfast-pongal-ven-pongal-with-coconut-chutney-red-chutney-and-sambar-served.webp?a=1&b=1&s=612x612&w=0&k=20&c=se73LXWg-H4mC8iWA_ZmpMdCsxEJVyMFRsY4o6giT_Q=', description: 'Savory rice-lentil porridge with ghee and pepper' },
    { id: 'deb036fc-f368-4b96-abe6-b7516c225c1d', categoryId: 'breakfast', name: 'Vada (2 pcs)',             price: 16, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQeXs6x6RSOgKFhPX-W0uFBRMpiYKrfQ3h8NIKvRqNvLQ&s=10', description: 'Crispy lentil fritters with coconut chutney and sambar' },
    { id: 'b15abe50-818c-4146-9132-a7b86137adf6', categoryId: 'breakfast', name: 'Idiyappam & Coconut Milk', price: 20, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWb1O2_M6S-Ju4RcE5ZZuJK0XRMk75QcgrEJyYEB76Ew&s=10', description: 'String hoppers with sweet coconut milk — Kerala breakfast favourite' },

    // KERALA MEALS
    { id: 'd20b4509-cc60-4b24-bb16-8aca91d40eec', categoryId: 'meals', name: 'Full Kerala Meals',  price: 45, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTUz7Cbu3y5ovv9HG6Utp20jLIPBSklkCslnKL8S7Oe2Q&s=10', description: 'Rice, sambar, rasam, 2 curries, thoran, papadom, pickle & payasam' },
    { id: '77dbc727-31bf-4a21-80a2-1a7944e07787', categoryId: 'meals', name: 'Mini Kerala Meals',  price: 32, prepTimeMins: 10, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxOm1UcEd3gTSJl08dGBgB2acMiILgiG-s_bhGseak4g&s=10', description: 'Rice, sambar, 1 curry, thoran, papadom & pickle' },
    { id: '0f8409e1-def3-44cc-a3d6-86bcc548d7ec', categoryId: 'meals', name: 'Fish Meals',         price: 55, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS2Y3snNZfWgDYs7FCOgpjOjVTOOc4w9iZsDfI3_ebmPQ&s=10', description: 'Full meals with Kerala fish curry & fried fish' },
    { id: '0cb75d12-b0e1-46c8-9e6c-046241de9ed7', categoryId: 'meals', name: 'Chicken Meals',      price: 50, prepTimeMins: 12, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHlp3YelCTF-5tdKP1HYf-E9E2ObG1_W-p1fVPADH1DA&s=10', description: 'Full meals with Kerala chicken curry & sides' },

    // CURRIES
    { id: '3267629a-50eb-4a5f-a08d-3291802d7d61', categoryId: 'curries', name: 'Kerala Fish Curry',   price: 52, prepTimeMins: 20, imageUrl: 'https://media.istockphoto.com/id/1480338622/photo/homemade-kerala-fish-curry.jpg?b=1&s=612x612&w=0&k=20&c=PN7wliedzCTszXiqIlv20KD5Cjx6BqfEI3Ch0MLJzfw=', description: 'Kodampuli based red fish curry — authentic Kerala style' },
    { id: '26b78619-65b2-42fe-bf71-ac8a746471b0', categoryId: 'curries', name: 'Meen Moilee',         price: 55, prepTimeMins: 22, imageUrl: 'https://images.boldsky.com/webp/img/2014/03/07-meen-moilee.jpg', description: 'Mild coconut milk fish curry with turmeric' },
    { id: '9fb355e4-acd2-43c3-9b8f-6ee1ca6e24df', categoryId: 'curries', name: 'Nadan Chicken Curry', price: 48, prepTimeMins: 22, imageUrl: 'https://images.pexels.com/photos/35629938/pexels-photo-35629938.jpeg', description: 'Kerala style chicken curry with roasted coconut gravy' },
    { id: 'f8d5a98d-88ab-420d-9c04-06e62bdad903', categoryId: 'curries', name: 'Chicken Mappas',      price: 50, prepTimeMins: 22, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQUKr5CVkNpvRbMN6KgbfNN--zEAbI3mDiZ8i9cTEeB1Q&s=10', description: 'Creamy coconut chicken curry with whole spices' },
    { id: '4f9e4a17-ea99-4c7a-9784-7362f3dae336', categoryId: 'curries', name: 'Mutton Curry',        price: 62, prepTimeMins: 30, imageUrl: 'https://images.pexels.com/photos/9609846/pexels-photo-9609846.jpeg', description: 'Slow cooked mutton in Kerala spices' },
    { id: '5778bf16-5795-4a14-9086-7b7a73a2ca2e', categoryId: 'curries', name: 'Beef Ularthiyathu',   price: 58, prepTimeMins: 30, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJC---sx5_pntoYvyKXuvsW7HiimR-53V1oTka-ut2Xw&s=10', description: 'Dry roasted beef with coconut and spices — Kerala special' },
    { id: 'b86d8230-96ef-461d-9346-c3f2f05df651', categoryId: 'curries', name: 'Egg Roast',           price: 32, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=80', description: 'Hard boiled eggs in spiced onion-tomato masala' },
    { id: '5bf248f1-4734-49b3-89d5-8bdfe21e0734', categoryId: 'curries', name: 'Dal Tadka',           price: 28, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-D4_4ZywCYKa8ar2QHEmCQvAVJdrbmq-I3sDTpf2umw&s=10', description: 'Yellow lentils with ghee tadka and cumin' },
    { id: 'acd22b0a-7ab2-4938-a6dd-443a69427841', categoryId: 'curries', name: 'Avial',               price: 30, prepTimeMins: 18, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzq54y5VLEl7vHdQA3PPQ9LKf-pZqbKOA5ov9i2jab7g&s=10', description: 'Mixed vegetables in coconut-yogurt gravy — Kerala classic' },
    { id: 'a6e5583e-c5a9-4504-9e1d-78176da08ea0', categoryId: 'curries', name: 'Sambar',              price: 20, prepTimeMins: 10, imageUrl: 'https://media.istockphoto.com/id/1280359179/photo/sambar-south-indian-lentil-stew-with-vegetables-and-curry-leaves.jpg?b=1&s=612x612&w=0&k=20&c=HPWLc-nTC0wbZ3kQ54f5U0aZ4fm9T1SgmfVFXgfBJ9s=', description: 'South Indian lentil-vegetable stew' },
    { id: '2cd6ebe7-0aba-4cad-b4ff-c41f5d2dc4af', categoryId: 'curries', name: 'Kadala Curry',        price: 26, prepTimeMins: 18, imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80', description: 'Black chickpea curry in roasted coconut gravy' },

    // BIRIYANI & RICE
    { id: '7596ccf0-de43-4992-88f8-8177ea168b99', categoryId: 'biriyani', name: 'Malabar Chicken Biriyani', price: 52, prepTimeMins: 25, imageUrl: 'https://images.pexels.com/photos/35071812/pexels-photo-35071812.jpeg', description: 'Fragrant kaima rice biriyani with tender chicken, fried onions & raita' },
    { id: '4f0a675d-4003-4cf4-8cda-853a1dbdf3bc', categoryId: 'biriyani', name: 'Malabar Mutton Biriyani',  price: 65, prepTimeMins: 28, imageUrl: 'https://images.pexels.com/photos/18698232/pexels-photo-18698232.jpeg', description: 'Slow cooked mutton Malabar-style with kaima rice' },
    { id: '8207c181-f5e9-418e-9a17-e2c867e5fc72', categoryId: 'biriyani', name: 'Fish Biriyani',            price: 58, prepTimeMins: 28, imageUrl: 'https://images.pexels.com/photos/17649369/pexels-photo-17649369.jpeg', description: 'Delicate fish pieces layered in spiced basmati' },
    { id: '37bb84ed-f48a-4787-a0ed-6fbce6314e18', categoryId: 'biriyani', name: 'Prawn Biriyani',           price: 68, prepTimeMins: 28, imageUrl: 'https://images.pexels.com/photos/34217290/pexels-photo-34217290.jpeg', description: 'Jumbo prawns in aromatic Malabar spiced rice' },
    { id: '451d71f9-26aa-411a-8d21-5579da10bd4b', categoryId: 'biriyani', name: 'Veg Biriyani',             price: 38, prepTimeMins: 22, imageUrl: 'https://images.pexels.com/photos/7593267/pexels-photo-7593267.jpeg', description: 'Mixed vegetables and paneer in fragrant basmati' },
    { id: '4c003a13-da59-42ee-8018-e82b1a037cd3', categoryId: 'biriyani', name: 'Ghee Rice',                price: 28, prepTimeMins: 12, imageUrl: 'https://images.pexels.com/photos/35267286/pexels-photo-35267286.jpeg', description: 'Aromatic kaima rice cooked in ghee with whole spices' },

    // BREADS
    { id: 'b10bb144-9e76-4a11-b321-345d9ae6f226', categoryId: 'breads', name: 'Kerala Parota',   price: 8,  prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Layered flaky flatbread — pairs best with beef or chicken curry' },
    { id: '1918e4a0-cab3-49f4-a73d-6af434410eb5', categoryId: 'breads', name: 'Chapati (2 pcs)', price: 10, prepTimeMins: 8,  imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80', description: 'Whole wheat flatbread' },
    { id: '7a65662e-47b3-47cf-b4de-f7c09fd43c4b', categoryId: 'breads', name: 'Naan',            price: 12, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Soft leavened bread from the tandoor' },
    { id: '39ffd033-b787-46bc-b5fd-9b0ac1bddd1b', categoryId: 'breads', name: 'Garlic Naan',     price: 14, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Buttered naan topped with fresh garlic' },
    { id: '2c23b47c-250d-4224-b423-e7214b51fea1', categoryId: 'breads', name: 'Puttu (2 pcs)',   price: 16, prepTimeMins: 12, imageUrl: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&q=80', description: 'Steamed rice cylinders with coconut — order with kadala curry' },

    // SNACKS & STARTERS
    { id: '8be4a1ec-ea67-4762-9294-174e53f6bcf8', categoryId: 'snacks', name: 'Chicken 65',           price: 38, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=600&q=80', description: 'Spicy deep-fried chicken bites — South Indian bar classic' },
    { id: '8fce55e7-3f1b-4d37-b674-f2857b353359', categoryId: 'snacks', name: 'Fish Fry',             price: 42, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1611171711791-7b6eea9a0680?w=600&q=80', description: 'Marinated fish slices fried in Kerala spices' },
    { id: 'ef36eded-0b52-4dda-851f-668b64e415ae', categoryId: 'snacks', name: 'Prawn Fry',             price: 52, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80', description: 'Crispy prawns marinated in chilli and turmeric' },
    { id: '6293ec2d-2de4-4d3c-a3b7-f3942538729a', categoryId: 'snacks', name: 'Parippu Vada (3 pcs)', price: 14, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', description: 'Crispy chana dal fritters — Kerala tea-time snack' },
    { id: '3ebb99a4-609c-49e5-a3fb-8008e92585c0', categoryId: 'snacks', name: 'Banana Bajji (4 pcs)', price: 16, prepTimeMins: 12, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', description: 'Raw banana slices in spiced batter, deep fried' },
    { id: '76baa148-1ab7-4a98-9e97-4e96aed9df1c', categoryId: 'snacks', name: 'Unniyappam (4 pcs)',   price: 18, prepTimeMins: 15, imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80', description: 'Sweet rice and banana balls fried in ghee' },
    { id: '1d051c44-18ed-4d50-bb38-3db3d82f1998', categoryId: 'snacks', name: 'Samosa (2 pcs)',       price: 14, prepTimeMins: 10, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', description: 'Crispy pastry with spiced potato filling' },
    { id: '3cc51672-9268-4b89-86d7-1ba1c3df7537', categoryId: 'snacks', name: 'Kothu Parota',         price: 38, prepTimeMins: 18, imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600&q=80', description: 'Shredded parota stir fried with egg, onion and masala' },

    // BEVERAGES
    { id: '9ab6b351-ad52-4a68-844f-8d61f3f9b20f', categoryId: 'beverages', name: 'Sulaimani Chai',        price: 10, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1567708904284-9aa74d5f5ce4?w=600&q=80', description: 'Malabar black tea with lemon and spices — the Kerala staple' },
    { id: 'fb8e0d9f-91e7-494c-99c5-4218497c5a02', categoryId: 'beverages', name: 'Karak Chai',            price: 10, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1567708904284-9aa74d5f5ce4?w=600&q=80', description: 'Strong milk tea with cardamom' },
    { id: '190532f2-3327-4a4a-9571-20ac82dfd357', categoryId: 'beverages', name: 'Filter Coffee',         price: 12, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80', description: 'South Indian drip coffee with frothy milk' },
    { id: '6b10f191-72a6-4835-a067-691e7c49b363', categoryId: 'beverages', name: 'Tender Coconut Water',  price: 18, prepTimeMins: 2, imageUrl: 'https://images.unsplash.com/photo-1582556573559-a8a1b8b0cde6?w=600&q=80', description: 'Fresh coconut water — chilled' },
    { id: '57dbfbbf-70f2-47e8-999d-49fa8fe0ea3a', categoryId: 'beverages', name: 'Mango Lassi',           price: 18, prepTimeMins: 5, imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&q=80', description: 'Sweet mango blended yogurt drink' },
    { id: '4ae52a3b-401b-41e3-a215-a0673bfccdd3', categoryId: 'beverages', name: 'Buttermilk (Sambaram)', price: 12, prepTimeMins: 3, imageUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&q=80', description: 'Salted spiced buttermilk with ginger and curry leaves' },
    { id: '5415503a-fc28-495a-9f19-a3d2f25c2f85', categoryId: 'beverages', name: 'Fresh Lime Soda',       price: 12, prepTimeMins: 3, imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80', description: 'Fresh lime with soda — sweet, salt or masala' },
    { id: '3a00c0ad-2943-4e0e-8a05-576b86a11349', categoryId: 'beverages', name: 'Soft Drinks',           price: 8,  prepTimeMins: 1, imageUrl: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=600&q=80', description: 'Pepsi, 7Up, Miranda' },

    // DESSERTS
    { id: 'e8743f03-61b7-412e-a93c-16deed18e746', categoryId: 'desserts', name: 'Semiya Payasam',      price: 22, prepTimeMins: 5, imageUrl: 'https://media.istockphoto.com/id/692446072/photo/most-famous-indian-sweet-pudding-kheer-or-semiya-khir-in-a-bowl-selective-focus.jpg?b=1&s=612x612&w=0&k=20&c=YKas7wiEdCXkFJYmzpBDaFLTLYQaneUNOy1mH-g2Ec8=', description: 'Vermicelli pudding in sweetened milk with cardamom' },
    { id: '8c622f17-901a-41db-92ef-858984806ef0', categoryId: 'desserts', name: 'Palada Payasam',      price: 25, prepTimeMins: 5, imageUrl: 'https://images.pexels.com/photos/31109623/pexels-photo-31109623.jpeg', description: 'Rice ada in thick sweetened milk — sadya classic' },
    { id: 'ef938650-14e5-4409-ad29-bfc0a6c93b0e', categoryId: 'desserts', name: 'Kerala Halwa',        price: 20, prepTimeMins: 5, imageUrl: 'https://media.istockphoto.com/id/479875468/photo/sliced-black-halwa.jpg?b=1&s=612x612&w=0&k=20&c=RsEzpJLkMre0jRNjpdkl-VlsZSsVHbq4yIMbt057o5o=', description: 'Kozhikodan wheat halwa — rich and chewy' },
    { id: '4b13c4c1-bdb7-4ba7-9668-c0e46144fdd3', categoryId: 'desserts', name: 'Banana Halwa',        price: 18, prepTimeMins: 5, imageUrl: 'https://images.pexels.com/photos/8820715/pexels-photo-8820715.jpeg', description: 'Nendran banana cooked in ghee and jaggery' },
    { id: 'a2c20837-72e9-4829-98e5-d1bdc63369e0', categoryId: 'desserts', name: 'Ice Cream (2 scoops)', price: 18, prepTimeMins: 2, imageUrl: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600&q=80', description: 'Vanilla, Mango, or Strawberry' },
    { id: 'bacb749f-4a5a-4b82-bd46-a21f0ccfcf10', categoryId: 'desserts', name: 'Elanir Payasam',      price: 20, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSidgav71TxS14jZw3swgnY90wL7MNNkjKCuYPosvUr9Q&s=10', description: 'Tender coconut payasam — rich, cooling and lightly sweet South Indian dessert' },

    // FALOODA
    { id: 'e02e31b3-43ea-4b47-91f6-0d6ac3c8dbb0', categoryId: 'faloda', name: 'Royal Falooda',     price: 10, prepTimeMins: 15, imageUrl: 'https://res.cloudinary.com/k6ywmnqi/image/upload/v1783020223/almanzil/menu/zwk8xbtuokkvnjsr59vl.jpg', description: 'Traditional falooda with rose syrup, vermicelli, basil seeds (sabja), milk, ice cream, dry fruits, and jelly.' },
    { id: '8cbdc9cb-13d7-492a-a52d-48bbecf062b4', categoryId: 'faloda', name: 'Chocolate Falooda', price: 20, prepTimeMins: 15, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRtf1sW79ikFRvngjRXLZCoWp26zi9an0VNjT7fvAvoLA&s=10', description: 'Chocolate syrup, chilled milk, vermicelli, basil seeds, chocolate ice cream, brownie pieces or chocolate chips, topped with whipped cream.' },
    { id: 'ebee2d34-75cc-427b-b6b7-123a734a8d3e', categoryId: 'faloda', name: 'Panni Poori',        price: 10, prepTimeMins: 15, imageUrl: 'https://res.cloudinary.com/k6ywmnqi/image/upload/v1783178089/almanzil/menu/nylo12q5fkv0hf785pad.jpg', description: 'Fresh mango puree blended with milk, vermicelli, basil seeds, vanilla ice cream, and mango chunks.' },

    // CHARCOAL GRILLS
    { id: 'cc001000-0000-0000-0000-000000000001', categoryId: 'charcoal', name: 'Charcoal Chicken (Full)',     price: 75, prepTimeMins: 35, imageUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=600&q=80', description: 'Whole chicken marinated in Kerala spices, slow-grilled over charcoal. Served with garlic sauce, pita and salad.' },
    { id: 'cc001000-0000-0000-0000-000000000002', categoryId: 'charcoal', name: 'Charcoal Chicken (Half)',    price: 42, prepTimeMins: 30, imageUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=600&q=80', description: 'Half chicken marinated in Kerala spices, slow-grilled over charcoal. Served with garlic sauce and salad.' },
    { id: 'cc001000-0000-0000-0000-000000000003', categoryId: 'charcoal', name: 'Charcoal Fish',              price: 65, prepTimeMins: 25, imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80', description: 'Whole pomfret or kingfish marinated in turmeric and chilli, grilled on charcoal. Served with lemon and salad.' },
    { id: 'cc001000-0000-0000-0000-000000000004', categoryId: 'charcoal', name: 'Charcoal Prawns',            price: 80, prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80', description: 'Jumbo prawns with Kerala masala, char-grilled and served with garlic butter and wedges.' },
    { id: 'cc001000-0000-0000-0000-000000000005', categoryId: 'charcoal', name: 'Charcoal Mutton Chops',      price: 95, prepTimeMins: 35, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80', description: 'Tender lamb chops marinated overnight in Kerala spices, grilled over live charcoal.' },
    { id: 'cc001000-0000-0000-0000-000000000006', categoryId: 'charcoal', name: 'Charcoal Mixed Grill',       price: 120, prepTimeMins: 40, imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&q=80', description: 'Platter of charcoal chicken, mutton chops, seekh kebab and prawns. Serves 2.' },
    { id: 'cc001000-0000-0000-0000-000000000007', categoryId: 'charcoal', name: 'Seekh Kebab (4 pcs)',        price: 45, prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80', description: 'Minced lamb and beef with spices, skewered and charcoal grilled. Served with mint chutney.' },
    { id: 'cc001000-0000-0000-0000-000000000008', categoryId: 'charcoal', name: 'Charcoal Veg Platter',       price: 48, prepTimeMins: 20, imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80', description: 'Grilled paneer tikka, mushrooms, bell peppers and corn on the cob, spiced and charcoal grilled.' },
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
      name: 'Fish Type', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Pomfret',   priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Kingfish',  priceAdd: 10, isDefault: false, sortOrder: 1 },
        { name: 'Hammour',   priceAdd: 20, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000003', // Charcoal Fish
      name: 'Sides', required: false, minSelect: 0, maxSelect: 2, sortOrder: 1,
      options: [
        { name: 'Extra Garlic Sauce', priceAdd: 3, isDefault: false, sortOrder: 0 },
        { name: 'Extra Salad',        priceAdd: 5, isDefault: false, sortOrder: 1 },
        { name: 'Pita Bread',         priceAdd: 4, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000001', // Charcoal Chicken Full
      name: 'Marinade', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Kerala Spice',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Lemon Herb',     priceAdd: 0, isDefault: false, sortOrder: 1 },
        { name: 'Peri Peri',      priceAdd: 0, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000001', // Charcoal Chicken Full
      name: 'Sides', required: false, minSelect: 0, maxSelect: 3, sortOrder: 1,
      options: [
        { name: 'Garlic Sauce',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Extra Pita',     priceAdd: 4, isDefault: false, sortOrder: 1 },
        { name: 'French Fries',   priceAdd: 8, isDefault: false, sortOrder: 2 },
        { name: 'Coleslaw',       priceAdd: 6, isDefault: false, sortOrder: 3 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000002', // Charcoal Chicken Half
      name: 'Marinade', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Kerala Spice',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'Lemon Herb',     priceAdd: 0, isDefault: false, sortOrder: 1 },
        { name: 'Peri Peri',      priceAdd: 0, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000002', // Charcoal Chicken Half
      name: 'Sides', required: false, minSelect: 0, maxSelect: 2, sortOrder: 1,
      options: [
        { name: 'Garlic Sauce',   priceAdd: 0, isDefault: true,  sortOrder: 0 },
        { name: 'French Fries',   priceAdd: 8, isDefault: false, sortOrder: 1 },
        { name: 'Pita Bread',     priceAdd: 4, isDefault: false, sortOrder: 2 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000007', // Seekh Kebab
      name: 'Meat Mix', required: true, minSelect: 1, maxSelect: 1, sortOrder: 0,
      options: [
        { name: 'Lamb & Beef',  priceAdd: 0,  isDefault: true,  sortOrder: 0 },
        { name: 'Chicken Only', priceAdd: -5, isDefault: false, sortOrder: 1 },
      ],
    },
    {
      menuItemId: 'cc001000-0000-0000-0000-000000000007', // Seekh Kebab
      name: 'Extras', required: false, minSelect: 0, maxSelect: 2, sortOrder: 1,
      options: [
        { name: 'Extra Mint Chutney', priceAdd: 2, isDefault: false, sortOrder: 0 },
        { name: 'Pita Bread (2 pcs)', priceAdd: 5, isDefault: false, sortOrder: 1 },
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
