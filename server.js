const express = require('express');
const path = require('path');
const { pool, migrate } = require('./db');
const { generateInvoice } = require('./pdf');

const app = express();
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = parseInt(process.env.PORT || '3000', 10);

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(s);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function parseItems(b) {
  const desc = [].concat(b.item_description || []);
  const qty = [].concat(b.item_quantity || []);
  const unit = [].concat(b.item_unit || []);
  const price = [].concat(b.item_unit_price || []);
  const out = [];
  for (let i = 0; i < desc.length; i++) {
    if (!desc[i] || !String(desc[i]).trim()) continue;
    const q = parseFloat(String(qty[i] || '1').replace(',', '.')) || 0;
    const p = parseFloat(String(price[i] || '0').replace(',', '.')) || 0;
    out.push({
      description: String(desc[i]),
      quantity: q,
      unit: unit[i] || 'ks',
      unit_price: p,
      total: Math.round(q * p * 100) / 100,
    });
  }
  return out;
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
    [`${year}%`],
  );
  if (!rows.length) return `${year}001`;
  const seq = parseInt(rows[0].number.slice(4), 10) || 0;
  return `${year}${String(seq + 1).padStart(3, '0')}`;
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, number, issue_date, due_date, customer_name, total FROM invoices ORDER BY id DESC',
    );
    res.render('index', { invoices: rows });
  } catch (e) { next(e); }
});

app.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE id=1');
    res.render('settings', { settings: rows[0], saved: req.query.saved === '1' });
  } catch (e) { next(e); }
});

app.post('/settings', async (req, res, next) => {
  try {
    const b = req.body;
    await pool.query(
      `UPDATE settings
         SET name=$1, address=$2, ico=$3, dic=$4,
             bank_account=$5, iban=$6, swift=$7,
             phone=$8, email=$9, note=$10
       WHERE id=1`,
      [
        b.name || '', b.address || '', b.ico || '', b.dic || '',
        b.bank_account || '', b.iban || '', b.swift || '',
        b.phone || '', b.email || '', b.note || '',
      ],
    );
    res.redirect('/settings?saved=1');
  } catch (e) { next(e); }
});

app.get('/invoices/new', async (req, res, next) => {
  try {
    const number = await nextInvoiceNumber();
    const draft = {
      number,
      variable_symbol: number,
      payment_method: 'Bankovní převod',
      issue_date: today(),
      taxable_date: today(),
      due_date: addDays(today(), 14),
      customer_name: '',
      customer_address: '',
      customer_ico: '',
      customer_dic: '',
      note: '',
    };
    res.render('form', {
      invoice: draft,
      items: [{ description: '', quantity: 1, unit: 'ks', unit_price: 0 }],
      action: '/invoices',
      submitLabel: 'Vystavit fakturu',
    });
  } catch (e) { next(e); }
});

app.post('/invoices', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body;
    const items = parseItems(b);
    if (!items.length) {
      return res.status(400).send('Faktura musí obsahovat alespoň jednu položku.');
    }
    const total = items.reduce((s, i) => s + i.total, 0);
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO invoices
         (number, issue_date, due_date, taxable_date, payment_method,
          variable_symbol, customer_name, customer_address,
          customer_ico, customer_dic, note, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        b.number, b.issue_date, b.due_date, b.taxable_date,
        b.payment_method || 'Bankovní převod',
        b.variable_symbol || b.number,
        b.customer_name || '', b.customer_address || '',
        b.customer_ico || '', b.customer_dic || '',
        b.note || '', total,
      ],
    );
    const id = rows[0].id;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await client.query(
        `INSERT INTO invoice_items
           (invoice_id, position, description, quantity, unit, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, i, it.description, it.quantity, it.unit, it.unit_price, it.total],
      );
    }
    await client.query('COMMIT');
    res.redirect(`/invoices/${id}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

app.get('/invoices/:id', async (req, res, next) => {
  try {
    const { rows: ir } = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!ir.length) return res.status(404).render('notfound');
    const { rows: items } = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position',
      [req.params.id],
    );
    const { rows: sr } = await pool.query('SELECT * FROM settings WHERE id=1');
    res.render('show', { invoice: ir[0], items, settings: sr[0] });
  } catch (e) { next(e); }
});

app.get('/invoices/:id/pdf', async (req, res, next) => {
  try {
    const { rows: ir } = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (!ir.length) return res.status(404).send('Faktura nenalezena.');
    const { rows: items } = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position',
      [req.params.id],
    );
    const { rows: sr } = await pool.query('SELECT * FROM settings WHERE id=1');
    generateInvoice(res, { invoice: ir[0], items, settings: sr[0] });
  } catch (e) { next(e); }
});

app.post('/invoices/:id/delete', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM invoices WHERE id=$1', [req.params.id]);
    res.redirect('/');
  } catch (e) { next(e); }
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('Chyba serveru: ' + err.message);
});

migrate()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Fakturace běží na portu ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migrace selhala:', err);
    process.exit(1);
  });
