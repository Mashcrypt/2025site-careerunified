import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sources = [
  { size: 16, file: "favicon-16x16.png" },
  { size: 32, file: "favicon-32x32.png" },
  { size: 48, file: "favicon-48x48.png" },
];

const images = await Promise.all(
  sources.map(async source => {
    const buffer = await readFile(path.join(rootDir, source.file));
    const signature = buffer.subarray(0, 8).toString("hex");
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    if (signature !== "89504e470d0a1a0a" || width !== source.size || height !== source.size) {
      throw new Error(`${source.file} must be a ${source.size}x${source.size} PNG.`);
    }

    return {...source, buffer};
  }),
);

const directorySize = 6 + images.length * 16;
const directory = Buffer.alloc(directorySize);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);

let imageOffset = directorySize;
images.forEach((image, index) => {
  const entryOffset = 6 + index * 16;
  directory.writeUInt8(image.size, entryOffset);
  directory.writeUInt8(image.size, entryOffset + 1);
  directory.writeUInt8(0, entryOffset + 2);
  directory.writeUInt8(0, entryOffset + 3);
  directory.writeUInt16LE(1, entryOffset + 4);
  directory.writeUInt16LE(32, entryOffset + 6);
  directory.writeUInt32LE(image.buffer.length, entryOffset + 8);
  directory.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += image.buffer.length;
});

await writeFile(
  path.join(rootDir, "favicon.ico"),
  Buffer.concat([directory, ...images.map(image => image.buffer)]),
);

console.log("Built favicon.ico with 16x16, 32x32, and 48x48 images.");
