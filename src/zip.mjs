// Small uncompressed ZIP writer: PNGs are already compressed.
const table = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function makeZip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const filename = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, filename, data); central.push(entry, filename);
    offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
