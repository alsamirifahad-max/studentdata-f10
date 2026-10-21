import { createClient } from '@supabase/supabase-js';
export const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export const json=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
export const bodyOf=e=>{try{return JSON.parse(e.body||'{}')}catch{return {}}};
export const db=()=>{if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Server database is not configured');return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})};
export const clean=(v,max=2000)=>String(v??'').trim().slice(0,max);
export const sha=async v=>{const b=new TextEncoder().encode(v);const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')};
export const randomToken=(n=24)=>{const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')};
export async function adminUser(event,supabase){const h=event.headers?.authorization||event.headers?.Authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)throw new Error('يلزم تسجيل الدخول');const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)throw new Error('جلسة الدخول غير صالحة');const allow=(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);if(!data.user.email||!allow.includes(data.user.email.toLowerCase()))throw new Error('هذا الحساب غير مخوّل للإدارة');return data.user;}
