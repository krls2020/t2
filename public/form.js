(function () {
  const tbody = document.querySelector('#items tbody');
  const tpl = document.getElementById('row-tpl');
  const grandTotalCell = document.querySelector('#items .grand-total');

  function fmt(n) {
    return n.toLocaleString('cs-CZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function parseNum(v) {
    return parseFloat(String(v || '').replace(',', '.')) || 0;
  }

  function recalc() {
    let total = 0;
    tbody.querySelectorAll('tr.item').forEach((row) => {
      const q = parseNum(row.querySelector('.qty').value);
      const p = parseNum(row.querySelector('.price').value);
      const line = Math.round(q * p * 100) / 100;
      row.querySelector('.line-total').textContent = fmt(line);
      total += line;
    });
    grandTotalCell.textContent = `${fmt(total)} Kč`;
  }

  tbody.addEventListener('input', recalc);
  tbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove')) {
      const rows = tbody.querySelectorAll('tr.item');
      if (rows.length > 1) {
        e.target.closest('tr').remove();
      } else {
        // last row — clear it instead
        e.target.closest('tr').querySelectorAll('input').forEach((i, idx) => {
          if (idx === 0) i.value = '';
          if (idx === 1) i.value = '1';
          if (idx === 2) i.value = 'ks';
          if (idx === 3) i.value = '0';
        });
      }
      recalc();
    }
  });

  document.getElementById('add-item').addEventListener('click', () => {
    tbody.appendChild(tpl.content.cloneNode(true));
    recalc();
  });

  recalc();
})();
