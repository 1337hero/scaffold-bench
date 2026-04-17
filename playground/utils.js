function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function throttle(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  const clone = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    clone[key] = deepClone(obj[key]);
  }
  return clone;
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function retry(fn, attempts = 3) {
  return async function (...args) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn.apply(this, args);
      } catch (e) {
        if (i === attempts - 1) throw e;
      }
    }
  };
}

function parseQueryString(url) {
  const params = {};
  const query = url.split("?")[1];
  if (!query) return params;
  query.split("&").forEach((pair) => {
    const [key, val] = pair.split("=");
    params[key] = val;
  });
  return params;
}

module.exports = { debounce, throttle, deepClone, formatDate, retry, parseQueryString };
