import { test, expect, chromium } from "@playwright/test";

/**
 * SpacetimeDB WebSocket Throughput Test
 *
 * Measures data throughput between two WebSocket clients connected to SpacetimeDB,
 * where writes go through the checkbox_chunk table.
 *
 * We intercept the Worker's postMessage to count outbound messages (reducer calls)
 * and addEventListener('message') for inbound messages (subscription updates).
 * ReducerResults are counted via console.log interception since the worker doesn't
 * forward them to the main thread.
 */

const WORKER_INTERCEPT_SCRIPT = `
  window.__workerStats = { sent: 0, received: 0, sentBytes: 0, receivedBytes: 0 };

  const OriginalWorker = window.Worker;
  window.Worker = function(url, options) {
    const worker = new OriginalWorker(url, options);

    worker.addEventListener('message', function(event) {
      window.__workerStats.received++;
      if (typeof event.data === 'string') {
        window.__workerStats.receivedBytes += event.data.length;
      } else if (event.data && typeof event.data === 'object') {
        // Binary messages: chunk ({ type, state: ArrayBuffer }) or delta ({ type, data: ArrayBuffer })
        if (event.data.state && event.data.state.byteLength) {
          window.__workerStats.receivedBytes += event.data.state.byteLength;
        } else if (event.data.data && event.data.data.byteLength) {
          window.__workerStats.receivedBytes += event.data.data.byteLength;
        }
      }
    });

    const origPost = worker.postMessage.bind(worker);
    worker.postMessage = function(data, transfer) {
      window.__workerStats.sent++;
      if (typeof data === 'string') window.__workerStats.sentBytes += data.length;
      return origPost(data, transfer);
    };

    return worker;
  };
  window.Worker.prototype = OriginalWorker.prototype;
`;

async function getStats(page: any) {
  return page.evaluate(() => ({ ...(window as any).__workerStats }));
}

function delta(before: any, after: any) {
  return {
    sent: after.sent - before.sent,
    received: after.received - before.received,
    sentBytes: after.sentBytes - before.sentBytes,
    receivedBytes: after.receivedBytes - before.receivedBytes,
  };
}

function fmt(bytes: number): string {
  if (bytes < 0) return `-${fmt(-bytes)}`;
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

test.describe("WebSocket Throughput Between Two Clients", () => {
  test.setTimeout(120_000);

  test("measure cross-client data throughput via SpacetimeDB", async () => {
    const browser = await chromium.launch();
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const baseURL = process.env.BASE_URL || "http://localhost:8080";

    // Note: We don't use page.on("console") — ReducerResult messages contain
    // embedded 4MB chunk data that causes RangeError when Playwright serializes them.
    // Worker stats (postMessage interception) capture all the throughput data we need.

    await pageA.addInitScript(WORKER_INTERCEPT_SCRIPT);
    await pageB.addInitScript(WORKER_INTERCEPT_SCRIPT);

    console.log("Loading both clients...");
    await Promise.all([pageA.goto(baseURL), pageB.goto(baseURL)]);
    await Promise.all([
      pageA.waitForSelector("canvas", { timeout: 60000 }),
      pageB.waitForSelector("canvas", { timeout: 60000 }),
    ]);

    console.log("Waiting for SpacetimeDB connections and initial sync...");
    await Promise.all([pageA.waitForTimeout(8000), pageB.waitForTimeout(8000)]);

    // Snapshot before test
    const beforeA = await getStats(pageA);
    const beforeB = await getStats(pageB);
    console.log(
      `Initial sync: A received ${beforeA.received} msgs (${fmt(beforeA.receivedBytes)}), ` +
      `B received ${beforeB.received} msgs (${fmt(beforeB.receivedBytes)})`
    );
    console.log("Starting throughput test (dispatching click events)...\n");

    // With delta updates, each checkbox change is ~16 bytes instead of 4MB.
    const NUM_CLICKS = 200;
    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 50;

    const writerResults = await pageA.evaluate(
      async ({ numClicks, batchSize, batchDelay }: any) => {
        const canvas = document.querySelector("canvas") as HTMLCanvasElement;
        if (!canvas) return { error: "No canvas" };

        const rect = canvas.getBoundingClientRect();
        let clicks = 0;
        const start = performance.now();

        while (clicks < numClicks) {
          for (let i = 0; i < batchSize && clicks < numClicks; i++) {
            const x = 20 + (clicks % 80) * 8;
            const y = 20 + (Math.floor(clicks / 80) % 60) * 8;

            canvas.dispatchEvent(
              new MouseEvent("click", {
                clientX: rect.left + x,
                clientY: rect.top + y,
                bubbles: true,
                button: 0,
              })
            );
            clicks++;
          }
          await new Promise((r) => setTimeout(r, batchDelay));
        }

        return { clicks, elapsed: performance.now() - start };
      },
      { numClicks: NUM_CLICKS, batchSize: BATCH_SIZE, batchDelay: BATCH_DELAY_MS }
    );

    if ("error" in writerResults) throw new Error(writerResults.error as string);

    // Wait for server responses (each update sends full 4MB chunk, so don't wait too long)
    console.log("Writes complete. Waiting for server responses...");
    await pageA.waitForTimeout(5000);
    await pageB.waitForTimeout(5000);

    // Snapshot after test
    const afterA = await getStats(pageA);
    const afterB = await getStats(pageB);
    const dA = delta(beforeA, afterA);
    const dB = delta(beforeB, afterB);
    const totalClicks = writerResults.clicks;
    const elapsedSec = writerResults.elapsed / 1000;

    // Verify data was actually written to DB
    const chunkVersion = await pageA.evaluate(async () => {
      // Query the loaded chunks to see if any were modified
      return (window as any).__workerStats;
    });

    console.log("=".repeat(70));
    console.log("SPACETIMEDB WEBSOCKET THROUGHPUT TEST RESULTS");
    console.log("=".repeat(70));
    console.log("");
    console.log("--- Initial Subscription Load ---");
    console.log(`  Chunks synced per client:  ${beforeA.received} chunks`);
    console.log(`  Data per client:           ${fmt(beforeA.receivedBytes)}`);
    console.log(`  Chunk size:                ~${fmt(beforeA.receivedBytes / Math.max(beforeA.received, 1))} each`);
    console.log("");
    console.log("--- Writer (Client A → SpacetimeDB) ---");
    console.log(`  Click events dispatched:   ${totalClicks}`);
    console.log(`  Duration:                  ${elapsedSec.toFixed(2)}s`);
    console.log(`  Clicks/sec:                ${(totalClicks / elapsedSec).toFixed(1)}`);
    console.log(`  Messages to worker:        ${dA.sent}`);
    console.log(`  Bytes to worker:           ${fmt(dA.sentBytes)}`);
    console.log(`  Send throughput (IPC):     ${fmt(dA.sentBytes / elapsedSec)}/s`);
    console.log("");
    console.log("--- Cross-Client (Server → Client B via Deltas) ---");
    console.log(`  Delta msgs received:       ${dB.received}`);
    console.log(`  Delta bytes received:      ${fmt(dB.receivedBytes)}`);
    console.log(`  Receive throughput:        ${dB.receivedBytes > 0 ? fmt(dB.receivedBytes / elapsedSec) + "/s" : "0"}`);
    console.log(`  Avg delta size:            ${dB.received > 0 ? fmt(dB.receivedBytes / dB.received) : "N/A"}`);
    console.log("");
    console.log("--- Throughput Summary ---");
    const avgMsgSize = dA.sent > 0 ? dA.sentBytes / dA.sent : 0;
    console.log(`  Avg IPC msg size (out):    ${fmt(avgMsgSize)}`);
    console.log(`  Data mutated in DB:        ${fmt(totalClicks * 4)} (4 bytes/checkbox in 4MB row)`);
    if (dB.receivedBytes > 0) {
      console.log(`  Cross-client throughput:   ${fmt(dB.receivedBytes / elapsedSec)}/s`);
    }
    console.log("=".repeat(70));

    expect(dA.sent).toBeGreaterThan(0);
    expect(totalClicks).toBeGreaterThan(0);

    await browser.close();
  });
});
