-- Add balance_after column to transactions table
-- Stores the account balance after each transaction (for bank uploads)
ALTER TABLE transactions ADD COLUMN balance_after DECIMAL(15,0) NULL;
