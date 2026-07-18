// Merge-gate smoke test. Boots the real Nest app in-process against whatever
// DATABASE_URL is configured (CI points this at a throwaway Postgres service —
// see .github/workflows/ci.yml). Every record this test creates is deleted in
// afterAll, in dependency order, so it never leaves data behind.
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor'
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter'
import * as bcrypt from 'bcryptjs'

// Random 4-digit base per run so re-runs (including two runs racing in CI) never
// collide on the tableNumber unique constraint, and leftover rows from a run that
// crashed before afterAll are easy to spot by their high, distinct numbers.
const RUN_BASE = 90000 + Math.floor(Math.random() * 9000)

describe('Merge-gate smoke test (e2e)', () => {
  let app: INestApplication<App>
  let prisma: PrismaService
  let http: ReturnType<typeof request>
  let ownerToken: string

  // Track everything created so cleanup is exhaustive even if an assertion throws mid-test
  const created = {
    userIds: [] as string[],
    tableIds: [] as string[],
    categoryIds: [] as string[],
    itemIds: [] as string[],
    orderIds: [] as string[],
    offerIds: [] as string[],
    groupIds: [] as string[],
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleFixture.createNestApplication()
    // Mirror main.ts bootstrap exactly so response shape ({success,data,timestamp}) and
    // route prefixes (/api/v1/...) match production behavior.
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new ResponseInterceptor())
    app.useGlobalFilters(new GlobalExceptionFilter())
    await app.init()
    prisma = moduleFixture.get(PrismaService)
    http = request(app.getHttpServer())

    // Ephemeral owner so this test never depends on (or pollutes) seeded accounts
    const owner = await prisma.user.create({
      data: {
        name: 'E2E Smoke Owner',
        email: `e2e-owner-${Date.now()}@test.local`,
        passwordHash: await bcrypt.hash('SmokeTest123!', 10),
        role: 'OWNER',
        isVerified: true,
      },
    })
    created.userIds.push(owner.id)

    const login = await http.post('/api/v1/auth/staff-login').send({ email: owner.email, password: 'SmokeTest123!' })
    expect(login.status).toBe(201)
    ownerToken = login.body.data.token
    expect(ownerToken).toBeTruthy()
  })

  afterAll(async () => {
    // Each step is independent — if one throws (e.g. an unexpected FK edge case),
    // it must not skip the rest. A merge-gate cleanup that dies half-done is worse
    // than one that logs a warning and keeps going.
    const step = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn() } catch (err) { console.warn(`[smoke cleanup] ${label} failed:`, (err as Error).message) }
    }

    // FK-safe order: orders -> group members/groups -> offers/items/categories -> tables -> users
    if (created.orderIds.length) {
      await step('delete order items', () => prisma.orderItem.deleteMany({ where: { orderId: { in: created.orderIds } } }))
      await step('delete orders', () => prisma.order.deleteMany({ where: { id: { in: created.orderIds } } }))
    }
    if (created.groupIds.length) {
      await step('delete table group members', () => prisma.tableGroupMember.deleteMany({ where: { groupId: { in: created.groupIds } } }))
      await step('delete table groups', () => prisma.tableGroup.deleteMany({ where: { id: { in: created.groupIds } } }))
    }
    if (created.offerIds.length) await step('delete offers', () => prisma.offer.deleteMany({ where: { id: { in: created.offerIds } } }))
    if (created.itemIds.length) await step('delete menu items', () => prisma.menuItem.deleteMany({ where: { id: { in: created.itemIds } } }))
    if (created.categoryIds.length) await step('delete menu categories', () => prisma.menuCategory.deleteMany({ where: { id: { in: created.categoryIds } } }))
    if (created.tableIds.length) await step('delete tables', () => prisma.restaurantTable.deleteMany({ where: { id: { in: created.tableIds } } }))
    if (created.userIds.length) await step('delete users', () => prisma.user.deleteMany({ where: { id: { in: created.userIds } } }))

    // Belt-and-suspenders: sweep anything matching this run's own naming convention,
    // in case an id never made it into the `created` tracker (e.g. process crash
    // between create and push). Scoped tightly enough to never touch real data.
    await step('sweep any remaining E2E rows', async () => {
      const strayTables = await prisma.restaurantTable.findMany({ where: { name: { startsWith: 'E2E-Smoke' } }, select: { id: true } })
      const strayIds = strayTables.map(t => t.id)
      if (strayIds.length) {
        await prisma.orderItem.deleteMany({ where: { order: { tableId: { in: strayIds } } } })
        await prisma.order.deleteMany({ where: { tableId: { in: strayIds } } })
        await prisma.tableGroupMember.deleteMany({ where: { tableId: { in: strayIds } } })
        await prisma.restaurantTable.deleteMany({ where: { id: { in: strayIds } } })
      }
      await prisma.menuItem.deleteMany({ where: { name: { startsWith: 'E2E Smoke' } } })
      await prisma.menuCategory.deleteMany({ where: { name: { startsWith: 'E2E Smoke' } } })
      await prisma.offer.deleteMany({ where: { name: { startsWith: 'E2E Smoke' } } })
      await prisma.user.deleteMany({ where: { email: { contains: 'e2e-owner-' } } })
    })

    await app.close()
  })

  const auth = () => ({ Authorization: `Bearer ${ownerToken}` })

  it('health check: menu categories endpoint responds', async () => {
    const res = await http.get('/api/v1/menu/categories')
    expect(res.status).toBe(200)
  })

  describe('order lifecycle: create -> approve -> settle', () => {
    let tableId: string
    let categoryId: string
    let itemId: string
    let orderId: string

    beforeAll(async () => {
      const cat = await prisma.menuCategory.create({ data: { name: 'E2E Smoke Category', sortOrder: 999 } })
      created.categoryIds.push(cat.id); categoryId = cat.id

      const item = await prisma.menuItem.create({
        data: { categoryId, name: 'E2E Smoke Item', price: 20, isAvailable: true },
      })
      created.itemIds.push(item.id); itemId = item.id

      const table = await prisma.restaurantTable.create({
        data: { tableNumber: RUN_BASE + 1, name: 'E2E-Smoke-A', capacity: 2, qrCode: `e2e-smoke-a-${Date.now()}` },
      })
      created.tableIds.push(table.id); tableId = table.id
    })

    it('staff can place an order that lands ACCEPTED (staff orders skip approval)', async () => {
      const res = await http.post(`/api/v1/orders/table/${tableId}/staff-order`)
        .set(auth())
        .send({ items: [{ menuItemId: itemId, quantity: 1 }] })
      // Capture + track the id for cleanup BEFORE any assertion that could throw —
      // otherwise a failed expectation here leaks the row past afterAll.
      orderId = res.body.data?.id
      if (orderId) created.orderIds.push(orderId)

      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe('ACCEPTED')
      expect(Number(res.body.data.total)).toBeCloseTo(21, 1) // 20 + 5% VAT
    })

    it('order appears in active-bills for that table', async () => {
      const res = await http.get('/api/v1/orders/active-bills').set(auth())
      expect(res.status).toBe(200)
      const entry = res.body.data.find((e: any) => e.table.id === tableId)
      expect(entry).toBeTruthy()
      expect(Number(entry.combined.total)).toBeCloseTo(21, 1)
    })

    it('marking DELIVERED then settling clears the table', async () => {
      await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } })
      const session = await prisma.order.findUnique({ where: { id: orderId }, select: { tableSessionId: true } })
      const res = await http.post(`/api/v1/payments/session/${session!.tableSessionId}/settle`)
        .set(auth())
        .send({ method: 'CASH' })
      expect(res.status).toBe(201)

      const table = await prisma.restaurantTable.findUnique({ where: { id: tableId } })
      expect(table!.status).toBe('DIRTY')

      const paid = await prisma.order.findUnique({ where: { id: orderId } })
      expect(paid!.paymentStatus).toBe('PAID')
    })
  })

  describe('table merging: merge -> combined bill -> settle whole group', () => {
    let tableA: string, tableB: string
    let categoryId: string, itemId: string
    let groupId: string
    let orderA: string, orderB: string

    beforeAll(async () => {
      const cat = await prisma.menuCategory.create({ data: { name: 'E2E Smoke Category 2', sortOrder: 999 } })
      created.categoryIds.push(cat.id); categoryId = cat.id
      const item = await prisma.menuItem.create({ data: { categoryId, name: 'E2E Smoke Item 2', price: 10, isAvailable: true } })
      created.itemIds.push(item.id); itemId = item.id

      const ta = await prisma.restaurantTable.create({ data: { tableNumber: RUN_BASE + 2, name: 'E2E-Smoke-B', capacity: 2, qrCode: `e2e-smoke-b-${Date.now()}` } })
      const tb = await prisma.restaurantTable.create({ data: { tableNumber: RUN_BASE + 3, name: 'E2E-Smoke-C', capacity: 2, qrCode: `e2e-smoke-c-${Date.now()}` } })
      created.tableIds.push(ta.id, tb.id)
      tableA = ta.id; tableB = tb.id
    })

    it('merges two tables', async () => {
      const res = await http.post('/api/v1/tables/merge').set(auth()).send({ tableIds: [tableA, tableB], label: 'E2E Smoke Party' })
      expect(res.status).toBe(201)
      groupId = res.body.data.id
      created.groupIds.push(groupId)
    })

    it('rejects merging an already-grouped table', async () => {
      const thirdTable = await prisma.restaurantTable.create({ data: { tableNumber: RUN_BASE + 4, name: 'E2E-Smoke-D', capacity: 2, qrCode: `e2e-smoke-d-${Date.now()}` } })
      created.tableIds.push(thirdTable.id)
      const res = await http.post('/api/v1/tables/merge').set(auth()).send({ tableIds: [tableA, thirdTable.id] })
      expect(res.status).toBe(400)
    })

    it('places orders on both merged tables and sees one combined bill', async () => {
      const rA = await http.post(`/api/v1/orders/table/${tableA}/staff-order`).set(auth()).send({ items: [{ menuItemId: itemId, quantity: 1 }] })
      const rB = await http.post(`/api/v1/orders/table/${tableB}/staff-order`).set(auth()).send({ items: [{ menuItemId: itemId, quantity: 2 }] })
      orderA = rA.body.data?.id; orderB = rB.body.data?.id
      if (orderA) created.orderIds.push(orderA)
      if (orderB) created.orderIds.push(orderB)
      expect(rA.status).toBe(201); expect(rB.status).toBe(201)

      const bills = await http.get('/api/v1/orders/active-bills').set(auth())
      const merged = bills.body.data.find((e: any) => e.groupId === groupId)
      expect(merged).toBeTruthy()
      expect(merged.mergedTables.length).toBe(2)
      // 10 + 20 = 30 subtotal, +5% VAT = 31.5
      expect(Number(merged.combined.total)).toBeCloseTo(31.5, 1)
    })

    it('settles the whole group in one call and closes it', async () => {
      const res = await http.post(`/api/v1/payments/group/${groupId}/settle`).set(auth()).send({ method: 'CASH' })
      expect(res.status).toBe(201)
      expect(res.body.data.settled).toBe(2)
      expect(Number(res.body.data.total)).toBeCloseTo(31.5, 1)

      const group = await prisma.tableGroup.findUnique({ where: { id: groupId } })
      expect(group!.closedAt).not.toBeNull()

      const tables = await prisma.restaurantTable.findMany({ where: { id: { in: [tableA, tableB] } } })
      expect(tables.every(t => t.status === 'DIRTY')).toBe(true)
    })
  })

  describe('ASP (market-price) items block guest self-checkout', () => {
    let categoryId: string, itemId: string

    beforeAll(async () => {
      const cat = await prisma.menuCategory.create({ data: { name: 'E2E Smoke ASP Category', sortOrder: 999 } })
      created.categoryIds.push(cat.id); categoryId = cat.id
      const item = await prisma.menuItem.create({ data: { categoryId, name: 'E2E Smoke Market Fish', price: 50, isAvailable: true, isMarketPrice: true } })
      created.itemIds.push(item.id); itemId = item.id
    })

    it('rejects a guest order for an ASP item', async () => {
      const res = await http.post('/api/v1/orders').send({
        type: 'TAKEAWAY', contactPhone: '971500000999', items: [{ menuItemId: itemId, quantity: 1 }],
      })
      expect(res.status).toBe(400)
    })

    it('accepts a staff order for an ASP item with a customPrice quote', async () => {
      const res = await http.post('/api/v1/orders').set(auth()).send({
        type: 'TAKEAWAY', contactPhone: '971500000999',
        items: [{ menuItemId: itemId, quantity: 1, customPrice: 65 }],
      })
      if (res.body.data?.id) created.orderIds.push(res.body.data.id)
      expect(res.status).toBe(201)
      expect(Number(res.body.data.subtotal)).toBeCloseTo(65, 1)
    })
  })

  describe('seasonal offers apply automatically at order time', () => {
    let categoryId: string, itemId: string, offerId: string

    beforeAll(async () => {
      const cat = await prisma.menuCategory.create({ data: { name: 'E2E Smoke Offer Category', sortOrder: 999 } })
      created.categoryIds.push(cat.id); categoryId = cat.id
      const item = await prisma.menuItem.create({ data: { categoryId, name: 'E2E Smoke Discounted Item', price: 100, isAvailable: true } })
      created.itemIds.push(item.id); itemId = item.id
    })

    it('creates a 20% off offer scoped to this item', async () => {
      const res = await http.post('/api/v1/offers').set(auth()).send({
        name: 'E2E Smoke Offer', scope: 'ITEM', itemIds: [itemId], type: 'PERCENT', value: 20,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3600_000).toISOString(),
        isActive: true,
      })
      offerId = res.body.data?.id
      if (offerId) created.offerIds.push(offerId)
      expect(res.status).toBe(201)
    })

    it('order for that item is priced with the discount applied', async () => {
      const res = await http.post('/api/v1/orders').send({
        type: 'TAKEAWAY', contactPhone: '971500000998', items: [{ menuItemId: itemId, quantity: 1 }],
      })
      if (res.body.data?.id) created.orderIds.push(res.body.data.id)
      expect(res.status).toBe(201)
      expect(Number(res.body.data.subtotal)).toBeCloseTo(80, 1) // 100 - 20%
    })
  })
})
