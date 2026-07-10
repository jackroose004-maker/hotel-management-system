-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PRE_ORDER', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'VOID', 'REFUND_REQUESTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'SPLIT', 'APPLE_PAY', 'GOOGLE_PAY', 'CHARGE_TO_ROOM');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('EMPTY', 'OCCUPIED', 'BILL_PENDING', 'DIRTY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_NEW', 'ORDER_ACCEPTED', 'ORDER_READY', 'ORDER_CANCELLED', 'BOOKING_CONFIRMED', 'BOOKING_REMINDER', 'BOOKING_CANCELLED', 'PAYMENT_RECEIVED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "staff_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "staff_role_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "dietary_tags" TEXT NOT NULL DEFAULT '',
    "notif_order_updates" BOOLEAN NOT NULL DEFAULT true,
    "notif_booking_reminders" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "otp_code" TEXT,
    "otp_expiry" TIMESTAMP(3),
    "reset_otp_code" TEXT,
    "reset_otp_expiry" TIMESTAMP(3),
    "reset_attempts_today" INTEGER NOT NULL DEFAULT 0,
    "reset_attempts_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clock_in" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clock_out" TIMESTAMP(3),
    "role" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "user_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("user_id","menu_item_id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "description" TEXT,
    "description_ar" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "video_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "prep_time_mins" INTEGER NOT NULL DEFAULT 15,
    "is_special_day" BOOLEAN NOT NULL DEFAULT false,
    "special_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifier_groups" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifier_options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "price_add" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" TEXT NOT NULL,
    "table_number" INTEGER NOT NULL,
    "name" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'EMPTY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_reservable" BOOLEAN NOT NULL DEFAULT true,
    "zone" TEXT NOT NULL DEFAULT 'Indoor',
    "qr_code" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "table_id" TEXT,
    "table_session_id" TEXT,
    "user_id" TEXT,
    "stripe_intent_id" TEXT,
    "token_number" INTEGER,
    "booking_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "split_cash_amount" DECIMAL(10,2),
    "tip_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_method" "PaymentMethod",
    "notes" TEXT,
    "client_ip" TEXT,
    "contact_phone" TEXT,
    "promo_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "is_rush" BOOLEAN NOT NULL DEFAULT false,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "settled_by_id" TEXT,
    "settled_at" TIMESTAMP(3),
    "expected_ready_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_add" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_by_id" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promos" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "PromoType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "min_order_value" DECIMAL(10,2),
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_usages" (
    "id" TEXT NOT NULL,
    "promo_id" TEXT NOT NULL,
    "user_id" TEXT,
    "order_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'WEB',
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_role" "Role",
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "tags" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "table_id" TEXT,
    "party_size" INTEGER NOT NULL,
    "slot_date" DATE NOT NULL,
    "slot_time" TEXT NOT NULL,
    "slot_expires_at" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "notes" TEXT,
    "seating_preference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_strikes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "last_no_show_at" TIMESTAMP(3),
    "blocked_until" TIMESTAMP(3),
    "cancel_count_24h" INTEGER NOT NULL DEFAULT 0,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_strikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_orders" INTEGER NOT NULL,
    "cancelled_orders" INTEGER NOT NULL DEFAULT 0,
    "total_covers" INTEGER NOT NULL DEFAULT 0,
    "gross_revenue" DECIMAL(12,2) NOT NULL,
    "vat_collected" DECIMAL(12,2) NOT NULL,
    "discount_given" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_revenue" DECIMAL(12,2) NOT NULL,
    "cash_revenue" DECIMAL(12,2) NOT NULL,
    "card_revenue" DECIMAL(12,2) NOT NULL,
    "avg_order_value" DECIMAL(10,2) NOT NULL,
    "avg_prep_time_mins" DECIMAL(6,2),
    "avg_rating" DECIMAL(3,2),
    "peak_hour" INTEGER,
    "top_item_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_settings" (
    "id" TEXT NOT NULL,
    "restaurant_name" TEXT NOT NULL DEFAULT 'Al Manzil',
    "restaurant_name_ar" TEXT,
    "tagline" TEXT,
    "tagline_ar" TEXT,
    "hero_config" JSONB,
    "phone" TEXT,
    "address" TEXT,
    "logo_url" TEXT,
    "open_time" TEXT NOT NULL DEFAULT '00:00',
    "close_time" TEXT NOT NULL DEFAULT '00:00',
    "weekly_schedule" JSONB NOT NULL DEFAULT '{"MON":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]},"TUE":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]},"WED":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]},"THU":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]},"FRI":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]},"SAT":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]},"SUN":{"open":true,"shifts":[{"openTime":"00:00","closeTime":"00:00"}]}}',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "default_capacity" INTEGER NOT NULL DEFAULT 4,
    "vat_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "service_charge_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "currency_symbol" TEXT NOT NULL DEFAULT 'AED',
    "default_prep_time_mins" INTEGER NOT NULL DEFAULT 15,
    "bookings_enabled" BOOLEAN NOT NULL DEFAULT true,
    "slot_duration_mins" INTEGER NOT NULL DEFAULT 30,
    "expected_dining_mins" INTEGER NOT NULL DEFAULT 90,
    "table_release_window_mins" INTEGER NOT NULL DEFAULT 60,
    "same_day_cutoff_mins" INTEGER NOT NULL DEFAULT 15,
    "peak_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "peak_ranges" JSONB NOT NULL DEFAULT '[]',
    "no_show_grace_period_off_peak" INTEGER NOT NULL DEFAULT 20,
    "no_show_grace_period_peak" INTEGER NOT NULL DEFAULT 5,
    "max_booking_days_ahead" INTEGER NOT NULL DEFAULT 7,
    "require_login_to_book" BOOLEAN NOT NULL DEFAULT true,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reminder_mins_before" INTEGER NOT NULL DEFAULT 60,
    "brand_preset" TEXT NOT NULL DEFAULT 'amber',
    "brand_color" TEXT NOT NULL DEFAULT '#f59e0b',
    "show_language_toggle" BOOLEAN NOT NULL DEFAULT false,
    "login_desktop_image" TEXT,
    "login_mobile_image" TEXT,
    "vat_number" TEXT,
    "bill_config" JSONB,
    "kot_config" JSONB,
    "split_payment_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tip_enabled" BOOLEAN NOT NULL DEFAULT true,
    "discount_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pre_order_enabled" BOOLEAN NOT NULL DEFAULT true,
    "pre_order_lead_mins" INTEGER NOT NULL DEFAULT 30,
    "kds_enabled" BOOLEAN NOT NULL DEFAULT false,
    "thermal_enabled" BOOLEAN NOT NULL DEFAULT false,
    "thermal_printer_ip" TEXT,
    "thermal_printer_port" INTEGER NOT NULL DEFAULT 9100,
    "smtp_host" TEXT,
    "smtp_port" INTEGER NOT NULL DEFAULT 465,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
    "smtp_user" TEXT,
    "smtp_pass" TEXT,
    "email_from_name" TEXT,
    "email_from_address" TEXT,
    "email_reply_to" TEXT,
    "support_email" TEXT,
    "support_phone" TEXT,
    "social_links" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "locale_enabled" BOOLEAN NOT NULL DEFAULT false,
    "bg_color" TEXT NOT NULL DEFAULT '#f0f0f0',
    "card_theme" TEXT NOT NULL DEFAULT 'light',
    "footer_note" TEXT,
    "footer_no_reply" TEXT,
    "footer_no_reply_ar" TEXT,
    "greeting" TEXT,
    "greeting_ar" TEXT,
    "metadata" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "shifts_user_id_clock_in_idx" ON "shifts"("user_id", "clock_in");

-- CreateIndex
CREATE INDEX "menu_modifier_groups_menu_item_id_idx" ON "menu_modifier_groups"("menu_item_id");

-- CreateIndex
CREATE INDEX "menu_modifier_options_group_id_idx" ON "menu_modifier_options"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_table_number_key" ON "restaurant_tables"("table_number");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_qr_code_key" ON "restaurant_tables"("qr_code");

-- CreateIndex
CREATE INDEX "restaurant_tables_status_idx" ON "restaurant_tables"("status");

-- CreateIndex
CREATE INDEX "restaurant_tables_is_reservable_is_active_idx" ON "restaurant_tables"("is_reservable", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripe_intent_id_key" ON "orders"("stripe_intent_id");

-- CreateIndex
CREATE INDEX "orders_table_session_id_idx" ON "orders"("table_session_id");

-- CreateIndex
CREATE INDEX "orders_booking_id_idx" ON "orders"("booking_id");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_payment_status_idx" ON "orders"("status", "payment_status");

-- CreateIndex
CREATE INDEX "orders_table_id_payment_status_idx" ON "orders"("table_id", "payment_status");

-- CreateIndex
CREATE INDEX "orders_table_id_table_session_id_idx" ON "orders"("table_id", "table_session_id");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_menu_item_id_idx" ON "order_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "order_item_modifiers_order_item_id_idx" ON "order_item_modifiers"("order_item_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "promos_code_key" ON "promos"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promo_usages_order_id_key" ON "promo_usages"("order_id");

-- CreateIndex
CREATE INDEX "promo_usages_promo_id_user_id_idx" ON "promo_usages"("promo_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_created_at_idx" ON "activity_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_order_id_key" ON "feedback"("order_id");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");

-- CreateIndex
CREATE INDEX "bookings_customer_id_slot_date_idx" ON "bookings"("customer_id", "slot_date");

-- CreateIndex
CREATE INDEX "bookings_slot_date_status_idx" ON "bookings"("slot_date", "status");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_table_id_slot_date_slot_time_key" ON "bookings"("table_id", "slot_date", "slot_time");

-- CreateIndex
CREATE UNIQUE INDEX "customer_strikes_customer_id_key" ON "customer_strikes"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_date_key" ON "daily_reports"("date");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "menu_modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_settled_by_id_fkey" FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "menu_modifier_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promos" ADD CONSTRAINT "promos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_strikes" ADD CONSTRAINT "customer_strikes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

