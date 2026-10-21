-- نفّذ هذا الملف في Supabase SQL Editor بعد مراجعة مسؤول تقنية المعلومات.
create extension if not exists pgcrypto;
create table if not exists public.students (
 id uuid primary key default gen_random_uuid(),
 national_id text not null unique check (national_id ~ '^[0-9]{10}$'),
 full_name text not null,
 grade text not null,
 section text not null,
 school_email text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.support_tickets (
 id uuid primary key default gen_random_uuid(),
 ticket_code text not null unique,
 student_id uuid not null references public.students(id) on delete restrict,
 student_name_snapshot text not null default '',
 grade_snapshot text not null default '',
 section_snapshot text not null default '',
 national_id_masked text not null,
 category text not null,
 contact text not null,
 title text not null,
 description text not null,
 tracking_hash text not null,
 status text not null default 'new' check (status in ('new','in_progress','answered','resolved')),
 reply text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists support_tickets_created_at_idx on public.support_tickets(created_at desc);
create index if not exists support_tickets_student_id_idx on public.support_tickets(student_id);
alter table public.support_tickets add column if not exists student_name_snapshot text not null default '';
alter table public.support_tickets add column if not exists grade_snapshot text not null default '';
alter table public.support_tickets add column if not exists section_snapshot text not null default '';
-- نسخ بيانات الطالب وقت إرسال الشكوى لعرضها في لوحة الإدارة دون join إضافي.
create or replace function public.snapshot_ticket_student() returns trigger language plpgsql security definer set search_path=public as $$
begin select full_name,grade,section into new.student_name_snapshot,new.grade_snapshot,new.section_snapshot from public.students where id=new.student_id; return new; end; $$;
drop trigger if exists support_ticket_student_snapshot on public.support_tickets;
create trigger support_ticket_student_snapshot before insert on public.support_tickets for each row execute function public.snapshot_ticket_student();
-- مهم: لا تُفتح الجداول مباشرة من المتصفح. الوصول عبر وظائف Netlify فقط.
alter table public.students enable row level security;
alter table public.support_tickets enable row level security;
revoke all on table public.students from anon, authenticated;
revoke all on table public.support_tickets from anon, authenticated;
-- لا تمنح anon أو authenticated أي صلاحية. service role يستخدم داخل وظائف الخادم فقط.
