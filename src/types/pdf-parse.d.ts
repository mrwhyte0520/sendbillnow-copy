declare module 'pdf-parse' {
  export interface PdfParseResult {
    text?: string;
    numpages?: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }

  export default function pdfParse(input: Uint8Array): Promise<PdfParseResult>;
}
