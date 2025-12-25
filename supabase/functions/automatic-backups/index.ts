import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackupSettings {
  user_id: string;
  auto_backup: boolean;
  backup_frequency: 'daily' | 'weekly' | 'monthly';
  retention_period: number;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🔄 Starting automatic backup process...')

    // 1. Obtener usuarios con respaldos automáticos habilitados
    const { data: settings, error: settingsError } = await supabaseClient
      .from('accounting_settings')
      .select('user_id, auto_backup, backup_frequency, retention_period')
      .eq('auto_backup', true)

    if (settingsError) {
      throw new Error(`Error fetching settings: ${settingsError.message}`)
    }

    if (!settings || settings.length === 0) {
      console.log('ℹ️ No users with automatic backups enabled')
      return new Response(
        JSON.stringify({ message: 'No users with automatic backups enabled', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`📊 Found ${settings.length} users with automatic backups enabled`)

    let processedCount = 0
    let createdCount = 0
    let skippedCount = 0
    const errors: string[] = []

    // 2. Procesar cada usuario
    for (const setting of settings as BackupSettings[]) {
      try {
        const shouldCreateBackup = await checkIfBackupNeeded(supabaseClient, setting)
        
        if (shouldCreateBackup) {
          console.log(`✅ Creating backup for user ${setting.user_id}`)
          await createAutomaticBackup(supabaseClient, setting)
          createdCount++
        } else {
          console.log(`⏭️ Skipping user ${setting.user_id} - backup not needed yet`)
          skippedCount++
        }
        
        processedCount++
      } catch (error) {
        const errorMsg = `Error processing user ${setting.user_id}: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    // 3. Limpiar respaldos expirados
    console.log('🧹 Cleaning expired backups...')
    const { error: cleanupError } = await supabaseClient.rpc('delete_expired_backups')
    
    if (cleanupError) {
      console.error(`⚠️ Error cleaning expired backups: ${cleanupError.message}`)
    } else {
      console.log('✅ Expired backups cleaned successfully')
    }

    const result = {
      success: true,
      message: 'Automatic backup process completed',
      stats: {
        totalUsers: settings.length,
        processed: processedCount,
        created: createdCount,
        skipped: skippedCount,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    }

    console.log('✅ Automatic backup process completed:', result)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('❌ Fatal error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function checkIfBackupNeeded(supabaseClient: any, setting: BackupSettings): Promise<boolean> {
  // Obtener último respaldo automático del usuario
  const { data: lastBackup, error } = await supabaseClient
    .from('data_backups')
    .select('backup_date')
    .eq('user_id', setting.user_id)
    .eq('backup_type', 'automatic')
    .order('backup_date', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    throw error
  }

  // Si no hay respaldos previos, crear uno
  if (!lastBackup) {
    return true
  }

  const lastBackupDate = new Date(lastBackup.backup_date)
  const now = new Date()
  const hoursSinceLastBackup = (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60)

  // Verificar según frecuencia
  switch (setting.backup_frequency) {
    case 'daily':
      return hoursSinceLastBackup >= 24
    case 'weekly':
      return hoursSinceLastBackup >= 24 * 7
    case 'monthly':
      return hoursSinceLastBackup >= 24 * 30
    default:
      return false
  }
}

async function createAutomaticBackup(supabaseClient: any, setting: BackupSettings): Promise<void> {
  const userId = setting.user_id

  // Helper para obtener datos de forma segura
  const safeSingle = async (query: any) => {
    try {
      const { data, error } = await query
      if (error && error.code !== 'PGRST116') throw error
      if (Array.isArray(data)) return data[0] ?? null
      return data ?? null
    } catch (e) {
      console.error('safeSingle error:', e)
      return null
    }
  }

  const safeList = async (query: any) => {
    try {
      const { data, error } = await query
      if (error && error.code !== 'PGRST116') throw error
      return data ?? []
    } catch (e) {
      console.error('safeList error:', e)
      return []
    }
  }

  // Recolectar datos del usuario
  console.log(`📦 Collecting data for user ${userId}...`)

  // Settings
  const companyInfo = await safeSingle(
    supabaseClient.from('company_info').select('*').eq('user_id', userId).limit(1)
  )
  const accountingSettings = await safeSingle(
    supabaseClient.from('accounting_settings').select('*').eq('user_id', userId).limit(1)
  )
  const taxSettings = await safeSingle(
    supabaseClient.from('tax_settings').select('*').eq('user_id', userId).limit(1)
  )
  const inventorySettings = await safeSingle(
    supabaseClient.from('inventory_settings').select('*').eq('user_id', userId).limit(1)
  )
  const payrollSettings = await safeSingle(
    supabaseClient.from('payroll_settings').select('*').eq('user_id', userId).limit(1)
  )

  // Catálogos
  const customers = await safeList(
    supabaseClient.from('customers').select('*').eq('user_id', userId)
  )
  const suppliers = await safeList(
    supabaseClient.from('suppliers').select('*').eq('user_id', userId)
  )
  const chartAccounts = await safeList(
    supabaseClient.from('chart_accounts').select('*').eq('user_id', userId)
  )
  const products = await safeList(
    supabaseClient.from('inventory_items').select('*').eq('user_id', userId)
  )
  const warehouses = await safeList(
    supabaseClient.from('warehouses').select('*').eq('user_id', userId)
  )

  // Movimientos
  const invoices = await safeList(
    supabaseClient.from('invoices').select('*').eq('user_id', userId)
  )
  const supplierPayments = await safeList(
    supabaseClient.from('supplier_payments').select('*').eq('user_id', userId)
  )
  const journalEntries = await safeList(
    supabaseClient.from('journal_entries').select('*').eq('user_id', userId)
  )
  const journalEntryLines = await safeList(
    supabaseClient.from('journal_entry_lines').select('*')
  )
  const pettyFunds = await safeList(
    supabaseClient.from('petty_cash_funds').select('*').eq('user_id', userId)
  )
  const pettyExpenses = await safeList(
    supabaseClient.from('petty_cash_expenses').select('*').eq('user_id', userId)
  )
  const pettyReimbursements = await safeList(
    supabaseClient.from('petty_cash_reimbursements').select('*').eq('user_id', userId)
  )
  const fixedAssets = await safeList(
    supabaseClient.from('fixed_assets').select('*').eq('user_id', userId)
  )
  const fixedDepreciations = await safeList(
    supabaseClient.from('fixed_asset_depreciations').select('*').eq('user_id', userId)
  )
  const fixedDisposals = await safeList(
    supabaseClient.from('fixed_asset_disposals').select('*').eq('user_id', userId)
  )

  // Construir payload del respaldo
  const backupPayload = {
    version: 1,
    generated_at: new Date().toISOString(),
    user_id: userId,
    settings: {
      company_info: companyInfo,
      accounting_settings: accountingSettings,
      tax_settings: taxSettings,
      inventory_settings: inventorySettings,
      payroll_settings: payrollSettings,
    },
    catalogs: {
      customers,
      suppliers,
      chart_accounts: chartAccounts,
      products,
      warehouses,
    },
    movements: {
      invoices,
      supplier_payments: supplierPayments,
      journal_entries: journalEntries,
      journal_entry_lines: journalEntryLines,
      petty_cash_funds: pettyFunds,
      petty_cash_expenses: pettyExpenses,
      petty_cash_reimbursements: pettyReimbursements,
      fixed_assets: fixedAssets,
      fixed_asset_depreciations: fixedDepreciations,
      fixed_asset_disposals: fixedDisposals,
    },
  }

  // Calcular tamaño aproximado
  const serialized = JSON.stringify(backupPayload)
  const approximateSize = new Blob([serialized]).size

  const now = new Date().toISOString()
  const backupName = `Respaldo_Automatico_${now.split('T')[0]}_${setting.backup_frequency}`

  // Guardar en base de datos
  const { error: insertError } = await supabaseClient
    .from('data_backups')
    .insert({
      user_id: userId,
      backup_type: 'automatic',
      backup_name: backupName,
      backup_data: backupPayload,
      backup_date: now,
      status: 'completed',
      retention_days: setting.retention_period,
      file_size: approximateSize,
    })

  if (insertError) {
    throw new Error(`Error saving backup: ${insertError.message}`)
  }

  console.log(`✅ Backup created successfully for user ${userId} (${(approximateSize / 1024).toFixed(2)} KB)`)
}
