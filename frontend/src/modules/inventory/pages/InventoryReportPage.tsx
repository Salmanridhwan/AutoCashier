import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/context/AuthContext';
import { useLanguage } from '@/shared/context/LanguageContext';

function formatRp(val: number): string {
  return 'Rp ' + Math.round(val).toLocaleString('id-ID');
}

export default function InventoryReportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const hasPrinted = useRef(false);

  // Read snapshot stored in sessionStorage
  const raw = sessionStorage.getItem('inventory_report_snapshot');
  const snap = raw ? JSON.parse(raw) : null;

  // Auto-trigger print once, then return
  useEffect(() => {
    if (!snap || hasPrinted.current) return;
    hasPrinted.current = true;

    const timer = setTimeout(() => {
      window.print();
    }, 600);

    return () => clearTimeout(timer);
  }, [snap]);

  if (!snap) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center space-y-4">
          <p className="text-gray-500 font-semibold">
            {language === 'id' ? 'Data laporan inventaris tidak ditemukan.' : 'No inventory report data found.'}
          </p>
          <button
            onClick={() => navigate('/inventory')}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold"
          >
            {language === 'id' ? 'Kembali ke Inventaris' : 'Back to Inventory'}
          </button>
        </div>
      </div>
    );
  }

  const { inventory, branchName, generatedAt } = snap;

  const totalSKUs = inventory.length;
  const totalStock = inventory.reduce((acc: number, item: any) => acc + (item.stock || 0), 0);
  const totalAssetVal = inventory.reduce((acc: number, item: any) => acc + ((item.price || 0) * (item.stock || 0)), 0);
  const lowStockCount = inventory.filter((item: any) => (item.stock || 0) < 20).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Inter', sans-serif;
          background: #f8fafc;
          color: #1e293b;
        }

        .report-wrapper {
          min-height: 100vh;
          background: #f1f5f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
          gap: 16px;
        }

        .no-print {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .report-page {
          width: 210mm;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 30px rgba(0,0,0,0.08);
          overflow: hidden;
        }

        .report-header {
          background: linear-gradient(135deg, #1e3a5f 0%, #312e81 100%);
          color: #fff;
          padding: 40px 48px 36px;
        }

        .report-body {
          padding: 36px 48px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .label-xs {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .section-title {
          font-size: 13px;
          font-weight: 800;
          color: #1e293b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding-bottom: 10px;
          border-bottom: 2px solid #e2e8f0;
          margin-bottom: 16px;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .summary-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
        }

        .summary-card .val {
          font-size: 18px;
          font-weight: 900;
          color: #1e293b;
          margin-top: 6px;
          line-height: 1.1;
        }

        .summary-card .sub {
          font-size: 10px;
          color: #64748b;
          font-weight: 600;
          margin-top: 4px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        thead tr {
          background: #f1f5f9;
        }

        th {
          padding: 10px 12px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #64748b;
          text-align: left;
        }

        td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          font-weight: 500;
        }

        tr:last-child td { border-bottom: none; }

        .td-right { text-align: right; font-weight: 700; }
        .td-mono  { font-family: monospace; }

        .chip {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: #e0e7ff;
          color: #4338ca;
        }

        .badge-warning {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 800;
          background: #ffe4e6;
          color: #e11d48;
        }

        .badge-success {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 800;
          background: #d1fae5;
          color: #059669;
        }

        .report-footer {
          padding: 20px 48px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          body { background: #fff; }

          .report-wrapper {
            background: #fff;
            padding: 0;
            display: block;
          }

          .no-print { display: none !important; }

          .report-page {
            width: 100%;
            border-radius: 0;
            box-shadow: none;
            page-break-after: avoid;
          }

          .report-body { padding: 24px 36px; gap: 20px; }
          .report-header { padding: 28px 36px 24px; }
          .report-footer { padding: 14px 36px; }
          .summary-card .val { font-size: 15px; }
        }
      `}</style>

      <div className="report-wrapper">
        {/* Screen-only toolbar */}
        <div className="no-print">
          <button
            onClick={() => {
              sessionStorage.removeItem('inventory_report_snapshot');
              navigate('/inventory');
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            {language === 'id' ? '← Kembali' : '← Back'}
          </button>
          <button
            onClick={() => window.print()}
            style={{
              padding: '10px 24px',
              borderRadius: 12,
              border: 'none',
              background: '#4f46e5',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(79,70,229,0.3)',
            }}
          >
            {language === 'id' ? '🖨 Cetak / Simpan PDF' : '🖨 Print / Save PDF'}
          </button>
        </div>

        {/* Report Document */}
        <div className="report-page">
          {/* Header */}
          <div className="report-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
                  AutoCashier — Inventory Management
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                  {language === 'id' ? 'Laporan Inventaris Cabang' : 'Branch Inventory Report'}
                </div>
                <div style={{ fontSize: 14, color: '#c7d2fe', marginTop: 6, fontWeight: 600 }}>
                  {branchName}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                  {language === 'id' ? 'Tanggal Cetak' : 'Print Date'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
                  {generatedAt}
                </div>
                <div style={{ fontSize: 10, color: '#818cf8', marginTop: 12, fontWeight: 600 }}>
                  {language === 'id' ? 'Dicetak oleh:' : 'Printed by:'} {user?.username ?? '—'}
                </div>
                <div style={{ fontSize: 10, color: '#818cf8', marginTop: 2, fontWeight: 600 }}>
                  Role: {user?.role ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="report-body">
            {/* 1. Summary Widgets */}
            <div>
              <div className="section-title">{language === 'id' ? 'Ringkasan Inventaris' : 'Inventory Summary'}</div>
              <div className="summary-grid">
                <div className="summary-card">
                  <div className="label-xs">{language === 'id' ? 'Total SKU Produk' : 'Total Product SKUs'}</div>
                  <div className="val">{totalSKUs} SKU</div>
                  <div className="sub">{language === 'id' ? 'terdaftar di sistem' : 'registered in system'}</div>
                </div>
                <div className="summary-card">
                  <div className="label-xs">{language === 'id' ? 'Total Kuantitas Stok' : 'Total Stock Quantity'}</div>
                  <div className="val">{totalStock.toLocaleString('id-ID')} unit</div>
                  <div className="sub">{language === 'id' ? 'unit fisik tersedia' : 'physical units available'}</div>
                </div>
                <div className="summary-card">
                  <div className="label-xs">{language === 'id' ? 'Total Nilai Aset' : 'Total Asset Value'}</div>
                  <div className="val">{formatRp(totalAssetVal)}</div>
                  <div className="sub">{language === 'id' ? 'berdasarkan harga jual' : 'based on retail price'}</div>
                </div>
                <div className="summary-card">
                  <div className="label-xs">{language === 'id' ? 'Stok Menipis' : 'Low Stock Items'}</div>
                  <div className="val" style={{ color: lowStockCount > 0 ? '#e11d48' : '#059669' }}>
                    {lowStockCount} {language === 'id' ? 'Produk' : 'Products'}
                  </div>
                  <div className="sub">{language === 'id' ? 'stok di bawah 20 pcs' : 'stock below 20 pcs'}</div>
                </div>
              </div>
            </div>

            {/* 2. Detailed Table */}
            <div>
              <div className="section-title">{language === 'id' ? 'Rincian Stok Barang' : 'Detailed Stock List'}</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>No</th>
                    <th>{language === 'id' ? 'Nama Produk' : 'Product Name'}</th>
                    <th>SKU</th>
                    <th>{language === 'id' ? 'Kategori' : 'Category'}</th>
                    <th style={{ textAlign: 'right' }}>{language === 'id' ? 'Harga Jual' : 'Retail Price'}</th>
                    <th style={{ textAlign: 'right' }}>{language === 'id' ? 'Stok' : 'Stock'}</th>
                    <th>{language === 'id' ? 'Status AI' : 'AI Status'}</th>
                    <th style={{ textAlign: 'right' }}>{language === 'id' ? 'Nilai Aset' : 'Asset Value'}</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.length > 0 ? (
                    inventory.map((item: any, i: number) => {
                      const assetVal = (item.price || 0) * (item.stock || 0);
                      const isLow = (item.stock || 0) < 20;
                      return (
                        <tr key={item.id}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 700, color: '#1e293b' }}>{item.name || '—'}</td>
                          <td className="td-mono">{item.sku || '—'}</td>
                          <td><span className="chip">{item.category || 'Local Product'}</span></td>
                          <td className="td-right td-mono">{formatRp(item.price || 0)}</td>
                          <td className="td-right td-mono" style={{ color: isLow ? '#e11d48' : '#1e293b', fontWeight: isLow ? 700 : 500 }}>
                            {item.stock ?? 0} {isLow && <span style={{ fontSize: 8, verticalAlign: 'middle' }}>⚠️</span>}
                          </td>
                          <td>
                            {item.ai_label ? (
                              <span className="badge-success">{item.ai_label}</span>
                            ) : (
                              <span className="badge-warning">No Label</span>
                            )}
                          </td>
                          <td className="td-right td-mono" style={{ color: '#312e81', fontWeight: 700 }}>
                            {formatRp(assetVal)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs font-semibold text-gray-400">
                        {language === 'id' ? 'Tidak ada produk untuk ditampilkan.' : 'No products to display.'}
                      </td>
                    </tr>
                  )}
                  {inventory.length > 0 && (
                    <tr style={{ background: '#f1f5f9' }}>
                      <td colSpan={5} style={{ fontWeight: 800, fontSize: 11 }}>TOTAL</td>
                      <td className="td-right td-mono" style={{ fontWeight: 800 }}>
                        {totalStock.toLocaleString('id-ID')}
                      </td>
                      <td></td>
                      <td className="td-right td-mono" style={{ fontWeight: 900, color: '#4f46e5' }}>
                        {formatRp(totalAssetVal)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="report-footer">
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
              AutoCashier Inventory · {language === 'id' ? 'Dokumen ini dibuat otomatis oleh sistem' : 'This document is auto-generated by the system'}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
              {generatedAt} · Confidential
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
