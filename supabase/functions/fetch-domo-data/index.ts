import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface DomoRecord {
  job: string;
  job_description?: string;
  phase: string;
  phase_description: string;
  month_date: string;
  cost_type?: number;
  cost_type_description?: string;
  cost?: number;
  line_description?: string;
}

interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
}

Deno.serve(async (req: Request) => {
  try {
    // Get environment variables
    const domoClientId = Deno.env.get('DOMO_CLIENT_ID');
    const domoClientSecret = Deno.env.get('DOMO_CLIENT_SECRET');
    const domoDatasetId = Deno.env.get('DOMO_DATASET_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Validate required environment variables
    if (!domoClientId || !domoClientSecret || !domoDatasetId || !supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required environment variables. Please check DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_ID, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Get OAuth access token from Domo
    const credentials = btoa(`${domoClientId}:${domoClientSecret}`);
    const tokenResponse = await fetch('https://api.domo.com/oauth/token?scope=data&grant_type=client_credentials', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenResponse.ok) {
      throw new Error(`Domo OAuth error: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Successfully obtained Domo access token');

    // Step 2: Fetch data from Domo API using SQL query endpoint
    const domoResponse = await fetch(`https://api.domo.com/v1/datasets/query/execute/${domoDatasetId}`, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sql: 'SELECT * FROM table'
      })
    });

    if (!domoResponse.ok) {
      throw new Error(`Domo API error: ${domoResponse.status} ${domoResponse.statusText}`);
    }

    const domoData = await domoResponse.json();
    console.log(`Fetched data from Domo with ${domoData.rows?.length || 0} rows`);

    // Transform Domo data from columns/rows format to match Supabase schema
    const columns = domoData.columns || [];
    const rows = domoData.rows || [];
    
    const transformedData: DomoRecord[] = rows.map((row: any[]) => {
      const record: any = {};
      row.forEach((value: any, index: number) => {
        const columnName = columns[index];
        if (columnName) {
          record[columnName] = value;
        }
      });
      
      return {
        job: record.Job || '',
        job_description: record.JobDescription || null,
        phase: record.Phase || '',
        phase_description: record.PhaseDescription || '',
        month_date: record.Mth || '',
        cost_type: record.CostType ? parseInt(record.CostType) : null,
        cost_type_description: record.CostTypeDescription || null,
        cost: record.Cost ? parseFloat(record.Cost) : null,
        line_description: record.LineDescription || null
      };
    });

    // Upsert data into Supabase
    const result: SyncResult = {
      success: true,
      recordsProcessed: transformedData.length,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: []
    };

    // Process records in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < transformedData.length; i += batchSize) {
      const batch = transformedData.slice(i, i + batchSize);
      
      try {
        const { data, error } = await supabase
          .from('it_rate_monthly_totals')
          .upsert(batch, {
            onConflict: 'job,phase,month_date,cost_type',
            ignoreDuplicates: false
          })
          .select();

        if (error) {
          result.errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
          console.error(`Batch error:`, error);
        } else {
          // Count inserted vs updated records
          const now = new Date().toISOString();
          const inserted = data?.filter(record => 
            new Date(record.created_at).getTime() === new Date(record.updated_at).getTime()
          ).length || 0;
          const updated = (data?.length || 0) - inserted;
          
          result.recordsInserted += inserted;
          result.recordsUpdated += updated;
        }
      } catch (batchError) {
        result.errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`);
        console.error(`Batch processing error:`, batchError);
      }
    }

    // Update the updated_at timestamp for all processed records
    if (result.recordsProcessed > 0) {
      await supabase
        .from('it_rate_monthly_totals')
        .update({ updated_at: new Date().toISOString() })
        .in('job', transformedData.map(r => r.job))
        .in('phase', transformedData.map(r => r.phase))
        .in('month_date', transformedData.map(r => r.month_date));
    }

    console.log(`Sync completed: ${result.recordsInserted} inserted, ${result.recordsUpdated} updated`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: [error.message]
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
