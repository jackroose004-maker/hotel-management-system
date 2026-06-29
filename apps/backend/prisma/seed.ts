import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Owner account
  await prisma.user.upsert({
    where: { email: 'owner@hotel.com' },
    update: {},
    create: {
      name: 'Hotel Owner',
      email: 'owner@hotel.com',
      passwordHash: await bcrypt.hash('owner123', 10),
      role: 'OWNER',
    },
  })

  await prisma.user.upsert({
    where: { email: 'staff@hotel.com' },
    update: {},
    create: {
      name: 'Kitchen Staff',
      email: 'staff@hotel.com',
      passwordHash: await bcrypt.hash('staff123', 10),
      role: 'STAFF',
    },
  })

  // Tables
  for (let i = 1; i <= 10; i++) {
    await prisma.restaurantTable.upsert({
      where: { tableNumber: i },
      update: {},
      create: { tableNumber: i, capacity: i <= 6 ? 4 : 6, qrCode: `table-qr-${i}` },
    })
  }

  // Menu categories
  const categories = [
    { name: 'Breakfast', nameAr: 'إفطار', sortOrder: 1 },
    { name: 'Starters', nameAr: 'مقبلات', sortOrder: 2 },
    { name: 'Main Course', nameAr: 'الطبق الرئيسي', sortOrder: 3 },
    { name: 'Grills', nameAr: 'مشويات', sortOrder: 4 },
    { name: 'Rice & Biryani', nameAr: 'أرز وبريياني', sortOrder: 5 },
    { name: 'Beverages', nameAr: 'مشروبات', sortOrder: 6 },
    { name: 'Desserts', nameAr: 'حلويات', sortOrder: 7 },
  ]

  const createdCats: Record<string, string> = {}
  for (const cat of categories) {
    const c = await prisma.menuCategory.upsert({
      where: { id: cat.name.toLowerCase().replace(/ /g, '-') },
      update: {},
      create: { id: cat.name.toLowerCase().replace(/ /g, '-'), ...cat },
    })
    createdCats[cat.name] = c.id
  }

  const items = [
    // Breakfast
    { categoryId: createdCats['Breakfast'], name: 'Full English Breakfast', price: 28, prepTimeMins: 15, description: 'Eggs, toast, beans, sausage' },
    { categoryId: createdCats['Breakfast'], name: 'Shakshuka', price: 22, prepTimeMins: 12, description: 'Poached eggs in spiced tomato sauce' },
    { categoryId: createdCats['Breakfast'], name: 'Pancakes with Honey', price: 20, prepTimeMins: 10 },
    // Starters
    { categoryId: createdCats['Starters'], name: 'Hummus & Pita', price: 18, prepTimeMins: 5, description: 'Fresh hummus with warm pita' },
    { categoryId: createdCats['Starters'], name: 'Chicken Wings', price: 32, prepTimeMins: 15, description: 'Crispy wings, garlic sauce' },
    { categoryId: createdCats['Starters'], name: 'Soup of the Day', price: 15, prepTimeMins: 8 },
    // Main Course
    { categoryId: createdCats['Main Course'], name: 'Butter Chicken', price: 45, prepTimeMins: 20, description: 'Classic creamy tomato curry' },
    { categoryId: createdCats['Main Course'], name: 'Lamb Machboos', price: 55, prepTimeMins: 25, description: 'UAE spiced lamb on rice' },
    { categoryId: createdCats['Main Course'], name: 'Fish & Chips', price: 48, prepTimeMins: 18 },
    { categoryId: createdCats['Main Course'], name: 'Chicken Shawarma Plate', price: 38, prepTimeMins: 12 },
    // Grills
    { categoryId: createdCats['Grills'], name: 'Mixed Grill Platter', price: 75, prepTimeMins: 25, description: 'Chicken, lamb, kofta with sides' },
    { categoryId: createdCats['Grills'], name: 'Grilled Hammour', price: 85, prepTimeMins: 20, description: 'Local fish, grilled to perfection' },
    { categoryId: createdCats['Grills'], name: 'Lamb Chops', price: 90, prepTimeMins: 22 },
    // Rice & Biryani
    { categoryId: createdCats['Rice & Biryani'], name: 'Chicken Biryani', price: 42, prepTimeMins: 20, description: 'Fragrant basmati, tender chicken' },
    { categoryId: createdCats['Rice & Biryani'], name: 'Mutton Biryani', price: 52, prepTimeMins: 25 },
    { categoryId: createdCats['Rice & Biryani'], name: 'Vegetable Biryani', price: 35, prepTimeMins: 18 },
    // Beverages
    { categoryId: createdCats['Beverages'], name: 'Fresh Lemon Mint', price: 15, prepTimeMins: 3, description: 'UAE favourite' },
    { categoryId: createdCats['Beverages'], name: 'Karak Chai', price: 8, prepTimeMins: 5 },
    { categoryId: createdCats['Beverages'], name: 'Soft Drinks', price: 8, prepTimeMins: 1 },
    { categoryId: createdCats['Beverages'], name: 'Fresh Juice', price: 18, prepTimeMins: 5 },
    // Desserts
    { categoryId: createdCats['Desserts'], name: 'Umm Ali', price: 22, prepTimeMins: 10, description: 'Egyptian bread pudding' },
    { categoryId: createdCats['Desserts'], name: 'Kunafa', price: 25, prepTimeMins: 12, description: 'Crispy cheese pastry with syrup' },
    { categoryId: createdCats['Desserts'], name: 'Ice Cream (2 scoops)', price: 18, prepTimeMins: 3 },
  ]

  for (const item of items) {
    await prisma.menuItem.create({ data: item }).catch(() => {})
  }

  console.log('✅ Seed complete')
  console.log('  Owner: owner@hotel.com / owner123')
  console.log('  Staff: staff@hotel.com / staff123')
}

main().finally(() => prisma.$disconnect())
