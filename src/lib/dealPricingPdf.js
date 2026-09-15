import { round2 } from './dealPricing'

// Ported from old-portal/js/dealPricing.js's dpDownloadQuotePdf. Production
// lazy-loads jsPDF from a CDN <script> tag only once a quote is actually
// generated, to avoid paying its cost on every portal load — jspdf is now an
// npm dependency here instead, and this dynamic import() achieves the same
// lazy-load goal through Vite's own code-splitting (same category of
// technique-only substitution as fetch() replacing raw XHR elsewhere in this
// project — approved before implementing).
export async function downloadQuotePdf({ result, customerName, state, repName, catalog, lines }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  let y = 20

  doc.setFontSize(16)
  doc.text('Aditi Tracking — Quotation', 14, y)
  y += 10
  doc.setFontSize(10)
  doc.text(`Quote Ref: ${result.quote_ref}`, 14, y)
  y += 6
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 14, y)
  y += 6
  doc.text(`Customer: ${customerName}`, 14, y)
  y += 6
  doc.text(`State: ${state}`, 14, y)
  y += 6
  doc.text(`Rep: ${repName || ''}`, 14, y)
  y += 10

  doc.setFontSize(9)
  doc.setFont(undefined, 'bold')
  doc.text('Product', 14, y)
  doc.text('Qty', 118, y)
  doc.text('Price', 140, y)
  doc.text('Total', 170, y)
  doc.setFont(undefined, 'normal')
  y += 5
  doc.line(14, y, 196, y)
  y += 6

  lines.forEach((line) => {
    const item = catalog.find((p) => p.product_id === line.product_id)
    const name = item ? item.name : line.product_id
    const total = round2(line.qty * line.selling_price)
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.text(String(name).slice(0, 55), 14, y)
    doc.text(String(line.qty), 118, y)
    doc.text(line.selling_price.toFixed(2), 140, y)
    doc.text(total.toFixed(2), 170, y)
    y += 6
  })

  y += 4
  doc.line(14, y, 196, y)
  y += 8
  doc.text(`Subtotal: Rs ${result.subtotal.toFixed(2)}`, 140, y)
  y += 6
  doc.text(`GST: Rs ${result.gst_amount.toFixed(2)}`, 140, y)
  y += 6
  doc.setFont(undefined, 'bold')
  doc.text(`Grand Total: Rs ${result.grand_total.toFixed(2)}`, 140, y)

  doc.save(`${result.quote_ref}.pdf`)
}
