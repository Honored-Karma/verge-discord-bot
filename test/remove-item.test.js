import assert from "node:assert/strict";
import test from "node:test";
import { data } from "../commands/remove-item.js";

test("remove-item command has valid slash command schema and options", () => {
  const json = data.toJSON();
  assert.equal(json.name, "remove-item");
  assert.ok(json.description.startsWith("[АДМИН]"));

  const options = json.options || [];
  const userOption = options.find((o) => o.name === "user");
  assert.ok(userOption, "should have user option");
  assert.equal(userOption.required, true);

  const itemOption = options.find((o) => o.name === "item");
  assert.ok(itemOption, "should have item option");
  assert.equal(itemOption.required, true);
  assert.equal(itemOption.autocomplete, true);

  const quantityOption = options.find((o) => o.name === "quantity");
  assert.ok(quantityOption, "should have quantity option");
  assert.equal(quantityOption.required, false);
  assert.equal(quantityOption.min_value, 1);

  const allOption = options.find((o) => o.name === "all");
  assert.ok(allOption, "should have all option");
  assert.equal(allOption.required, false);

  const slotOption = options.find((o) => o.name === "slot");
  assert.ok(slotOption, "should have slot option");
  assert.equal(slotOption.required, false);
  assert.equal(slotOption.choices?.length, 3);

  const reasonOption = options.find((o) => o.name === "reason");
  assert.ok(reasonOption, "should have reason option");
  assert.equal(reasonOption.required, false);
});
