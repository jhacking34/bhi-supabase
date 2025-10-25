# Supabase Domo Data Sync

This project syncs IT Rate data from Domo API to your Supabase `it_rate_monthly_totals` table.

## Project Setup Complete ✅

- **Supabase Project**: Data_Lake (ykcoosvkhrcbtuhvaqev)
- **Table**: `it_rate_monthly_totals` (120 existing records)
- **Edge Function**: `fetch-domo-data` (created)
- **Local Project**: `~/projects/bhi-supabase`

## Next Steps

### 1. Configure Environment Variables

Create `.env.local` file in your project root and add your API credentials:

```bash
# Domo API credentials (OAuth client credentials)
DOMO_CLIENT_ID=b5a89f40-d91a-484b-82fa-0bfe1cbffef3
DOMO_CLIENT_SECRET=6639545e7ea1dd75927a145973707e05896144a4ab561bff92ee53ca13df4688
DOMO_DATASET_ID=c54958da-8554-4d24-ad91-9ad6e9e2da6a

# Supabase credentials (get these from your Supabase project settings)
SUPABASE_URL=https://ykcoosvkhrcbtuhvaqev.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrY29vc3ZraHJjYnR1aHZhcWV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM0MDg2OSwiZXhwIjoyMDc2OTE2ODY5fQ.aDSPiSONPYlTkkpwkEAoNSCUokEOLkCdON68768RhfQ
```

**Note**: `.env.local` files are gitignored for security - you'll need to create this file manually.

**Where to find these:**
- `DOMO_CLIENT_ID`: Your Domo OAuth client ID (provided above: b5a89f40-d91a-484b-82fa-0bfe1cbffef3)
- `DOMO_CLIENT_SECRET`: Your Domo OAuth client secret (provided above)
- `DOMO_DATASET_ID`: The specific dataset ID containing your IT Rate data (provided above: c54958da-8554-4d24-ad91-9ad6e9e2da6a)
- `SUPABASE_URL`: Your Supabase project URL (already provided above)
- `SUPABASE_SERVICE_ROLE_KEY`: Get from Supabase Dashboard → Settings → API → service_role key

### 2. Test Locally

```bash
# Start local development server
supabase functions serve fetch-domo-data

# In another terminal, test the function
curl -i http://localhost:54321/functions/v1/fetch-domo-data
```

### 3. Deploy to Production

```bash
# Set secrets in Supabase (replace with your actual values)
supabase secrets set DOMO_CLIENT_ID="b5a89f40-d91a-484b-82fa-0bfe1cbffef3"
supabase secrets set DOMO_CLIENT_SECRET="6639545e7ea1dd75927a145973707e05896144a4ab561bff92ee53ca13df4688"
supabase secrets set DOMO_DATASET_ID="c54958da-8554-4d24-ad91-9ad6e9e2da6a"
supabase secrets set SUPABASE_URL="https://ykcoosvkhrcbtuhvaqev.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrY29vc3ZraHJjYnR1aHZhcWV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTM0MDg2OSwiZXhwIjoyMDc2OTE2ODY5fQ.aDSPiSONPYlTkkpwkEAoNSCUokEOLkCdON68768RhfQ"

# Deploy the function
supabase functions deploy fetch-domo-data
```

### 4. Set Up Automated Scheduling

**Option A: GitHub Actions (Recommended)**

Create `.github/workflows/sync-domo-data.yml`:

```yaml
name: Sync Domo Data to Supabase

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call Domo Sync Edge Function
        run: |
          curl -X POST https://ykcoosvkhrcbtuhvaqev.supabase.co/functions/v1/fetch-domo-data \
            -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrY29vc3ZraHJjYnR1aHZhcWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNDA4NjksImV4cCI6MjA3NjkxNjg2OX0.xT-oo4l8Y4jXlg29NgVw3J6f2UblJjq_KG1PCxMwej4" \
            -H "Content-Type: application/json"
```

**Option B: External Cron Service**
Use EasyCron, cron-job.org, or similar to POST to your Edge Function URL on a schedule.

## How It Works

1. **Gets OAuth access token** from Domo using client credentials flow
2. **Fetches data** from Domo API using SQL query endpoint with the access token
3. **Transforms data** from columns/rows format to match the `it_rate_monthly_totals` schema
4. **Upserts data** into Supabase (updates existing, adds new, no duplicates)
5. **Returns summary** of records processed, inserted, and updated

## Key Features

- **Batch Processing**: Processes records in batches of 100 to avoid overwhelming the database
- **Upsert Logic**: Uses UNIQUE constraint on (job, phase, month_date, cost_type) for clean updates
- **Error Handling**: Comprehensive error reporting and logging
- **Timestamp Tracking**: Updates `updated_at` timestamp for all processed records

## Troubleshooting

- Check Supabase logs: `supabase functions logs fetch-domo-data`
- Verify environment variables are set correctly
- Ensure Domo client credentials have proper permissions and data scope
- Check that the Domo dataset ID is correct (should be the UUID from your Xano script)
- Verify OAuth token is being obtained successfully (check logs for "Successfully obtained Domo access token")

## Project Structure

```
~/projects/bhi-supabase/
├── .env.local                    # Local environment variables
├── supabase/
│   └── functions/
│       └── fetch-domo-data/
│           └── index.ts         # Edge Function code
└── README.md                    # This file
```

Ready to sync your Domo data! 🚀
