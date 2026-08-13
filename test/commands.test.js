import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

test("all slash commands load with unique valid schemas", async () => {
  const files = (await readdir(new URL("../commands/", import.meta.url)))
    .filter((file) => file.endsWith(".js"));
  const names = new Set();

  for (const file of files) {
    const command = await import(new URL(`../commands/${file}`, import.meta.url));
    assert.ok(command.data, `${file} must export data`);
    assert.equal(typeof command.execute, "function", `${file} must export execute`);
    const schema = command.data.toJSON();
    assert.ok(!names.has(schema.name), `duplicate command: ${schema.name}`);
    names.add(schema.name);
  }

  assert.equal(names.size, files.length);
});
