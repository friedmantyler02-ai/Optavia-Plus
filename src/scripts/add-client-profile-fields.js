/**
 * Migration: Add profile & social fields to clients table
 * These fields mirror the leads table so coaches can track the same info
 * after converting a lead to a client.
 *
 * Run via: node src/scripts/add-client-profile-fields.js
 *
 * SQL to run in Supabase SQL Editor:
 *
 *   ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_url TEXT;
 *   ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT;
 *   ALTER TABLE clients ADD COLUMN IF NOT EXISTS groups TEXT;
 *   ALTER TABLE clients ADD COLUMN IF NOT EXISTS originally_met_date TIMESTAMPTZ;
 *
 */

const SQL = `
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS groups TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS originally_met_date TIMESTAMPTZ;
`;

console.log("Run the following SQL in the Supabase SQL Editor:\n");
console.log(SQL);
