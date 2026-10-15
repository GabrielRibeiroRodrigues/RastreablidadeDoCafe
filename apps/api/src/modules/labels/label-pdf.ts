import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { formatPlace, type PublicOrigin } from '../trace/public-origin.js';

/** Dados impressos na etiqueta (já reduzidos ao que é publicável). */
export interface LabelData {
  companyName: string;
  productName: string;
  lotCode: string;
  harvest: string | null;
  variety: string | null;
  /** Já traduzido, ex.: "Média-clara". */
  roastLevel: string | null;
  /** Rótulo da data conforme o tipo do lote, ex.: "Torrado em". */
  dateLabel: string;
  date: string;
  expiresAt: string | null;
  cuppingScore: string | null;
  origins: PublicOrigin[];
  /** Conteúdo do QR code: a página pública de rastreio. */
  publicUrl: string;
}

/** 100 × 150 mm (etiqueta térmica comum), em pontos (1 mm = 72 / 25,4 pt). */
const MM = 72 / 25.4;
const WIDTH = 100 * MM;
const HEIGHT = 150 * MM;
const MARGIN = 5 * MM;

const ESPRESSO = rgb(0.2, 0.13, 0.09);
const INK = rgb(0.13, 0.11, 0.1);
const MUTED = rgb(0.42, 0.38, 0.35);
const RULE = rgb(0.82, 0.78, 0.74);
const CREAM = rgb(0.98, 0.96, 0.93);

const QR_SIZE = 36 * MM;
const MAX_ORIGINS = 4;

/**
 * Monta o PDF da etiqueta do lote (uma página 100 × 150 mm) com QR code vetorial — nítido em
 * impressora térmica. Usa Helvetica (fonte padrão do PDF, codificação WinAnsi): cobre os acentos
 * do português (ã, é, ç…); caracteres fora dela são trocados por equivalentes sem acento.
 */
export async function buildLabelPdf(data: LabelData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Etiqueta ${data.lotCode}`);
  pdf.setSubject(data.productName);
  pdf.setCreator('TraceFlow');
  pdf.setProducer('TraceFlow');

  const page = pdf.addPage([WIDTH, HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = new TextWriter(page, regular, bold);
  const contentWidth = WIDTH - 2 * MARGIN;

  // Faixa superior: empresa.
  const bandHeight = 11 * MM;
  page.drawRectangle({
    x: 0,
    y: HEIGHT - bandHeight,
    width: WIDTH,
    height: bandHeight,
    color: ESPRESSO,
  });
  text.fitLine(data.companyName.toUpperCase(), {
    x: MARGIN,
    y: HEIGHT - bandHeight / 2 - 3.5,
    size: 10,
    font: bold,
    color: CREAM,
    maxWidth: contentWidth,
  });

  let y = HEIGHT - bandHeight - 6 * MM;

  // Produto (até 2 linhas).
  for (const line of text.wrap(data.productName, bold, 13, contentWidth).slice(0, 2)) {
    text.draw(line, { x: MARGIN, y, size: 13, font: bold, color: INK });
    y -= 15;
  }

  // Código do lote, grande.
  y -= 4;
  text.draw('LOTE', { x: MARGIN, y, size: 7, font: bold, color: MUTED });
  y -= 22;
  text.fitLine(data.lotCode, {
    x: MARGIN,
    y,
    size: 24,
    font: bold,
    color: INK,
    maxWidth: contentWidth,
  });
  y -= 10;
  rule(page, y);

  // Ficha técnica: 3 linhas × 2 colunas.
  const fields: Array<[string, string | null]> = [
    ['Safra', data.harvest],
    ['Variedade', data.variety],
    ['Torra', data.roastLevel],
    [data.dateLabel, data.date],
    ['Validade', data.expiresAt],
    ['Pontuação SCA', data.cuppingScore],
  ];
  const columnWidth = contentWidth / 2;
  y -= 12;
  for (let row = 0; row < fields.length / 2; row++) {
    for (let column = 0; column < 2; column++) {
      const [label, value] = fields[row * 2 + column] ?? ['', null];
      const x = MARGIN + column * columnWidth;
      text.draw(label.toUpperCase(), { x, y, size: 6.5, font: bold, color: MUTED });
      text.fitLine(value ?? '—', {
        x,
        y: y - 12,
        size: 10.5,
        font: bold,
        color: INK,
        maxWidth: columnWidth - 6,
      });
    }
    y -= 27;
  }
  rule(page, y + 6);

  // Origem: o espaço restante até o bloco do QR code.
  const qrTop = MARGIN + 6 + QR_SIZE;
  y -= 8;
  text.draw('ORIGEM', { x: MARGIN, y, size: 7, font: bold, color: MUTED });
  y -= 12;
  const origins = data.origins.slice(0, MAX_ORIGINS);
  if (origins.length === 0) {
    text.draw('Origem não informada', { x: MARGIN, y, size: 9, font: regular, color: MUTED });
  }
  for (const origin of origins) {
    if (y - 10 < qrTop) break;
    const place = formatPlace(origin);
    // Sem nome publicável (produtor pessoa física sem fazenda): só a região/cidade.
    text.fitLine(origin.name ?? (place || 'Origem não identificada'), {
      x: MARGIN,
      y,
      size: 9.5,
      font: bold,
      color: INK,
      maxWidth: contentWidth,
    });
    const detail = [
      origin.name ? place : '',
      origin.altitudeMeters ? `${origin.altitudeMeters.toLocaleString('pt-BR')} m` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (detail) {
      text.fitLine(detail, {
        x: MARGIN,
        y: y - 10,
        size: 8,
        font: regular,
        color: MUTED,
        maxWidth: contentWidth,
      });
      y -= 23;
    } else {
      y -= 13;
    }
  }
  const hidden = data.origins.length - origins.length;
  if (hidden > 0 && y - 6 > qrTop) {
    text.draw(`+ ${hidden} outra(s) origem(ns)`, {
      x: MARGIN,
      y,
      size: 8,
      font: regular,
      color: MUTED,
    });
  }

  // QR code + chamada.
  const qrX = MARGIN;
  const qrY = MARGIN + 6;
  drawQrCode(page, data.publicUrl, qrX, qrY, QR_SIZE);
  const sideX = qrX + QR_SIZE + 4 * MM;
  const sideWidth = WIDTH - MARGIN - sideX;
  let sideY = qrY + QR_SIZE - 10;
  for (const line of text.wrap('Escaneie e conheça a origem deste café', bold, 10, sideWidth)) {
    text.draw(line, { x: sideX, y: sideY, size: 10, font: bold, color: INK });
    sideY -= 12;
  }
  sideY -= 4;
  // Impresso sem o esquema (só para leitura humana; o QR tem a URL completa).
  const printedUrl = data.publicUrl.replace(/^https?:\/\//, '');
  // Quebra depois da última "/": o token fica inteiro numa linha.
  const cut = printedUrl.lastIndexOf('/') + 1;
  const urlLines = [printedUrl.slice(0, cut), printedUrl.slice(cut)].flatMap((part) =>
    text.wrapChars(part, regular, 6.5, sideWidth),
  );
  for (const line of urlLines.slice(0, 3)) {
    text.draw(line, { x: sideX, y: sideY, size: 6.5, font: regular, color: MUTED });
    sideY -= 8;
  }
  text.draw('Rastreado com TraceFlow', { x: sideX, y: qrY, size: 6.5, font: bold, color: MUTED });

  return pdf.save();
}

function rule(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: WIDTH - MARGIN, y },
    thickness: 0.6,
    color: RULE,
  });
}

/** QR code desenhado com retângulos (vetorial), nível de correção M. */
function drawQrCode(page: PDFPage, content: string, x: number, y: number, size: number): void {
  const { modules } = QRCode.create(content, { errorCorrectionLevel: 'M' });
  const quiet = 1; // margem (em módulos) — a área ao redor já é branca
  const cell = size / (modules.size + 2 * quiet);
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (!modules.get(row, column)) continue;
      page.drawRectangle({
        x: x + (column + quiet) * cell,
        // Linhas do QR crescem para baixo; o PDF, para cima.
        y: y + size - (row + quiet + 1) * cell,
        width: cell + 0.05, // sobreposição mínima evita frestas entre módulos
        height: cell + 0.05,
        color: rgb(0, 0, 0),
      });
    }
  }
}

interface DrawOptions {
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
}

/** Escrita de texto com troca de caracteres que a fonte padrão (WinAnsi) não codifica. */
class TextWriter {
  private readonly supported: Set<number>;

  constructor(
    private readonly page: PDFPage,
    regular: PDFFont,
    bold: PDFFont,
  ) {
    this.supported = new Set(
      regular.getCharacterSet().filter((code) => bold.getCharacterSet().includes(code)),
    );
  }

  /** Remove o que a fonte não tem: primeiro tenta sem acento (NFKD), senão "?". */
  safe(value: string): string {
    let out = '';
    for (const char of value) {
      const code = char.codePointAt(0) ?? 63;
      if (this.supported.has(code)) {
        out += char;
        continue;
      }
      const plain = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      out += [...plain].every((c) => this.supported.has(c.codePointAt(0) ?? 63)) ? plain : '?';
    }
    return out;
  }

  draw(value: string, options: DrawOptions): void {
    this.page.drawText(this.safe(value), options);
  }

  /** Uma linha: reduz a fonte até caber; se ainda assim não couber, corta com reticências. */
  fitLine(value: string, options: DrawOptions & { maxWidth: number }): void {
    const { maxWidth, ...draw } = options;
    let text = this.safe(value);
    let size = draw.size;
    const minSize = draw.size * 0.7;
    while (size > minSize && draw.font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
    while (text.length > 1 && draw.font.widthOfTextAtSize(text, size) > maxWidth) {
      text = `${text.slice(0, -2)}…`;
    }
    this.page.drawText(text, { ...draw, size });
  }

  /** Quebra por palavras. */
  wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const word of this.safe(value).split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** Quebra por caracteres (URLs não têm espaços). */
  wrapChars(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const char of this.safe(value)) {
      if (current && font.widthOfTextAtSize(current + char, size) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
