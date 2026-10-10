'use strict';

const ALLOWED_COURIERS = ['jne', 'jnt', 'sicepat'];
const MAX_ITEMS = 50;
const MAX_QUANTITY = 1000;
const MAX_WEIGHT_GRAMS = 100000;
const MAX_AMOUNT_IDR = 5000000000;
const REQUEST_TIMEOUT_MS = 10000;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new HttpError(500, `Konfigurasi server ${name} belum tersedia.`);
  }
  return value.trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event.body || event.body.length > 65536) {
    throw new HttpError(400, 'Body request kosong atau terlalu besar.');
  }

  let body;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    body = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'Body request harus berupa JSON yang valid.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Format body request tidak valid.');
  }
  return body;
}

function parseItems(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) {
    throw new HttpError(400, `items harus berisi 1 sampai ${MAX_ITEMS} produk.`);
  }

  const quantities = new Map();
  for (const item of value) {
    const productId = typeof item?.productId === 'string'
      ? item.productId.trim()
      : '';
    const quantity = item?.quantity;

    if (!productId || productId.length > 128) {
      throw new HttpError(400, 'Setiap item harus memiliki productId yang valid.');
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new HttpError(400, 'Jumlah produk harus bilangan bulat yang valid.');
    }

    const combined = (quantities.get(productId) || 0) + quantity;
    if (combined > MAX_QUANTITY) {
      throw new HttpError(400, 'Jumlah produk melebihi batas yang diizinkan.');
    }
    quantities.set(productId, combined);
  }

  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
}

function collectionUrl(collection) {
  const endpoint = requiredEnv('ASTRA_DB_ENDPOINT').replace(/\/+$/, '');
  const suffix = '/api/json/v1/default_keyspace/';

  if (endpoint.endsWith('/api/json/v1/default_keyspace')) {
    return `${endpoint}/${collection}`;
  }
  if (endpoint.endsWith('/api/json/v1')) {
    return `${endpoint}/default_keyspace/${collection}`;
  }
  return `${endpoint}${suffix}${collection}`;
}

async function fetchJson(url, options, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new HttpError(502, `${label} mengembalikan respons yang tidak valid.`);
    }

    if (!response.ok || data?.errors?.length) {
      console.error(`[commerce] ${label} request failed`, {
        status: response.status,
        errors: data?.errors
      });
      throw new HttpError(502, `${label} sedang tidak dapat memproses permintaan.`);
    }
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(`[commerce] ${label} request error`, error);
    throw new HttpError(502, `${label} tidak dapat dijangkau. Silakan coba lagi.`);
  } finally {
    clearTimeout(timeout);
  }
}

async function astraAction(collection, action, value) {
  const token = requiredEnv('ASTRA_DB_APPLICATION_TOKEN');
  return fetchJson(collectionUrl(collection), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Token: token
    },
    body: JSON.stringify({ [action]: value })
  }, 'Astra DB');
}

async function getProducts(items) {
  const ids = items.map((item) => item.productId);
  const result = await astraAction('products_collection', 'find', {
    filter: { $or: [{ _id: { $in: ids } }, { id: { $in: ids } }] },
    options: { limit: ids.length }
  });
  const documents = result?.data?.documents;
  if (!Array.isArray(documents)) {
    throw new HttpError(502, 'Astra DB memberikan data katalog dengan format tidak valid.');
  }

  const productsById = new Map();
  for (const product of documents) {
    const databaseId = typeof product?._id === 'string' ? product._id : '';
    const catalogId = typeof product?.id === 'string' ? product.id : '';
    if (!databaseId && !catalogId) continue;
    const price = product.price;
    const weightGrams = product.weight_grams;
    if (!Number.isSafeInteger(price) || price < 0
      || !Number.isSafeInteger(weightGrams) || weightGrams < 1) {
      throw new HttpError(502, 'Data harga atau berat produk di katalog tidak valid.');
    }
    if (databaseId) productsById.set(databaseId, product);
    if (catalogId) productsById.set(catalogId, product);
  }

  return items.map((item) => {
    const product = productsById.get(item.productId);
    if (!product || product.is_active === false) {
      throw new HttpError(400, `Produk ${item.productId} tidak ditemukan atau tidak aktif.`);
    }
    return {
      id: item.productId,
      name: typeof product.name === 'string' ? product.name.slice(0, 200) : item.productId,
      quantity: item.quantity,
      unitPrice: product.price,
      weightGrams: product.weight_grams
    };
  });
}

function getShippingAddress(value) {
  const origin = Number(requiredEnv('KOMERCE_ORIGIN_DISTRICT_ID'));
  const destination = Number(value?.destination);
  if (!Number.isSafeInteger(origin) || origin < 1
    || !Number.isSafeInteger(destination) || destination < 1) {
    throw new HttpError(400, 'KOMERCE_ORIGIN_DISTRICT_ID dan destination harus berupa ID kecamatan yang valid.');
  }
  return { origin, destination };
}

function normalizeQuotes(payload) {
  const data = payload?.data;
  const source = data?.results ?? data?.costs ?? data
    ?? payload?.rajaongkir?.results ?? payload?.results;
  const carriers = Array.isArray(source) ? source : source ? [source] : [];
  const quotes = [];

  for (const carrier of carriers) {
    const code = String(carrier?.code ?? carrier?.courier_code ?? carrier?.courier ?? '')
      .toLowerCase();
    const services = Array.isArray(carrier?.costs) ? carrier.costs : [carrier];

    for (const service of services) {
      const rawCost = service?.cost ?? service?.shipping_cost ?? service?.price;
      const costValue = Array.isArray(rawCost) ? rawCost[0]?.value : rawCost?.value ?? rawCost;
      const amount = Number(costValue);
      const serviceCode = String(
        service?.service ?? service?.service_code ?? service?.service_name ?? ''
      );
      if (!ALLOWED_COURIERS.includes(code) || !serviceCode
        || !Number.isSafeInteger(amount) || amount < 0) continue;

      quotes.push({
        courier_code: code,
        courier_name: String(carrier?.name ?? carrier?.courier_name ?? code).slice(0, 80),
        service: serviceCode.slice(0, 80),
        description: String(service?.description ?? '').slice(0, 200),
        cost: amount,
        etd: String(service?.etd ?? service?.duration ?? '').slice(0, 40)
      });
    }
  }
  return quotes;
}

async function calculateShipping(address, weightGrams) {
  const apiKey = requiredEnv('KOMERCE_SHIPPING_API_KEY');
  const baseUrl = (process.env.KOMERCE_SHIPPING_API_URL
    || 'https://rajaongkir.komerce.id/api/v1/calculate/district/domestic-cost')
    .trim();
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new HttpError(500, 'Konfigurasi URL API Komerce tidak valid.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'rajaongkir.komerce.id') {
    throw new HttpError(500, 'URL API Komerce harus menggunakan host HTTPS resmi.');
  }

  const form = new URLSearchParams({
    origin: String(address.origin),
    destination: String(address.destination),
    weight: String(weightGrams),
    courier: ALLOWED_COURIERS.join(':')
  });
  const response = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      key: apiKey
    },
    body: form.toString()
  }, 'Komerce');

  const options = normalizeQuotes(response);
  if (!options.length) {
    throw new HttpError(502, 'Komerce tidak mengembalikan opsi ongkir yang valid.');
  }
  return options;
}

module.exports = {
  ALLOWED_COURIERS,
  MAX_AMOUNT_IDR,
  HttpError,
  astraAction,
  calculateShipping,
  getProducts,
  getShippingAddress,
  jsonResponse,
  parseBody,
  parseItems
};
