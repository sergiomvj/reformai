
import { createClient } from '@supabase/supabase-js';

// Estas variáveis devem ser definidas no seu .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL ou Key não encontradas. Verifique suas variáveis de ambiente Build Args.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
