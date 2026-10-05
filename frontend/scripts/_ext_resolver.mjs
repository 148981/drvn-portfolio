// 附檔名補全 resolver：讓 node 直接跑使用 Vite 式(extensionless)匯入的 src 模組
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
      try { return await nextResolve(specifier + '.js', context); } catch (_) {}
      try { return await nextResolve(specifier + '/index.js', context); } catch (_) {}
    }
    throw e;
  }
}
