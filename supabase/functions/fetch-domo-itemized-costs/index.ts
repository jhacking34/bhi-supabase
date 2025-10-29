import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ItemizedCostRecord {
  job: string;
  cost_trans?: number;
  phase: string;
  cost_type?: number;
  posted_date?: string;
  actual_cost?: number;
  vendor?: string;
  vendor_name?: string;
  po?: string;
  description?: string;
  detl_desc?: string;
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
    const domoDatasetId = Deno.env.get('DOMO_DATASET_ID_ITEMIZED_COSTS');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Validate required environment variables
    if (!domoClientId || !domoClientSecret || !domoDatasetId || !supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required environment variables. Please check DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_ID_ITEMIZED_COSTS, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.'
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
    
    const transformedData: ItemizedCostRecord[] = rows.map((row: any[]) => {
      const record: any = {};
      row.forEach((value: any, index: number) => {
        const columnName = columns[index];
        if (columnName) {
          record[columnName] = value;
        }
      });
      
      // Parse posted_date from various formats
      let parsedDate: string | null = null;
      if (record.PostedDate) {
        try {
          const date = new Date(record.PostedDate);
          if (!isNaN(date.getTime())) {
            parsedDate = date.toISOString();
          }
        } catch (e) {
          console.warn(`Failed to parse date: ${record.PostedDate}`);
        }
      }
      
      // Extract vendor and vendor_name with cleanup logic
      let vendor = record.Vendor || null;
      let vendorName = record['Vendor Name'] || null;
      
      // If vendor is null, '221164', or '21601', extract vendor name from detl_desc
      const vendorString = vendor?.toString().trim() || '';
      const shouldExtractVendor = !vendor || vendorString === '221164' || vendorString === '21601';
      
      if (shouldExtractVendor && record.DetlDesc) {
        const detlDesc = record.DetlDesc.trim();
        
        // Extract vendor name from detl_desc
        // Example: '221164 Divvy Users - CC Upl 20250831 / TR# 8185 / 260 / APCo: 1  Lorena Fajardo Newegg ' -> 'Newegg'
        // Strategy: Get text after the last "/" segment, then take the last meaningful word(s)
        
        let extractedVendor = null;
        
        // Split by "/" to handle segmented descriptions
        const segments = detlDesc.split('/').map(s => s.trim()).filter(s => s.length > 0);
        
        // Work with the last segment (most likely to contain vendor name)
        const textToProcess = segments.length > 0 ? segments[segments.length - 1] : detlDesc;
        
        // Split into words and filter out non-vendor words
        const words = textToProcess.split(/\s+/).filter(w => {
          const word = w.trim();
          if (!word || word.length < 3) return false; // Too short
          
          const lowerW = word.toLowerCase();
          // Filter out known non-vendor tokens
          const excludedTokens = ['apco', 'apco:', 'tr#', 'cc', 'upl', 'divvy', 'users', '260', '1', 
                                  '221164', '21601', 'lorena', 'fajardo'];
          if (excludedTokens.includes(lowerW)) return false;
          
          // Filter out pure numbers (dates, IDs, etc)
          if (/^\d+$/.test(word) && word.length > 4) return false; // Long numbers probably dates/IDs
          if (/^\d{8}$/.test(word)) return false; // Dates like 20250831
          
          // Filter out patterns like "TR# 8185" fragments
          if (/^tr#/i.test(word)) return false;
          
          return true;
        });
        
        if (words.length > 0) {
          // Usually vendor name is the last 1-2 words
          // Take last 1-2 words as vendor name (handles both "Newegg" and "Amazon Web Services")
          extractedVendor = words.slice(-2).join(' ').trim();
        }
        
        // Fallback: if no good extraction from last segment, try the very end of the full detl_desc
        if (!extractedVendor || extractedVendor.length < 3) {
          const allWords = detlDesc.split(/\s+/).filter(w => {
            const word = w.trim();
            if (!word || word.length < 3) return false;
            const lowerW = word.toLowerCase();
            return !/^(apco|tr#|cc|upl|divvy|users|260|1|221164|21601|fajardo|lorena)$/.test(lowerW) &&
                   !/^\d{8,}$/.test(word); // Not long numbers
          });
          
          if (allWords.length > 0) {
            extractedVendor = allWords.slice(-2).join(' ').trim();
          }
        }
        
        if (extractedVendor && extractedVendor.length >= 3) {
          vendorName = extractedVendor;
        }
      }
      
      return {
        job: record.Job || '',
        cost_trans: record.CostTrans ? parseInt(record.CostTrans) : null,
        phase: record.Phase || '',
        cost_type: record.CostType ? parseInt(record.CostType) : null,
        posted_date: parsedDate,
        actual_cost: record.ActualCost ? parseFloat(record.ActualCost) : null,
        vendor: vendor,
        vendor_name: vendorName,
        po: record.PO || null,
        description: record.Description || null,
        detl_desc: record.DetlDesc || null
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
          .from('it_rate_itemized_costs')
          .upsert(batch, {
            onConflict: 'job,cost_trans,phase,cost_type,posted_date',
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
        .from('it_rate_itemized_costs')
        .update({ updated_at: new Date().toISOString() })
        .in('job', transformedData.map(r => r.job))
        .in('phase', transformedData.map(r => r.phase));
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
