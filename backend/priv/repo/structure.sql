--
-- PostgreSQL database dump
--

\restrict gQdkgForM5nYzwpza0wLfJXvOsEhvB7xIftbSWeGmrNwwbiIQcP5jcfwlHV8Iu5

-- Dumped from database version 17.7 (Homebrew)
-- Dumped by pg_dump version 17.7 (Homebrew)

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
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: oban_job_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.oban_job_state AS ENUM (
    'available',
    'suspended',
    'scheduled',
    'executing',
    'retryable',
    'completed',
    'discarded',
    'cancelled'
);


--
-- Name: ash_elixir_and(anycompatible, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_and("left" anycompatible, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT CASE
    WHEN $1 IS NOT NULL THEN $2
    ELSE $1
  END $_$;


--
-- Name: ash_elixir_and(boolean, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_and("left" boolean, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  SELECT CASE
    WHEN $1 IS TRUE THEN $2
    ELSE $1
  END $_$;


--
-- Name: ash_elixir_or(anycompatible, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_or("left" anycompatible, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$ SELECT COALESCE($1, $2) $_$;


--
-- Name: ash_elixir_or(boolean, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_elixir_or("left" boolean, "right" anycompatible, OUT f1 anycompatible) RETURNS anycompatible
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$ SELECT COALESCE(NULLIF($1, FALSE), $2) $_$;


--
-- Name: ash_raise_error(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_raise_error(json_data jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
    -- Raise an error with the provided JSON data.
    -- The JSON object is converted to text for inclusion in the error message.
    RAISE EXCEPTION 'ash_error: %', json_data::text;
    RETURN NULL;
END;
$$;


--
-- Name: ash_raise_error(jsonb, anycompatible); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_raise_error(json_data jsonb, type_signal anycompatible) RETURNS anycompatible
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
BEGIN
    -- Raise an error with the provided JSON data.
    -- The JSON object is converted to text for inclusion in the error message.
    RAISE EXCEPTION 'ash_error: %', json_data::text;
    RETURN NULL;
END;
$$;


--
-- Name: ash_trim_whitespace(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ash_trim_whitespace(arr text[]) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
    start_index INT = 1;
    end_index INT = array_length(arr, 1);
BEGIN
    WHILE start_index <= end_index AND arr[start_index] = '' LOOP
        start_index := start_index + 1;
    END LOOP;

    WHILE end_index >= start_index AND arr[end_index] = '' LOOP
        end_index := end_index - 1;
    END LOOP;

    IF start_index > end_index THEN
        RETURN ARRAY[]::text[];
    ELSE
        RETURN arr[start_index : end_index];
    END IF;
END; $$;


--
-- Name: uuid_generate_v7(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uuid_generate_v7() RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  timestamp    TIMESTAMPTZ;
  microseconds INT;
BEGIN
  timestamp    = clock_timestamp();
  microseconds = (cast(extract(microseconds FROM timestamp)::INT - (floor(extract(milliseconds FROM timestamp))::INT * 1000) AS DOUBLE PRECISION) * 4.096)::INT;

  RETURN encode(
    set_byte(
      set_byte(
        overlay(uuid_send(gen_random_uuid()) placing substring(int8send(floor(extract(epoch FROM timestamp) * 1000)::BIGINT) FROM 3) FROM 1 FOR 6
      ),
      6, (b'0111' || (microseconds >> 8)::bit(4))::bit(8)::int
    ),
    7, microseconds::bit(8)::int
  ),
  'hex')::UUID;
END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_at timestamp without time zone NOT NULL,
    released_at timestamp without time zone,
    release_reason text
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    user_id uuid NOT NULL,
    outcome text NOT NULL,
    notes text,
    called_at timestamp without time zone NOT NULL
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    metric text NOT NULL,
    target_value bigint NOT NULL,
    user_id uuid,
    set_by_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    period text NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: lead_list_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_list_assignments (
    id uuid NOT NULL,
    lead_list_id uuid NOT NULL,
    user_id uuid NOT NULL,
    inserted_at timestamp without time zone NOT NULL
);


--
-- Name: lead_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_lists (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(255),
    imported_at timestamp without time zone,
    total_count integer DEFAULT 0 NOT NULL,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    inserted_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "företag" text NOT NULL,
    telefon text NOT NULL,
    epost text,
    hemsida text,
    adress text,
    postnummer text,
    stad text,
    bransch text,
    orgnr text,
    "omsättning_tkr" text,
    vinst_tkr text,
    "anställda" text,
    vd_namn text,
    bolagsform text,
    status text DEFAULT 'new'::text NOT NULL,
    quarantine_until timestamp without time zone,
    callback_at timestamp without time zone,
    imported_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    callback_reminded_at timestamp without time zone,
    lead_list_id uuid,
    "källa" text,
    telefon_2 character varying(255)
);


--
-- Name: login_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_token text NOT NULL,
    ip_address text,
    user_agent text,
    device_type text,
    browser text,
    city text,
    country text,
    logged_in_at timestamp without time zone NOT NULL,
    last_active_at timestamp without time zone NOT NULL,
    logged_out_at timestamp without time zone,
    force_logged_out boolean DEFAULT false NOT NULL
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    meeting_date date NOT NULL,
    meeting_time time(0) without time zone NOT NULL,
    notes text,
    google_calendar_id text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    reminded_at timestamp without time zone,
    teams_join_url text,
    teams_event_id character varying(255),
    duration_minutes bigint DEFAULT 30 NOT NULL,
    attendee_email text,
    attendee_name text
);


--
-- Name: microsoft_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.microsoft_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    microsoft_user_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp without time zone NOT NULL,
    inserted_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: oban_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oban_jobs (
    id bigint NOT NULL,
    state public.oban_job_state DEFAULT 'available'::public.oban_job_state NOT NULL,
    queue text DEFAULT 'default'::text NOT NULL,
    worker text NOT NULL,
    args jsonb DEFAULT '{}'::jsonb NOT NULL,
    errors jsonb[] DEFAULT ARRAY[]::jsonb[] NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 20 NOT NULL,
    inserted_at timestamp without time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
    scheduled_at timestamp without time zone DEFAULT timezone('UTC'::text, now()) NOT NULL,
    attempted_at timestamp without time zone,
    completed_at timestamp without time zone,
    attempted_by text[],
    discarded_at timestamp without time zone,
    priority integer DEFAULT 0 NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    meta jsonb DEFAULT '{}'::jsonb,
    cancelled_at timestamp without time zone,
    CONSTRAINT attempt_range CHECK (((attempt >= 0) AND (attempt <= max_attempts))),
    CONSTRAINT positive_max_attempts CHECK ((max_attempts > 0)),
    CONSTRAINT queue_length CHECK (((char_length(queue) > 0) AND (char_length(queue) < 128))),
    CONSTRAINT worker_length CHECK (((char_length(worker) > 0) AND (char_length(worker) < 128)))
);


--
-- Name: TABLE oban_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.oban_jobs IS '12';


--
-- Name: oban_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oban_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oban_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oban_jobs_id_seq OWNED BY public.oban_jobs.id;


--
-- Name: oban_peers; Type: TABLE; Schema: public; Owner: -
--

CREATE UNLOGGED TABLE public.oban_peers (
    name text NOT NULL,
    node text NOT NULL,
    started_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: phone_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phone_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    user_id uuid,
    caller text NOT NULL,
    callee text NOT NULL,
    duration bigint DEFAULT 0 NOT NULL,
    call_log_id uuid,
    received_at timestamp without time zone NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    recording_key text,
    recording_id text,
    telavox_call_id text,
    direction text
);


--
-- Name: quarantines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quarantines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    quarantined_at timestamp without time zone NOT NULL,
    released_at timestamp without time zone NOT NULL
);


--
-- Name: requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    admin_notes text,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    extra_data jsonb,
    purpose text NOT NULL,
    expires_at timestamp(0) without time zone NOT NULL,
    subject text NOT NULL,
    jti text NOT NULL
);


--
-- Name: trusted_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trusted_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_token text NOT NULL,
    device_name text,
    expires_at timestamp without time zone NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    hashed_password text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'agent'::text NOT NULL,
    inserted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    phone_number text,
    extension_number text,
    telavox_token text
);


--
-- Name: oban_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oban_jobs ALTER COLUMN id SET DEFAULT nextval('public.oban_jobs_id_seq'::regclass);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: lead_list_assignments lead_list_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_list_assignments
    ADD CONSTRAINT lead_list_assignments_pkey PRIMARY KEY (id);


--
-- Name: lead_lists lead_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_lists
    ADD CONSTRAINT lead_lists_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: login_sessions login_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_sessions
    ADD CONSTRAINT login_sessions_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: microsoft_connections microsoft_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.microsoft_connections
    ADD CONSTRAINT microsoft_connections_pkey PRIMARY KEY (id);


--
-- Name: oban_jobs non_negative_priority; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.oban_jobs
    ADD CONSTRAINT non_negative_priority CHECK ((priority >= 0)) NOT VALID;


--
-- Name: oban_jobs oban_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oban_jobs
    ADD CONSTRAINT oban_jobs_pkey PRIMARY KEY (id);


--
-- Name: oban_peers oban_peers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oban_peers
    ADD CONSTRAINT oban_peers_pkey PRIMARY KEY (name);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: phone_calls phone_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phone_calls
    ADD CONSTRAINT phone_calls_pkey PRIMARY KEY (id);


--
-- Name: quarantines quarantines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quarantines
    ADD CONSTRAINT quarantines_pkey PRIMARY KEY (id);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (jti);


--
-- Name: trusted_devices trusted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: assignments_lead_id_released_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_lead_id_released_at_index ON public.assignments USING btree (lead_id, released_at);


--
-- Name: assignments_user_id_released_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_user_id_released_at_index ON public.assignments USING btree (user_id, released_at);


--
-- Name: audit_logs_resource_type_resource_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_resource_type_resource_id_index ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: audit_logs_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_id_index ON public.audit_logs USING btree (user_id);


--
-- Name: call_logs_lead_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_logs_lead_id_index ON public.call_logs USING btree (lead_id);


--
-- Name: call_logs_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_logs_user_id_index ON public.call_logs USING btree (user_id);


--
-- Name: lead_list_assignments_lead_list_id_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_list_assignments_lead_list_id_user_id_index ON public.lead_list_assignments USING btree (lead_list_id, user_id);


--
-- Name: lead_list_assignments_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_list_assignments_user_id_index ON public.lead_list_assignments USING btree (user_id);


--
-- Name: leads_lead_list_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_lead_list_id_index ON public.leads USING btree (lead_list_id);


--
-- Name: leads_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_status_index ON public.leads USING btree (status);


--
-- Name: leads_telefon_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_telefon_index ON public.leads USING btree (telefon);


--
-- Name: login_sessions_unique_session_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX login_sessions_unique_session_token_index ON public.login_sessions USING btree (session_token);


--
-- Name: meetings_user_id_status_meeting_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meetings_user_id_status_meeting_date_index ON public.meetings USING btree (user_id, status, meeting_date);


--
-- Name: microsoft_connections_microsoft_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX microsoft_connections_microsoft_user_id_index ON public.microsoft_connections USING btree (microsoft_user_id);


--
-- Name: microsoft_connections_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX microsoft_connections_user_id_index ON public.microsoft_connections USING btree (user_id);


--
-- Name: oban_jobs_args_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_args_index ON public.oban_jobs USING gin (args);


--
-- Name: oban_jobs_meta_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_meta_index ON public.oban_jobs USING gin (meta);


--
-- Name: oban_jobs_state_queue_priority_scheduled_at_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oban_jobs_state_queue_priority_scheduled_at_id_index ON public.oban_jobs USING btree (state, queue, priority, scheduled_at, id);


--
-- Name: password_reset_tokens_unique_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX password_reset_tokens_unique_token_index ON public.password_reset_tokens USING btree (token);


--
-- Name: password_reset_tokens_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_user_id_index ON public.password_reset_tokens USING btree (user_id);


--
-- Name: phone_calls_callee_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_calls_callee_index ON public.phone_calls USING btree (callee);


--
-- Name: phone_calls_received_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_calls_received_at_index ON public.phone_calls USING btree (received_at);


--
-- Name: phone_calls_recording_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_calls_recording_id_index ON public.phone_calls USING btree (recording_id);


--
-- Name: phone_calls_telavox_call_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_calls_telavox_call_id_index ON public.phone_calls USING btree (telavox_call_id);


--
-- Name: phone_calls_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phone_calls_user_id_index ON public.phone_calls USING btree (user_id);


--
-- Name: trusted_devices_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trusted_devices_expires_at_index ON public.trusted_devices USING btree (expires_at);


--
-- Name: trusted_devices_unique_device_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trusted_devices_unique_device_token_index ON public.trusted_devices USING btree (device_token);


--
-- Name: trusted_devices_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trusted_devices_user_id_index ON public.trusted_devices USING btree (user_id);


--
-- Name: users_unique_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_unique_email_index ON public.users USING btree (email);


--
-- Name: users_unique_extension_number_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_unique_extension_number_index ON public.users USING btree (extension_number);


--
-- Name: users_unique_phone_number_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_unique_phone_number_index ON public.users USING btree (phone_number);


--
-- Name: lead_list_assignments lead_list_assignments_lead_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_list_assignments
    ADD CONSTRAINT lead_list_assignments_lead_list_id_fkey FOREIGN KEY (lead_list_id) REFERENCES public.lead_lists(id) ON DELETE CASCADE;


--
-- Name: lead_list_assignments lead_list_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_list_assignments
    ADD CONSTRAINT lead_list_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: leads leads_lead_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_lead_list_id_fkey FOREIGN KEY (lead_list_id) REFERENCES public.lead_lists(id) ON DELETE SET NULL;


--
-- Name: microsoft_connections microsoft_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.microsoft_connections
    ADD CONSTRAINT microsoft_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict gQdkgForM5nYzwpza0wLfJXvOsEhvB7xIftbSWeGmrNwwbiIQcP5jcfwlHV8Iu5

INSERT INTO public."schema_migrations" (version) VALUES (20260401153422);
INSERT INTO public."schema_migrations" (version) VALUES (20260401153423);
INSERT INTO public."schema_migrations" (version) VALUES (20260401153847);
INSERT INTO public."schema_migrations" (version) VALUES (20260401154248);
INSERT INTO public."schema_migrations" (version) VALUES (20260401155115);
INSERT INTO public."schema_migrations" (version) VALUES (20260401192744);
INSERT INTO public."schema_migrations" (version) VALUES (20260401193352);
INSERT INTO public."schema_migrations" (version) VALUES (20260401194511);
INSERT INTO public."schema_migrations" (version) VALUES (20260401200001);
INSERT INTO public."schema_migrations" (version) VALUES (20260401200002);
INSERT INTO public."schema_migrations" (version) VALUES (20260401210001);
INSERT INTO public."schema_migrations" (version) VALUES (20260402064312);
INSERT INTO public."schema_migrations" (version) VALUES (20260402071742);
INSERT INTO public."schema_migrations" (version) VALUES (20260402090000);
INSERT INTO public."schema_migrations" (version) VALUES (20260402093225);
INSERT INTO public."schema_migrations" (version) VALUES (20260402102515);
INSERT INTO public."schema_migrations" (version) VALUES (20260402120000);
INSERT INTO public."schema_migrations" (version) VALUES (20260402124154);
INSERT INTO public."schema_migrations" (version) VALUES (20260402130227);
INSERT INTO public."schema_migrations" (version) VALUES (20260402140443);
INSERT INTO public."schema_migrations" (version) VALUES (20260402164158);
INSERT INTO public."schema_migrations" (version) VALUES (20260402164628);
INSERT INTO public."schema_migrations" (version) VALUES (20260402164759);
INSERT INTO public."schema_migrations" (version) VALUES (20260402183648);
INSERT INTO public."schema_migrations" (version) VALUES (20260403072520);
