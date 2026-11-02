import { Worker } from 'node:worker_threads';
import { TupperError } from './tupperErrors.js';

let active = 0;
// Advanced notation (explosions, fate, grouped rolls, maths) uses the same open
// source engine referenced by Tupperbox. Keep arbitrary expressions off the
// gateway thread, with bounded memory, runtime and concurrent workers.
export async function rollAdvancedTupperDice(expression) {
  if (expression.length > 250) throw new TupperError('Блок кубиков: используйте до 250 символов.');
  if (active >= 4) throw new TupperError('Сейчас выполняется много бросков. Повторите отправку через несколько секунд.');
  active++;
  let worker;
  try {
    return await new Promise((resolve, reject) => {
      worker = new Worker(new URL('../workers/tupperDice.js', import.meta.url), {
        workerData: expression, resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 2 },
        execArgv: [], env: {},
      });
      const timer = setTimeout(() => reject(new TupperError('Слишком сложный бросок. Сократите выражение.')), 8000);
      const done = callback => value => { clearTimeout(timer); callback(value); };
      worker.once('message', done(result => {
        if (result.error) reject(new TupperError('Не удалось выполнить блок кубиков. Проверьте выражение.'));
        else resolve(result.output);
      }));
      worker.once('error', done(() => reject(new TupperError('Не удалось выполнить блок кубиков. Сократите выражение.'))));
      worker.once('exit', done(() => reject(new TupperError('Вычисление броска прервано. Сократите выражение.'))));
    });
  } finally {
    await worker?.terminate();
    active--;
  }
}
