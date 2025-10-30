-- Enable Row Level Security on both tables
ALTER TABLE it_rate_monthly_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IT_rate_itemized_costs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public SELECT access to it_rate_monthly_totals
CREATE POLICY "Allow public SELECT on it_rate_monthly_totals"
ON it_rate_monthly_totals
FOR SELECT
TO public
USING (true);

-- Create policy to allow public SELECT access to IT_rate_itemized_costs
CREATE POLICY "Allow public SELECT on IT_rate_itemized_costs"
ON IT_rate_itemized_costs
FOR SELECT
TO public
USING (true);

