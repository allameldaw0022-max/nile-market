/**
 * قارئ xlsx بالحد الأدنى — بلا اعتماديات.
 *
 * ملف xlsx أرشيف ZIP يحوي XML. فكّ الضغط يستخدم
 * `DecompressionStream('deflate-raw')` المتوفّرة في المتصفحات الحديثة،
 * فلا حاجة لمكتبة خارجية لقراءة ملف يرفعه المستخدم.
 *
 * المدعوم: أول ورقة، النصوص المشتركة، الأرقام، والتواريخ كنص خام.
 * غير المدعوم: الصيغ المحسوبة (تُقرأ قيمتها المخزَّنة) والملفات
 * المشفَّرة. عند أي عجز نطلب من المستخدم CSV بدل أن نخمّن.
 */

export class XlsxUnsupported extends Error {}

type ZipEntry = { name: string; bytes: Uint8Array };

const td = new TextDecoder('utf-8');

function u16(b: Uint8Array, i: number) { return b[i] | (b[i + 1] << 8); }
function u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new XlsxUnsupported('المتصفح لا يدعم فكّ ضغط ملفات Excel');
  }
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** يقرأ مدخلات ZIP من الفهرس المركزي (أدقّ من المسح التتابعي). */
async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buffer);

  // End of Central Directory: نبحث عنه من آخر الملف
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i -= 1) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxUnsupported('ملف Excel غير صالح');

  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map<string, Uint8Array>();

  for (let n = 0; n < count; n += 1) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const compSize = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const localOffset = u32(b, p + 42);
    const name = td.decode(b.subarray(p + 46, p + 46 + nameLen));

    // الترويسة المحلية: الحجمان قد يكونان صفرًا هنا، فنستعمل الفهرس
    const lNameLen = u16(b, localOffset + 26);
    const lExtraLen = u16(b, localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(dataStart, dataStart + compSize);

    const entry: ZipEntry = {
      name,
      bytes: method === 0 ? raw : await inflateRaw(raw),
    };
    out.set(entry.name, entry.bytes);
    p += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
   .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
   .replace(/&amp;/g, '&');

/** النصوص المشتركة: كل <si> قد يتكوّن من عدة <t> (نص منسَّق). */
function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    const parts = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    out.push(parts
      .map((t) => unescapeXml(t.replace(/<t\b[^>]*>/, '').replace(/<\/t>/, '')))
      .join(''));
  }
  return out;
}

/** "BC12" ⇒ 54 (فهرس العمود من الصفر) */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

export async function parseXlsx(file: Blob): Promise<string[][]> {
  const zip = await readZip(await file.arrayBuffer());

  const sharedRaw = zip.get('xl/sharedStrings.xml');
  const shared = sharedRaw ? readSharedStrings(td.decode(sharedRaw)) : [];

  // أول ورقة بالترتيب الذي تعلنه workbook.xml، وإلا sheet1.xml
  const sheetName = Array.from(zip.keys())
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort()[0];
  if (!sheetName) throw new XlsxUnsupported('لم نجد أي ورقة في الملف');

  const xml = td.decode(zip.get(sheetName)!);
  const rows: string[][] = [];

  for (const rowXml of xml.match(/<row\b[\s\S]*?(?:\/>|<\/row>)/g) ?? []) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = /\sr="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const type = /\st="(\w+)"/.exec(cellXml)?.[1];
      const idx = ref ? columnIndex(ref) : cells.length;

      let value = '';
      if (type === 'inlineStr') {
        value = (cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [])
          .map((t) => unescapeXml(t.replace(/<t\b[^>]*>/, '').replace(/<\/t>/, '')))
          .join('');
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? '';
        value = type === 's' ? (shared[Number(raw)] ?? '') : unescapeXml(raw);
      }

      while (cells.length < idx) cells.push('');
      cells[idx] = value;
    }
    rows.push(cells);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
