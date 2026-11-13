/* Comptes de la copropriété — calculs et rendu partagés (admin, charges, finances) */
(function (w) {
  const eur = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 }) + ' €';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

  function compute(d) {
    const rec = d.recettes || [];
    const percu = rec.reduce((s, r) => s + num(r.montant), 0);
    const appel = rec.reduce((s, r) => s + num(r.appel), 0);
    const internet = rec.reduce((s, r) => s + num(r.internet), 0);
    const fraisBureau = (d.fraisBureau || []).reduce((s, r) => s + num(r.montant), 0);
    const depensesHors = (d.depenses || []).reduce((s, r) => s + num(r.montant), 0);
    const depenses = depensesHors + fraisBureau;
    const prevu = num(d.prevu && d.prevu.montant), prevuInternet = num(d.prevu && d.prevu.internet);
    const reste = Math.max(0, prevu - percu);
    const totalRecettes = percu + appel + num(d.interetsLivret);
    const nouvelAvoir = num(d.avanceProvision) + totalRecettes - depenses;
    return { percu, appel, internet, fraisBureau, depensesHors, depenses, prevu, prevuInternet, reste, totalRecettes, nouvelAvoir };
  }

  async function load() {
    // 1) API (données à jour immédiatement) ; 2) fichier statique du dernier déploiement
    try { const r = await fetch('/api/comptes', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) {}
    const r = await fetch('/docs/comptes.json', { cache: 'no-store' }); if (!r.ok) throw new Error('comptes indisponibles'); return await r.json();
  }

  function dateFr(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }

  function renderRecettes(d) {
    const c = compute(d);
    let h = `<table class="sheet"><caption>Recettes — charges annuelles ${esc(d.exercice || '')}${d.etabliLe ? ' · établi au ' + esc(dateFr(d.etabliLe)) : ''}</caption>`;
    h += '<thead><tr><th>Noms</th><th>Montant</th><th>Appel excep.</th><th>Internet</th></tr></thead><tbody>';
    for (const r of d.recettes || []) {
      const inet = r.internetNote ? esc(r.internetNote) : (num(r.internet) ? eur(r.internet) : '');
      h += `<tr><td>${esc(r.nom)}</td><td class="num">${num(r.montant) ? eur(r.montant) : ''}</td><td class="num">${num(r.appel) ? eur(r.appel) : ''}</td><td class="num">${inet}</td></tr>`;
    }
    h += `<tr class="tot"><td>Perçu</td><td class="num">${eur(c.percu)}</td><td class="num">${c.appel ? eur(c.appel) : ''}</td><td class="num">${eur(c.internet)}</td></tr>`;
    h += `<tr class="tot"><td>Prévu</td><td class="num">${eur(c.prevu)}</td><td></td><td class="num">${eur(c.prevuInternet)}</td></tr>`;
    h += `<tr class="tot"><td>Reste à percevoir</td><td class="num">${eur(c.reste)}</td><td></td><td></td></tr>`;
    if (num(d.interetsLivret)) h += `<tr class="tot"><td>Intérêts Livret A</td><td class="num">${eur(d.interetsLivret)}</td><td></td><td></td></tr>`;
    h += `<tr class="tot"><td>Avance / provision reportée</td><td class="num">${eur(d.avanceProvision)}</td><td></td><td></td></tr>`;
    if (num(d.avoirInternet)) h += `<tr class="tot"><td>Avoir internet${d.avoirInternetDate ? ' au ' + esc(d.avoirInternetDate) : ''}</td><td class="num">${eur(d.avoirInternet)}</td><td></td><td></td></tr>`;
    h += `<tr class="tot"><td>Dépenses de l'exercice</td><td class="num">${eur(c.depenses)}</td><td></td><td></td></tr>`;
    h += `<tr class="tot"><td>Nouvel avoir</td><td class="num">${eur(c.nouvelAvoir)}</td><td></td><td></td></tr>`;
    h += '</tbody></table>';
    if (d.notes) h += `<p style="font-size:14px;color:var(--muted);margin:10px 0 0">${esc(d.notes)}</p>`;
    return h;
  }

  function renderDepenses(d, { withFraisBureau = true } = {}) {
    const c = compute(d);
    let h = `<table class="sheet"><caption>Dépenses de l'exercice ${esc(d.exercice || '')}</caption><thead><tr><th>Poste</th><th>Montant</th></tr></thead><tbody>`;
    for (const r of d.depenses || []) if (num(r.montant)) h += `<tr><td>${esc(r.poste)}</td><td class="num">${eur(r.montant)}</td></tr>`;
    if (withFraisBureau) h += `<tr><td>Frais de bureau et d'AG</td><td class="num">${eur(c.fraisBureau)}</td></tr>`;
    h += `<tr class="tot"><td>Total dépenses</td><td class="num">${eur(c.depenses)}</td></tr></tbody></table>`;
    return h;
  }

  function toWorkbook(d) {
    const c = compute(d); const X = w.XLSX; if (!X) return null;
    const wb = X.utils.book_new();
    const rows = [[`RECETTES — Charges annuelles ${d.exercice || ''}`], [d.etabliLe ? 'Établi au ' + dateFr(d.etabliLe) : ''], [], ['NOMS', 'MONTANT', 'APPEL EXCEP.', 'INTERNET']];
    for (const r of d.recettes || []) rows.push([r.nom, num(r.montant) || null, num(r.appel) || null, r.internetNote || num(r.internet) || null]);
    rows.push([], ['PERÇU', c.percu, c.appel || null, c.internet], ['PRÉVU', c.prevu, null, c.prevuInternet], ['Reste à percevoir', c.reste], [], ['Intérêts Livret A', num(d.interetsLivret)], ['Avance / provision reportée', num(d.avanceProvision)], ['Avoir internet', num(d.avoirInternet)], ['Dépenses', c.depenses], ['Nouvel avoir', c.nouvelAvoir]);
    const ws1 = X.utils.aoa_to_sheet(rows); ws1['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, ws1, 'Recettes');
    const dep = [['DÉPENSES', d.exercice || ''], ['Poste', 'Montant']]; for (const r of d.depenses || []) dep.push([r.poste, num(r.montant)]); dep.push(['Frais de bureau et d\'AG', c.fraisBureau], ['TOTAL', c.depenses]);
    const ws2 = X.utils.aoa_to_sheet(dep); ws2['!cols'] = [{ wch: 48 }, { wch: 14 }]; X.utils.book_append_sheet(wb, ws2, 'Dépenses');
    const fb = [['FRAIS DE BUREAU', d.exercice || ''], ['Poste', 'Montant']]; for (const r of d.fraisBureau || []) fb.push([r.poste, num(r.montant)]); fb.push(['TOTAL', c.fraisBureau]);
    const ws3 = X.utils.aoa_to_sheet(fb); ws3['!cols'] = [{ wch: 30 }, { wch: 14 }]; X.utils.book_append_sheet(wb, ws3, 'Frais de bureau');
    return wb;
  }

  w.Comptes = { eur, esc, num, compute, load, dateFr, renderRecettes, renderDepenses, toWorkbook };
})(window);
