import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/** Dados do relatório (já traduzidos e formatados para exibição). */
export interface RecallReportData {
  companyName: string;
  number: string;
  severity: string;
  status: string;
  reason: string;
  createdAt: string;
  createdBy: string;
  generatedAt: string;
  originLot: { code: string; product: string };
  origins: string[];
  lots: Array<{
    code: string;
    product: string;
    depth: number;
    balance: string;
    previousStatus: string;
    status: string;
  }>;
  customers: Array<{
    name: string;
    place: string;
    contact: string;
    shipments: string;
    quantities: string;
  }>;
}

// A4 em pontos.
const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT = WIDTH - 2 * MARGIN;

const ESPRESSO = rgb(0.2, 0.13, 0.09);
const INK = rgb(0.13, 0.11, 0.1);
const MUTED = rgb(0.42, 0.38, 0.35);
const RULE = rgb(0.82, 0.78, 0.74);
const ALERT = rgb(0.6, 0.11, 0.09);
const STRIPE = rgb(0.97, 0.95, 0.92);

interface Column {
  title: string;
  width: number;
}

/**
 * Relatório do recall em PDF (A4, várias páginas): cabeçalho com número/gravidade/motivo, lote de
 * origem e fazendas, tabela de lotes afetados e tabela de clientes a contatar com as expedições.
 * Helvetica padrão (WinAnsi): acentos do português funcionam; o resto é simplificado.
 */
export async function buildRecallReportPdf(data: RecallReportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recall ${data.number}`);
  pdf.setSubject(data.reason);
  pdf.setCreator('TraceFlow');
  pdf.setProducer('TraceFlow');

  const writer = new ReportWriter(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    `${data.companyName} - Recall ${data.number}`,
  );

  writer.title(`Relatório de recall ${data.number}`, data.companyName);
  writer.fields([
    ['Gravidade', data.severity],
    ['Situação na emissão', data.status],
    ['Aberto em', `${data.createdAt} por ${data.createdBy}`],
    ['Gerado em', data.generatedAt],
    ['Lote de origem', `${data.originLot.code} - ${data.originLot.product}`],
    ['Origem (fazendas)', data.origins.length ? data.origins.join('; ') : '-'],
  ]);
  writer.heading('Motivo');
  writer.paragraph(data.reason);

  writer.heading(`Lotes afetados (${data.lots.length}) - bloqueados para movimentação`);
  writer.table(
    [
      { title: 'Lote', width: 95 },
      { title: 'Produto', width: 170 },
      { title: 'Nível', width: 40 },
      { title: 'Saldo', width: 90 },
      { title: 'Status anterior', width: 120 },
    ],
    data.lots.map((lot) => [
      lot.code,
      lot.product,
      String(lot.depth),
      lot.balance,
      lot.previousStatus,
    ]),
  );

  writer.heading(`Clientes a contatar (${data.customers.length})`);
  if (data.customers.length === 0) {
    writer.paragraph('Nenhuma expedição dos lotes afetados: nenhum cliente a contatar.');
  } else {
    writer.table(
      [
        { title: 'Cliente', width: 130 },
        { title: 'Cidade/UF', width: 85 },
        { title: 'Contato', width: 110 },
        { title: 'Expedições', width: 100 },
        { title: 'Quantidade', width: 90 },
      ],
      data.customers.map((c) => [c.name, c.place, c.contact, c.shipments, c.quantities]),
    );
  }

  writer.finish();
  return pdf.save();
}

class ReportWriter {
  private page!: PDFPage;
  private y = 0;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly footer: string,
  ) {
    this.newPage();
  }

  title(text: string, subtitle: string): void {
    this.page.drawRectangle({ x: 0, y: HEIGHT - 70, width: WIDTH, height: 70, color: ESPRESSO });
    this.page.drawText(winAnsi(text), {
      x: MARGIN,
      y: HEIGHT - 38,
      size: 18,
      font: this.bold,
      color: rgb(0.98, 0.96, 0.93),
    });
    this.page.drawText(winAnsi(subtitle), {
      x: MARGIN,
      y: HEIGHT - 56,
      size: 10,
      font: this.regular,
      color: rgb(0.9, 0.85, 0.8),
    });
    this.y = HEIGHT - 95;
  }

  fields(rows: Array<[string, string]>): void {
    for (const [label, value] of rows) {
      const lines = this.wrap(value, this.regular, 10, CONTENT - 120);
      this.ensure(lines.length * 13 + 2);
      this.page.drawText(winAnsi(label), {
        x: MARGIN,
        y: this.y,
        size: 10,
        font: this.bold,
        color: label === 'Gravidade' ? ALERT : INK,
      });
      for (const line of lines) {
        this.page.drawText(line, { x: MARGIN + 120, y: this.y, size: 10, font: this.regular });
        this.y -= 13;
      }
      this.y -= 2;
    }
  }

  heading(text: string): void {
    this.ensure(40);
    this.y -= 12;
    this.page.drawText(winAnsi(text), {
      x: MARGIN,
      y: this.y,
      size: 12,
      font: this.bold,
      color: ESPRESSO,
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: WIDTH - MARGIN, y: this.y },
      thickness: 0.8,
      color: RULE,
    });
    this.y -= 14;
  }

  paragraph(text: string): void {
    for (const line of this.wrap(text, this.regular, 10, CONTENT)) {
      this.ensure(13);
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 10, font: this.regular, color: INK });
      this.y -= 13;
    }
  }

  table(columns: Column[], rows: string[][]): void {
    const size = 8.5;
    const lineHeight = 11;
    const drawHeader = () => {
      this.ensure(lineHeight + 6);
      let x = MARGIN;
      for (const column of columns) {
        this.page.drawText(winAnsi(column.title), {
          x,
          y: this.y,
          size,
          font: this.bold,
          color: MUTED,
        });
        x += column.width;
      }
      this.y -= lineHeight + 3;
    };

    drawHeader();
    rows.forEach((row, index) => {
      const cells = row.map((cell, i) =>
        this.wrap(cell, this.regular, size, columns[i]!.width - 6).slice(0, 4),
      );
      const height = Math.max(...cells.map((lines) => lines.length)) * lineHeight + 4;
      if (this.y - height < MARGIN + 20) {
        this.newPage();
        drawHeader();
      }
      if (index % 2 === 0) {
        this.page.drawRectangle({
          x: MARGIN - 3,
          y: this.y - height + lineHeight - 1,
          width: CONTENT + 6,
          height,
          color: STRIPE,
        });
      }
      let x = MARGIN;
      cells.forEach((lines, i) => {
        lines.forEach((line, n) => {
          this.page.drawText(line, {
            x,
            y: this.y - n * lineHeight,
            size,
            font: this.regular,
            color: INK,
          });
        });
        x += columns[i]!.width;
      });
      this.y -= height;
    });
    this.y -= 4;
  }

  /** Rodapé com numeração em todas as páginas. */
  finish(): void {
    this.pages.forEach((page, index) => {
      page.drawText(winAnsi(`${this.footer} - página ${index + 1} de ${this.pages.length}`), {
        x: MARGIN,
        y: 22,
        size: 8,
        font: this.regular,
        color: MUTED,
      });
    });
  }

  private newPage(): void {
    this.page = this.pdf.addPage([WIDTH, HEIGHT]);
    this.pages.push(this.page);
    this.y = HEIGHT - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  /** Quebra em linhas que cabem na largura (palavras longas são cortadas). */
  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of winAnsi(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }
}

/** Mantém Latin-1 (acentos do português); fora disso, remove diacríticos ou troca por `?`. */
export function winAnsi(text: string): string {
  return [...text]
    .map((char) => {
      if (char === '\n' || (char >= ' ' && char <= 'ÿ')) return char;
      if (char === '–' || char === '—') return '-';
      const stripped = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\xff]+$/.test(stripped) ? stripped : '?';
    })
    .join('')
    .replace(/[\x7f-\x9f]/g, '?');
}
