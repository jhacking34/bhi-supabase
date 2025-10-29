-- Create IT_rate_itemized_costs table
CREATE TABLE IF NOT EXISTS IT_rate_itemized_costs (
  id SERIAL PRIMARY KEY,
  job TEXT NOT NULL,
  cost_trans INTEGER,
  phase TEXT NOT NULL,
  cost_type INTEGER,
  posted_date TIMESTAMP WITH TIME ZONE,
  actual_cost DECIMAL,
  vendor TEXT,
  vendor_name TEXT,
  po TEXT,
  description TEXT,
  detl_desc TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(job, cost_trans, phase, cost_type, posted_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_it_rate_itemized_costs_job ON IT_rate_itemized_costs(job);
CREATE INDEX IF NOT EXISTS idx_it_rate_itemized_costs_posted_date ON IT_rate_itemized_costs(posted_date);
CREATE INDEX IF NOT EXISTS idx_it_rate_itemized_costs_phase ON IT_rate_itemized_costs(phase);
CREATE INDEX IF NOT EXISTS idx_it_rate_itemized_costs_cost_trans ON IT_rate_itemized_costs(cost_trans);
