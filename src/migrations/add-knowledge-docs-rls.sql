-- Run this in Supabase SQL Editor
CREATE POLICY "Allow authenticated read" ON knowledge_documents
FOR SELECT TO authenticated USING (true);
