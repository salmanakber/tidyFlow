import path from 'path';
import fs from 'fs';

declare const __non_webpack_require__: NodeRequire | undefined;

type ArabicReshaperModule = {
  ArabicShaper?: { convertArabic: (text: string) => string };
};

let arabicReshaperPkg: ArabicReshaperModule | null | undefined;

/** Load arabic-persian-reshaper at runtime (webpack-externalized — no top-level require). */
function loadArabicReshaper(): ArabicReshaperModule | null {
  if (arabicReshaperPkg !== undefined) return arabicReshaperPkg;
  try {
    if (typeof __non_webpack_require__ === 'function') {
      arabicReshaperPkg = __non_webpack_require__('arabic-persian-reshaper') as ArabicReshaperModule;
      return arabicReshaperPkg;
    }
    const { createRequire } = require('module') as typeof import('module');
    const nodeRequire = createRequire(__filename);
    arabicReshaperPkg = nodeRequire('arabic-persian-reshaper') as ArabicReshaperModule;
    return arabicReshaperPkg;
  } catch (err) {
    console.warn('[pdf-fonts] arabic-persian-reshaper unavailable:', err);
    arabicReshaperPkg = null;
    return null;
  }
}

export interface PdfFontSet {
  regular: string;
  bold: string;
  rtl: boolean;
}

/** Internal PDFKit font names — prefixed to avoid collisions with built-ins. */
const FONT_NAMES = {
  latinRegular: 'MayaNotoSans-Regular',
  latinBold: 'MayaNotoSans-Bold',
  arabicRegular: 'MayaNotoSansArabic-Regular',
  arabicBold: 'MayaNotoSansArabic-Bold',
  chineseRegular: 'MayaNotoSansSC-Regular',
  chineseBold: 'MayaNotoSansSC-Bold',
} as const;

const FONT_FILE_NAMES = {
  latinRegular: 'NotoSans-Regular.ttf',
  latinBold: 'NotoSans-Bold.ttf',
  arabicRegular: 'NotoSansArabic-Regular.ttf',
  arabicBold: 'NotoSansArabic-Bold.ttf',
  chineseRegular: 'NotoSansSC-Regular.otf',
  chineseBold: 'NotoSansSC-Bold.otf',
} as const;

const PROBE_FILE = FONT_FILE_NAMES.latinRegular;

const docRegistered = new WeakMap<PDFKit.PDFDocument, Set<string>>();
let builtinFontPatchInstalled = false;
let resolvedFontsDir: string | null | undefined;
let startupCheckDone = false;

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

/** Collect every directory that might contain our bundled .ttf/.otf files. */
function fontDirectoryCandidates(): string[] {
  const roots = uniqueStrings([
    process.env.PDF_FONTS_DIR || '',
    process.cwd(),
    typeof __dirname === 'string' ? __dirname : '',
    typeof __dirname === 'string' ? path.resolve(__dirname, '..') : '',
    typeof __dirname === 'string' ? path.resolve(__dirname, '../..') : '',
    typeof __dirname === 'string' ? path.resolve(__dirname, '../../..') : '',
    typeof __dirname === 'string' ? path.resolve(__dirname, '../../../..') : '',
  ]);

  const relativeDirs = [
    ['assets', 'fonts'],
    ['web', 'assets', 'fonts'],
    ['.next', 'server', 'assets', 'fonts'],
    ['server', 'assets', 'fonts'],
  ];

  const out: string[] = [];
  for (const root of roots) {
    for (const parts of relativeDirs) {
      out.push(path.resolve(root, ...parts));
    }
  }
  return uniqueStrings(out);
}

/** Resolve and cache the fonts directory; returns null when not found. */
export function resolveFontsDirectory(): string | null {
  if (resolvedFontsDir !== undefined) return resolvedFontsDir;

  for (const dir of fontDirectoryCandidates()) {
    const probe = path.join(dir, PROBE_FILE);
    if (fs.existsSync(probe)) {
      resolvedFontsDir = dir;
      return dir;
    }
  }

  resolvedFontsDir = null;
  return null;
}

/** Call once at server startup — logs a clear error if fonts are missing. */
export function ensurePdfFontsAvailable(): string | null {
  const dir = resolveFontsDirectory();
  if (!startupCheckDone) {
    startupCheckDone = true;
    if (dir) {
      const files = Object.values(FONT_FILE_NAMES).map((f) => {
        const full = path.join(dir, f);
        return `${f}:${fs.existsSync(full) ? 'ok' : 'MISSING'}`;
      });
      console.log(`[pdf-fonts] Font directory: ${dir}`);
      console.log(`[pdf-fonts] Font files: ${files.join(', ')}`);
    } else {
      console.error(
        '[pdf-fonts] CRITICAL: Unicode font directory not found. ' +
          'Invoice PDFs in non-English languages will show garbled text or empty boxes. ' +
          `Searched: ${fontDirectoryCandidates().join(' | ')}`
      );
    }
  }
  return dir;
}

function fontFilePath(filename: string): string | null {
  const dir = resolveFontsDirectory();
  if (!dir) return null;
  const full = path.join(dir, filename);
  return fs.existsSync(full) ? full : null;
}

function getRegistered(doc: PDFKit.PDFDocument): Set<string> {
  let set = docRegistered.get(doc);
  if (!set) {
    set = new Set();
    docRegistered.set(doc, set);
  }
  return set;
}

function registerFontFile(
  doc: PDFKit.PDFDocument,
  name: string,
  filename: string
): boolean {
  const filePath = fontFilePath(filename);
  if (!filePath) {
    console.error(`[pdf-fonts] Missing font file: ${filename}`);
    return false;
  }

  const registered = getRegistered(doc);
  if (registered.has(name)) return true;

  try {
    // File-path registration is more reliable than buffers in Next.js / PDFKit.
    doc.registerFont(name, filePath);
    registered.add(name);
    return true;
  } catch (err) {
    console.error(`[pdf-fonts] Failed to register ${name} from ${filePath}:`, err);
    return false;
  }
}

/** Patch fs so PDFKit built-in Helvetica fonts resolve in Next.js/webpack builds. */
export function ensurePdfKitBuiltinFonts(): void {
  if (builtinFontPatchInstalled) return;

  const possiblePaths = [
    path.resolve(process.cwd(), 'node_modules/pdfkit/js/data'),
    path.resolve(__dirname, '../node_modules/pdfkit/js/data'),
    path.resolve(__dirname, '../../node_modules/pdfkit/js/data'),
  ];

  let actualFontPath: string | undefined;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      actualFontPath = testPath;
      break;
    }
  }

  if (!actualFontPath) return;

  const originalReadFileSync = fs.readFileSync;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fs as any).readFileSync = function patchedReadFileSync(filePath: fs.PathOrFileDescriptor, ...args: any[]) {
    const filePathStr = String(filePath);
    if (
      filePathStr.includes('Helvetica') ||
      (filePathStr.includes('data/') && filePathStr.endsWith('.afm'))
    ) {
      const fileName = path.basename(filePathStr);
      const actualPath = path.join(actualFontPath!, fileName);
      if (fs.existsSync(actualPath)) {
        return originalReadFileSync.call(this, actualPath, ...args);
      }
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };

  builtinFontPatchInstalled = true;
}

export function normalizePdfLocale(locale?: string | null): string {
  return (locale || 'en').toLowerCase().split('-')[0];
}

export function isRtlPdfLocale(locale?: string | null): boolean {
  return normalizePdfLocale(locale) === 'ar';
}

/** Reshape Arabic letters for PDFKit (presentation forms). */
function reshapeArabic(text: string): string {
  const convert = loadArabicReshaper()?.ArabicShaper?.convertArabic;
  if (!convert) return text;
  try {
    return convert(text);
  } catch {
    return text;
  }
}

/** PDFKit renders LTR only — reverse Arabic word order for visual RTL display. */
function reorderArabicForPdfKit(text: string): string {
  const shaped = reshapeArabic(text);
  const parts = shaped.split(/(\s+)/);
  return parts.reverse().join('');
}

export function preparePdfText(text: string, locale?: string | null): string {
  if (!text) return text;
  if (!isRtlPdfLocale(locale)) return text;
  return reorderArabicForPdfKit(text);
}

type FontAvailability = {
  latin: boolean;
  arabic: boolean;
  chinese: boolean;
};

function registerFontsForLocale(doc: PDFKit.PDFDocument, locale?: string | null): FontAvailability {
  ensurePdfFontsAvailable();
  const loc = normalizePdfLocale(locale);

  const latin =
    registerFontFile(doc, FONT_NAMES.latinRegular, FONT_FILE_NAMES.latinRegular) &&
    registerFontFile(doc, FONT_NAMES.latinBold, FONT_FILE_NAMES.latinBold);

  const arabic =
    loc === 'ar'
      ? registerFontFile(doc, FONT_NAMES.arabicRegular, FONT_FILE_NAMES.arabicRegular) &&
        registerFontFile(doc, FONT_NAMES.arabicBold, FONT_FILE_NAMES.arabicBold)
      : false;

  const chinese =
    loc === 'cn' || loc === 'zh'
      ? registerFontFile(doc, FONT_NAMES.chineseRegular, FONT_FILE_NAMES.chineseRegular) &&
        registerFontFile(doc, FONT_NAMES.chineseBold, FONT_FILE_NAMES.chineseBold)
      : false;

  return { latin, arabic, chinese };
}

function helveticaFallback(rtl = false): PdfFontSet {
  ensurePdfKitBuiltinFonts();
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', rtl };
}

function latinFontSet(rtl = false): PdfFontSet {
  return {
    regular: FONT_NAMES.latinRegular,
    bold: FONT_NAMES.latinBold,
    rtl,
  };
}

const fallbackWarned = new Set<string>();

function warnFontFallback(loc: string, requested: string, usedHelvetica: boolean): void {
  const key = `${loc}:${requested}:${usedHelvetica}`;
  if (fallbackWarned.has(key)) return;
  fallbackWarned.add(key);
  console.error(
    `[pdf-fonts] FONT FALLBACK for locale "${loc}": "${requested}" could not be loaded` +
      (usedHelvetica
        ? ' — using Helvetica. Arabic/Chinese will appear garbled; accented Latin may show boxes.'
        : ' — using Latin font; non-Latin characters will not render.') +
      ` Font dir: ${resolveFontsDirectory() ?? 'NOT FOUND'}`
  );
}

/**
 * Register Unicode fonts and return a font set guaranteed to exist on the doc.
 */
export function registerPdfFonts(
  doc: PDFKit.PDFDocument,
  locale?: string | null
): PdfFontSet {
  ensurePdfKitBuiltinFonts();
  const availability = registerFontsForLocale(doc, locale);
  const loc = normalizePdfLocale(locale);

  if (loc === 'ar') {
    if (availability.arabic) {
      return {
        regular: FONT_NAMES.arabicRegular,
        bold: FONT_NAMES.arabicBold,
        rtl: true,
      };
    }
    warnFontFallback(loc, 'NotoSansArabic', !availability.latin);
    if (availability.latin) return latinFontSet(true);
    return helveticaFallback(true);
  }

  if (loc === 'cn' || loc === 'zh') {
    if (availability.chinese) {
      return {
        regular: FONT_NAMES.chineseRegular,
        bold: FONT_NAMES.chineseBold,
        rtl: false,
      };
    }
    warnFontFallback(loc, 'NotoSansSC', !availability.latin);
    if (availability.latin) return latinFontSet(false);
    return helveticaFallback(false);
  }

  if (availability.latin) return latinFontSet(false);
  if (loc !== 'en') warnFontFallback(loc, 'NotoSans', true);
  return helveticaFallback(false);
}

export function setPdfFont(
  doc: PDFKit.PDFDocument,
  fonts: PdfFontSet,
  bold = false
): void {
  doc.font(bold ? fonts.bold : fonts.regular);
}

export function pdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  fonts: PdfFontSet,
  locale?: string | null,
  options?: PDFKit.Mixins.TextOptions & { bold?: boolean }
): void {
  setPdfFont(doc, fonts, options?.bold);
  const shaped = preparePdfText(text, locale);
  const opts = { ...options };
  delete (opts as { bold?: boolean }).bold;
  if (fonts.rtl) {
    opts.align = opts.align || 'right';
  }
  doc.text(shaped, x, y, opts);
}
