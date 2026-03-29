import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://swookcccpytiyelmgqbd.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_pMSYiqQtFxZPbwJNC50XRg_kKqwGua7'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)