# Al Manzil — Staff Portal Documentation

## What Is This System

Al Manzil is a Dubai roadside hotel ordering system for a Kerala / South Indian cuisine restaurant.
It has a customer-facing side (table QR ordering) and a **staff portal** (web app for staff/managers/owners).
This document covers the staff portal only.

**Tech stack:**
- Frontend: Next.js 15 App Router, Tailwind CSS v4, Zustand
- Backend: NestJS with URI versioning (`/api/v1/...`)
- NestJS wraps all responses: `{ success, data, timestamp }` — always unwrap with `payload = json?.data ?? json`
- Auth: JWT stored in localStorage, managed via Zustand `useAuthStore`
- Theme: dark/light via `useThemeStore`

---

## Pages & Status

### `/staff/login`
- **Status:** Done
- Login form, no layout wrapper applied

### `/staff/orders`
- **Status:** Exists, not redesigned
- Real-time order management for staff/kitchen

### `/staff/kitchen`
- **Status:** Exists, not redesigned
- Kitchen display — incoming orders

### `/staff/tables`
- **Status:** Exists, not redesigned
- Table map / table status view

### `/staff/bookings`
- **Status:** Exists, not redesigned
- Reservation management

### `/staff/menu`
- **Status:** ✅ Redesigned
- Owner/Manager only
- **Layout:** Horizontal category pill tabs + responsive image card grid (2 → 3 → 4 → 5 cols per breakpoint)
- **Header:** Page title + stat pills (total items / categories / active count) + search bar + Add Item button
- **Cards:** Full-bleed image, item name, price, availability toggle, edit + delete actions
- **Live updates:** Edit and delete update state optimistically — no page reload needed
- **Add item:** Inline form inside the category tab bar (no modal/popup)

### `/staff/analytics`
- **Status:** Exists, not redesigned
- Owner/Manager only
- Revenue and order analytics

### `/staff/settings`
- **Status:** ✅ Redesigned
- Owner/Manager only
- **Layout:** Single scrollable page with 7 accordion sections (no separate page per section)
- **Always visible at top:** Homepage preview banner + Save All button
- **Sections:**
  1. Restaurant — name, description, cuisine, contact
  2. Hours — opening/closing times per day
  3. Tables — table count, QR config
  4. Orders & VAT — order settings, VAT rate
  5. Bookings — peak hours, no-show policy
  6. Notifications — alert preferences
  7. Appearance — theme/branding options

---

## Layout (`/staff/layout.tsx`)

The layout wraps all staff pages (except login).

**Key things:**
- Desktop: collapsible sidebar (`w-56` ↔ `w-16`), dark bg `bg-gray-900 dark:bg-gray-950`
- Mobile: hamburger → slide-in drawer overlay
- `<main>` is `flex-1 overflow-auto bg-gray-50 dark:bg-gray-900` — child pages must NOT create their own scroll containers or fixed-height wrappers
- Auth guard: uses `ready` flag to prevent redirect before localStorage is read on mount

```ts
// Auth race condition fix
const [ready, setReady] = useState(false)
useEffect(() => { init(); setReady(true) }, [])
useEffect(() => {
  if (ready && pathname !== '/staff/login' && !token) router.replace('/staff/login')
}, [ready, token, pathname])
if (pathname === '/staff/login') return <>{children}</>
if (!ready || !token) return null
```

---

## Auth Store (`/store/auth.ts`)

Zustand store — no persist middleware, manual localStorage.

```ts
init()     // reads token + user from localStorage on mount
setAuth()  // saves to localStorage + Zustand
logout()   // clears localStorage + Zustand
```

---

## Global CSS (`globals.css`)

Scrollbars hidden globally:
```css
* { scrollbar-width: none; -ms-overflow-style: none; }
*::-webkit-scrollbar { display: none; }
```

---

## Roles

| Role    | Pages accessible |
|---------|-----------------|
| STAFF   | Orders, Kitchen, Tables, Bookings |
| MANAGER | + Menu, Analytics, Settings |
| OWNER   | All |

---

## Flows Implemented

### Menu flow
1. Page loads → fetch categories with nested items from `/api/v1/menu/categories`
2. User picks category tab → grid filters to that category's items
3. Add item → inline form in tabs bar → POST `/api/v1/menu/items` → optimistic add to state
4. Edit item → slide-in edit panel → PUT `/api/v1/menu/items/:id` → optimistic update in state
5. Toggle availability → PATCH → optimistic toggle in state
6. Delete → confirm modal → DELETE `/api/v1/menu/items/:id` → filter out from state

### Settings flow
1. Page loads → fetch restaurant config from API
2. User opens an accordion section (click header)
3. Edits fields inline
4. Clicks Save All → PATCH all changed fields to API

### Auth flow
1. Login → POST `/api/v1/auth/login` → receive `{ token, user }`
2. `setAuth(user, token)` → saves to localStorage + Zustand
3. On any page mount → `init()` reads localStorage → restores session
4. Logout → clears localStorage + Zustand → redirect to `/staff/login`

---

## Things Fixed (Session History)

| Issue | Fix |
|-------|-----|
| Refresh logged user out | Added `ready` flag — redirect waits for `init()` to complete |
| Dark footer block on menu page | Removed the page's own `h-[calc(100vh-56px)] overflow-hidden bg-gray-950` wrapper |
| Menu updates needed page reload | Replaced `load()` calls with optimistic state updates |
| Mobile menu sidebar broken | Replaced sidebar layout with horizontal category tabs |
| Scrollbar visible everywhere | Added global CSS to hide scrollbars |
| Settings tiles looked empty | Redesigned from square grid cards to horizontal list rows |
| Settings inner pages were mostly empty space | Replaced page-navigation with inline accordion |

---

## TODO / Still Needed

### High priority
- [ ] **Light mode** — all pages look like a plain white board; need proper contrast, depth, subtle backgrounds and borders in light theme
- [ ] **Orders page** — redesign to match the visual standard of Menu and Settings
- [ ] **Tables page** — redesign
- [ ] **Bookings page** — redesign
- [ ] **Analytics page** — redesign
- [ ] **Kitchen page** — redesign

### Medium priority
- [ ] Customer-facing QR ordering flow (table scan → menu → cart → place order)
- [ ] Real-time order notifications (WebSocket or polling) for kitchen + orders page
- [ ] Image upload for menu items (currently uses URL input)

### Nice to have
- [ ] Drag-to-reorder menu categories and items
- [ ] Print-friendly QR code page per table
- [ ] Export analytics as CSV/PDF

---

## File Map

```
apps/web/
├── app/
│   ├── staff/
│   │   ├── layout.tsx          ← auth guard + sidebar + mobile drawer
│   │   ├── login/page.tsx
│   │   ├── orders/page.tsx
│   │   ├── kitchen/page.tsx
│   │   ├── tables/page.tsx
│   │   ├── bookings/page.tsx
│   │   ├── menu/page.tsx       ← ✅ redesigned
│   │   ├── analytics/page.tsx
│   │   └── settings/page.tsx   ← ✅ redesigned
│   └── globals.css             ← global scrollbar hide
├── store/
│   ├── auth.ts                 ← JWT auth store
│   └── theme.ts                ← dark/light theme store
└── components/
    └── ui/                     ← shared UI components (Card, Button, etc.)
```
