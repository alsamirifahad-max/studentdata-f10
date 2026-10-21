import {json} from './_shared.mjs';
export default async()=>json(200,{supabaseUrl:process.env.SUPABASE_URL||'',supabaseAnonKey:process.env.SUPABASE_ANON_KEY||''});
