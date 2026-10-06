--
-- PostgreSQL database dump
--

\restrict Jq9bUWjdAO2vycXoHtFy4fdMHD4MB1SNjRBauQU8r2Ahx8lY665bDuWCLgrfkYM

-- Dumped from database version 17.11 (Debian 17.11-0+deb13u1)
-- Dumped by pg_dump version 17.11 (Debian 17.11-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AttendanceStatus; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."AttendanceStatus" AS ENUM (
    'PRESENT',
    'ABSENT',
    'LEAVE'
);


ALTER TYPE public."AttendanceStatus" OWNER TO bumbleb;

--
-- Name: InquiryChannel; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."InquiryChannel" AS ENUM (
    'CALL',
    'WHATSAPP',
    'WEBSITE',
    'SOCIAL',
    'EVENT',
    'REFERRAL',
    'WALK_IN'
);


ALTER TYPE public."InquiryChannel" OWNER TO bumbleb;

--
-- Name: InstalmentPlan; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."InstalmentPlan" AS ENUM (
    'PLAN_A',
    'PLAN_B',
    'PLAN_C'
);


ALTER TYPE public."InstalmentPlan" OWNER TO bumbleb;

--
-- Name: LeadStage; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."LeadStage" AS ENUM (
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


ALTER TYPE public."LeadStage" OWNER TO bumbleb;

--
-- Name: LedgerType; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."LedgerType" AS ENUM (
    'PRESCHOOL',
    'EVENING'
);


ALTER TYPE public."LedgerType" OWNER TO bumbleb;

--
-- Name: PaymentMode; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."PaymentMode" AS ENUM (
    'CASH',
    'CHEQUE',
    'UPI',
    'POS',
    'RAZORPAY',
    'NEFT'
);


ALTER TYPE public."PaymentMode" OWNER TO bumbleb;

--
-- Name: ScreeningResult; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."ScreeningResult" AS ENUM (
    'EP',
    'GP',
    'SP',
    'NP',
    'ND'
);


ALTER TYPE public."ScreeningResult" OWNER TO bumbleb;

--
-- Name: StudentStatus; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."StudentStatus" AS ENUM (
    'REGISTERED',
    'ACTIVE',
    'TC_ISSUED',
    'GRADUATED',
    'WITHDRAWN'
);


ALTER TYPE public."StudentStatus" OWNER TO bumbleb;

--
-- Name: UnitStatus; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."UnitStatus" AS ENUM (
    'ACTIVE',
    'DEVELOPMENT',
    'INACTIVE'
);


ALTER TYPE public."UnitStatus" OWNER TO bumbleb;

--
-- Name: UnitType; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."UnitType" AS ENUM (
    'COMPANY_OWNED',
    'FRANCHISE'
);


ALTER TYPE public."UnitType" OWNER TO bumbleb;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: bumbleb
--

CREATE TYPE public."UserRole" AS ENUM (
    'FOUNDER',
    'ACADEMIC_DIR',
    'CURRICULUM_LEAD',
    'CENTRE_HEAD',
    'COORDINATOR',
    'TEACHER',
    'RECEPTIONIST'
);


ALTER TYPE public."UserRole" OWNER TO bumbleb;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: area_master; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.area_master (
    id uuid NOT NULL,
    locality text NOT NULL,
    pincode text,
    suggested_unit_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.area_master OWNER TO bumbleb;

--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.attendance_records (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    date date NOT NULL,
    status public."AttendanceStatus" DEFAULT 'ABSENT'::public."AttendanceStatus" NOT NULL,
    marked_by_id uuid,
    marked_at timestamp(3) without time zone,
    is_locked boolean DEFAULT false NOT NULL,
    lock_time timestamp(3) without time zone,
    override_by_id uuid,
    override_reason text
);


ALTER TABLE public.attendance_records OWNER TO bumbleb;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.audit_log (
    id uuid NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by_id uuid,
    changed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address text
);


ALTER TABLE public.audit_log OWNER TO bumbleb;

--
-- Name: batches; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.batches (
    id uuid NOT NULL,
    unit_id uuid NOT NULL,
    programme_id uuid NOT NULL,
    name text NOT NULL,
    medium text,
    shift text NOT NULL,
    start_time text NOT NULL,
    end_time text,
    capacity integer NOT NULL,
    academic_year text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.batches OWNER TO bumbleb;

--
-- Name: certificates; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.certificates (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    type text NOT NULL,
    serial_no text NOT NULL,
    payload jsonb,
    issued_by_id uuid,
    issued_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.certificates OWNER TO bumbleb;

--
-- Name: consent_log; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.consent_log (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    consent_type text NOT NULL,
    granted boolean NOT NULL,
    granted_by text NOT NULL,
    granted_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.consent_log OWNER TO bumbleb;

--
-- Name: discovery_flights; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.discovery_flights (
    id uuid NOT NULL,
    lead_id uuid,
    student_id uuid,
    unit_id uuid NOT NULL,
    scheduled_at timestamp(3) without time zone,
    conducted_at timestamp(3) without time zone,
    result_code public."ScreeningResult",
    recommendation text,
    notes text,
    internal_only boolean DEFAULT true NOT NULL,
    approved_by_id uuid,
    approved_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.discovery_flights OWNER TO bumbleb;

--
-- Name: fee_structures; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.fee_structures (
    id uuid NOT NULL,
    unit_id uuid NOT NULL,
    programme_id uuid NOT NULL,
    academic_year text NOT NULL,
    total_fee numeric(10,2) NOT NULL,
    instalment_1 numeric(10,2),
    instalment_2 numeric(10,2),
    instalment_3 numeric(10,2),
    sibling_discount_pct numeric(5,2),
    locked boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.fee_structures OWNER TO bumbleb;

--
-- Name: fee_transactions; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.fee_transactions (
    id uuid NOT NULL,
    student_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    ledger_type public."LedgerType" DEFAULT 'PRESCHOOL'::public."LedgerType" NOT NULL,
    amount numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    fine numeric(10,2) DEFAULT 0 NOT NULL,
    payment_mode public."PaymentMode" NOT NULL,
    reference text,
    payment_date date NOT NULL,
    instalment_no integer,
    receipt_no text NOT NULL,
    remarks text,
    is_cancelled boolean DEFAULT false NOT NULL,
    collected_by_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.fee_transactions OWNER TO bumbleb;

--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.lead_activities (
    id uuid NOT NULL,
    lead_id uuid NOT NULL,
    type text NOT NULL,
    note text,
    meta jsonb,
    by_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.lead_activities OWNER TO bumbleb;

--
-- Name: leads; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.leads (
    id uuid NOT NULL,
    inquiry_no text NOT NULL,
    stage public."LeadStage" DEFAULT 'NEW_INQUIRY'::public."LeadStage" NOT NULL,
    parent_name text NOT NULL,
    parent_phone text NOT NULL,
    parent_email text,
    child_name text,
    child_dob date,
    programme_interest_id uuid,
    area_locality text,
    preferred_unit text,
    suggested_unit_id uuid,
    assigned_unit_id uuid,
    routing_notes text,
    inquiry_channel public."InquiryChannel" DEFAULT 'CALL'::public."InquiryChannel" NOT NULL,
    experience_interest boolean DEFAULT false NOT NULL,
    lead_score integer DEFAULT 0 NOT NULL,
    source_campaign text,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.leads OWNER TO bumbleb;

--
-- Name: message_logs; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.message_logs (
    id uuid NOT NULL,
    type text NOT NULL,
    channel text DEFAULT 'WHATSAPP'::text NOT NULL,
    recipient text NOT NULL,
    student_id uuid,
    unit_id uuid,
    payload jsonb,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    scheduled_for timestamp(3) without time zone,
    sent_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.message_logs OWNER TO bumbleb;

--
-- Name: programmes; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.programmes (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    tier_name text NOT NULL,
    age_min numeric(4,1) NOT NULL,
    age_max numeric(4,1) NOT NULL,
    level_colour text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.programmes OWNER TO bumbleb;

--
-- Name: students; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.students (
    id uuid NOT NULL,
    unit_id uuid NOT NULL,
    admission_no text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    dob date NOT NULL,
    gender text,
    photo_url text,
    blood_group text,
    allergies text,
    medical_notes text,
    father_name text,
    father_phone text,
    mother_name text,
    mother_phone text,
    address_area text,
    programme_id uuid,
    batch_id uuid,
    admission_date date,
    instalment_plan public."InstalmentPlan",
    status public."StudentStatus" DEFAULT 'ACTIVE'::public."StudentStatus" NOT NULL,
    academic_year text NOT NULL,
    sibling_group text,
    lead_id uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.students OWNER TO bumbleb;

--
-- Name: unit_settings; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.unit_settings (
    unit_id uuid NOT NULL,
    petty_cash_float numeric(10,2) DEFAULT 5000.00 NOT NULL,
    admission_number text,
    calendly_link text,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.unit_settings OWNER TO bumbleb;

--
-- Name: units; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.units (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type public."UnitType" DEFAULT 'COMPANY_OWNED'::public."UnitType" NOT NULL,
    address text,
    phone text,
    email text,
    website text,
    status public."UnitStatus" DEFAULT 'ACTIVE'::public."UnitStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.units OWNER TO bumbleb;

--
-- Name: users; Type: TABLE; Schema: public; Owner: bumbleb
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    phone text,
    role public."UserRole" NOT NULL,
    unit_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.users OWNER TO bumbleb;

--
-- Data for Name: area_master; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.area_master (id, locality, pincode, suggested_unit_id, is_active) FROM stdin;
a94fd5c6-b687-446c-b615-dc59377150f3	Saraswati Nagar	360001	844a4405-6984-4180-9ed8-dc3ff1ce74b2	t
ad6ebdc8-0104-4e94-9af3-68bcbbc6d91e	Kalawad Road	360005	844a4405-6984-4180-9ed8-dc3ff1ce74b2	t
3229918d-0741-4ef4-875e-cb2aa27bb129	Tirupati Nagar	360007	ad026061-28f0-485b-82ae-1ad3e12310dd	t
7fc7359e-5698-4f16-9250-e5b918a42835	Nirmala Road	360007	ad026061-28f0-485b-82ae-1ad3e12310dd	t
9e73a946-375a-4bcc-ab00-38a4aaae66d5	Jivraj Park	360004	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	t
7e35e654-1534-40c3-9ae5-5a58783c4be6	University Road	360005	ad026061-28f0-485b-82ae-1ad3e12310dd	t
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.attendance_records (id, student_id, batch_id, unit_id, date, status, marked_by_id, marked_at, is_locked, lock_time, override_by_id, override_reason) FROM stdin;
cd7f3f96-41a6-4c13-9277-67d3ee687132	0b08d903-6908-4057-8a23-b14257903ac0	c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.755	f	\N	\N	\N
035f2dbd-5bdb-4bdc-9d62-a93bc75a57c3	996a4d6d-6d45-4afe-982d-b6d0c67fd880	792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.757	f	\N	\N	\N
729643e0-acef-4364-9385-d210683b93e3	b0b96dc4-e78c-45c5-9518-954f6c4ec74f	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.76	f	\N	\N	\N
0aaa0236-8fd2-46a6-870a-9a2cbdc31ee1	e565114e-2c31-438f-8d56-42ad90051af3	8b5eacff-a956-4660-bae9-87479832f69e	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
55bc514c-b35b-475e-8606-f7b4f8935b0f	ef83cb29-7494-4866-93f5-6b8db4f755f9	bcad12bd-ddff-42ac-9bbb-414b16bb0314	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.765	f	\N	\N	\N
968c642b-191e-460f-a1d7-46f88289af51	59aa66d6-6f25-4f11-acb1-a804fcc9823a	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.767	f	\N	\N	\N
299d4640-f98b-40bb-90bc-fe490fbf5493	b977bd58-3325-4f78-ac66-358781f8da2e	d2f770d8-64ee-41a5-9339-90d949a76d1d	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
436bf304-b125-4cd8-9853-23dea89a678c	6ed48cec-3632-4010-a50d-8aafff560dfa	c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.77	f	\N	\N	\N
aa7fcc1a-99b2-41e4-b0d1-5864a2ef008c	e474709a-3b43-437b-b79e-c39995bfdb84	792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.771	f	\N	\N	\N
e3298514-2d2e-4aff-abae-77ae67e4755b	c97c1ae1-5a82-40b2-b745-f39361fdc808	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.774	f	\N	\N	\N
2510ded9-b6e0-4782-876c-55218e1e9c76	6b8c37a5-d0be-40f7-8c80-705e956562af	8b5eacff-a956-4660-bae9-87479832f69e	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.776	f	\N	\N	\N
8734e0dd-3f09-4ada-b4a9-ba36a9611621	3df859ab-c8d8-4a65-9410-b559c2a25dbe	bcad12bd-ddff-42ac-9bbb-414b16bb0314	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
e95f8fe8-f057-462f-acd8-ccacd193f3e2	7d0bbd56-5b89-4eee-9f9d-2f0a38f6c96a	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.779	f	\N	\N	\N
20c668ef-ab0f-481c-8c34-4287b777d72b	e3971fb6-68e0-4a74-8976-46f0081176c4	d2f770d8-64ee-41a5-9339-90d949a76d1d	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.78	f	\N	\N	\N
3b0ff2b9-afe0-4837-a9ce-5b3a852e5782	38aa0ab8-f293-4d9f-9e3c-ed433ff523df	c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.782	f	\N	\N	\N
b89f2038-d087-495d-81d8-6c2d74d323e5	a2244cea-79c0-4d20-9749-e8a92181a5e8	792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.784	f	\N	\N	\N
17bf6186-4948-4ea6-8c55-7c406da966e2	3c073c40-4c7a-496a-a27f-a33a16089631	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
a88f4d00-0fc4-4737-bb78-ec37761a4ce4	80525f93-f9b6-4e19-8a40-75e1b6fb9d07	8b5eacff-a956-4660-bae9-87479832f69e	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.788	f	\N	\N	\N
1b13887d-926f-4926-9811-09d74d593bbc	e4ae36fe-fd5e-41ea-86c9-283007803a6e	bcad12bd-ddff-42ac-9bbb-414b16bb0314	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.79	f	\N	\N	\N
bca914db-93cf-485a-bced-4ae9faaf07eb	e49729f5-5787-4e00-b41d-34ad47b33438	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.791	f	\N	\N	\N
0c7bad10-6b7d-45f9-a2cb-4daad89bd256	a8e7a31e-375c-464b-960c-f525bf9e5f4e	d2f770d8-64ee-41a5-9339-90d949a76d1d	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.792	f	\N	\N	\N
7cbd6f88-2a7c-498d-aa4a-4b351fec4ab4	207c5b92-d926-4e6c-8175-da91f1df29c9	c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.794	f	\N	\N	\N
3dc01083-7aae-4c4a-8ae1-4c6757568609	5c18e94a-8710-41a8-a05c-0aa6ab23f9b2	792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.795	f	\N	\N	\N
00b97cc6-43e1-4dde-9279-c352b07b6501	2beedd2a-55a1-47d0-bd4e-ad62a01df6b0	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.797	f	\N	\N	\N
4bf80ede-d6e7-4d7a-b1e3-29269b4f41d0	754ef823-c39a-423a-ac0c-9eada75a5588	8b5eacff-a956-4660-bae9-87479832f69e	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
625d4743-ae76-486a-83d7-aee77b7349eb	6b4679e1-c9e2-478f-831e-5ae366dadee5	bcad12bd-ddff-42ac-9bbb-414b16bb0314	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
7ce9402d-2c96-4d9a-8500-526af151dfe9	04022492-c42d-44dc-b6f7-f4ae49a7dc7e	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
76636f69-bc2a-4498-93c1-9b31d78d7ca4	f0c61f2f-fbe7-49a1-ba48-c7f72db1584c	d2f770d8-64ee-41a5-9339-90d949a76d1d	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.802	f	\N	\N	\N
7ca76180-4ac1-4446-833f-0d3a8ff0bf59	ca9f72a3-340d-41c7-b84e-e7ef22e6d5a2	c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.804	f	\N	\N	\N
bdbb2409-2828-4feb-8032-bdcd408ccd82	09aeb2a1-42f8-4331-8b7d-18f26411521e	792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.805	f	\N	\N	\N
06b11c9a-bdc1-4253-85b0-b6daa5a4c029	cfcc87c4-cfc0-4b38-8b86-3f194aebdaf9	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.807	f	\N	\N	\N
7b2f9cde-5346-4bd0-bffb-9b5501cc49e0	729f5cad-8e65-4095-b45e-30859908fca8	8b5eacff-a956-4660-bae9-87479832f69e	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.808	f	\N	\N	\N
7859b7d3-f8e9-4c30-9f63-afbae2945c2d	71285030-2537-4dc0-a277-bba0b6a269a5	bcad12bd-ddff-42ac-9bbb-414b16bb0314	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.809	f	\N	\N	\N
5826eaa0-1102-4d41-b4dc-c7689dadb255	c1200c29-bbc0-460f-8227-2333e53ac856	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	ad026061-28f0-485b-82ae-1ad3e12310dd	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.811	f	\N	\N	\N
fbcc0363-157a-41b0-8f93-f75c03fb85b9	9bb19d6c-7085-404e-9b65-f1f6d5391b96	d2f770d8-64ee-41a5-9339-90d949a76d1d	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	2026-10-06	ABSENT	\N	\N	f	\N	\N	\N
2d40c480-f9a4-4b1e-81f3-3df3c2bd233d	a212c7bd-fdb0-4318-b548-f00410aca157	c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.813	f	\N	\N	\N
747703a6-5fa7-4461-8a7b-d360211a0294	bc8ee0f2-9066-41de-a2f5-cf71b4cb0a12	792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	\N	2026-10-06 13:05:50.814	f	\N	\N	\N
3eb764d7-cebc-4270-92f3-d3584dc16abd	112aab73-59f6-42bd-93a5-90ca666d994b	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:10:57.281	t	2026-10-06 03:00:00	0c006da1-6038-405d-a74d-4d3333ab7795	Teacher phone died; marking from register
9d9cc40c-9869-40b6-87f6-f23403203780	89ac5cdb-c21a-458f-a5c3-3e85dd06986f	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:10:57.281	t	2026-10-06 03:00:00	0c006da1-6038-405d-a74d-4d3333ab7795	Teacher phone died; marking from register
eed99d6c-3a1f-4263-a19f-0c1f31626aac	5bb5ca77-cf60-4002-896c-d9fec4905572	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	PRESENT	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:10:57.281	t	2026-10-06 03:00:00	0c006da1-6038-405d-a74d-4d3333ab7795	Teacher phone died; marking from register
0889fde4-0ca8-45a6-b3f1-5a05105871e9	332d5dcd-2b7a-4dbe-a64c-f9a72b2e94b9	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	ABSENT	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:10:57.281	t	2026-10-06 03:00:00	0c006da1-6038-405d-a74d-4d3333ab7795	Teacher phone died; marking from register
1020bce4-7a39-46a9-8624-d3f31a27fd37	4373e774-583b-47f5-92e2-a6f2714409de	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-06	ABSENT	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:10:57.281	t	2026-10-06 03:00:00	0c006da1-6038-405d-a74d-4d3333ab7795	Teacher phone died; marking from register
a7009633-edb1-45ef-ac01-7609c7ef5132	112aab73-59f6-42bd-93a5-90ca666d994b	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-07	PRESENT	a1693265-c0ab-4279-ad7a-5bedf3022e25	2026-10-06 13:10:57.306	f	2026-10-07 03:00:00	\N	\N
8915b855-d4d5-4dd6-b352-a21d69d011f7	89ac5cdb-c21a-458f-a5c3-3e85dd06986f	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-07	PRESENT	a1693265-c0ab-4279-ad7a-5bedf3022e25	2026-10-06 13:10:57.306	f	2026-10-07 03:00:00	\N	\N
d88dc6a4-e790-4d6c-bf49-e3d26308c490	5bb5ca77-cf60-4002-896c-d9fec4905572	005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	2026-10-07	PRESENT	a1693265-c0ab-4279-ad7a-5bedf3022e25	2026-10-06 13:10:57.306	f	2026-10-07 03:00:00	\N	\N
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.audit_log (id, table_name, record_id, action, old_data, new_data, changed_by_id, changed_at, ip_address) FROM stdin;
6dd78c60-eaf1-4349-aab4-029e16144cfb	attendance_records	005b011c-c049-4acb-8ea0-858a11d3c588:2026-10-06	UPDATE	\N	{"late": true, "marked": 5, "reason": "Teacher phone died; marking from register"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:10:57.294	127.0.0.1
f1178330-f658-4256-9dc4-2e0a4ccacb7f	attendance_records	005b011c-c049-4acb-8ea0-858a11d3c588:2026-10-07	UPDATE	\N	{"late": false, "marked": 3, "reason": null}	a1693265-c0ab-4279-ad7a-5bedf3022e25	2026-10-06 13:10:57.313	127.0.0.1
2255e030-c726-46d4-baae-7867a5e3d5c2	fee_transactions	ed615e51-eff5-4fce-8fe0-b813d586b80a	CREATE	\N	{"id": "ed615e51-eff5-4fce-8fe0-b813d586b80a", "fine": 0.0, "amount": 16800.0, "unitId": "844a4405-6984-4180-9ed8-dc3ff1ce74b2", "remarks": null, "discount": 0.0, "createdAt": "2026-10-06T13:11:00.402Z", "receiptNo": "BB-U1-RCPT-2627-0001", "reference": "UPI/raj123@okaxis", "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "ledgerType": "PRESCHOOL", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "UPI", "instalmentNo": 1, "collectedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.405	127.0.0.1
32e3bba8-68b6-42e4-a8d4-6b9920d15b5a	fee_transactions	d5a01110-c645-42dd-96bf-d002cfd71c6f	CREATE	\N	{"id": "d5a01110-c645-42dd-96bf-d002cfd71c6f", "fine": 0.0, "amount": 500.0, "unitId": "844a4405-6984-4180-9ed8-dc3ff1ce74b2", "remarks": "part payment inst 2", "discount": 0.0, "createdAt": "2026-10-06T13:11:00.416Z", "receiptNo": "BB-U1-RCPT-2627-0002", "reference": null, "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "ledgerType": "PRESCHOOL", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.418	127.0.0.1
cbe23f16-6afd-4c7c-b2da-881af01ecf06	fee_transactions	d5a01110-c645-42dd-96bf-d002cfd71c6f	UPDATE	{"id": "d5a01110-c645-42dd-96bf-d002cfd71c6f", "fine": 0.0, "amount": 500.0, "unitId": "844a4405-6984-4180-9ed8-dc3ff1ce74b2", "remarks": "part payment inst 2", "discount": 0.0, "createdAt": "2026-10-06T13:11:00.416Z", "receiptNo": "BB-U1-RCPT-2627-0002", "reference": null, "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "ledgerType": "PRESCHOOL", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	{"id": "d5a01110-c645-42dd-96bf-d002cfd71c6f", "fine": 0.0, "amount": 500.0, "unitId": "844a4405-6984-4180-9ed8-dc3ff1ce74b2", "remarks": "part payment inst 2 [CANCELLED: duplicate entry]", "discount": 0.0, "createdAt": "2026-10-06T13:11:00.416Z", "receiptNo": "BB-U1-RCPT-2627-0002", "reference": null, "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "ledgerType": "PRESCHOOL", "isCancelled": true, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.463	127.0.0.1
ccea46cc-1d38-424a-8b62-e3c167ca7e33	message_logs	fee-reminders	CREATE	\N	{"queued": 71}	50966236-ace6-45a3-8fbd-7205d74d4845	2026-10-06 13:11:00.805	127.0.0.1
bfbc31d4-e1f8-47c0-ba85-eb357af4552d	fee_transactions	08aa7b9f-dcb2-4c31-ae71-7f43cf5cc3cc	CREATE	\N	{"id": "08aa7b9f-dcb2-4c31-ae71-7f43cf5cc3cc", "fine": 0.0, "amount": 2000.0, "unitId": "844a4405-6984-4180-9ed8-dc3ff1ce74b2", "remarks": null, "discount": 0.0, "createdAt": "2026-10-06T13:11:00.835Z", "receiptNo": "BB-U1-RCPT-2627-0003", "reference": null, "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "ledgerType": "EVENING", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.837	127.0.0.1
122149eb-a81a-4491-882b-7ec2468868d3	fee_transactions	20adb7a9-b63e-47d9-b8a4-5e3dcc63177e	CREATE	\N	{"id": "20adb7a9-b63e-47d9-b8a4-5e3dcc63177e", "fine": 0.0, "amount": 777.0, "unitId": "ad026061-28f0-485b-82ae-1ad3e12310dd", "remarks": "test delta", "discount": 0.0, "createdAt": "2026-10-06T13:12:06.195Z", "receiptNo": "BB-U2-RCPT-2627-0001", "reference": null, "studentId": "e565114e-2c31-438f-8d56-42ad90051af3", "ledgerType": "PRESCHOOL", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d"}	f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	2026-10-06 13:12:06.199	127.0.0.1
aa479145-da2c-400f-a76e-ca45f63c2634	fee_transactions	20adb7a9-b63e-47d9-b8a4-5e3dcc63177e	UPDATE	{"id": "20adb7a9-b63e-47d9-b8a4-5e3dcc63177e", "fine": 0.0, "amount": 777.0, "unitId": "ad026061-28f0-485b-82ae-1ad3e12310dd", "remarks": "test delta", "discount": 0.0, "createdAt": "2026-10-06T13:12:06.195Z", "receiptNo": "BB-U2-RCPT-2627-0001", "reference": null, "studentId": "e565114e-2c31-438f-8d56-42ad90051af3", "ledgerType": "PRESCHOOL", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d"}	{"id": "20adb7a9-b63e-47d9-b8a4-5e3dcc63177e", "fine": 0.0, "amount": 777.0, "unitId": "ad026061-28f0-485b-82ae-1ad3e12310dd", "remarks": "test delta [CANCELLED: test cleanup]", "discount": 0.0, "createdAt": "2026-10-06T13:12:06.195Z", "receiptNo": "BB-U2-RCPT-2627-0001", "reference": null, "studentId": "e565114e-2c31-438f-8d56-42ad90051af3", "ledgerType": "PRESCHOOL", "isCancelled": true, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d"}	f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	2026-10-06 13:12:06.239	127.0.0.1
11bd968e-c813-4842-8810-33b5bda40426	fee_transactions	3b6be1d4-777b-459d-b7e0-9d4f3d6ce313	CREATE	\N	{"id": "3b6be1d4-777b-459d-b7e0-9d4f3d6ce313", "fine": 0.0, "amount": 2000.0, "unitId": "ad026061-28f0-485b-82ae-1ad3e12310dd", "remarks": null, "discount": 0.0, "createdAt": "2026-10-06T13:12:06.256Z", "receiptNo": "BB-U2-RCPT-2627-0002", "reference": null, "studentId": "e565114e-2c31-438f-8d56-42ad90051af3", "ledgerType": "EVENING", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d"}	f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	2026-10-06 13:12:06.258	127.0.0.1
8fcc8c6d-0b75-48fe-9ee5-cda40e57d6b4	fee_transactions	3b6be1d4-777b-459d-b7e0-9d4f3d6ce313	UPDATE	{"id": "3b6be1d4-777b-459d-b7e0-9d4f3d6ce313", "fine": 0.0, "amount": 2000.0, "unitId": "ad026061-28f0-485b-82ae-1ad3e12310dd", "remarks": null, "discount": 0.0, "createdAt": "2026-10-06T13:12:06.256Z", "receiptNo": "BB-U2-RCPT-2627-0002", "reference": null, "studentId": "e565114e-2c31-438f-8d56-42ad90051af3", "ledgerType": "EVENING", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d"}	{"id": "3b6be1d4-777b-459d-b7e0-9d4f3d6ce313", "fine": 0.0, "amount": 2000.0, "unitId": "ad026061-28f0-485b-82ae-1ad3e12310dd", "remarks": "[CANCELLED: test cleanup]", "discount": 0.0, "createdAt": "2026-10-06T13:12:06.256Z", "receiptNo": "BB-U2-RCPT-2627-0002", "reference": null, "studentId": "e565114e-2c31-438f-8d56-42ad90051af3", "ledgerType": "EVENING", "isCancelled": true, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "CASH", "instalmentNo": null, "collectedById": "f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d"}	f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	2026-10-06 13:12:06.276	127.0.0.1
f15d77fa-0846-42d3-af6e-6cc4397c9264	certificates	5ddecf6e-447e-4b68-88ab-c91884b69357	CREATE	\N	{"id": "5ddecf6e-447e-4b68-88ab-c91884b69357", "type": "BONAFIDE", "payload": {"ay": "2026-27", "event": null, "reason": null}, "issuedAt": "2026-10-06T13:24:59.305Z", "serialNo": "BB-U1-CERT-2627-0001", "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "issuedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:24:59.308	127.0.0.1
b97f00f4-eae0-4bda-a917-9556f7f353ea	fee_transactions	d6fd2c44-1d49-473d-b6c3-40d89a4f2da0	CREATE	\N	{"id": "d6fd2c44-1d49-473d-b6c3-40d89a4f2da0", "fine": 0.0, "amount": 8400.0, "unitId": "844a4405-6984-4180-9ed8-dc3ff1ce74b2", "remarks": "final settlement", "discount": 0.0, "createdAt": "2026-10-06T13:24:59.350Z", "receiptNo": "BB-U1-RCPT-2627-0004", "reference": null, "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "ledgerType": "PRESCHOOL", "isCancelled": false, "paymentDate": "2026-10-06T00:00:00.000Z", "paymentMode": "UPI", "instalmentNo": null, "collectedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:24:59.353	127.0.0.1
32b6b92a-e749-47b7-9e66-51cdf0d4471e	certificates	1b2307eb-c3ff-4c6a-ad97-0117610f86fc	CREATE	\N	{"id": "1b2307eb-c3ff-4c6a-ad97-0117610f86fc", "type": "TC", "payload": {"ay": "2026-27", "event": null, "reason": null}, "issuedAt": "2026-10-06T13:24:59.375Z", "serialNo": "BB-U1-CERT-2627-0002", "studentId": "0b08d903-6908-4057-8a23-b14257903ac0", "issuedById": "0c006da1-6038-405d-a74d-4d3333ab7795"}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:24:59.38	127.0.0.1
2407e6e9-421b-408b-92db-cf569966a844	message_logs	announcement	CREATE	\N	{"title": "Diwali Break 🎆", "queued": 41}	50966236-ace6-45a3-8fbd-7205d74d4845	2026-10-06 13:24:59.481	127.0.0.1
1d4364c5-6fbf-4155-9acd-88180a49e924	message_logs	dispatch	UPDATE	\N	{"mode": "SANDBOX", "sent": 120}	50966236-ace6-45a3-8fbd-7205d74d4845	2026-10-06 13:24:59.709	127.0.0.1
\.


--
-- Data for Name: batches; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.batches (id, unit_id, programme_id, name, medium, shift, start_time, end_time, capacity, academic_year, is_active, created_at) FROM stdin;
c43da4a2-e3f5-4995-9494-699a405678b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	20a7895f-57d1-4296-8af2-3c22b2f81653	PlayHouse Morning (Guj)	gujarati	morning	08:00	11:30	20	2026-27	t	2026-10-06 13:05:50.472
792db192-b75e-40cf-a750-eb859d29c92a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	e140cb07-139f-486c-8388-02335a726f86	PreK Morning (Guj)	gujarati	morning	08:00	12:00	25	2026-27	t	2026-10-06 13:05:50.475
005b011c-c049-4acb-8ea0-858a11d3c588	844a4405-6984-4180-9ed8-dc3ff1ce74b2	8e12570f-92ab-4de5-a630-49178b43173b	K1 Morning (Eng)	english	morning	08:00	12:30	25	2026-27	t	2026-10-06 13:05:50.477
7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	3485ec36-cc48-479a-9f51-e0a8c456aad0	K2 Morning (Eng)	english	morning	08:00	12:30	25	2026-27	t	2026-10-06 13:05:50.479
8b5eacff-a956-4660-bae9-87479832f69e	ad026061-28f0-485b-82ae-1ad3e12310dd	afa7f7d0-3165-4384-a665-312af481e616	Todd Care Morning	english	morning	10:00	11:30	15	2026-27	t	2026-10-06 13:05:50.48
bcad12bd-ddff-42ac-9bbb-414b16bb0314	ad026061-28f0-485b-82ae-1ad3e12310dd	20a7895f-57d1-4296-8af2-3c22b2f81653	PlayHouse Morning	english	morning	09:00	12:00	20	2026-27	t	2026-10-06 13:05:50.481
614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	ad026061-28f0-485b-82ae-1ad3e12310dd	e140cb07-139f-486c-8388-02335a726f86	PreK Morning	english	morning	09:00	12:30	20	2026-27	t	2026-10-06 13:05:50.483
d2f770d8-64ee-41a5-9339-90d949a76d1d	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	20a7895f-57d1-4296-8af2-3c22b2f81653	PlayHouse Morning	english	morning	09:00	12:00	20	2026-27	t	2026-10-06 13:05:50.485
\.


--
-- Data for Name: certificates; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.certificates (id, student_id, type, serial_no, payload, issued_by_id, issued_at) FROM stdin;
5ddecf6e-447e-4b68-88ab-c91884b69357	0b08d903-6908-4057-8a23-b14257903ac0	BONAFIDE	BB-U1-CERT-2627-0001	{"ay": "2026-27", "event": null, "reason": null}	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:24:59.305
\.


--
-- Data for Name: consent_log; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.consent_log (id, student_id, consent_type, granted, granted_by, granted_at) FROM stdin;
\.


--
-- Data for Name: discovery_flights; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.discovery_flights (id, lead_id, student_id, unit_id, scheduled_at, conducted_at, result_code, recommendation, notes, internal_only, approved_by_id, approved_at, created_at) FROM stdin;
\.


--
-- Data for Name: fee_structures; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.fee_structures (id, unit_id, programme_id, academic_year, total_fee, instalment_1, instalment_2, instalment_3, sibling_discount_pct, locked, created_at) FROM stdin;
8da7f095-401c-4204-a21f-91350d59b106	844a4405-6984-4180-9ed8-dc3ff1ce74b2	afa7f7d0-3165-4384-a665-312af481e616	2026-27	36000.00	14400.00	10800.00	10800.00	10.00	t	2026-10-06 13:05:50.597
55552d0a-c6ad-4a9c-89c0-1d35acee0868	844a4405-6984-4180-9ed8-dc3ff1ce74b2	20a7895f-57d1-4296-8af2-3c22b2f81653	2026-27	42000.00	16800.00	12600.00	12600.00	10.00	t	2026-10-06 13:05:50.6
48faf8f8-c506-408d-bedd-02a937ae56c2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	e140cb07-139f-486c-8388-02335a726f86	2026-27	48000.00	19200.00	14400.00	14400.00	10.00	t	2026-10-06 13:05:50.601
9bb1e370-bf4f-4228-bac3-c3d1a3b9cf4f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	8e12570f-92ab-4de5-a630-49178b43173b	2026-27	52000.00	20800.00	15600.00	15600.00	10.00	t	2026-10-06 13:05:50.603
c29bbde3-fd9f-4d5e-b609-c6716b6e3d5a	844a4405-6984-4180-9ed8-dc3ff1ce74b2	3485ec36-cc48-479a-9f51-e0a8c456aad0	2026-27	55000.00	22000.00	16500.00	16500.00	10.00	t	2026-10-06 13:05:50.605
40552b52-e704-4abd-8c06-950ffc7a585c	ad026061-28f0-485b-82ae-1ad3e12310dd	afa7f7d0-3165-4384-a665-312af481e616	2026-27	36000.00	14400.00	10800.00	10800.00	10.00	t	2026-10-06 13:05:50.607
1fedfc38-00e9-43bd-86d8-b29297fd5e02	ad026061-28f0-485b-82ae-1ad3e12310dd	20a7895f-57d1-4296-8af2-3c22b2f81653	2026-27	42000.00	16800.00	12600.00	12600.00	10.00	t	2026-10-06 13:05:50.608
ce70a3a4-1cb3-495b-afc0-591a8a5bb883	ad026061-28f0-485b-82ae-1ad3e12310dd	e140cb07-139f-486c-8388-02335a726f86	2026-27	48000.00	19200.00	14400.00	14400.00	10.00	t	2026-10-06 13:05:50.61
161fded0-0ff8-4b9f-ad9f-351a487636f4	ad026061-28f0-485b-82ae-1ad3e12310dd	8e12570f-92ab-4de5-a630-49178b43173b	2026-27	52000.00	20800.00	15600.00	15600.00	10.00	t	2026-10-06 13:05:50.611
03e47630-903a-44b0-8806-d0ee77f67bac	ad026061-28f0-485b-82ae-1ad3e12310dd	3485ec36-cc48-479a-9f51-e0a8c456aad0	2026-27	55000.00	22000.00	16500.00	16500.00	10.00	t	2026-10-06 13:05:50.613
541d3c75-561b-4b43-af39-3645851ad3ba	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	afa7f7d0-3165-4384-a665-312af481e616	2026-27	36000.00	14400.00	10800.00	10800.00	10.00	t	2026-10-06 13:05:50.615
a1576ada-f524-4cf7-8ce0-12e7efa5958e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	20a7895f-57d1-4296-8af2-3c22b2f81653	2026-27	42000.00	16800.00	12600.00	12600.00	10.00	t	2026-10-06 13:05:50.616
785dd048-b2b5-4094-b18d-bcc753f2c43b	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	e140cb07-139f-486c-8388-02335a726f86	2026-27	48000.00	19200.00	14400.00	14400.00	10.00	t	2026-10-06 13:05:50.618
e46cab54-5d06-4405-9548-7cef205cb6ce	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	8e12570f-92ab-4de5-a630-49178b43173b	2026-27	52000.00	20800.00	15600.00	15600.00	10.00	t	2026-10-06 13:05:50.619
bb69a9cf-6079-4e69-9813-6b23f38dc82f	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	3485ec36-cc48-479a-9f51-e0a8c456aad0	2026-27	55000.00	22000.00	16500.00	16500.00	10.00	t	2026-10-06 13:05:50.621
\.


--
-- Data for Name: fee_transactions; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.fee_transactions (id, student_id, unit_id, ledger_type, amount, discount, fine, payment_mode, reference, payment_date, instalment_no, receipt_no, remarks, is_cancelled, collected_by_id, created_at) FROM stdin;
805b24db-cf21-44ed-a6ec-6ec7bc9ce8c5	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	UPI	\N	2026-06-02	1	BB-U1-RCPT-00001	\N	f	\N	2026-10-06 13:05:50.7
033e9331-b229-41fe-9f10-40344fb3e200	996a4d6d-6d45-4afe-982d-b6d0c67fd880	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	19200.00	0.00	0.00	RAZORPAY	\N	2026-06-03	1	BB-U1-RCPT-00002	\N	f	\N	2026-10-06 13:05:50.703
343a8704-a382-4bd0-9574-55599313c3f7	b0b96dc4-e78c-45c5-9518-954f6c4ec74f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	22000.00	0.00	0.00	CHEQUE	\N	2026-06-04	1	BB-U1-RCPT-00003	\N	f	\N	2026-10-06 13:05:50.704
cb2faafb-e225-4978-a266-f818de1b90e5	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	14400.00	0.00	0.00	CASH	\N	2026-06-05	1	BB-U2-RCPT-00004	\N	f	\N	2026-10-06 13:05:50.706
d89dd9fa-8618-4467-a808-8ec8ea80a7e7	ef83cb29-7494-4866-93f5-6b8db4f755f9	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	16800.00	0.00	0.00	UPI	\N	2026-06-06	1	BB-U2-RCPT-00005	\N	f	\N	2026-10-06 13:05:50.708
6ed5a0c8-9867-4a8f-a694-8eab3a52b5a5	59aa66d6-6f25-4f11-acb1-a804fcc9823a	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	19200.00	0.00	0.00	RAZORPAY	\N	2026-06-07	1	BB-U2-RCPT-00006	\N	f	\N	2026-10-06 13:05:50.709
4736b66c-178b-4834-8c78-bd7c9a3799fd	b977bd58-3325-4f78-ac66-358781f8da2e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	PRESCHOOL	16800.00	0.00	0.00	CHEQUE	\N	2026-06-08	1	BB-U3-RCPT-00007	\N	f	\N	2026-10-06 13:05:50.711
7eef1849-3040-4f56-8b37-33d7543bec5a	6ed48cec-3632-4010-a50d-8aafff560dfa	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	CASH	\N	2026-06-09	1	BB-U1-RCPT-00008	\N	f	\N	2026-10-06 13:05:50.712
df8edd75-67c7-433b-aba8-903bd2b84518	e474709a-3b43-437b-b79e-c39995bfdb84	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	19200.00	0.00	0.00	UPI	\N	2026-06-10	1	BB-U1-RCPT-00009	\N	f	\N	2026-10-06 13:05:50.714
cd5b95c4-3f1d-4f17-b8e5-c211b8edc3c7	112aab73-59f6-42bd-93a5-90ca666d994b	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	20800.00	0.00	0.00	RAZORPAY	\N	2026-06-11	1	BB-U1-RCPT-00010	\N	f	\N	2026-10-06 13:05:50.716
853748b7-64d1-42f6-9b22-08386efbbd41	c97c1ae1-5a82-40b2-b745-f39361fdc808	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	22000.00	0.00	0.00	CHEQUE	\N	2026-06-12	1	BB-U1-RCPT-00011	\N	f	\N	2026-10-06 13:05:50.718
5182deaf-fd73-4810-bcce-a72a8caff444	3df859ab-c8d8-4a65-9410-b559c2a25dbe	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	16800.00	0.00	0.00	CASH	\N	2026-06-13	1	BB-U2-RCPT-00012	\N	f	\N	2026-10-06 13:05:50.72
5cce8a2d-8c94-4d12-8df3-f5392b95a212	e3971fb6-68e0-4a74-8976-46f0081176c4	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	PRESCHOOL	16800.00	0.00	0.00	UPI	\N	2026-06-14	1	BB-U3-RCPT-00013	\N	f	\N	2026-10-06 13:05:50.721
e51a61ff-7cce-463b-bed6-a0a31ef00e4f	38aa0ab8-f293-4d9f-9e3c-ed433ff523df	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	RAZORPAY	\N	2026-06-15	1	BB-U1-RCPT-00014	\N	f	\N	2026-10-06 13:05:50.723
3895f5d9-9ef9-4a67-be6b-d3d8551175ae	89ac5cdb-c21a-458f-a5c3-3e85dd06986f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	20800.00	0.00	0.00	CHEQUE	\N	2026-06-16	1	BB-U1-RCPT-00015	\N	f	\N	2026-10-06 13:05:50.725
4f4207da-f754-4a67-aa72-98017f31468e	3c073c40-4c7a-496a-a27f-a33a16089631	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	22000.00	0.00	0.00	CASH	\N	2026-06-17	1	BB-U1-RCPT-00016	\N	f	\N	2026-10-06 13:05:50.727
17e5e679-aaa6-463e-9c5d-ddbb05db6768	e4ae36fe-fd5e-41ea-86c9-283007803a6e	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	16800.00	0.00	0.00	UPI	\N	2026-06-18	1	BB-U2-RCPT-00017	\N	f	\N	2026-10-06 13:05:50.728
d64c39e3-63bb-4d96-ab2c-4f91b7819401	e49729f5-5787-4e00-b41d-34ad47b33438	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	19200.00	0.00	0.00	RAZORPAY	\N	2026-06-19	1	BB-U2-RCPT-00018	\N	f	\N	2026-10-06 13:05:50.73
80a4c5c1-69f1-452a-a7d0-6896177ea740	a8e7a31e-375c-464b-960c-f525bf9e5f4e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	PRESCHOOL	16800.00	0.00	0.00	CHEQUE	\N	2026-06-20	1	BB-U3-RCPT-00019	\N	f	\N	2026-10-06 13:05:50.731
1861dd93-83c6-4b8b-9333-952598ea3025	207c5b92-d926-4e6c-8175-da91f1df29c9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	CASH	\N	2026-06-21	1	BB-U1-RCPT-00020	\N	f	\N	2026-10-06 13:05:50.733
0cb84f6c-6800-4138-8e68-d85cc94aea24	5c18e94a-8710-41a8-a05c-0aa6ab23f9b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	19200.00	0.00	0.00	UPI	\N	2026-06-22	1	BB-U1-RCPT-00021	\N	f	\N	2026-10-06 13:05:50.734
d80f2c30-e465-4989-925a-604adb792197	4373e774-583b-47f5-92e2-a6f2714409de	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	20800.00	0.00	0.00	RAZORPAY	\N	2026-06-23	1	BB-U1-RCPT-00022	\N	f	\N	2026-10-06 13:05:50.736
730be625-bed7-45a2-9007-d1dd0cddb211	6b4679e1-c9e2-478f-831e-5ae366dadee5	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	16800.00	0.00	0.00	CHEQUE	\N	2026-06-24	1	BB-U2-RCPT-00023	\N	f	\N	2026-10-06 13:05:50.738
46c76276-ff65-4a4f-8182-216e6f33e271	04022492-c42d-44dc-b6f7-f4ae49a7dc7e	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	19200.00	0.00	0.00	CASH	\N	2026-06-25	1	BB-U2-RCPT-00024	\N	f	\N	2026-10-06 13:05:50.739
6ea348e9-e023-442a-8350-103180079d22	f0c61f2f-fbe7-49a1-ba48-c7f72db1584c	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	PRESCHOOL	16800.00	0.00	0.00	UPI	\N	2026-06-26	1	BB-U3-RCPT-00025	\N	f	\N	2026-10-06 13:05:50.741
3b566752-3670-48ab-b94d-f78cbc729f95	ca9f72a3-340d-41c7-b84e-e7ef22e6d5a2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	RAZORPAY	\N	2026-06-27	1	BB-U1-RCPT-00026	\N	f	\N	2026-10-06 13:05:50.742
0478b3df-a85b-488f-bff2-e1a74e5fd73e	09aeb2a1-42f8-4331-8b7d-18f26411521e	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	19200.00	0.00	0.00	CHEQUE	\N	2026-06-28	1	BB-U1-RCPT-00027	\N	f	\N	2026-10-06 13:05:50.744
7980776c-2333-4a21-b5d8-01456cb04d7a	cfcc87c4-cfc0-4b38-8b86-3f194aebdaf9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	22000.00	0.00	0.00	CASH	\N	2026-06-01	1	BB-U1-RCPT-00028	\N	f	\N	2026-10-06 13:05:50.746
b72c8431-4723-4bd2-958b-e48f77714c61	729f5cad-8e65-4095-b45e-30859908fca8	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	14400.00	0.00	0.00	UPI	\N	2026-06-02	1	BB-U2-RCPT-00029	\N	f	\N	2026-10-06 13:05:50.747
4ce39de4-bf68-4d8a-9b62-97dd6b9ec37b	71285030-2537-4dc0-a277-bba0b6a269a5	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	16800.00	0.00	0.00	RAZORPAY	\N	2026-06-03	1	BB-U2-RCPT-00030	\N	f	\N	2026-10-06 13:05:50.749
3e208d7d-21ff-4cfb-a560-59e23e69fdbf	c1200c29-bbc0-460f-8227-2333e53ac856	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	19200.00	0.00	0.00	CHEQUE	\N	2026-06-04	1	BB-U2-RCPT-00031	\N	f	\N	2026-10-06 13:05:50.751
68ff11d7-d82e-484e-bf59-0f5343abb482	9bb19d6c-7085-404e-9b65-f1f6d5391b96	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	PRESCHOOL	16800.00	0.00	0.00	CASH	\N	2026-06-05	1	BB-U3-RCPT-00032	\N	f	\N	2026-10-06 13:05:50.752
3df7e1fb-0767-4d4a-ae9c-ddb4b8882e44	a212c7bd-fdb0-4318-b548-f00410aca157	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	UPI	\N	2026-06-06	1	BB-U1-RCPT-00033	\N	f	\N	2026-10-06 13:05:50.754
ed615e51-eff5-4fce-8fe0-b813d586b80a	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	16800.00	0.00	0.00	UPI	UPI/raj123@okaxis	2026-10-06	1	BB-U1-RCPT-2627-0001	\N	f	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.402
d5a01110-c645-42dd-96bf-d002cfd71c6f	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	500.00	0.00	0.00	CASH	\N	2026-10-06	\N	BB-U1-RCPT-2627-0002	part payment inst 2 [CANCELLED: duplicate entry]	t	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.416
08aa7b9f-dcb2-4c31-ae71-7f43cf5cc3cc	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	EVENING	2000.00	0.00	0.00	CASH	\N	2026-10-06	\N	BB-U1-RCPT-2627-0003	\N	f	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:11:00.835
20adb7a9-b63e-47d9-b8a4-5e3dcc63177e	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	PRESCHOOL	777.00	0.00	0.00	CASH	\N	2026-10-06	\N	BB-U2-RCPT-2627-0001	test delta [CANCELLED: test cleanup]	t	f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	2026-10-06 13:12:06.195
3b6be1d4-777b-459d-b7e0-9d4f3d6ce313	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	EVENING	2000.00	0.00	0.00	CASH	\N	2026-10-06	\N	BB-U2-RCPT-2627-0002	[CANCELLED: test cleanup]	t	f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	2026-10-06 13:12:06.256
d6fd2c44-1d49-473d-b6c3-40d89a4f2da0	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	PRESCHOOL	8400.00	0.00	0.00	UPI	\N	2026-10-06	\N	BB-U1-RCPT-2627-0004	final settlement	f	0c006da1-6038-405d-a74d-4d3333ab7795	2026-10-06 13:24:59.35
\.


--
-- Data for Name: lead_activities; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.lead_activities (id, lead_id, type, note, meta, by_id, created_at) FROM stdin;
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.leads (id, inquiry_no, stage, parent_name, parent_phone, parent_email, child_name, child_dob, programme_interest_id, area_locality, preferred_unit, suggested_unit_id, assigned_unit_id, routing_notes, inquiry_channel, experience_interest, lead_score, source_campaign, notes, created_at, updated_at) FROM stdin;
086dd7d4-6a93-431c-94f1-aa712a5f4f28	BB-U1-INQ-2627-0001	NEW_INQUIRY	Kiran Patel	+91 9710000000	\N	Dev	\N	afa7f7d0-3165-4384-a665-312af481e616	Saraswati Nagar	U1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	\N	\N	CALL	t	20	\N	\N	2026-10-06 13:05:50.816	2026-10-06 13:05:50.817
d2e62ef0-d8f6-4716-b646-ef7846cb64cc	BB-U2-INQ-2627-0002	FIRST_BUZZ	Bhavesh Shah	+91 9710654321	\N	Mahi	\N	20a7895f-57d1-4296-8af2-3c22b2f81653	Kalawad Road	U2	ad026061-28f0-485b-82ae-1ad3e12310dd	ad026061-28f0-485b-82ae-1ad3e12310dd	\N	WHATSAPP	f	27	\N	\N	2026-10-04 13:05:50.819	2026-10-06 13:05:50.82
3a7f96c9-b70c-40dd-a727-b30a20fe080d	BB-U3-INQ-2627-0003	ROUTING	Dipti Mehta	+91 9711308642	\N	Nisha	\N	e140cb07-139f-486c-8388-02335a726f86	Tirupati Nagar	U3	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	\N	WEBSITE	f	34	\N	\N	2026-10-02 13:05:50.821	2026-10-06 13:05:50.822
96a0e485-08fd-4873-8abf-1339df298abb	BB-U1-INQ-2627-0004	EXPERIENCE_SESSION	Jignesh Joshi	+91 9711962963	\N	Om	\N	8e12570f-92ab-4de5-a630-49178b43173b	Nirmala Road	NO_PREFERENCE	844a4405-6984-4180-9ed8-dc3ff1ce74b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	\N	SOCIAL	t	41	\N	\N	2026-09-30 13:05:50.822	2026-10-06 13:05:50.823
c9b180e3-e94a-475a-ae48-9c09b813432d	BB-U2-INQ-2627-0005	DISCOVERY_FLIGHT	Falak Trivedi	+91 9712617284	\N	Prisha	\N	3485ec36-cc48-479a-9f51-e0a8c456aad0	Jivraj Park	U1	ad026061-28f0-485b-82ae-1ad3e12310dd	\N	\N	REFERRAL	f	48	\N	\N	2026-09-28 13:05:50.824	2026-10-06 13:05:50.825
0534913b-7376-44ef-91c5-9930510e2c3d	BB-U3-INQ-2627-0006	OFFER	Chirag Dave	+91 9713271605	\N	Rudra	\N	afa7f7d0-3165-4384-a665-312af481e616	University Road	U2	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	\N	WALK_IN	f	55	\N	\N	2026-09-26 13:05:50.826	2026-10-06 13:05:50.826
55526026-6780-4103-a567-a1fdd9b0ccfb	BB-U1-INQ-2627-0007	CONFIRMATION	Hina Vyas	+91 9713925926	\N	Tara	\N	20a7895f-57d1-4296-8af2-3c22b2f81653	Saraswati Nagar	U3	844a4405-6984-4180-9ed8-dc3ff1ce74b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	\N	CALL	t	62	\N	\N	2026-09-24 13:05:50.828	2026-10-06 13:05:50.828
920a456c-0a7a-401e-aba2-4bf18e1a3bcb	BB-U2-INQ-2627-0008	ENROLLED	Nilesh Bhatt	+91 9714580247	\N	Yash	\N	e140cb07-139f-486c-8388-02335a726f86	Kalawad Road	NO_PREFERENCE	ad026061-28f0-485b-82ae-1ad3e12310dd	ad026061-28f0-485b-82ae-1ad3e12310dd	\N	WHATSAPP	f	69	\N	\N	2026-09-22 13:05:50.829	2026-10-06 13:05:50.83
7184120c-81f7-4c61-9583-3d30cf758f56	BB-U3-INQ-2627-0009	NEW_INQUIRY	Kiran Raval	+91 9715234568	\N	Zara	\N	8e12570f-92ab-4de5-a630-49178b43173b	Tirupati Nagar	U1	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	\N	\N	WEBSITE	f	76	\N	\N	2026-09-20 13:05:50.831	2026-10-06 13:05:50.832
13768c57-ae0c-4150-95f8-5254a65f15bf	BB-U1-INQ-2627-0010	FIRST_BUZZ	Bhavesh Thakkar	+91 9715888889	\N	Kian	\N	3485ec36-cc48-479a-9f51-e0a8c456aad0	Nirmala Road	U2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	\N	SOCIAL	t	83	\N	\N	2026-09-18 13:05:50.833	2026-10-06 13:05:50.833
fa757b61-2beb-48d9-a715-f456942e48e2	BB-U2-INQ-2627-0011	ROUTING	Dipti Gandhi	+91 9716543210	\N	Avni	\N	afa7f7d0-3165-4384-a665-312af481e616	Jivraj Park	U3	ad026061-28f0-485b-82ae-1ad3e12310dd	ad026061-28f0-485b-82ae-1ad3e12310dd	\N	REFERRAL	f	90	\N	\N	2026-09-16 13:05:50.834	2026-10-06 13:05:50.835
98bb41f7-d7f2-4784-9ca1-5720b4a7fbf3	BB-U3-INQ-2627-0012	EXPERIENCE_SESSION	Jignesh Desai	+91 9717197531	\N	Darsh	\N	20a7895f-57d1-4296-8af2-3c22b2f81653	University Road	NO_PREFERENCE	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	\N	WALK_IN	f	22	\N	\N	2026-09-14 13:05:50.836	2026-10-06 13:05:50.836
01941e7a-2e87-4d1f-a31d-43c2f7cf1448	BB-U1-INQ-2627-0013	DISCOVERY_FLIGHT	Falak Kotak	+91 9717851852	\N	Esha	\N	e140cb07-139f-486c-8388-02335a726f86	Saraswati Nagar	U1	844a4405-6984-4180-9ed8-dc3ff1ce74b2	\N	\N	CALL	t	29	\N	\N	2026-09-12 13:05:50.837	2026-10-06 13:05:50.838
a46f7b2d-e61c-4ed3-ae28-9f7e9296fa00	BB-U2-INQ-2627-0014	OFFER	Chirag Pandya	+91 9718506173	\N	Freya	\N	8e12570f-92ab-4de5-a630-49178b43173b	Kalawad Road	U2	ad026061-28f0-485b-82ae-1ad3e12310dd	ad026061-28f0-485b-82ae-1ad3e12310dd	\N	WHATSAPP	f	36	\N	\N	2026-09-10 13:05:50.839	2026-10-06 13:05:50.839
394f6e85-32a8-425a-993d-b52fb83c8be0	BB-U3-INQ-2627-0015	CONFIRMATION	Hina Patel	+91 9719160494	\N	Hridaan	\N	3485ec36-cc48-479a-9f51-e0a8c456aad0	Tirupati Nagar	U3	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	\N	WEBSITE	f	43	\N	\N	2026-09-08 13:05:50.84	2026-10-06 13:05:50.841
4048a61c-9eb6-4a98-b373-59d0887b52b5	BB-U1-INQ-2627-0016	ENROLLED	Nilesh Shah	+91 9719814815	\N	Ira	\N	afa7f7d0-3165-4384-a665-312af481e616	Nirmala Road	NO_PREFERENCE	844a4405-6984-4180-9ed8-dc3ff1ce74b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	\N	SOCIAL	t	50	\N	\N	2026-09-06 13:05:50.841	2026-10-06 13:05:50.842
\.


--
-- Data for Name: message_logs; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.message_logs (id, type, channel, recipient, student_id, unit_id, payload, status, scheduled_for, sent_at, created_at) FROM stdin;
0c0638c7-b816-4399-9908-e3f87d3cb4aa	FEE_REMINDER	WHATSAPP	+91 9119753072	38aa0ab8-f293-4d9f-9e3c-ed433ff523df	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Pari Mehta", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 21000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.519	2026-10-06 13:11:00.564
0d120ec9-8d9e-40a0-a69c-60897d8c0530	FEE_REMINDER	WHATSAPP	+91 9103703701	b0b96dc4-e78c-45c5-9518-954f6c4ec74f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Krish Joshi", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 16500, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.522	2026-10-06 13:11:00.529
0ece1a36-60e5-4c23-b182-4523d3764feb	RECEIPT	WHATSAPP	+91 9100000000	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aarav Patel", "amount": 16800, "receiptNo": "BB-U1-RCPT-2627-0001"}	SENT	\N	2026-10-06 13:24:59.524	2026-10-06 13:11:00.407
3c261650-2156-4c07-8573-2dd9c51263fd	FEE_REMINDER	WHATSAPP	+91 9120987639	a2244cea-79c0-4d20-9749-e8a92181a5e8	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Veer Joshi", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 48000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.551	2026-10-06 13:11:00.569
3d10624a-def9-47b9-9e13-0fc890e12bb2	FEE_REMINDER	WHATSAPP	+91 9133333309	2beedd2a-55a1-47d0-bd4e-ad62a01df6b0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Yash Pandya", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 16500, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.553	2026-10-06 13:11:00.61
4241d6b7-e085-4f5c-aab1-745fc418b812	FEE_REMINDER	WHATSAPP	+91 9130864175	5c18e94a-8710-41a8-a05c-0aa6ab23f9b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Rudra Desai", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4800, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.557	2026-10-06 13:11:00.594
6052401a-0b10-4cee-b849-36bddcd81fbe	FEE_REMINDER	WHATSAPP	+91 9113580237	c97c1ae1-5a82-40b2-b745-f39361fdc808	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Kiara Desai", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 33000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.565	2026-10-06 13:11:00.556
81b58ea7-b706-444d-b62b-d24cf7c9435d	FEE_REMINDER	WHATSAPP	+91 9101234567	996a4d6d-6d45-4afe-982d-b6d0c67fd880	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Vihaan Shah", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4800, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.587	2026-10-06 13:11:00.512
888b62b0-fed6-4762-b4d5-ca7297a95733	ABSENCE_ALERT	WHATSAPP	+91 9102469134	332d5dcd-2b7a-4dbe-a64c-f9a72b2e94b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"date": "2026-10-06", "batch": "K1 Morning (Eng)", "child": "Reyansh Mehta", "template": "absence_alert"}	SENT	2026-10-06 13:10:57.329	2026-10-06 13:24:59.594	2026-10-06 13:10:57.33
8d3d8547-6384-47ae-b15e-f9d6fdfeceb3	FEE_REMINDER	WHATSAPP	+91 9112345670	112aab73-59f6-42bd-93a5-90ca666d994b	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aadhya Gandhi", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 5200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.598	2026-10-06 13:11:00.546
99fe7d7f-d7b9-42c6-b278-f41a181ae5cc	FEE_REMINDER	WHATSAPP	+91 9109876536	6ed48cec-3632-4010-a50d-8aafff560dfa	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Myra Raval", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 25200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.605	2026-10-06 13:11:00.533
a162b173-7a20-4211-ab86-987c9c9065e2	FEE_REMINDER	WHATSAPP	+91 9133333309	2beedd2a-55a1-47d0-bd4e-ad62a01df6b0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Yash Pandya", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 22000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.611	2026-10-06 13:11:00.606
a1c340ed-2ed1-47ed-8fad-fc57141196ab	FEE_REMINDER	WHATSAPP	+91 9102469134	332d5dcd-2b7a-4dbe-a64c-f9a72b2e94b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Reyansh Mehta", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 52000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.614	2026-10-06 13:11:00.521
a2a2a376-7f3b-4dc2-9992-de120de9db41	ABSENCE_ALERT	WHATSAPP	+91 9132098742	4373e774-583b-47f5-92e2-a6f2714409de	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"date": "2026-10-06", "batch": "K1 Morning (Eng)", "child": "Tara Kotak", "template": "absence_alert"}	SENT	2026-10-06 13:10:57.335	2026-10-06 13:24:59.618	2026-10-06 13:10:57.336
b129131d-b77d-4e63-adea-f3db9cbfeb92	RECEIPT	WHATSAPP	+91 9100000000	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aarav Patel", "amount": 500, "receiptNo": "BB-U1-RCPT-2627-0002"}	SENT	\N	2026-10-06 13:24:59.636	2026-10-06 13:11:00.42
c2c93530-e8fe-4b73-8d89-476398f9f5ec	FEE_REMINDER	WHATSAPP	+91 9129629608	207c5b92-d926-4e6c-8175-da91f1df29c9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Prisha Gandhi", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 12600, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.653	2026-10-06 13:11:00.591
c76a893f-1f4a-4322-8f15-fe64af8533c8	FEE_REMINDER	WHATSAPP	+91 9111111103	e474709a-3b43-437b-b79e-c39995bfdb84	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Saanvi Thakkar", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 12960, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.659	2026-10-06 13:11:00.542
c9d52ea4-7f9e-4905-a540-a4b47c3a27a5	FEE_REMINDER	WHATSAPP	+91 9123456773	3c073c40-4c7a-496a-a27f-a33a16089631	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Jiya Dave", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 24750, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.661	2026-10-06 13:11:00.583
cafff20e-54ef-48af-9c32-fb5facfa9b16	FEE_REMINDER	WHATSAPP	+91 9111111103	e474709a-3b43-437b-b79e-c39995bfdb84	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Saanvi Thakkar", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 11040, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.664	2026-10-06 13:11:00.538
d2c5b7b6-adb7-46f0-85b5-a858a7e4e2ce	FEE_REMINDER	WHATSAPP	+91 9100000000	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aarav Patel", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 8400, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.669	2026-10-06 13:11:00.509
d489e32a-7ee9-4c6b-a3ac-1aa6484183db	FEE_REMINDER	WHATSAPP	+91 9119753072	38aa0ab8-f293-4d9f-9e3c-ed433ff523df	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Pari Mehta", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.671	2026-10-06 13:11:00.56
d747f4be-e8ff-4ef0-b0bb-e41ad371100f	FEE_REMINDER	WHATSAPP	+91 9129629608	207c5b92-d926-4e6c-8175-da91f1df29c9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Prisha Gandhi", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 12600, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.673	2026-10-06 13:11:00.587
dc3586c6-baee-4e03-983c-348f8026357d	FEE_REMINDER	WHATSAPP	+91 9103703701	b0b96dc4-e78c-45c5-9518-954f6c4ec74f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Krish Joshi", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 16500, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.679	2026-10-06 13:11:00.525
de8d797e-02f0-4ab6-9650-a7a4fcb6d517	FEE_REMINDER	WHATSAPP	+91 9130864175	5c18e94a-8710-41a8-a05c-0aa6ab23f9b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Rudra Desai", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 24000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.683	2026-10-06 13:11:00.598
ec5d3bad-aaf0-4926-878b-66ba4c7f36e5	FEE_REMINDER	WHATSAPP	+91 9122222206	89ac5cdb-c21a-458f-a5c3-3e85dd06986f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Hetvi Trivedi", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 15600, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.695	2026-10-06 13:11:00.573
ed35405f-0191-4f25-b0fe-04e3b1251241	FEE_REMINDER	WHATSAPP	+91 9122222206	89ac5cdb-c21a-458f-a5c3-3e85dd06986f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Hetvi Trivedi", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 15600, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.696	2026-10-06 13:11:00.577
f0a1d894-a463-4bf6-bd95-9e9ce6a49cfa	FEE_REMINDER	WHATSAPP	+91 9132098742	4373e774-583b-47f5-92e2-a6f2714409de	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Tara Kotak", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 31200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.697	2026-10-06 13:11:00.603
f67d7a7d-656e-48e2-be06-9db34a09e003	FEE_REMINDER	WHATSAPP	+91 9112345670	112aab73-59f6-42bd-93a5-90ca666d994b	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aadhya Gandhi", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 26000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.705	2026-10-06 13:11:00.551
0ff73c69-bece-4172-b6f6-055ebb08ccb5	FEE_REMINDER	WHATSAPP	+91 9114814804	6b8c37a5-d0be-40f7-8c80-705e956562af	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Ishaan Kotak", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 14400, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.525	2026-10-06 13:11:00.679
243bda66-fc04-473d-a4da-b271fbbff637	FEE_REMINDER	WHATSAPP	+91 9140740711	09aeb2a1-42f8-4331-8b7d-18f26411521e	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Freya Dave", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 14400, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.531	2026-10-06 13:11:00.625
2778426d-8223-4abf-acaf-c45e0fd2a07a	FEE_REMINDER	WHATSAPP	+91 9124691340	80525f93-f9b6-4e19-8a40-75e1b6fb9d07	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Dev Vyas", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 36000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.534	2026-10-06 13:11:00.707
29e4982e-5e01-4125-b4b9-8608f0923c72	FEE_REMINDER	WHATSAPP	+91 9141975278	5bb5ca77-cf60-4002-896c-d9fec4905572	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Hridaan Vyas", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 26000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.535	2026-10-06 13:11:00.634
2d78dafa-bf3a-4060-a753-a78b56eef547	FEE_REMINDER	WHATSAPP	+91 9125925907	e4ae36fe-fd5e-41ea-86c9-283007803a6e	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Mahi Bhatt", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 12600, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.538	2026-10-06 13:11:00.711
2dfe0493-5ab3-4b3a-968c-e55015a5a3a3	FEE_REMINDER	WHATSAPP	+91 9114814804	6b8c37a5-d0be-40f7-8c80-705e956562af	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Ishaan Kotak", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 10800, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.54	2026-10-06 13:11:00.688
364d5ff3-6204-419a-ac7f-a1039a44fcf8	FEE_REMINDER	WHATSAPP	+91 9150617247	bc8ee0f2-9066-41de-a2f5-cf71b4cb0a12	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Pia Pandya", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 48000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.549	2026-10-06 13:11:00.653
4a17ef5a-1e2e-48eb-a6d5-d1d3901c2e90	FEE_REMINDER	WHATSAPP	+91 9116049371	3df859ab-c8d8-4a65-9410-b559c2a25dbe	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Arjun Pandya", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.558	2026-10-06 13:11:00.693
6af9570e-0583-4322-ba41-76cfe3fcb8cf	FEE_REMINDER	WHATSAPP	+91 9134567876	754ef823-c39a-423a-ac0c-9eada75a5588	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Zara Patel", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 18000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.577	2026-10-06 13:11:00.727
747b8fac-4070-4922-b6cc-e797d750cf2c	FEE_REMINDER	WHATSAPP	+91 9107407402	59aa66d6-6f25-4f11-acb1-a804fcc9823a	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Anaya Vyas", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 14400, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.58	2026-10-06 13:11:00.675
794d04ad-2bbd-4568-825e-a19b2dc65cc7	FEE_REMINDER	WHATSAPP	+91 9134567876	754ef823-c39a-423a-ac0c-9eada75a5588	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Zara Patel", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 18000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.581	2026-10-06 13:11:00.732
7fe596d5-b100-444f-b9cc-bccc75333a7e	FEE_REMINDER	WHATSAPP	+91 9107407402	59aa66d6-6f25-4f11-acb1-a804fcc9823a	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Anaya Vyas", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 14400, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.583	2026-10-06 13:11:00.671
801e4f3d-53ac-461d-ab4d-4506cb708c6d	FEE_REMINDER	WHATSAPP	+91 9117283938	7d0bbd56-5b89-4eee-9f9d-2f0a38f6c96a	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Shiv Patel", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 48000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.585	2026-10-06 13:11:00.703
849b808a-ece5-41f7-8236-71d38e122ddf	FEE_REMINDER	WHATSAPP	+91 9127160474	e49729f5-5787-4e00-b41d-34ad47b33438	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Nisha Raval", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 24000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.593	2026-10-06 13:11:00.723
90431415-b23e-48fe-b994-5afa723fa381	FEE_REMINDER	WHATSAPP	+91 9114814804	6b8c37a5-d0be-40f7-8c80-705e956562af	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Ishaan Kotak", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 10800, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.599	2026-10-06 13:11:00.684
98820b23-bdae-48c1-be7e-9b295f7e57a7	FEE_REMINDER	WHATSAPP	+91 9116049371	3df859ab-c8d8-4a65-9410-b559c2a25dbe	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Arjun Pandya", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 21000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.603	2026-10-06 13:11:00.699
9e19ac0f-6a24-4da8-b899-220dee45f9b4	FEE_REMINDER	WHATSAPP	+91 9149382680	a212c7bd-fdb0-4318-b548-f00410aca157	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Nirav Kotak", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.606	2026-10-06 13:11:00.643
ac0e8069-8656-4720-9723-de052984bfaa	FEE_REMINDER	WHATSAPP	+91 9135802443	6b4679e1-c9e2-478f-831e-5ae366dadee5	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Kian Shah", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 21000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.626	2026-10-06 13:11:00.736
bb8c314c-0900-4dd5-b086-df67bdd6dae7	FEE_REMINDER	WHATSAPP	+91 9106172835	ef83cb29-7494-4866-93f5-6b8db4f755f9	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Kavya Dave", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 25200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.649	2026-10-06 13:11:00.666
bc5abe0a-4d6a-403a-b5d1-146218d9eb0f	FEE_REMINDER	WHATSAPP	+91 9143209845	cfcc87c4-cfc0-4b38-8b86-3f194aebdaf9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Ira Bhatt", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 33000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.651	2026-10-06 13:11:00.639
c58749ff-511a-4bdd-98fd-7fa075fa5a2a	FEE_REMINDER	WHATSAPP	+91 9140740711	09aeb2a1-42f8-4331-8b7d-18f26411521e	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Freya Dave", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 14400, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.654	2026-10-06 13:11:00.622
d89292be-2115-4be4-86ae-dd23cf259300	FEE_REMINDER	WHATSAPP	+91 9104938268	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Dhruv Trivedi", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 3600, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.674	2026-10-06 13:11:00.657
d9201448-84c6-43fd-9dbb-d590a42c6622	FEE_REMINDER	WHATSAPP	+91 9127160474	e49729f5-5787-4e00-b41d-34ad47b33438	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Nisha Raval", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4800, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.676	2026-10-06 13:11:00.718
e6dec4fd-b038-49c6-8f61-0e1f5be2eaa7	FEE_REMINDER	WHATSAPP	+91 9139506144	ca9f72a3-340d-41c7-b84e-e7ef22e6d5a2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Esha Trivedi", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 25200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.69	2026-10-06 13:11:00.618
f115ab7e-9703-467f-87b8-de1d182fa270	FEE_REMINDER	WHATSAPP	+91 9141975278	5bb5ca77-cf60-4002-896c-d9fec4905572	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Hridaan Vyas", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 26000, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.699	2026-10-06 13:11:00.63
f265faa9-325b-4bc2-b33e-faa78953031c	FEE_REMINDER	WHATSAPP	+91 9104938268	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Dhruv Trivedi", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 18000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.701	2026-10-06 13:11:00.662
f5b8eecb-41f7-40db-8a34-cec0c85bb504	FEE_REMINDER	WHATSAPP	+91 9133333309	2beedd2a-55a1-47d0-bd4e-ad62a01df6b0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Yash Pandya", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 16500, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.704	2026-10-06 13:11:00.614
149354b3-491a-4c43-aca9-5dc19bed5cd7	FEE_REMINDER	WHATSAPP	+91 9138271577	f0c61f2f-fbe7-49a1-ba48-c7f72db1584c	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Darsh Joshi", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 21000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.526	2026-10-06 13:11:00.796
191a0848-85d0-446f-80b2-031d87f62c1b	ANNOUNCEMENT	WHATSAPP	+91 9107407402	59aa66d6-6f25-4f11-acb1-a804fcc9823a	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.528	2026-10-06 13:24:59.422
1f3cbc5f-1cb2-4d4e-b545-bb7958b57008	RECEIPT	WHATSAPP	+91 9104938268	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Dhruv Trivedi", "amount": 2000, "receiptNo": "BB-U2-RCPT-2627-0002"}	SENT	\N	2026-10-06 13:24:59.529	2026-10-06 13:12:06.26
2a13a2d5-5d2a-4fcb-9585-684b8e37a0d0	RECEIPT	WHATSAPP	+91 9100000000	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aarav Patel", "amount": 8400, "receiptNo": "BB-U1-RCPT-2627-0004"}	SENT	\N	2026-10-06 13:24:59.536	2026-10-06 13:24:59.355
2fece320-9b0c-4dcf-a49a-4e61a05ca7d3	RECEIPT	WHATSAPP	+91 9104938268	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Dhruv Trivedi", "amount": 777, "receiptNo": "BB-U2-RCPT-2627-0001"}	SENT	\N	2026-10-06 13:24:59.541	2026-10-06 13:12:06.202
333e47e2-641c-4dc8-bd88-3097aed8f965	FEE_REMINDER	WHATSAPP	+91 9137037010	04022492-c42d-44dc-b6f7-f4ae49a7dc7e	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Avni Mehta", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 14400, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.544	2026-10-06 13:11:00.74
33670af2-997d-4727-b7bc-b3341f5040ee	FEE_REMINDER	WHATSAPP	+91 9145678979	71285030-2537-4dc0-a277-bba0b6a269a5	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Keya Thakkar", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.546	2026-10-06 13:11:00.759
4215088e-a5e3-40a4-9655-2498ae227079	FEE_REMINDER	WHATSAPP	+91 9148148113	9bb19d6c-7085-404e-9b65-f1f6d5391b96	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Meera Desai", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 9660, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.556	2026-10-06 13:11:00.8
5195f77b-f53e-4fed-8133-ef95f29caf05	FEE_REMINDER	WHATSAPP	+91 9138271577	f0c61f2f-fbe7-49a1-ba48-c7f72db1584c	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Darsh Joshi", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.561	2026-10-06 13:11:00.792
6088775f-0137-409f-af57-5e700363c21b	FEE_REMINDER	WHATSAPP	+91 9118518505	e3971fb6-68e0-4a74-8976-46f0081176c4	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Riya Shah", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 12600, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.567	2026-10-06 13:11:00.784
6824aa56-b0c6-40af-90c2-442c1d90ec50	ANNOUNCEMENT	WHATSAPP	+91 9109876536	6ed48cec-3632-4010-a50d-8aafff560dfa	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.574	2026-10-06 13:24:59.425
6877df31-54ea-4f0e-80d4-793360a25240	FEE_REMINDER	WHATSAPP	+91 9137037010	04022492-c42d-44dc-b6f7-f4ae49a7dc7e	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Avni Mehta", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 14400, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.575	2026-10-06 13:11:00.745
a26b4364-659c-4a4c-a18f-9bfeae6333c4	ANNOUNCEMENT	WHATSAPP	+91 9108641969	b977bd58-3325-4f78-ac66-358781f8da2e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.616	2026-10-06 13:24:59.424
a9b19168-5357-4cf7-aad7-4cea9fcac38d	ANNOUNCEMENT	WHATSAPP	+91 9102469134	332d5dcd-2b7a-4dbe-a64c-f9a72b2e94b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.621	2026-10-06 13:24:59.414
ab0c1b22-7a37-40f8-8976-c79acdbbb08d	RECEIPT	WHATSAPP	+91 9100000000	0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Aarav Patel", "amount": 2000, "receiptNo": "BB-U1-RCPT-2627-0003"}	SENT	\N	2026-10-06 13:24:59.623	2026-10-06 13:11:00.839
abef6b2f-4aa6-4393-ad3a-7f9350bbc128	FEE_REMINDER	WHATSAPP	+91 9145678979	71285030-2537-4dc0-a277-bba0b6a269a5	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Keya Thakkar", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 21000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.624	2026-10-06 13:11:00.763
ac652a29-f6e2-4a32-8011-380ef705ff66	FEE_REMINDER	WHATSAPP	+91 9148148113	9bb19d6c-7085-404e-9b65-f1f6d5391b96	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Meera Desai", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 11340, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.629	2026-10-06 13:11:00.803
b76321b4-73bf-45aa-a122-2dcf92af3976	FEE_REMINDER	WHATSAPP	+91 9144444412	729f5cad-8e65-4095-b45e-30859908fca8	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Jay Raval", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 10800, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.645	2026-10-06 13:11:00.755
c7525dcd-30f0-4bb7-a5f6-dce50c0fc901	FEE_REMINDER	WHATSAPP	+91 9108641969	b977bd58-3325-4f78-ac66-358781f8da2e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Diya Bhatt", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 21000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.657	2026-10-06 13:11:00.775
cb73a316-4b72-46c4-87b8-50a5b0c66d94	ANNOUNCEMENT	WHATSAPP	+91 9106172835	ef83cb29-7494-4866-93f5-6b8db4f755f9	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.666	2026-10-06 13:24:59.42
d0413de8-c035-4d76-82c1-b940f1ff028f	ANNOUNCEMENT	WHATSAPP	+91 9104938268	e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.667	2026-10-06 13:24:59.418
dbee17ac-952b-46df-8b0e-eaaf90ee6a96	FEE_REMINDER	WHATSAPP	+91 9144444412	729f5cad-8e65-4095-b45e-30859908fca8	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Jay Raval", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 10800, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.678	2026-10-06 13:11:00.75
de024d14-3745-4864-9b5e-669c0aa2fb19	ANNOUNCEMENT	WHATSAPP	+91 9112345670	112aab73-59f6-42bd-93a5-90ca666d994b	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.681	2026-10-06 13:24:59.428
e24c49c5-3a3c-439d-9f03-ab0ba08d0b83	FEE_REMINDER	WHATSAPP	+91 9128395041	a8e7a31e-375c-464b-960c-f525bf9e5f4e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Om Thakkar", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 25200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.685	2026-10-06 13:11:00.788
e54ca85b-9989-48db-8b0c-5355cd7d8fba	ANNOUNCEMENT	WHATSAPP	+91 9101234567	996a4d6d-6d45-4afe-982d-b6d0c67fd880	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.686	2026-10-06 13:24:59.412
e6361f17-fc17-469e-8e65-07366372bdd1	FEE_REMINDER	WHATSAPP	+91 9146913546	c1200c29-bbc0-460f-8227-2333e53ac856	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Laksh Gandhi", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 28800, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.688	2026-10-06 13:11:00.767
e86b9290-ea65-4402-ab23-7042b77b8c65	ANNOUNCEMENT	WHATSAPP	+91 9103703701	b0b96dc4-e78c-45c5-9518-954f6c4ec74f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.692	2026-10-06 13:24:59.416
f1658dfb-2ca0-40ac-bf1e-9789aa90d213	FEE_REMINDER	WHATSAPP	+91 9108641969	b977bd58-3325-4f78-ac66-358781f8da2e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Diya Bhatt", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 4200, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.7	2026-10-06 13:11:00.772
00cf4aa8-efaa-4366-92f5-d0f069da6813	ANNOUNCEMENT	WHATSAPP	+91 9137037010	04022492-c42d-44dc-b6f7-f4ae49a7dc7e	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.511	2026-10-06 13:24:59.463
026f91f5-b39a-4153-86ab-08e1d4c8cea5	ANNOUNCEMENT	WHATSAPP	+91 9146913546	c1200c29-bbc0-460f-8227-2333e53ac856	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.514	2026-10-06 13:24:59.474
031b4c04-fcc8-48b8-aa90-a72e0c0f9e79	ANNOUNCEMENT	WHATSAPP	+91 9134567876	754ef823-c39a-423a-ac0c-9eada75a5588	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.516	2026-10-06 13:24:59.46
2520815d-33ff-4677-83c0-42bf31dc71b1	ANNOUNCEMENT	WHATSAPP	+91 9132098742	4373e774-583b-47f5-92e2-a6f2714409de	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.532	2026-10-06 13:24:59.456
30a0484c-0b00-4475-9c09-28e0374f3020	ANNOUNCEMENT	WHATSAPP	+91 9117283938	7d0bbd56-5b89-4eee-9f9d-2f0a38f6c96a	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.543	2026-10-06 13:24:59.434
384dabc2-1284-45c8-a77a-994c22cf4f5a	ANNOUNCEMENT	WHATSAPP	+91 9122222206	89ac5cdb-c21a-458f-a5c3-3e85dd06986f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.55	2026-10-06 13:24:59.441
40071c14-a630-446a-9db3-cb0f45dd5b97	ANNOUNCEMENT	WHATSAPP	+91 9118518505	e3971fb6-68e0-4a74-8976-46f0081176c4	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.554	2026-10-06 13:24:59.436
586c9f8c-b98f-42e0-b5be-8040dd4da4ac	ANNOUNCEMENT	WHATSAPP	+91 9127160474	e49729f5-5787-4e00-b41d-34ad47b33438	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.562	2026-10-06 13:24:59.449
590691d3-12df-484f-b752-9f04d3ca14e5	ANNOUNCEMENT	WHATSAPP	+91 9123456773	3c073c40-4c7a-496a-a27f-a33a16089631	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.564	2026-10-06 13:24:59.443
609f51a3-e251-41b8-b4d8-251ed35d33ee	ANNOUNCEMENT	WHATSAPP	+91 9124691340	80525f93-f9b6-4e19-8a40-75e1b6fb9d07	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.568	2026-10-06 13:24:59.445
60abdf85-92f8-4c33-9359-9237a94e162d	ANNOUNCEMENT	WHATSAPP	+91 9125925907	e4ae36fe-fd5e-41ea-86c9-283007803a6e	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.57	2026-10-06 13:24:59.447
6173a2a0-23f7-4b25-b86b-8e3badf1073b	ANNOUNCEMENT	WHATSAPP	+91 9120987639	a2244cea-79c0-4d20-9749-e8a92181a5e8	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.572	2026-10-06 13:24:59.439
72eb9fdd-0585-452a-975e-2be3f5c56511	ANNOUNCEMENT	WHATSAPP	+91 9144444412	729f5cad-8e65-4095-b45e-30859908fca8	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.579	2026-10-06 13:24:59.472
8371d58c-9d15-4c65-b844-d587b19cdcc6	ANNOUNCEMENT	WHATSAPP	+91 9119753072	38aa0ab8-f293-4d9f-9e3c-ed433ff523df	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.589	2026-10-06 13:24:59.438
8432a35a-0d82-4478-9e5c-799fbec7db83	ANNOUNCEMENT	WHATSAPP	+91 9139506144	ca9f72a3-340d-41c7-b84e-e7ef22e6d5a2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.591	2026-10-06 13:24:59.466
8a32c476-ab73-4f12-ae86-a6c3bc5e0adf	ANNOUNCEMENT	WHATSAPP	+91 9135802443	6b4679e1-c9e2-478f-831e-5ae366dadee5	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.596	2026-10-06 13:24:59.461
9ef5e90b-3264-411a-811c-b93d0a194a0d	ANNOUNCEMENT	WHATSAPP	+91 9114814804	6b8c37a5-d0be-40f7-8c80-705e956562af	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.608	2026-10-06 13:24:59.431
a14e0c96-338d-48ef-940b-d08eb5a38a9e	ANNOUNCEMENT	WHATSAPP	+91 9116049371	3df859ab-c8d8-4a65-9410-b559c2a25dbe	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.61	2026-10-06 13:24:59.433
a75956fc-f9a5-43c6-b209-96067aa03398	ANNOUNCEMENT	WHATSAPP	+91 9130864175	5c18e94a-8710-41a8-a05c-0aa6ab23f9b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.619	2026-10-06 13:24:59.454
ad8c0a6a-c5fb-4362-b525-89ee9c342702	ANNOUNCEMENT	WHATSAPP	+91 9133333309	2beedd2a-55a1-47d0-bd4e-ad62a01df6b0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.631	2026-10-06 13:24:59.458
add1f70e-cd5c-4b31-b2a6-44d83881fad1	ANNOUNCEMENT	WHATSAPP	+91 9140740711	09aeb2a1-42f8-4331-8b7d-18f26411521e	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.633	2026-10-06 13:24:59.468
b315bf8b-570a-43f8-8f19-09c64babd1a4	ANNOUNCEMENT	WHATSAPP	+91 9128395041	a8e7a31e-375c-464b-960c-f525bf9e5f4e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.639	2026-10-06 13:24:59.451
b7d5dca7-2c91-4a42-98c4-1f1a1b73d664	ANNOUNCEMENT	WHATSAPP	+91 9138271577	f0c61f2f-fbe7-49a1-ba48-c7f72db1584c	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.647	2026-10-06 13:24:59.465
c6e84ed7-93d5-4f7f-bb87-75e9e9204712	ANNOUNCEMENT	WHATSAPP	+91 9129629608	207c5b92-d926-4e6c-8175-da91f1df29c9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.656	2026-10-06 13:24:59.452
c8a010fe-26a4-4911-ab21-36c2d0315c51	ANNOUNCEMENT	WHATSAPP	+91 9113580237	c97c1ae1-5a82-40b2-b745-f39361fdc808	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.66	2026-10-06 13:24:59.429
f517abc5-ca04-41d4-8e90-2665b8d1bb7d	ANNOUNCEMENT	WHATSAPP	+91 9141975278	5bb5ca77-cf60-4002-896c-d9fec4905572	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.703	2026-10-06 13:24:59.469
fe61a932-5d53-4e70-8515-473cccdf070e	ANNOUNCEMENT	WHATSAPP	+91 9145678979	71285030-2537-4dc0-a277-bba0b6a269a5	ad026061-28f0-485b-82ae-1ad3e12310dd	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.707	2026-10-06 13:24:59.473
004b21ab-6074-465f-8145-c67411014b6d	ANNOUNCEMENT	WHATSAPP	+91 9143209845	cfcc87c4-cfc0-4b38-8b86-3f194aebdaf9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.508	2026-10-06 13:24:59.47
0198d2eb-e248-4543-9ab2-2af465a7a3cf	FEE_REMINDER	WHATSAPP	+91 9123456773	3c073c40-4c7a-496a-a27f-a33a16089631	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Jiya Dave", "stage": "T+7", "dueDate": "2026-04-10", "amountDue": 2750, "instalmentNo": 1}	SENT	\N	2026-10-06 13:24:59.512	2026-10-06 13:11:00.58
07ec8a8b-417b-4e32-aa18-e53e24bffa4c	FEE_REMINDER	WHATSAPP	+91 9149382680	a212c7bd-fdb0-4318-b548-f00410aca157	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Nirav Kotak", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 21000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.517	2026-10-06 13:11:00.648
0cfdbde7-d1d9-4540-8bcb-e768979dff30	FEE_REMINDER	WHATSAPP	+91 9118518505	e3971fb6-68e0-4a74-8976-46f0081176c4	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"child": "Riya Shah", "stage": "T+7", "dueDate": "2026-07-10", "amountDue": 12600, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.52	2026-10-06 13:11:00.78
3404a685-15db-4d9b-b6af-b80dc24c5af1	ANNOUNCEMENT	WHATSAPP	+91 9111111103	e474709a-3b43-437b-b79e-c39995bfdb84	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.547	2026-10-06 13:24:59.427
4c4bb9db-ea74-4806-90c4-df83ff15bd04	ANNOUNCEMENT	WHATSAPP	+91 9150617247	bc8ee0f2-9066-41de-a2f5-cf71b4cb0a12	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.56	2026-10-06 13:24:59.479
9264404f-9c0c-457c-aacc-cee8305a4f43	FEE_REMINDER	WHATSAPP	+91 9101234567	996a4d6d-6d45-4afe-982d-b6d0c67fd880	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"child": "Vihaan Shah", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 24000, "instalmentNo": 2}	SENT	\N	2026-10-06 13:24:59.601	2026-10-06 13:11:00.517
b4b2b8ed-08ba-48d7-a65a-0935afd388eb	ANNOUNCEMENT	WHATSAPP	+91 9149382680	a212c7bd-fdb0-4318-b548-f00410aca157	844a4405-6984-4180-9ed8-dc3ff1ce74b2	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.643	2026-10-06 13:24:59.477
c9e6f93b-338e-44df-82c6-f894770fcb06	FEE_REMINDER	WHATSAPP	+91 9125925907	e4ae36fe-fd5e-41ea-86c9-283007803a6e	ad026061-28f0-485b-82ae-1ad3e12310dd	{"child": "Mahi Bhatt", "stage": "T-5", "dueDate": "2026-10-10", "amountDue": 12600, "instalmentNo": 3}	SENT	\N	2026-10-06 13:24:59.662	2026-10-06 13:11:00.714
e9826586-ec92-4de7-99c6-018372493a29	ANNOUNCEMENT	WHATSAPP	+91 9148148113	9bb19d6c-7085-404e-9b65-f1f6d5391b96	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	{"by": "Helly (Founder)", "body": "School closed 20–25 Oct. Happy Diwali from the BumbleB family!", "title": "Diwali Break 🎆"}	SENT	\N	2026-10-06 13:24:59.693	2026-10-06 13:24:59.476
\.


--
-- Data for Name: programmes; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.programmes (id, code, name, tier_name, age_min, age_max, level_colour, sort_order) FROM stdin;
afa7f7d0-3165-4384-a665-312af481e616	TODD_CARE	Todd Care	Baby Bees	1.5	2.5	#F5D547	1
20a7895f-57d1-4296-8af2-3c22b2f81653	PLAYHOUSE	PlayHouse	Beginner Bees	2.5	3.5	#F8C8DC	2
e140cb07-139f-486c-8388-02335a726f86	PREK	PreK	Busy Bees	3.5	4.5	#AEDFF7	3
8e12570f-92ab-4de5-a630-49178b43173b	K1	K1	Blooming Bees	4.5	5.5	#D6C5F0	4
3485ec36-cc48-479a-9f51-e0a8c456aad0	K2	K2	Brilliant Bees	5.5	6.5	#BBE5B3	5
\.


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.students (id, unit_id, admission_no, first_name, last_name, dob, gender, photo_url, blood_group, allergies, medical_notes, father_name, father_phone, mother_name, mother_phone, address_area, programme_id, batch_id, admission_date, instalment_plan, status, academic_year, sibling_group, lead_id, created_at, updated_at) FROM stdin;
996a4d6d-6d45-4afe-982d-b6d0c67fd880	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0002	Vihaan	Shah	2023-03-31	Female	\N	\N	\N	\N	Amit Shah	+91 9101234567	Payal Shah	\N	Kalawad Road	e140cb07-139f-486c-8388-02335a726f86	792db192-b75e-40cf-a750-eb859d29c92a	2026-06-02	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.625	2026-10-06 13:05:50.625
332d5dcd-2b7a-4dbe-a64c-f9a72b2e94b9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0003	Reyansh	Mehta	2021-04-24	Male	\N	\N	\N	\N	Sanjay Mehta	+91 9102469134	Hetal Mehta	\N	Tirupati Nagar	8e12570f-92ab-4de5-a630-49178b43173b	005b011c-c049-4acb-8ea0-858a11d3c588	2026-06-03	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.627	2026-10-06 13:05:50.627
b0b96dc4-e78c-45c5-9518-954f6c4ec74f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0004	Krish	Joshi	2020-08-31	Female	\N	\N	\N	\N	Hitesh Joshi	+91 9103703701	Bhavna Joshi	\N	Nirmala Road	3485ec36-cc48-479a-9f51-e0a8c456aad0	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	2026-06-04	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.629	2026-10-06 13:05:50.629
e565114e-2c31-438f-8d56-42ad90051af3	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0005	Dhruv	Trivedi	2024-11-21	Male	\N	\N	\N	\N	Paresh Trivedi	+91 9104938268	Komal Trivedi	\N	Jivraj Park	afa7f7d0-3165-4384-a665-312af481e616	8b5eacff-a956-4660-bae9-87479832f69e	2026-06-05	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.631	2026-10-06 13:05:50.631
ef83cb29-7494-4866-93f5-6b8db4f755f9	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0006	Kavya	Dave	2023-04-15	Female	\N	\N	\N	\N	Mehul Dave	+91 9106172835	Rupal Dave	\N	University Road	20a7895f-57d1-4296-8af2-3c22b2f81653	bcad12bd-ddff-42ac-9bbb-414b16bb0314	2026-06-06	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.633	2026-10-06 13:05:50.633
59aa66d6-6f25-4f11-acb1-a804fcc9823a	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0007	Anaya	Vyas	2023-03-07	Male	\N	\N	\N	\N	Rajesh Vyas	+91 9107407402	Nita Vyas	\N	Saraswati Nagar	e140cb07-139f-486c-8388-02335a726f86	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	2026-06-07	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.634	2026-10-06 13:05:50.634
b977bd58-3325-4f78-ac66-358781f8da2e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	BB-U3-2627-0008	Diya	Bhatt	2024-01-07	Female	\N	\N	\N	\N	Amit Bhatt	+91 9108641969	Payal Bhatt	\N	Kalawad Road	20a7895f-57d1-4296-8af2-3c22b2f81653	d2f770d8-64ee-41a5-9339-90d949a76d1d	2026-06-08	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.636	2026-10-06 13:05:50.636
6ed48cec-3632-4010-a50d-8aafff560dfa	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0009	Myra	Raval	2023-07-01	Male	\N	\N	\N	\N	Sanjay Raval	+91 9109876536	Hetal Raval	\N	Tirupati Nagar	20a7895f-57d1-4296-8af2-3c22b2f81653	c43da4a2-e3f5-4995-9494-699a405678b9	2026-06-09	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.638	2026-10-06 13:05:50.638
e474709a-3b43-437b-b79e-c39995bfdb84	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0010	Saanvi	Thakkar	2022-08-02	Female	\N	\N	\N	\N	Hitesh Thakkar	+91 9111111103	Bhavna Thakkar	\N	Nirmala Road	e140cb07-139f-486c-8388-02335a726f86	792db192-b75e-40cf-a750-eb859d29c92a	2026-06-10	PLAN_A	ACTIVE	2026-27	FAM-0	\N	2026-10-06 13:05:50.64	2026-10-06 13:05:50.64
112aab73-59f6-42bd-93a5-90ca666d994b	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0011	Aadhya	Gandhi	2021-12-05	Male	\N	\N	\N	\N	Paresh Gandhi	+91 9112345670	Komal Gandhi	\N	Jivraj Park	8e12570f-92ab-4de5-a630-49178b43173b	005b011c-c049-4acb-8ea0-858a11d3c588	2026-06-11	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.641	2026-10-06 13:05:50.641
c97c1ae1-5a82-40b2-b745-f39361fdc808	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0012	Kiara	Desai	2020-04-08	Female	\N	\N	\N	\N	Mehul Desai	+91 9113580237	Rupal Desai	\N	University Road	3485ec36-cc48-479a-9f51-e0a8c456aad0	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	2026-06-12	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.643	2026-10-06 13:05:50.643
6b8c37a5-d0be-40f7-8c80-705e956562af	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0013	Ishaan	Kotak	2025-02-05	Male	\N	\N	\N	\N	Rajesh Kotak	+91 9114814804	Nita Kotak	\N	Saraswati Nagar	afa7f7d0-3165-4384-a665-312af481e616	8b5eacff-a956-4660-bae9-87479832f69e	2026-06-13	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.645	2026-10-06 13:05:50.645
3df859ab-c8d8-4a65-9410-b559c2a25dbe	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0014	Arjun	Pandya	2023-05-11	Female	\N	\N	\N	\N	Amit Pandya	+91 9116049371	Payal Pandya	\N	Kalawad Road	20a7895f-57d1-4296-8af2-3c22b2f81653	bcad12bd-ddff-42ac-9bbb-414b16bb0314	2026-06-14	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.646	2026-10-06 13:05:50.646
7d0bbd56-5b89-4eee-9f9d-2f0a38f6c96a	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0015	Shiv	Patel	2022-10-12	Male	\N	\N	\N	\N	Sanjay Patel	+91 9117283938	Hetal Patel	\N	Tirupati Nagar	e140cb07-139f-486c-8388-02335a726f86	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	2026-06-15	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.648	2026-10-06 13:05:50.648
e3971fb6-68e0-4a74-8976-46f0081176c4	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	BB-U3-2627-0016	Riya	Shah	2023-11-05	Female	\N	\N	\N	\N	Hitesh Shah	+91 9118518505	Bhavna Shah	\N	Nirmala Road	20a7895f-57d1-4296-8af2-3c22b2f81653	d2f770d8-64ee-41a5-9339-90d949a76d1d	2026-06-16	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.65	2026-10-06 13:05:50.65
38aa0ab8-f293-4d9f-9e3c-ed433ff523df	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0017	Pari	Mehta	2023-11-29	Male	\N	\N	\N	\N	Paresh Mehta	+91 9119753072	Komal Mehta	\N	Jivraj Park	20a7895f-57d1-4296-8af2-3c22b2f81653	c43da4a2-e3f5-4995-9494-699a405678b9	2026-06-17	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.652	2026-10-06 13:05:50.652
a2244cea-79c0-4d20-9749-e8a92181a5e8	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0018	Veer	Joshi	2022-11-05	Female	\N	\N	\N	\N	Mehul Joshi	+91 9120987639	Rupal Joshi	\N	University Road	e140cb07-139f-486c-8388-02335a726f86	792db192-b75e-40cf-a750-eb859d29c92a	2026-06-18	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.653	2026-10-06 13:05:50.653
89ac5cdb-c21a-458f-a5c3-3e85dd06986f	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0019	Hetvi	Trivedi	2022-02-24	Male	\N	\N	\N	\N	Rajesh Trivedi	+91 9122222206	Nita Trivedi	\N	Saraswati Nagar	8e12570f-92ab-4de5-a630-49178b43173b	005b011c-c049-4acb-8ea0-858a11d3c588	2026-06-19	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.655	2026-10-06 13:05:50.655
3c073c40-4c7a-496a-a27f-a33a16089631	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0020	Jiya	Dave	2020-07-20	Female	\N	\N	\N	\N	Amit Dave	+91 9123456773	Payal Dave	\N	Kalawad Road	3485ec36-cc48-479a-9f51-e0a8c456aad0	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	2026-06-20	PLAN_B	ACTIVE	2026-27	FAM-1	\N	2026-10-06 13:05:50.657	2026-10-06 13:05:50.657
80525f93-f9b6-4e19-8a40-75e1b6fb9d07	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0021	Dev	Vyas	2024-04-19	Male	\N	\N	\N	\N	Sanjay Vyas	+91 9124691340	Hetal Vyas	\N	Tirupati Nagar	afa7f7d0-3165-4384-a665-312af481e616	8b5eacff-a956-4660-bae9-87479832f69e	2026-06-21	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.659	2026-10-06 13:05:50.659
e4ae36fe-fd5e-41ea-86c9-283007803a6e	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0022	Mahi	Bhatt	2024-01-13	Female	\N	\N	\N	\N	Hitesh Bhatt	+91 9125925907	Bhavna Bhatt	\N	Nirmala Road	20a7895f-57d1-4296-8af2-3c22b2f81653	bcad12bd-ddff-42ac-9bbb-414b16bb0314	2026-06-22	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.661	2026-10-06 13:05:50.661
e49729f5-5787-4e00-b41d-34ad47b33438	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0023	Nisha	Raval	2022-11-29	Male	\N	\N	\N	\N	Paresh Raval	+91 9127160474	Komal Raval	\N	Jivraj Park	e140cb07-139f-486c-8388-02335a726f86	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	2026-06-23	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.662	2026-10-06 13:05:50.662
a8e7a31e-375c-464b-960c-f525bf9e5f4e	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	BB-U3-2627-0024	Om	Thakkar	2024-01-19	Female	\N	\N	\N	\N	Mehul Thakkar	+91 9128395041	Rupal Thakkar	\N	University Road	20a7895f-57d1-4296-8af2-3c22b2f81653	d2f770d8-64ee-41a5-9339-90d949a76d1d	2026-06-24	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.664	2026-10-06 13:05:50.664
207c5b92-d926-4e6c-8175-da91f1df29c9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0025	Prisha	Gandhi	2023-05-01	Male	\N	\N	\N	\N	Rajesh Gandhi	+91 9129629608	Nita Gandhi	\N	Saraswati Nagar	20a7895f-57d1-4296-8af2-3c22b2f81653	c43da4a2-e3f5-4995-9494-699a405678b9	2026-06-25	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.665	2026-10-06 13:05:50.665
5c18e94a-8710-41a8-a05c-0aa6ab23f9b2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0026	Rudra	Desai	2023-02-28	Female	\N	\N	\N	\N	Amit Desai	+91 9130864175	Payal Desai	\N	Kalawad Road	e140cb07-139f-486c-8388-02335a726f86	792db192-b75e-40cf-a750-eb859d29c92a	2026-06-01	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.667	2026-10-06 13:05:50.667
4373e774-583b-47f5-92e2-a6f2714409de	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0027	Tara	Kotak	2022-04-03	Male	\N	\N	\N	\N	Sanjay Kotak	+91 9132098742	Hetal Kotak	\N	Tirupati Nagar	8e12570f-92ab-4de5-a630-49178b43173b	005b011c-c049-4acb-8ea0-858a11d3c588	2026-06-02	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.669	2026-10-06 13:05:50.669
2beedd2a-55a1-47d0-bd4e-ad62a01df6b0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0028	Yash	Pandya	2020-10-26	Female	\N	\N	\N	\N	Hitesh Pandya	+91 9133333309	Bhavna Pandya	\N	Nirmala Road	3485ec36-cc48-479a-9f51-e0a8c456aad0	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	2026-06-03	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.671	2026-10-06 13:05:50.671
754ef823-c39a-423a-ac0c-9eada75a5588	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0029	Zara	Patel	2024-06-12	Male	\N	\N	\N	\N	Paresh Patel	+91 9134567876	Komal Patel	\N	Jivraj Park	afa7f7d0-3165-4384-a665-312af481e616	8b5eacff-a956-4660-bae9-87479832f69e	2026-06-04	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.673	2026-10-06 13:05:50.673
6b4679e1-c9e2-478f-831e-5ae366dadee5	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0030	Kian	Shah	2023-11-08	Female	\N	\N	\N	\N	Mehul Shah	+91 9135802443	Rupal Shah	\N	University Road	20a7895f-57d1-4296-8af2-3c22b2f81653	bcad12bd-ddff-42ac-9bbb-414b16bb0314	2026-06-05	PLAN_C	ACTIVE	2026-27	FAM-2	\N	2026-10-06 13:05:50.675	2026-10-06 13:05:50.675
04022492-c42d-44dc-b6f7-f4ae49a7dc7e	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0031	Avni	Mehta	2022-06-20	Male	\N	\N	\N	\N	Rajesh Mehta	+91 9137037010	Nita Mehta	\N	Saraswati Nagar	e140cb07-139f-486c-8388-02335a726f86	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	2026-06-06	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.677	2026-10-06 13:05:50.677
f0c61f2f-fbe7-49a1-ba48-c7f72db1584c	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	BB-U3-2627-0032	Darsh	Joshi	2024-01-11	Female	\N	\N	\N	\N	Amit Joshi	+91 9138271577	Payal Joshi	\N	Kalawad Road	20a7895f-57d1-4296-8af2-3c22b2f81653	d2f770d8-64ee-41a5-9339-90d949a76d1d	2026-06-07	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.679	2026-10-06 13:05:50.679
ca9f72a3-340d-41c7-b84e-e7ef22e6d5a2	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0033	Esha	Trivedi	2023-06-08	Male	\N	\N	\N	\N	Sanjay Trivedi	+91 9139506144	Hetal Trivedi	\N	Tirupati Nagar	20a7895f-57d1-4296-8af2-3c22b2f81653	c43da4a2-e3f5-4995-9494-699a405678b9	2026-06-08	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.68	2026-10-06 13:05:50.68
09aeb2a1-42f8-4331-8b7d-18f26411521e	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0034	Freya	Dave	2022-06-29	Female	\N	\N	\N	\N	Hitesh Dave	+91 9140740711	Bhavna Dave	\N	Nirmala Road	e140cb07-139f-486c-8388-02335a726f86	792db192-b75e-40cf-a750-eb859d29c92a	2026-06-09	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.683	2026-10-06 13:05:50.683
5bb5ca77-cf60-4002-896c-d9fec4905572	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0035	Hridaan	Vyas	2022-03-31	Male	\N	\N	\N	\N	Paresh Vyas	+91 9141975278	Komal Vyas	\N	Jivraj Park	8e12570f-92ab-4de5-a630-49178b43173b	005b011c-c049-4acb-8ea0-858a11d3c588	2026-06-10	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.684	2026-10-06 13:05:50.684
cfcc87c4-cfc0-4b38-8b86-3f194aebdaf9	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0036	Ira	Bhatt	2020-11-04	Female	\N	\N	\N	\N	Mehul Bhatt	+91 9143209845	Rupal Bhatt	\N	University Road	3485ec36-cc48-479a-9f51-e0a8c456aad0	7dce2b24-12f4-4f79-8dbf-6a5acd1a32a1	2026-06-11	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.686	2026-10-06 13:05:50.686
729f5cad-8e65-4095-b45e-30859908fca8	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0037	Jay	Raval	2024-11-05	Male	\N	\N	\N	\N	Rajesh Raval	+91 9144444412	Nita Raval	\N	Saraswati Nagar	afa7f7d0-3165-4384-a665-312af481e616	8b5eacff-a956-4660-bae9-87479832f69e	2026-06-12	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.689	2026-10-06 13:05:50.689
71285030-2537-4dc0-a277-bba0b6a269a5	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0038	Keya	Thakkar	2024-03-04	Female	\N	\N	\N	\N	Amit Thakkar	+91 9145678979	Payal Thakkar	\N	Kalawad Road	20a7895f-57d1-4296-8af2-3c22b2f81653	bcad12bd-ddff-42ac-9bbb-414b16bb0314	2026-06-13	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.691	2026-10-06 13:05:50.691
c1200c29-bbc0-460f-8227-2333e53ac856	ad026061-28f0-485b-82ae-1ad3e12310dd	BB-U2-2627-0039	Laksh	Gandhi	2022-08-06	Male	\N	\N	\N	\N	Sanjay Gandhi	+91 9146913546	Hetal Gandhi	\N	Tirupati Nagar	e140cb07-139f-486c-8388-02335a726f86	614b5d9f-78c6-49e4-9e40-dfbb9cd3180d	2026-06-14	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.693	2026-10-06 13:05:50.693
9bb19d6c-7085-404e-9b65-f1f6d5391b96	c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	BB-U3-2627-0040	Meera	Desai	2024-01-17	Female	\N	\N	\N	\N	Hitesh Desai	+91 9148148113	Bhavna Desai	\N	Nirmala Road	20a7895f-57d1-4296-8af2-3c22b2f81653	d2f770d8-64ee-41a5-9339-90d949a76d1d	2026-06-15	PLAN_A	ACTIVE	2026-27	FAM-3	\N	2026-10-06 13:05:50.694	2026-10-06 13:05:50.694
a212c7bd-fdb0-4318-b548-f00410aca157	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0041	Nirav	Kotak	2023-11-16	Male	\N	\N	\N	\N	Paresh Kotak	+91 9149382680	Komal Kotak	\N	Jivraj Park	20a7895f-57d1-4296-8af2-3c22b2f81653	c43da4a2-e3f5-4995-9494-699a405678b9	2026-06-16	PLAN_B	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.696	2026-10-06 13:05:50.696
bc8ee0f2-9066-41de-a2f5-cf71b4cb0a12	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0042	Pia	Pandya	2022-11-11	Female	\N	\N	\N	\N	Mehul Pandya	+91 9150617247	Rupal Pandya	\N	University Road	e140cb07-139f-486c-8388-02335a726f86	792db192-b75e-40cf-a750-eb859d29c92a	2026-06-17	PLAN_C	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.698	2026-10-06 13:05:50.698
0b08d903-6908-4057-8a23-b14257903ac0	844a4405-6984-4180-9ed8-dc3ff1ce74b2	BB-U1-2627-0001	Aarav	Patel	2024-03-25	Male	\N	\N	\N	\N	Rajesh Patel	+91 9100000000	Nita Patel	\N	Saraswati Nagar	20a7895f-57d1-4296-8af2-3c22b2f81653	c43da4a2-e3f5-4995-9494-699a405678b9	2026-06-01	PLAN_A	ACTIVE	2026-27	\N	\N	2026-10-06 13:05:50.622	2026-10-06 13:24:59.377
\.


--
-- Data for Name: unit_settings; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.unit_settings (unit_id, petty_cash_float, admission_number, calendly_link, updated_at) FROM stdin;
844a4405-6984-4180-9ed8-dc3ff1ce74b2	5000.00	\N	\N	2026-10-06 13:05:50.456
ad026061-28f0-485b-82ae-1ad3e12310dd	5000.00	\N	calendly.com/bumblebkidz/new-meeting	2026-10-06 13:05:50.46
c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	5000.00	\N	\N	2026-10-06 13:05:50.462
\.


--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.units (id, code, name, type, address, phone, email, website, status, created_at) FROM stdin;
844a4405-6984-4180-9ed8-dc3ff1ce74b2	U1	Unit 1 – Saraswati	COMPANY_OWNED	Saraswati Campus, Rajkot	+91 98000 00001	u1@bumblebkidz.com	\N	ACTIVE	2026-10-06 13:05:50.451
ad026061-28f0-485b-82ae-1ad3e12310dd	U2	Unit 2 – Rajkot Flagship	COMPANY_OWNED	1 Tirupati Nagar, Nirmala Road, Rajkot	+91 98000 00002	bumblebkidz@gmail.com	bumblebwebsite.com	ACTIVE	2026-10-06 13:05:50.453
c1e3ceb1-8a7b-4e1c-b454-1b0e7421c6aa	U3	Unit 3 – Jivraj Park	COMPANY_OWNED	Rajkot Public School Building, Jivraj Park Main Road	+91 98000 00003	u3@bumblebkidz.com	\N	DEVELOPMENT	2026-10-06 13:05:50.455
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: bumbleb
--

COPY public.users (id, email, password_hash, full_name, phone, role, unit_id, is_active, last_login_at, created_at) FROM stdin;
086acdee-ea4f-4cf6-87b7-390fb203e2e9	ad@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Academic Director	\N	ACADEMIC_DIR	\N	t	\N	2026-10-06 13:05:50.576
569c0568-afc9-4de5-8a8e-452de85b5a0a	falguni@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Falguni (Curriculum Lead)	\N	CURRICULUM_LEAD	\N	t	\N	2026-10-06 13:05:50.578
64311398-af7a-4145-8bf2-debba1b38207	coord.u1@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Coordinator — Unit 1	\N	COORDINATOR	844a4405-6984-4180-9ed8-dc3ff1ce74b2	t	\N	2026-10-06 13:05:50.582
f897d384-b4ff-47ad-8d37-72518b325ac1	reception@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Central Hub Receptionist	\N	RECEPTIONIST	\N	t	\N	2026-10-06 13:05:50.586
f8b74f34-c8d7-4fa8-97b0-e3e18ec9442d	ch.u2@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Centre Head — Unit 2	\N	CENTRE_HEAD	ad026061-28f0-485b-82ae-1ad3e12310dd	t	2026-10-06 13:12:06.166	2026-10-06 13:05:50.581
0c006da1-6038-405d-a74d-4d3333ab7795	ch.u1@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Centre Head — Unit 1	\N	CENTRE_HEAD	844a4405-6984-4180-9ed8-dc3ff1ce74b2	t	2026-10-06 13:24:59.078	2026-10-06 13:05:50.579
a1693265-c0ab-4279-ad7a-5bedf3022e25	teacher.u1@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Teacher — K1 Unit 1	\N	TEACHER	844a4405-6984-4180-9ed8-dc3ff1ce74b2	t	2026-10-06 13:24:59.17	2026-10-06 13:05:50.584
50966236-ace6-45a3-8fbd-7205d74d4845	founder@bumblebkidz.com	$2a$10$6u/d12d4sHYKUJV6NJBdZO2tjPL.KJLCxfRp34wWytUv/OeHN/zcm	Helly (Founder)	\N	FOUNDER	\N	t	2026-10-06 13:32:22.777	2026-10-06 13:05:50.573
\.


--
-- Name: area_master area_master_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.area_master
    ADD CONSTRAINT area_master_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: consent_log consent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.consent_log
    ADD CONSTRAINT consent_log_pkey PRIMARY KEY (id);


--
-- Name: discovery_flights discovery_flights_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.discovery_flights
    ADD CONSTRAINT discovery_flights_pkey PRIMARY KEY (id);


--
-- Name: fee_structures fee_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);


--
-- Name: fee_transactions fee_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.fee_transactions
    ADD CONSTRAINT fee_transactions_pkey PRIMARY KEY (id);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: message_logs message_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.message_logs
    ADD CONSTRAINT message_logs_pkey PRIMARY KEY (id);


--
-- Name: programmes programmes_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: unit_settings unit_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.unit_settings
    ADD CONSTRAINT unit_settings_pkey PRIMARY KEY (unit_id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: attendance_records_student_id_date_batch_id_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX attendance_records_student_id_date_batch_id_key ON public.attendance_records USING btree (student_id, date, batch_id);


--
-- Name: certificates_serial_no_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX certificates_serial_no_key ON public.certificates USING btree (serial_no);


--
-- Name: fee_structures_unit_id_programme_id_academic_year_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX fee_structures_unit_id_programme_id_academic_year_key ON public.fee_structures USING btree (unit_id, programme_id, academic_year);


--
-- Name: fee_transactions_receipt_no_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX fee_transactions_receipt_no_key ON public.fee_transactions USING btree (receipt_no);


--
-- Name: leads_inquiry_no_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX leads_inquiry_no_key ON public.leads USING btree (inquiry_no);


--
-- Name: programmes_code_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX programmes_code_key ON public.programmes USING btree (code);


--
-- Name: students_admission_no_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX students_admission_no_key ON public.students USING btree (admission_no);


--
-- Name: students_lead_id_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX students_lead_id_key ON public.students USING btree (lead_id);


--
-- Name: units_code_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX units_code_key ON public.units USING btree (code);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: bumbleb
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: area_master area_master_suggested_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.area_master
    ADD CONSTRAINT area_master_suggested_unit_id_fkey FOREIGN KEY (suggested_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_log audit_log_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: batches batches_programme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: batches batches_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: certificates certificates_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: discovery_flights discovery_flights_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.discovery_flights
    ADD CONSTRAINT discovery_flights_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: discovery_flights discovery_flights_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.discovery_flights
    ADD CONSTRAINT discovery_flights_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: discovery_flights discovery_flights_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.discovery_flights
    ADD CONSTRAINT discovery_flights_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_structures fee_structures_programme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_structures fee_structures_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_transactions fee_transactions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.fee_transactions
    ADD CONSTRAINT fee_transactions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fee_transactions fee_transactions_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.fee_transactions
    ADD CONSTRAINT fee_transactions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lead_activities lead_activities_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_by_id_fkey FOREIGN KEY (by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leads leads_assigned_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_unit_id_fkey FOREIGN KEY (assigned_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: leads leads_programme_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_programme_interest_id_fkey FOREIGN KEY (programme_interest_id) REFERENCES public.programmes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: leads leads_suggested_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_suggested_unit_id_fkey FOREIGN KEY (suggested_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: message_logs message_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.message_logs
    ADD CONSTRAINT message_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: students students_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: students students_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: students students_programme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: students students_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: unit_settings unit_settings_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.unit_settings
    ADD CONSTRAINT unit_settings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: bumbleb
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict Jq9bUWjdAO2vycXoHtFy4fdMHD4MB1SNjRBauQU8r2Ahx8lY665bDuWCLgrfkYM

