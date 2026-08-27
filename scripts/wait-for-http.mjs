const urls = process.argv.slice(2);
if (!urls.length) {
  throw new Error("请至少提供一个等待地址");
}

const timeoutMs = 60_000;
const deadline = Date.now() + timeoutMs;
const pending = new Set(urls);

while (pending.size && Date.now() < deadline) {
  await Promise.all(
    [...pending].map(async (url) => {
      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(2_000),
        });
        if (response.ok) pending.delete(url);
      } catch {
        // The service is still starting.
      }
    }),
  );
  if (pending.size) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

if (pending.size) {
  throw new Error(
    `服务未在 ${timeoutMs / 1_000} 秒内就绪：${[...pending].join(", ")}`,
  );
}

process.stdout.write(`服务已就绪：${urls.join(", ")}\n`);
