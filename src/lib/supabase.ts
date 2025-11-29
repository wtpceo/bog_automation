import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 타입 정의
export interface Customer {
  id: string
  name: string
  phone: string
  business_type: string
  keywords: string[]
  tone: string
  confirm_token: string
  created_at: string
  is_active: boolean
  specialty?: string
  target_audience?: string
  brand_concept?: string
  main_services?: string[]
  price_range?: string
  location_info?: string
  preferred_expressions?: string[]
  avoided_expressions?: string[]
  sample_content?: string
}

export interface Draft {
  id: string
  customer_id: string
  week_of: string
  title: string
  content: string
  images: string[]
  status: 'pending' | 'selected' | 'rejected' | 'published'
  created_at: string
}

export interface Confirmation {
  id: string
  customer_id: string
  draft_id: string
  week_of: string
  confirmed_at: string
  memo: string | null
}
