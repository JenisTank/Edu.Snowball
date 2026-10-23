-- BumbleB Kidz ERP — initial schema
-- Generated from prisma/schema.prisma

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM (
  'FOUNDER',
  'ACADEMIC_DIR',
  'CURRICULUM_LEAD',
  'CENTRE_HEAD',
  'COORDINATOR',
  'TEACHER',
  'RECEPTIONIST',
  'HR_MANAGER'
);

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM (
  'COMPANY_OWNED',
  'FRANCHISE'
);

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM (
  'ACTIVE',
  'DEVELOPMENT',
  'INACTIVE'
);

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM (
  'NEW_INQUIRY',
  'FIRST_BUZZ',
  'ROUTING',
  'EXPERIENCE_SESSION',
  'DISCOVERY_FLIGHT',
  'OFFER',
  'CONFIRMATION',
  'ENROLLED',
  'LOST'
);

-- CreateEnum
CREATE TYPE "InquiryChannel" AS ENUM (
  'CALL',
  'WHATSAPP',
  'WEBSITE',
  'SOCIAL',
  'EVENT',
  'REFERRAL',
  'WALK_IN'
);

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM (
  'REGISTERED',
  'ACTIVE',
  'TC_ISSUED',
  'GRADUATED',
  'WITHDRAWN'
);

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM (
  'PRESENT',
  'ABSENT',
  'LEAVE'
);

-- CreateEnum
CREATE TYPE "ScreeningResult" AS ENUM (
  'EP',
  'GP',
  'SP',
  'NP',
  'ND'
);

-- CreateEnum
CREATE TYPE "InstalmentPlan" AS ENUM (
  'PLAN_A',
  'PLAN_B',
  'PLAN_C'
);

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM (
  'CASH',
  'CHEQUE',
  'UPI',
  'UPI_QR',
  'POS',
  'NEFT'
);

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM (
  'PRESCHOOL',
  'EVENING'
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "UnitType" DEFAULT 'COMPANY_OWNED' NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "status" "UnitStatus" DEFAULT 'ACTIVE' NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateTable
CREATE TABLE "unit_settings" (
    "unit_id" UUID NOT NULL,
    "petty_cash_float" DECIMAL(10, 2) DEFAULT 5000.00 NOT NULL,
    "admission_number" TEXT,
    "phone" TEXT,
    "upi_vpa" TEXT,
    "upi_payee_name" TEXT,
    "pt_enabled" BOOLEAN DEFAULT true NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "unit_settings_pkey" PRIMARY KEY ("unit_id")
);


-- CreateTable
CREATE TABLE "programmes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier_name" TEXT NOT NULL,
    "age_min" DECIMAL(4, 1) NOT NULL,
    "age_max" DECIMAL(4, 1) NOT NULL,
    "level_colour" TEXT NOT NULL,
    "sort_order" INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "programmes_code_key" ON "programmes"("code");

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "medium" TEXT,
    "shift" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "capacity" INTEGER NOT NULL,
    "academic_year" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "unit_id" UUID,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "area_master" (
    "id" UUID NOT NULL,
    "locality" TEXT NOT NULL,
    "pincode" TEXT,
    "suggested_unit_id" UUID NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "area_master_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "inquiry_no" TEXT NOT NULL,
    "stage" "LeadStage" DEFAULT 'NEW_INQUIRY' NOT NULL,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT NOT NULL,
    "parent_email" TEXT,
    "child_name" TEXT,
    "child_dob" DATE,
    "programme_interest_id" UUID,
    "area_locality" TEXT,
    "preferred_unit" TEXT,
    "suggested_unit_id" UUID,
    "assigned_unit_id" UUID,
    "routing_notes" TEXT,
    "inquiry_channel" "InquiryChannel" DEFAULT 'CALL' NOT NULL,
    "experience_interest" BOOLEAN DEFAULT false NOT NULL,
    "lead_score" INTEGER DEFAULT 0 NOT NULL,
    "source_campaign" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leads_inquiry_no_key" ON "leads"("inquiry_no");

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "admission_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "gender" TEXT,
    "photo_url" TEXT,
    "blood_group" TEXT,
    "allergies" TEXT,
    "medical_notes" TEXT,
    "father_name" TEXT,
    "father_phone" TEXT,
    "mother_name" TEXT,
    "mother_phone" TEXT,
    "guardian_email" TEXT,
    "address_area" TEXT,
    "programme_id" UUID,
    "batch_id" UUID,
    "admission_date" DATE,
    "orientation_date" DATE,
    "anonymised_at" TIMESTAMP(3),
    "instalment_plan" "InstalmentPlan",
    "status" "StudentStatus" DEFAULT 'ACTIVE' NOT NULL,
    "academic_year" TEXT NOT NULL,
    "sibling_group" TEXT,
    "lead_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "students_admission_no_key" ON "students"("admission_no");
CREATE UNIQUE INDEX "students_lead_id_key" ON "students"("lead_id");

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "student_id" UUID,
    "child_name" TEXT NOT NULL,
    "guardian_phone" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'WAITING' NOT NULL,
    "note" TEXT,
    "offered_at" TIMESTAMP(3),
    "offer_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waitlist_entries_unit_id_status_position_idx" ON "waitlist_entries"("unit_id", "status", "position");
CREATE INDEX "waitlist_entries_batch_id_status_idx" ON "waitlist_entries"("batch_id", "status");

-- CreateTable
CREATE TABLE "discovery_flights" (
    "id" UUID NOT NULL,
    "lead_id" UUID,
    "student_id" UUID,
    "unit_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "conducted_at" TIMESTAMP(3),
    "result_code" "ScreeningResult",
    "recommendation" TEXT,
    "notes" TEXT,
    "internal_only" BOOLEAN DEFAULT true NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "discovery_flights_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" DEFAULT 'ABSENT' NOT NULL,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3),
    "is_locked" BOOLEAN DEFAULT false NOT NULL,
    "lock_time" TIMESTAMP(3),
    "override_by_id" UUID,
    "override_reason" TEXT,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_records_student_id_date_batch_id_key" ON "attendance_records"("student_id", "date", "batch_id");

-- CreateTable
CREATE TABLE "student_leaves" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "type" TEXT DEFAULT 'PLANNED' NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT DEFAULT 'PENDING' NOT NULL,
    "source" TEXT DEFAULT 'PARENT' NOT NULL,
    "applied_by_id" UUID,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "student_leaves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_leaves_student_id_from_date_idx" ON "student_leaves"("student_id", "from_date");
CREATE INDEX "student_leaves_unit_id_status_from_date_idx" ON "student_leaves"("unit_id", "status", "from_date");

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "total_fee" DECIMAL(10, 2) NOT NULL,
    "instalment_1" DECIMAL(10, 2),
    "instalment_2" DECIMAL(10, 2),
    "instalment_3" DECIMAL(10, 2),
    "sibling_discount_pct" DECIMAL(5, 2),
    "locked" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_structures_unit_id_programme_id_academic_year_key" ON "fee_structures"("unit_id", "programme_id", "academic_year");

-- CreateTable
CREATE TABLE "fee_transactions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "ledger_type" "LedgerType" DEFAULT 'PRESCHOOL' NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "discount" DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    "fine" DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "payment_date" DATE NOT NULL,
    "instalment_no" INTEGER,
    "receipt_no" TEXT NOT NULL,
    "remarks" TEXT,
    "is_cancelled" BOOLEAN DEFAULT false NOT NULL,
    "collected_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "fee_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_transactions_receipt_no_key" ON "fee_transactions"("receipt_no");

-- CreateTable
CREATE TABLE "fee_addons" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "ledger_type" "LedgerType" DEFAULT 'PRESCHOOL' NOT NULL,
    "status" TEXT DEFAULT 'PENDING' NOT NULL,
    "payment_mode" "PaymentMode",
    "reference" TEXT,
    "notes" TEXT,
    "billed_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "settled_at" TIMESTAMP(3),
    "settled_by_id" UUID,
    "created_by_id" UUID,
    CONSTRAINT "fee_addons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_addons_unit_id_status_idx" ON "fee_addons"("unit_id", "status");
CREATE INDEX "fee_addons_student_id_billed_at_idx" ON "fee_addons"("student_id", "billed_at");

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ip_address" TEXT,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "serial_no" TEXT NOT NULL,
    "payload" JSONB,
    "issued_by_id" UUID,
    "issued_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificates_serial_no_key" ON "certificates"("serial_no");

-- CreateTable
CREATE TABLE "message_logs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT DEFAULT 'WHATSAPP' NOT NULL,
    "recipient" TEXT NOT NULL,
    "student_id" UUID,
    "unit_id" UUID,
    "payload" JSONB,
    "status" TEXT DEFAULT 'QUEUED' NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "attempts" INTEGER DEFAULT 0 NOT NULL,
    "last_error" TEXT,
    "delivered_via" TEXT,
    "template_code" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT DEFAULT 'WHATSAPP' NOT NULL,
    "language" TEXT DEFAULT 'en' NOT NULL,
    "body" TEXT NOT NULL,
    "meta_template" TEXT,
    "approved" BOOLEAN DEFAULT false NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_templates_code_key" ON "message_templates"("code");

-- CreateTable
CREATE TABLE "consent_log" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "consent_type" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "consent_log_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_phone_idx" ON "push_subscriptions"("phone");

-- CreateTable
CREATE TABLE "parent_messages" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "parent_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parent_messages_student_id_created_at_idx" ON "parent_messages"("student_id", "created_at");
CREATE INDEX "parent_messages_unit_id_created_at_idx" ON "parent_messages"("unit_id", "created_at");

-- CreateTable
CREATE TABLE "student_lifecycle_records" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "tab" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "visibility" TEXT DEFAULT 'STAFF_PARENT' NOT NULL,
    "status" TEXT,
    "event_date" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_lifecycle_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_lifecycle_records_student_id_tab_idx" ON "student_lifecycle_records"("student_id", "tab");
CREATE INDEX "student_lifecycle_records_unit_id_idx" ON "student_lifecycle_records"("unit_id");

-- CreateTable
CREATE TABLE "academic_plans" (
    "id" UUID NOT NULL,
    "unit_id" UUID,
    "programme_id" UUID,
    "academic_year" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "month" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "parent_visible" BOOLEAN DEFAULT false NOT NULL,
    "payload" JSONB,
    "authored_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "version" INTEGER DEFAULT 1 NOT NULL,
    "locked_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "master_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "academic_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "academic_plans_academic_year_kind_idx" ON "academic_plans"("academic_year", "kind");
CREATE INDEX "academic_plans_unit_id_idx" ON "academic_plans"("unit_id");
CREATE INDEX "academic_plans_master_id_idx" ON "academic_plans"("master_id");

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "unit_id" UUID,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reorder_level" INTEGER DEFAULT 0 NOT NULL,
    "quantity" INTEGER DEFAULT 0 NOT NULL,
    "unit_cost" DECIMAL(10,2) DEFAULT 0 NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "reference" TEXT,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_movements_unit_id_created_at_idx" ON "inventory_movements"("unit_id", "created_at");

-- CreateTable
CREATE TABLE "ptm_sessions" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "batch_id" UUID,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT DEFAULT 'SCHEDULED' NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ptm_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ptm_sessions_unit_id_scheduled_at_idx" ON "ptm_sessions"("unit_id", "scheduled_at");

-- CreateTable
CREATE TABLE "ptm_records" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attended" BOOLEAN DEFAULT false NOT NULL,
    "parent_names" TEXT,
    "teacher_notes" TEXT,
    "signed_form_url" TEXT,
    "recorded_by_id" TEXT,
    "recorded_at" TIMESTAMP(3),
    CONSTRAINT "ptm_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ptm_records_session_id_student_id_key" ON "ptm_records"("session_id", "student_id");

-- CreateTable
CREATE TABLE "evening_activities" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT,
    "fee" DECIMAL(10,2) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "evening_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evening_activities_unit_id_idx" ON "evening_activities"("unit_id");

-- CreateTable
CREATE TABLE "evening_enrollments" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "student_id" UUID,
    "participant_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" TEXT DEFAULT 'ACTIVE' NOT NULL,
    "amount_due" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "evening_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evening_enrollments_activity_id_student_id_key" ON "evening_enrollments"("activity_id", "student_id");
CREATE UNIQUE INDEX "evening_enrollments_activity_id_participant_id_key" ON "evening_enrollments"("activity_id", "participant_id");

-- CreateTable
CREATE TABLE "evening_payments" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "receipt_no" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "collected_by_id" UUID,
    CONSTRAINT "evening_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evening_payments_receipt_no_key" ON "evening_payments"("receipt_no");

-- CreateTable
CREATE TABLE "online_payments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "ledger_type" "LedgerType" DEFAULT 'PRESCHOOL' NOT NULL,
    "provider" TEXT DEFAULT 'UPI' NOT NULL,
    "mode" TEXT DEFAULT 'QR' NOT NULL,
    "order_id" TEXT NOT NULL,
    "upi_link" TEXT,
    "payer_ref" TEXT,
    "provider_payment_id" TEXT,
    "status" TEXT DEFAULT 'CREATED' NOT NULL,
    "failure_reason" TEXT,
    "transaction_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "online_payments_order_id_key" ON "online_payments"("order_id");
CREATE UNIQUE INDEX "online_payments_transaction_id_key" ON "online_payments"("transaction_id");
CREATE INDEX "online_payments_student_id_status_idx" ON "online_payments"("student_id", "status");
CREATE INDEX "online_payments_unit_id_created_at_idx" ON "online_payments"("unit_id", "created_at");

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "unit_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "pre_approved" BOOLEAN DEFAULT false NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendors_code_key" ON "vendors"("code");
CREATE INDEX "vendors_unit_id_active_idx" ON "vendors"("unit_id", "active");

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "requested_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_requests_unit_id_status_idx" ON "purchase_requests"("unit_id", "status");

-- CreateTable
CREATE TABLE "purchase_request_lines" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "estimated_cost" DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_request_lines_request_id_idx" ON "purchase_request_lines"("request_id");

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "request_id" UUID,
    "po_no" TEXT NOT NULL,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "ordered_at" TIMESTAMP(3),
    "expected_at" DATE,
    "total_amount" DECIMAL(12, 2) DEFAULT 0 NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_po_no_key" ON "purchase_orders"("po_no");
CREATE INDEX "purchase_orders_unit_id_status_idx" ON "purchase_orders"("unit_id", "status");

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    "received_qty" INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_lines_order_id_idx" ON "purchase_order_lines"("order_id");

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "grn_no" TEXT NOT NULL,
    "invoice_no" TEXT,
    "invoice_date" DATE,
    "received_by_id" UUID,
    "notes" TEXT,
    "received_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goods_receipts_grn_no_key" ON "goods_receipts"("grn_no");
CREATE INDEX "goods_receipts_unit_id_received_at_idx" ON "goods_receipts"("unit_id", "received_at");

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "order_line_id" UUID,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "goods_receipt_lines"("receipt_id");

-- CreateTable
CREATE TABLE "petty_cash_entries" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "receipt_ref" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "petty_cash_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "petty_cash_entries_unit_id_date_idx" ON "petty_cash_entries"("unit_id", "date");

-- CreateTable
CREATE TABLE "inward_outward_entries" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "handled_by_id" UUID,
    "acknowledged" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "inward_outward_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inward_outward_entries_unit_id_date_idx" ON "inward_outward_entries"("unit_id", "date");

-- CreateTable
CREATE TABLE "evening_participants" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "dob" DATE,
    "guardian_name" TEXT,
    "guardian_phone" TEXT,
    "school" TEXT,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "evening_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evening_participants_unit_id_active_idx" ON "evening_participants"("unit_id", "active");

-- CreateTable
CREATE TABLE "evening_sessions" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "topic" TEXT,
    "status" TEXT DEFAULT 'SCHEDULED' NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "evening_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evening_sessions_activity_id_date_key" ON "evening_sessions"("activity_id", "date");

-- CreateTable
CREATE TABLE "evening_attendance" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID,
    "participant_id" UUID,
    "status" TEXT DEFAULT 'PRESENT' NOT NULL,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMP(3),
    CONSTRAINT "evening_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evening_attendance_session_id_student_id_key" ON "evening_attendance"("session_id", "student_id");
CREATE UNIQUE INDEX "evening_attendance_session_id_participant_id_key" ON "evening_attendance"("session_id", "participant_id");
CREATE INDEX "evening_attendance_session_id_idx" ON "evening_attendance"("session_id");

-- CreateTable
CREATE TABLE "ptm_slots" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "student_id" UUID,
    "booked_at" TIMESTAMP(3),
    "booked_by_id" UUID,
    "notes" TEXT,
    CONSTRAINT "ptm_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ptm_slots_session_id_start_time_key" ON "ptm_slots"("session_id", "start_time");
CREATE INDEX "ptm_slots_session_id_idx" ON "ptm_slots"("session_id");

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "date_of_birth" DATE,
    "joining_date" DATE NOT NULL,
    "relieving_date" DATE,
    "status" TEXT DEFAULT 'ACTIVE' NOT NULL,
    "unit_id" UUID NOT NULL,
    "department" TEXT,
    "designation" TEXT NOT NULL,
    "reporting_manager_id" UUID,
    "employment_type" TEXT NOT NULL,
    "bank_account_name" TEXT,
    "bank_account_no" TEXT,
    "bank_ifsc" TEXT,
    "pan" TEXT,
    "uan" TEXT,
    "esic_number" TEXT,
    "pf_enabled" BOOLEAN DEFAULT false NOT NULL,
    "esic_enabled" BOOLEAN DEFAULT false NOT NULL,
    "pt_enabled" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_employee_no_key" ON "employees"("employee_no");
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");
CREATE INDEX "employees_unit_id_status_idx" ON "employees"("unit_id", "status");
CREATE INDEX "employees_reporting_manager_id_idx" ON "employees"("reporting_manager_id");

-- CreateTable
CREATE TABLE "employment_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "unit_id" UUID NOT NULL,
    "department" TEXT,
    "designation" TEXT NOT NULL,
    "employment_type" TEXT NOT NULL,
    "reporting_manager_id" UUID,
    "reason" TEXT,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employment_history_employee_id_effective_from_idx" ON "employment_history"("employee_id", "effective_from");

-- CreateTable
CREATE TABLE "hr_shifts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "working_minutes" INTEGER NOT NULL,
    "half_day_minutes" INTEGER NOT NULL,
    "ot_trigger_time" TEXT,
    "active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "hr_shifts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hr_shifts_code_key" ON "hr_shifts"("code");

-- CreateTable
CREATE TABLE "employee_shifts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    CONSTRAINT "employee_shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_shifts_employee_id_effective_from_idx" ON "employee_shifts"("employee_id", "effective_from");

-- CreateTable
CREATE TABLE "hr_holidays" (
    "id" UUID NOT NULL,
    "unit_id" UUID,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "hr_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hr_holidays_unit_id_date_key" ON "hr_holidays"("unit_id", "date");

-- CreateTable
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "calculation_type" TEXT NOT NULL,
    "default_value" DECIMAL(12,4) DEFAULT 0 NOT NULL,
    "pf_applicable" BOOLEAN DEFAULT false NOT NULL,
    "esic_applicable" BOOLEAN DEFAULT false NOT NULL,
    "pt_applicable" BOOLEAN DEFAULT false NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_components_code_key" ON "salary_components"("code");

-- CreateTable
CREATE TABLE "employee_salary_components" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    CONSTRAINT "employee_salary_components_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_salary_components_employee_id_effective_from_idx" ON "employee_salary_components"("employee_id", "effective_from");

-- CreateTable
CREATE TABLE "attendance_imports" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT DEFAULT 'PROCESSED' NOT NULL,
    "totalRows" INTEGER DEFAULT 0 NOT NULL,
    "errorRows" INTEGER DEFAULT 0 NOT NULL,
    "imported_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "attendance_imports_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "first_in" TIMESTAMP(3),
    "last_out" TIMESTAMP(3),
    "worked_minutes" INTEGER DEFAULT 0 NOT NULL,
    "late_minutes" INTEGER DEFAULT 0 NOT NULL,
    "status" TEXT DEFAULT 'PRESENT' NOT NULL,
    "exception" TEXT,
    "exception_resolved" BOOLEAN DEFAULT false NOT NULL,
    "correction_reason" TEXT,
    "import_id" UUID,
    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_attendance_employee_id_date_key" ON "staff_attendance"("employee_id", "date");
CREATE INDEX "staff_attendance_date_exception_resolved_idx" ON "staff_attendance"("date", "exception_resolved");

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "leaveType" TEXT NOT NULL,
    "allocation" DECIMAL(6,2) NOT NULL,
    "carry_forward_cap" DECIMAL(6,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_policies_year_leaveType_key" ON "leave_policies"("year", "leaveType");

-- CreateTable
CREATE TABLE "staff_leaves" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leaveType" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT DEFAULT 'PENDING_MANAGER' NOT NULL,
    "manager_approved_by_id" UUID,
    "hr_approved_by_id" UUID,
    "is_lwp" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "staff_leaves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_leaves_employee_id_from_date_idx" ON "staff_leaves"("employee_id", "from_date");

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "leaveType" TEXT NOT NULL,
    "opening" DECIMAL(6,2) DEFAULT 0 NOT NULL,
    "allocated" DECIMAL(6,2) DEFAULT 0 NOT NULL,
    "used" DECIMAL(6,2) DEFAULT 0 NOT NULL,
    "carried" DECIMAL(6,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_balances_employee_id_year_leaveType_key" ON "leave_balances"("employee_id", "year", "leaveType");

-- CreateTable
CREATE TABLE "overtime_authorisations" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "expected_minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "multiplier" DECIMAL(5,2) DEFAULT 1 NOT NULL,
    "status" TEXT DEFAULT 'REQUESTED' NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "actual_minutes" INTEGER,
    "eligible_minutes" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "overtime_authorisations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "overtime_authorisations_employee_id_date_key" ON "overtime_authorisations"("employee_id", "date");

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "unit_id" UUID,
    "status" TEXT DEFAULT 'DRAFT' NOT NULL,
    "version" INTEGER DEFAULT 1 NOT NULL,
    "created_by_id" UUID NOT NULL,
    "submitted_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "reversal_of_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_runs_type_month_unit_id_version_key" ON "payroll_runs"("type", "month", "unit_id", "version");

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "deductions" DECIMAL(12,2) NOT NULL,
    "employer_contributions" DECIMAL(12,2) DEFAULT 0 NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "worked_minutes" INTEGER DEFAULT 0 NOT NULL,
    "ot_minutes" INTEGER DEFAULT 0 NOT NULL,
    "lwp_days" DECIMAL(6,2) DEFAULT 0 NOT NULL,
    "details" JSONB NOT NULL,
    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_lines_run_id_employee_id_key" ON "payroll_lines"("run_id", "employee_id");

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT DEFAULT 'APPROVED' NOT NULL,
    "source_run_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_adjustments_employee_id_month_idx" ON "payroll_adjustments"("employee_id", "month");

-- CreateTable
CREATE TABLE "employee_minute_rates" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    CONSTRAINT "employee_minute_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_minute_rates_employee_id_effective_from_idx" ON "employee_minute_rates"("employee_id", "effective_from");

-- CreateTable
CREATE TABLE "statutory_schemes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "employee_rate" DECIMAL(7,4) NOT NULL,
    "employer_rate" DECIMAL(7,4) DEFAULT 0 NOT NULL,
    "wage_ceiling" DECIMAL(12,2),
    "calculation_basis" TEXT NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT "statutory_schemes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "statutory_schemes_code_effective_from_idx" ON "statutory_schemes"("code", "effective_from");

-- CreateTable
CREATE TABLE "statutory_slabs" (
    "id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "min_amount" DECIMAL(12,2) NOT NULL,
    "max_amount" DECIMAL(12,2),
    "deduction" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "statutory_slabs_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "security_deposits" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "employee_id" UUID,
    "student_id" UUID,
    "amount" DECIMAL(10, 2) NOT NULL,
    "status" TEXT DEFAULT 'HELD' NOT NULL,
    "collected_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "closed_at" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "security_deposits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_deposits_unit_id_status_idx" ON "security_deposits"("unit_id", "status");
CREATE INDEX "security_deposits_employee_id_idx" ON "security_deposits"("employee_id");
CREATE INDEX "security_deposits_student_id_idx" ON "security_deposits"("student_id");

-- CreateTable
CREATE TABLE "guest_logs" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "guest_name" TEXT NOT NULL,
    "phone" TEXT,
    "organisation" TEXT,
    "purpose" TEXT NOT NULL,
    "host_name" TEXT,
    "badge_no" TEXT,
    "student_id" UUID,
    "in_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "out_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    CONSTRAINT "guest_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_logs_unit_id_in_at_idx" ON "guest_logs"("unit_id", "in_at");

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "kind" TEXT DEFAULT 'OTHER' NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "driver" TEXT DEFAULT 'LOCAL' NOT NULL,
    "notes" TEXT,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" UUID,
    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_documents_storage_key_key" ON "student_documents"("storage_key");
CREATE INDEX "student_documents_student_id_kind_idx" ON "student_documents"("student_id", "kind");
CREATE INDEX "student_documents_unit_id_created_at_idx" ON "student_documents"("unit_id", "created_at");

-- CreateTable
CREATE TABLE "reorder_alerts" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "unit_id" UUID,
    "quantity" INTEGER NOT NULL,
    "reorder_level" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'OPEN' NOT NULL,
    "note" TEXT,
    "raised_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" UUID,
    CONSTRAINT "reorder_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reorder_alerts_status_raised_at_idx" ON "reorder_alerts"("status", "raised_at");
CREATE INDEX "reorder_alerts_item_id_status_idx" ON "reorder_alerts"("item_id", "status");

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);


-- AddForeignKey
ALTER TABLE "unit_settings" ADD CONSTRAINT "unit_settings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batches" ADD CONSTRAINT "batches_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batches" ADD CONSTRAINT "batches_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "area_master" ADD CONSTRAINT "area_master_suggested_unit_id_fkey" FOREIGN KEY ("suggested_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_programme_interest_id_fkey" FOREIGN KEY ("programme_interest_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_suggested_unit_id_fkey" FOREIGN KEY ("suggested_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_unit_id_fkey" FOREIGN KEY ("assigned_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "discovery_flights" ADD CONSTRAINT "discovery_flights_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "discovery_flights" ADD CONSTRAINT "discovery_flights_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "discovery_flights" ADD CONSTRAINT "discovery_flights_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_leaves" ADD CONSTRAINT "student_leaves_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_leaves" ADD CONSTRAINT "student_leaves_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_transactions" ADD CONSTRAINT "fee_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_transactions" ADD CONSTRAINT "fee_transactions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_addons" ADD CONSTRAINT "fee_addons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_addons" ADD CONSTRAINT "fee_addons_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "parent_messages" ADD CONSTRAINT "parent_messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_lifecycle_records" ADD CONSTRAINT "student_lifecycle_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_plans" ADD CONSTRAINT "academic_plans_master_id_fkey" FOREIGN KEY ("master_id") REFERENCES "academic_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ptm_records" ADD CONSTRAINT "ptm_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ptm_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ptm_records" ADD CONSTRAINT "ptm_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evening_enrollments" ADD CONSTRAINT "evening_enrollments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "evening_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evening_enrollments" ADD CONSTRAINT "evening_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evening_enrollments" ADD CONSTRAINT "evening_enrollments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "evening_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evening_payments" ADD CONSTRAINT "evening_payments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "evening_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evening_sessions" ADD CONSTRAINT "evening_sessions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "evening_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evening_attendance" ADD CONSTRAINT "evening_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "evening_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evening_attendance" ADD CONSTRAINT "evening_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evening_attendance" ADD CONSTRAINT "evening_attendance_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "evening_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ptm_slots" ADD CONSTRAINT "ptm_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ptm_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "hr_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_salary_components" ADD CONSTRAINT "employee_salary_components_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_salary_components" ADD CONSTRAINT "employee_salary_components_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overtime_authorisations" ADD CONSTRAINT "overtime_authorisations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_minute_rates" ADD CONSTRAINT "employee_minute_rates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "statutory_slabs" ADD CONSTRAINT "statutory_slabs_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "statutory_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "security_deposits" ADD CONSTRAINT "security_deposits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_logs" ADD CONSTRAINT "guest_logs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reorder_alerts" ADD CONSTRAINT "reorder_alerts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
