'use strict';

const { randomUUID } = require('node:crypto');
const {
  MAX_AMOUNT_IDR,
  HttpError,
  astraAction,
  calculateShipping,
  getProducts,
  getShippingAddress,
  jsonResponse,
  parseBody,
  parseItems
} = require('../lib/commerce');

function validateCustomer(value) {
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const email = typeof value?.email === 'string' ? value.email.trim() : '';
  const phone = typeof value?.phone === 'string' ? value.phone.trim() : '';

  if (!name || name.length > 100
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || !/^[+\d][\d\s()+.-]{7,24}$/.test(phone)) {
    throw new HttpError(400, 'Data nama, email, atau nomor telepon tidak valid.');
  }
  return { first_name: name, email, phone };
}

function getSelectedShipping(value, options) {
  const courierCode = String(value?.courier_code ?? '').trim().toLowerCase();
  const service = String(value?.service ?? '').trim();
  if (!courierCode || !service || service.length > 80) {
    throw new HttpError(400, 'Pilih kurir dan layanan ongkir yang valid.');
  }

  const quote = options.find((option) =>
    option.courier_code === courierCode
    && option.service.toLowerCase() === service.toLowerCase()
  );
  if (!quote) {
    throw new HttpError(400, 'Pilihan ongkir sudah tidak tersedia. Hitung ulang ongkir.');
  }
  return quote;
}

async function createSnapTransaction(orderId, grossAmount, itemDetails, customer) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  if (!serverKey || !serverKey.trim() || !clientKey || !clientKey.trim()) {
    throw new HttpError(500, 'Konfigurasi Midtrans Sandbox belum tersedia.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://app.sandbox.midtrans.com/snap/v1/transactions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey.trim()}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        item_details: itemDetails,
        customer_details: customer
      }),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new HttpError(502, 'Midtrans mengembalikan respons yang tidak valid.');
    }
    if (!response.ok || typeof data.token !== 'string' || !data.token) {
      console.error('[checkout] Midtrans request failed', {
        status: response.status,
        error_messages: data?.error_messages
      });
      throw new HttpError(502, 'Midtrans gagal membuat token pembayaran.');
    }
    return data.token;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('[checkout] Midtrans request error:', error);
    throw new HttpError(502, 'Midtrans tidak dapat dijangkau. Silakan coba lagi.');
  } finally {
    clearTimeout(timeout);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Metode tidak diizinkan.' });
  }

  try {
    const body = parseBody(event);
    const items = parseItems(body.items);
    const customer = validateCustomer(body.customer);
    const address = getShippingAddress(body.shipping);
    const products = await getProducts(items);
    const weightGrams = products.reduce(
      (total, product) => total + product.weightGrams * product.quantity,
      0
    );
    if (!Number.isSafeInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000) {
      throw new HttpError(400, 'Total berat pesanan tidak valid atau melebihi batas.');
    }

    const quotes = await calculateShipping(address, weightGrams);
    const shipping = getSelectedShipping(body.shipping, quotes);
    const subtotal = products.reduce(
      (total, product) => total + product.unitPrice * product.quantity,
      0
    );
    const grossAmount = subtotal + shipping.cost;
    if (!Number.isSafeInteger(subtotal) || subtotal < 1
      || !Number.isSafeInteger(grossAmount) || grossAmount > MAX_AMOUNT_IDR) {
      throw new HttpError(400, 'Total transaksi di luar batas yang diizinkan.');
    }

    const orderId = `BOB-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const itemDetails = products.map((product) => ({
      id: product.id.slice(0, 50),
      name: product.name.slice(0, 50),
      price: product.unitPrice,
      quantity: product.quantity
    }));
    itemDetails.push({
      id: 'shipping',
      name: `Ongkir ${shipping.courier_name} ${shipping.service}`.slice(0, 50),
      price: shipping.cost,
      quantity: 1
    });

    const token = await createSnapTransaction(orderId, grossAmount, itemDetails, customer);

    await astraAction('audit_logs', 'insertOne', {
      document: {
        _id: orderId,
        user_id: null,
        buyer_name: customer.first_name,
        activity: 'midtrans_transaction_created',
        order_id: orderId,
        amount_idr: grossAmount,
        currency: 'IDR',
        product_count: products.reduce((total, product) => total + product.quantity, 0),
        shipping_courier: shipping.courier_code,
        shipping_service: shipping.service,
        created_at: new Date().toISOString()
      }
    });

    return jsonResponse(200, {
      success: true,
      token,
      order_id: orderId,
      amount: grossAmount,
      client_key: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY.trim()
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    if (!(error instanceof HttpError)) {
      console.error('[checkout] Unexpected error:', error);
    }
    return jsonResponse(statusCode, {
      success: false,
      error: error instanceof HttpError ? error.message : 'Terjadi kesalahan server.'
    });
  }
};