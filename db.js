const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 10,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      ico TEXT NOT NULL DEFAULT '',
      dic TEXT NOT NULL DEFAULT '',
      bank_account TEXT NOT NULL DEFAULT '',
      iban TEXT NOT NULL DEFAULT '',
      swift TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT 'Nejsem plátcem DPH.'
    );

    INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      taxable_date DATE NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Bankovní převod',
      variable_symbol TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_address TEXT NOT NULL DEFAULT '',
      customer_ico TEXT NOT NULL DEFAULT '',
      customer_dic TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      position INT NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'ks',
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);
  `);
}

module.exports = { pool, migrate };
