-- Orders table for tracking client orders with FedEx shipping
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id),
  client_id uuid REFERENCES clients(id),
  optavia_id text,
  client_name text,
  order_number text NOT NULL,
  tracking_number text,
  order_date date,
  cv numeric,
  shipping_status text NOT NULL DEFAULT 'no_tracking',
  estimated_delivery date,
  delivered_at timestamptz,
  last_tracking_update text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT orders_order_number_coach_unique UNIQUE (order_number, coach_id)
);

-- Indexes
CREATE INDEX idx_orders_coach_id ON orders (coach_id);
CREATE INDEX idx_orders_client_id ON orders (client_id);
CREATE INDEX idx_orders_order_number ON orders (order_number);
CREATE INDEX idx_orders_optavia_id ON orders (optavia_id);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON orders FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY orders_insert ON orders FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY orders_update ON orders FOR UPDATE TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY orders_delete ON orders FOR DELETE TO authenticated
  USING (coach_id = auth.uid());
