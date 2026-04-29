const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_REGULAR = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

function fmtMoney(v) {
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
}

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`;
}

function generateInvoice(res, { invoice, items, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="faktura-${invoice.number}.pdf"`,
  );
  doc.pipe(res);

  doc.registerFont('R', FONT_REGULAR);
  doc.registerFont('B', FONT_BOLD);
  doc.font('R');

  doc.font('B').fontSize(22).text(`Faktura č. ${invoice.number}`, 50, 50);
  doc.font('R').fontSize(10).fillColor('#666')
    .text('Daňový doklad — neplátce DPH', 50, 78);
  doc.fillColor('black');

  const partiesTop = 110;
  doc.font('B').fontSize(11).text('Dodavatel', 50, partiesTop);
  doc.font('R').fontSize(10);
  let ly = partiesTop + 16;
  if (settings.name) { doc.text(settings.name, 50, ly); ly += 14; }
  if (settings.address) { doc.text(settings.address, 50, ly, { width: 240 }); ly += 14; }
  if (settings.ico) { doc.text(`IČO: ${settings.ico}`, 50, ly); ly += 14; }
  if (settings.dic) { doc.text(`DIČ: ${settings.dic}`, 50, ly); ly += 14; }
  if (settings.email) { doc.text(settings.email, 50, ly); ly += 14; }
  if (settings.phone) { doc.text(settings.phone, 50, ly); ly += 14; }

  const rightX = 320;
  doc.font('B').fontSize(11).text('Odběratel', rightX, partiesTop);
  doc.font('R').fontSize(10);
  let ry = partiesTop + 16;
  if (invoice.customer_name) { doc.text(invoice.customer_name, rightX, ry, { width: 230 }); ry += 14; }
  if (invoice.customer_address) { doc.text(invoice.customer_address, rightX, ry, { width: 230 }); ry += 28; }
  if (invoice.customer_ico) { doc.text(`IČO: ${invoice.customer_ico}`, rightX, ry); ry += 14; }
  if (invoice.customer_dic) { doc.text(`DIČ: ${invoice.customer_dic}`, rightX, ry); ry += 14; }

  const metaTop = Math.max(ly, ry) + 16;
  doc.font('B').fontSize(10).text('Datum vystavení:', 50, metaTop);
  doc.font('R').text(fmtDate(invoice.issue_date), 170, metaTop);
  doc.font('B').text('Datum splatnosti:', 50, metaTop + 16);
  doc.font('R').text(fmtDate(invoice.due_date), 170, metaTop + 16);
  doc.font('B').text('DUZP:', 50, metaTop + 32);
  doc.font('R').text(fmtDate(invoice.taxable_date), 170, metaTop + 32);

  const labelX = rightX;
  const labelW = 95;
  const valueX = rightX + 100;
  const valueW = 545 - valueX;
  doc.font('B').text('Způsob platby:', labelX, metaTop, { width: labelW, lineBreak: false });
  doc.font('R').text(invoice.payment_method || '', valueX, metaTop, { width: valueW, lineBreak: false });
  doc.font('B').text('Var. symbol:', labelX, metaTop + 16, { width: labelW, lineBreak: false });
  doc.font('R').text(invoice.variable_symbol || '', valueX, metaTop + 16, { width: valueW, lineBreak: false });
  if (settings.bank_account) {
    doc.font('B').text('Bankovní účet:', labelX, metaTop + 32, { width: labelW, lineBreak: false });
    doc.font('R').text(settings.bank_account, valueX, metaTop + 32, { width: valueW, lineBreak: false });
  }
  if (settings.iban) {
    doc.font('B').text('IBAN:', labelX, metaTop + 48, { width: labelW, lineBreak: false });
    doc.font('R').fontSize(9).text(settings.iban, valueX, metaTop + 49, { width: valueW, lineBreak: false });
    doc.fontSize(10);
  }

  const tableTop = metaTop + 80;
  doc.font('B').fontSize(10);
  doc.text('Popis', 50, tableTop);
  doc.text('Množství', 280, tableTop, { width: 60, align: 'right' });
  doc.text('MJ', 345, tableTop, { width: 30 });
  doc.text('Cena/MJ', 380, tableTop, { width: 70, align: 'right' });
  doc.text('Celkem', 460, tableTop, { width: 90, align: 'right' });
  doc.moveTo(50, tableTop + 14).lineTo(550, tableTop + 14).stroke();

  let y = tableTop + 20;
  doc.font('R').fontSize(10);
  for (const it of items) {
    const startY = y;
    doc.text(it.description, 50, y, { width: 220 });
    const descBottom = doc.y;
    doc.text(String(it.quantity), 280, startY, { width: 60, align: 'right' });
    doc.text(it.unit || 'ks', 345, startY, { width: 30 });
    doc.text(fmtMoney(it.unit_price), 380, startY, { width: 70, align: 'right' });
    doc.text(`${fmtMoney(it.total)} Kč`, 460, startY, { width: 90, align: 'right' });
    y = Math.max(descBottom, startY + 14) + 6;
  }

  doc.moveTo(50, y).lineTo(550, y).stroke();
  y += 12;
  doc.font('B').fontSize(13).text('Celkem k úhradě:', 280, y, { width: 160, align: 'right' });
  doc.font('B').fontSize(13).text(`${fmtMoney(invoice.total)} Kč`, 440, y, { width: 110, align: 'right' });
  y += 36;

  doc.font('R').fontSize(10);
  if (settings.note) {
    doc.text(settings.note, 50, y, { width: 500 });
    y = doc.y + 6;
  }
  if (invoice.note) {
    doc.text(invoice.note, 50, y, { width: 500 });
  }

  doc.end();
}

module.exports = { generateInvoice };
