export interface ReceiptExportPayload {
  printerName?: string;
  paperWidth?: '58mm' | '80mm';
  issuer: {
    mainTitle: string;
    subTitle?: string;
    addressLine?: string;
    phoneLine?: string;
    taxLine?: string;
  };
  documentTitle: string;
  metaRows: Array<{ label: string; value: string; boxed?: boolean }>;
  table?: {
    columns: Array<{ header: string; align: 'left' | 'center' | 'right'; widthRatio: number }>;
    rows: Array<{ cells: string[]; subText?: string }>;
  };
  sections?: Array<{
    title: string;
    rows: Array<{ label: string; value: string; bold?: boolean }>;
  }>;
  totals: Array<{ label: string; value: string; isGrandTotal?: boolean; isBoxedNote?: boolean }>;
  campaigns?: string[];
  signatures: {
    leftTitle: string;
    leftSubtitle: string;
    rightTitle: string;
    rightSubtitle: string;
  };
  footer: {
    primaryText: string;
    secondaryText: string;
    softwareText: string;
  };
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [''];
  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) {
        lines.push(current);
      }
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number
) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function drawSolidLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  lineWidth = 2.6
) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function drawBuildingIcon(ctx: CanvasRenderingContext2D, centerX: number, topY: number) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 3.2;
  ctx.lineJoin = 'round';

  const w = 44;
  const h = 38;
  const x = centerX - w / 2;
  const y = topY;

  ctx.strokeRect(x + 4, y + 2, 22, h - 2);
  ctx.strokeRect(x + 26, y + 12, 14, h - 12);

  ctx.fillRect(x + 10, y + 9, 4, 4);
  ctx.fillRect(x + 17, y + 9, 4, 4);
  ctx.fillRect(x + 10, y + 17, 4, 4);
  ctx.fillRect(x + 17, y + 17, 4, 4);
  ctx.fillRect(x + 12, y + 27, 6, 13);

  ctx.fillRect(x + 31, y + 18, 4, 4);
  ctx.fillRect(x + 31, y + 26, 4, 4);
  ctx.restore();
}

function drawQrIcon(ctx: CanvasRenderingContext2D, centerX: number, topY: number) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';

  const size = 68;
  const x = centerX - size / 2;
  const y = topY;

  // Top-left finder
  ctx.strokeRect(x + 4, y + 4, 22, 22);
  ctx.fillRect(x + 11, y + 11, 8, 8);

  // Top-right finder
  ctx.strokeRect(x + 42, y + 4, 22, 22);
  ctx.fillRect(x + 49, y + 11, 8, 8);

  // Bottom-left finder
  ctx.strokeRect(x + 4, y + 42, 22, 22);
  ctx.fillRect(x + 11, y + 49, 8, 8);

  // Data modules
  ctx.fillRect(x + 31, y + 6, 5, 12);
  ctx.fillRect(x + 31, y + 24, 12, 5);
  ctx.fillRect(x + 6, y + 31, 16, 5);
  ctx.fillRect(x + 32, y + 34, 8, 8);
  ctx.fillRect(x + 46, y + 34, 16, 5);
  ctx.fillRect(x + 32, y + 48, 5, 16);
  ctx.fillRect(x + 43, y + 46, 10, 6);
  ctx.fillRect(x + 56, y + 46, 6, 18);
  ctx.fillRect(x + 43, y + 58, 8, 6);
  ctx.restore();
}

function executeReceiptPass(
  ctx: CanvasRenderingContext2D,
  payload: ReceiptExportPayload,
  canvasWidth: number,
  draw: boolean
): number {
  const padX = 36;
  const contentW = canvasWidth - padX * 2;
  const left = padX;
  const right = padX + contentW;
  const centerX = canvasWidth / 2;
  const fontBase = 'Arial, Helvetica, sans-serif';

  let y = 34;

  if (draw) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, ctx.canvas.height);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
  }

  // 1. Üst Bina İkonu
  if (draw) {
    drawBuildingIcon(ctx, centerX, y);
  }
  y += 50;

  // 2. Düzenleyen Firma Başlıkları
  if (payload.issuer?.mainTitle) {
    ctx.font = `900 26px ${fontBase}`;
    const lines = wrapTextLines(ctx, payload.issuer.mainTitle, contentW);
    for (const ln of lines) {
      if (draw) {
        ctx.textAlign = 'center';
        ctx.fillText(ln, centerX, y);
      }
      y += 31;
    }
  }

  if (payload.issuer?.subTitle) {
    ctx.font = `800 20px ${fontBase}`;
    const lines = wrapTextLines(ctx, payload.issuer.subTitle, contentW);
    for (const ln of lines) {
      if (draw) {
        ctx.textAlign = 'center';
        ctx.fillText(ln, centerX, y);
      }
      y += 25;
    }
  }

  for (const metaLine of [
    payload.issuer?.addressLine,
    payload.issuer?.phoneLine,
    payload.issuer?.taxLine,
  ]) {
    if (!metaLine) continue;
    ctx.font = `700 17px ${fontBase}`;
    const lines = wrapTextLines(ctx, metaLine, contentW);
    for (const ln of lines) {
      if (draw) {
        ctx.textAlign = 'center';
        ctx.fillText(ln, centerX, y);
      }
      y += 22;
    }
  }

  y += 10;
  if (draw) drawDashedLine(ctx, left, right, y);
  y += 18;

  // 3. Kutu İçinde Belge Başlığı (SİPARİŞ BİLGİ FİŞİ vb.)
  if (payload.documentTitle) {
    ctx.font = `900 22px ${fontBase}`;
    const textW = ctx.measureText(payload.documentTitle).width;
    const boxW = Math.min(contentW, textW + 44);
    const boxH = 42;
    const boxX = centerX - boxW / 2;
    if (draw) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.6;
      ctx.strokeRect(boxX, y, boxW, boxH);
      ctx.textAlign = 'center';
      ctx.fillText(payload.documentTitle, centerX, y + 10);
    }
    y += boxH + 18;
    if (draw) drawDashedLine(ctx, left, right, y);
    y += 16;
  }

  // 4. Fiş Meta Satırları
  for (const row of payload.metaRows || []) {
    if (row.boxed) {
      ctx.font = `800 18px ${fontBase}`;
      const fullTxt = `${row.label} ${row.value}`.trim();
      const lines = wrapTextLines(ctx, fullTxt, contentW - 24);
      const boxH = lines.length * 23 + 14;
      if (draw) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.2;
        ctx.strokeRect(left, y, contentW, boxH);
        ctx.textAlign = 'center';
        lines.forEach((ln, idx) => {
          ctx.fillText(ln, centerX, y + 7 + idx * 23);
        });
      }
      y += boxH + 10;
    } else {
      ctx.font = `700 18px ${fontBase}`;
      const labelW = ctx.measureText(row.label).width;
      const maxValW = Math.max(160, contentW - labelW - 18);
      ctx.font = `800 18px ${fontBase}`;
      const valLines = wrapTextLines(ctx, row.value, maxValW);

      if (draw) {
        ctx.font = `700 18px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText(row.label, left, y);

        ctx.font = `800 18px ${fontBase}`;
        ctx.textAlign = 'right';
        valLines.forEach((ln, idx) => {
          ctx.fillText(ln, right, y + idx * 23);
        });
      }
      y += Math.max(27, valLines.length * 23 + 5);
    }
  }

  y += 6;
  if (draw) drawDashedLine(ctx, left, right, y);
  y += 14;

  // 5. Ürün Tablosu
  if (payload.table && payload.table.columns?.length > 0) {
    const cols = payload.table.columns;
    const colPositions: Array<{ x: number; w: number; align: 'left' | 'center' | 'right' }> = [];
    let accX = left;
    cols.forEach((c, idx) => {
      const w = idx === cols.length - 1 ? right - accX : Math.round(contentW * c.widthRatio);
      colPositions.push({ x: accX, w, align: c.align });
      accX += w;
    });

    ctx.font = `800 17px ${fontBase}`;
    if (draw) {
      cols.forEach((c, idx) => {
        const pos = colPositions[idx];
        ctx.textAlign = pos.align;
        const tx =
          pos.align === 'left'
            ? pos.x
            : pos.align === 'right'
            ? pos.x + pos.w
            : pos.x + pos.w / 2;
        ctx.fillText(c.header, tx, y);
      });
    }
    y += 25;
    if (draw) drawSolidLine(ctx, left, right, y, 2.5);
    y += 12;

    for (const r of payload.table.rows || []) {
      const firstColW = Math.max(120, (colPositions[0]?.w || 260) - 10);
      ctx.font = `700 17px ${fontBase}`;
      const nameLines = wrapTextLines(ctx, r.cells[0] || '', firstColW);
      const rowHeight = Math.max(24, nameLines.length * 22);

      if (draw) {
        ctx.textAlign = 'left';
        nameLines.forEach((ln, idx) => {
          ctx.fillText(ln, colPositions[0].x, y + idx * 22);
        });

        const midY = y + Math.max(0, (rowHeight - 20) / 2);
        for (let cIdx = 1; cIdx < cols.length; cIdx++) {
          const pos = colPositions[cIdx];
          const val = String(r.cells[cIdx] ?? '');
          ctx.font = cIdx === cols.length - 1 ? `800 17px ${fontBase}` : `700 17px ${fontBase}`;
          ctx.textAlign = pos.align;
          const tx =
            pos.align === 'left'
              ? pos.x
              : pos.align === 'right'
              ? pos.x + pos.w
              : pos.x + pos.w / 2;
          ctx.fillText(val, tx, midY);
        }
      }
      y += rowHeight + 4;

      if (r.subText) {
        ctx.font = `700 15px ${fontBase}`;
        const subLines = wrapTextLines(ctx, r.subText, contentW - 10);
        if (draw) {
          ctx.textAlign = 'left';
          subLines.forEach((ln, idx) => {
            ctx.fillText(ln, left, y + idx * 19);
          });
        }
        y += subLines.length * 19 + 4;
      }

      y += 6;
    }

    y += 4;
    if (draw) drawDashedLine(ctx, left, right, y);
    y += 16;
  }

  // 6. Bölümler (Gün Sonu Z Raporu vb.)
  if (payload.sections && payload.sections.length > 0) {
    for (const sec of payload.sections) {
      ctx.font = `900 18px ${fontBase}`;
      if (draw) {
        ctx.textAlign = 'left';
        ctx.fillText(sec.title, left, y);
      }
      y += 24;
      if (draw) drawSolidLine(ctx, left, right, y, 2.0);
      y += 10;

      for (const sr of sec.rows) {
        ctx.font = `700 17px ${fontBase}`;
        if (draw) {
          ctx.textAlign = 'left';
          ctx.fillText(sr.label, left, y);
          ctx.font = `800 17px ${fontBase}`;
          ctx.textAlign = 'right';
          ctx.fillText(sr.value, right, y);
        }
        y += 25;
      }
      y += 8;
      if (draw) drawDashedLine(ctx, left, right, y);
      y += 14;
    }
  }

  // 7. Kampanyalar
  if (payload.campaigns && payload.campaigns.length > 0) {
    ctx.font = `800 17px ${fontBase}`;
    if (draw) {
      ctx.textAlign = 'left';
      ctx.fillText('UYGULANAN KAMPANYALAR:', left, y);
    }
    y += 23;
    for (const c of payload.campaigns) {
      ctx.font = `700 16px ${fontBase}`;
      const lines = wrapTextLines(ctx, `• ${c}`, contentW);
      if (draw) {
        lines.forEach((ln, idx) => {
          ctx.fillText(ln, left, y + idx * 20);
        });
      }
      y += lines.length * 20 + 4;
    }
    y += 8;
    if (draw) drawDashedLine(ctx, left, right, y);
    y += 14;
  }

  // 8. Toplamlar & Genel Toplam
  for (const tot of payload.totals || []) {
    if (tot.isBoxedNote) {
      ctx.font = `700 16px ${fontBase}`;
      const lines = wrapTextLines(ctx, `${tot.label} ${tot.value}`.trim(), contentW - 20);
      const boxH = lines.length * 21 + 16;
      if (draw) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(left, y, contentW, boxH);
        ctx.textAlign = 'left';
        lines.forEach((ln, idx) => {
          ctx.fillText(ln, left + 10, y + 8 + idx * 21);
        });
      }
      y += boxH + 12;
    } else if (tot.isGrandTotal) {
      y += 6;
      if (draw) drawSolidLine(ctx, left, right, y, 2.8);
      y += 14;
      if (draw) {
        ctx.font = `900 25px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText(tot.label, left, y);
        ctx.textAlign = 'right';
        ctx.fillText(tot.value, right, y);
      }
      y += 38;
      if (draw) drawDashedLine(ctx, left, right, y);
      y += 18;
    } else {
      if (draw) {
        ctx.font = `700 18px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText(tot.label, left, y);
        ctx.font = `800 18px ${fontBase}`;
        ctx.textAlign = 'right';
        ctx.fillText(tot.value, right, y);
      }
      y += 28;
    }
  }

  // 9. İmza Alanları (Teslim Eden / Teslim Alan)
  if (payload.signatures) {
    y += 16;
    const colGap = 36;
    const colW = (contentW - colGap) / 2;
    const leftColX = left;
    const rightColX = left + colW + colGap;

    if (draw) {
      drawSolidLine(ctx, leftColX, leftColX + colW, y, 2.4);
      drawSolidLine(ctx, rightColX, rightColX + colW, y, 2.4);

      ctx.font = `800 18px ${fontBase}`;
      ctx.textAlign = 'center';
      ctx.fillText(payload.signatures.leftTitle, leftColX + colW / 2, y + 10);
      ctx.fillText(payload.signatures.rightTitle, rightColX + colW / 2, y + 10);

      ctx.font = `700 15px ${fontBase}`;
      ctx.fillText(payload.signatures.leftSubtitle, leftColX + colW / 2, y + 34);
      ctx.fillText(payload.signatures.rightSubtitle, rightColX + colW / 2, y + 34);
    }
    y += 74;
    if (draw) drawDashedLine(ctx, left, right, y);
    y += 22;
  }

  // 10. Alt QR İkonu ve Mali Değeri Yoktur Bilgisi
  if (draw) {
    drawQrIcon(ctx, centerX, y);
  }
  y += 82;

  if (payload.footer?.primaryText) {
    ctx.font = `900 19px ${fontBase}`;
    const lines = wrapTextLines(ctx, payload.footer.primaryText, contentW);
    for (const ln of lines) {
      if (draw) {
        ctx.textAlign = 'center';
        ctx.fillText(ln, centerX, y);
      }
      y += 25;
    }
  }

  if (payload.footer?.secondaryText) {
    y += 4;
    ctx.font = `700 16px ${fontBase}`;
    const lines = wrapTextLines(ctx, payload.footer.secondaryText, contentW);
    for (const ln of lines) {
      if (draw) {
        ctx.textAlign = 'center';
        ctx.fillText(ln, centerX, y);
      }
      y += 22;
    }
  }

  if (payload.footer?.softwareText) {
    y += 6;
    ctx.font = `700 14px ${fontBase}`;
    if (draw) {
      ctx.textAlign = 'center';
      ctx.fillText(payload.footer.softwareText, centerX, y);
    }
    y += 24;
  }

  return y + 24;
}

export function renderReceiptToCanvas(payload: ReceiptExportPayload): HTMLCanvasElement {
  const canvasWidth = 720;
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = canvasWidth;
  measureCanvas.height = 200;
  const measureCtx = measureCanvas.getContext('2d')!;
  const totalHeight = Math.max(400, Math.ceil(executeReceiptPass(measureCtx, payload, canvasWidth, false)));

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;
  executeReceiptPass(ctx, payload, canvasWidth, true);
  return canvas;
}

export function createReceiptPngBlobSync(payload: ReceiptExportPayload): Blob {
  const canvas = renderReceiptToCanvas(payload);
  const pngDataUrl = canvas.toDataURL('image/png');
  const pngBytes = dataUrlToUint8Array(pngDataUrl);
  return new Blob([pngBytes as unknown as BlobPart], { type: 'image/png' });
}

export async function generateReceiptPngBlob(payload: ReceiptExportPayload): Promise<Blob> {
  return createReceiptPngBlobSync(payload);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Banka dekont paylaşımı (navigator.share) için kullanıcı tıklama yetkisini (User Gesture)
 * hiç kaybetmeden %100 SENKRON olarak bellekte gerçek PDF 1.4 dosyası üretir.
 */
export function createReceiptPdfBlobSync(payload: ReceiptExportPayload): Blob {
  const canvas = renderReceiptToCanvas(payload);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const jpegBytes = dataUrlToUint8Array(jpegDataUrl);

  const imgW = canvas.width;
  const imgH = canvas.height;

  // 80mm (~226.77 pt) termal fiş genişliğine orantılı tam boy PDF sayfası
  const pdfW = 240;
  const pdfH = Math.round((imgH / imgW) * pdfW);

  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;

  const pushStr = (str: string) => {
    const arr = encoder.encode(str);
    chunks.push(arr as unknown as BlobPart);
    byteLength += arr.byteLength;
  };

  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr as unknown as BlobPart);
    byteLength += arr.byteLength;
  };

  const startObj = (id: number) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr('\nendobj\n');
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // 2: Pages
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  // 3: Page
  startObj(3);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfW} ${pdfH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  endObj();

  // 4: Image XObject (DCTDecode JPEG)
  startObj(4);
  pushStr(
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream');
  endObj();

  // 5: Page Content Stream
  const contentStream = `q\n${pdfW} 0 0 ${pdfH} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);
  startObj(5);
  pushStr(`<< /Length ${contentBytes.byteLength} >>\nstream\n`);
  pushBytes(contentBytes);
  endObj();

  // XRef
  const xrefOffset = byteLength;
  pushStr('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    pushStr(`${off} 00000 n \n`);
  }

  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

export async function generateReceiptPdfBlob(payload: ReceiptExportPayload): Promise<Blob> {
  return createReceiptPdfBlobSync(payload);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(blob);
  });
}
