import { parentPort, workerData } from 'node:worker_threads';
import { randomInt } from 'node:crypto';
import { DiceRoll, NumberGenerator } from '@dice-roller/rpg-dice-roller';

try {
  NumberGenerator.generator.engine = { next: () => randomInt(0x100000000) | 0 };
  const roll = new DiceRoll(workerData);
  if (!Number.isFinite(roll.total)) throw new Error('Non-finite roll');
  const output = roll.output;
  if (output.length > 12000) throw new Error('Roll too large');
  parentPort.postMessage({ output });
} catch {
  parentPort.postMessage({ error: true });
}
