-- Create it_rate_monthly_totals table
CREATE TABLE IF NOT EXISTS it_rate_monthly_totals (
  id SERIAL PRIMARY KEY,
  job TEXT NOT NULL,
  job_description TEXT,
  phase TEXT NOT NULL,
  phase_description TEXT NOT NULL,
  month_date TEXT NOT NULL,
  cost_type INTEGER,
  cost_type_description TEXT,
  cost DECIMAL,
  line_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(job, phase, month_date, cost_type)
);

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_it_rate_monthly_totals_job_phase ON it_rate_monthly_totals(job, phase);
CREATE INDEX IF NOT EXISTS idx_it_rate_monthly_totals_month_date ON it_rate_monthly_totals(month_date);
