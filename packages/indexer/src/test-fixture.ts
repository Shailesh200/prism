import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Build a disposable M-005 workspace under the OS temp dir. */
export async function createM005Fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prism-m005-"));

  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "nested"), { recursive: true });
  await mkdir(join(root, "build"), { recursive: true });
  await mkdir(join(root, "node_modules/pkg"), { recursive: true });

  await writeFile(
    join(root, "package.json"),
    '{\n  "name": "m005-basic",\n  "private": true\n}\n',
  );
  await writeFile(join(root, ".gitignore"), "secret.txt\nbuild/\n");
  await writeFile(join(root, ".prismignore"), "*.tmp\n");
  await writeFile(join(root, "src/a.ts"), "export const a = 1;\n");
  await writeFile(join(root, "src/b.ts"), "export const b = 2;\n");
  await writeFile(
    join(root, "src/bigish.txt"),
    "this file is used with a tiny maxFileBytes threshold\n",
  );
  await writeFile(join(root, "secret.txt"), "TOP SECRET\n");
  await writeFile(join(root, "build/out.js"), "should be ignored\n");
  await writeFile(join(root, "nested/x.tmp"), "tmp data\n");
  await writeFile(join(root, "nested/keep.md"), "keep me\n");
  await writeFile(join(root, "node_modules/pkg/index.js"), "from dep\n");
  await writeFile(join(root, "blob.dat"), Buffer.from("hel\0lo"));

  return root;
}
