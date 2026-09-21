import { packageManifest, teamsCsv, transferPackagePath } from './gradeTransferModel.js';

const encoder = new TextEncoder();
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
};
const u16 = (value) => [value & 255, (value >>> 8) & 255];
const u32 = (value) => [...u16(value), ...u16(value >>> 16)];

// A standards-compliant, store-only ZIP. CSVs are tiny and avoiding a new ZIP
// dependency keeps the production transfer path deterministic and auditable.
// A slash in a ZIP entry name is the folder boundary, so each lesson assignment
// extracts as one folder containing its section-grade CSVs.
export const buildGradebookZip = (units) => {
  const files = [
    { name: 'MANIFEST.txt', body: packageManifest(units) },
    ...units.map((unit) => ({ name: transferPackagePath(unit), body: teamsCsv(unit.rows) })),
  ].map((file) => ({ name: encoder.encode(file.name), data: encoder.encode(file.body) }));
  const local = []; const central = []; let offset = 0;
  files.forEach((file) => {
    const crc = crc32(file.data); const size = file.data.length;
    const header = [0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(size),...u32(size),...u16(file.name.length),0,0];
    local.push(...header, ...file.name, ...file.data);
    central.push(0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(size),...u32(size),...u16(file.name.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset),...file.name);
    offset += header.length + file.name.length + size;
  });
  const end = [0x50,0x4b,0x05,0x06,0,0,0,0,...u16(files.length),...u16(files.length),...u32(central.length),...u32(local.length),0,0];
  return new Uint8Array([...local, ...central, ...end]);
};
