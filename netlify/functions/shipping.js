'use strict';

const {
  HttpError,
  calculateShipping,
  getProducts,
  getShippingAddress,
  jsonResponse,
  parseBody,
  parseItems
} = require('../lib/commerce');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Metode tidak diizinkan.' });
  }

  try {
    const body = parseBody(event);
    const items = parseItems(body.items);
    const address = getShippingAddress(body);
    const products = await getProducts(items);
    const weightGrams = products.reduce(
      (total, product) => total + product.weightGrams * product.quantity,
      0
    );

    if (!Number.isSafeInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000) {
      throw new HttpError(400, 'Total berat pesanan tidak valid atau melebihi batas.');
    }

    const options = await calculateShipping(address, weightGrams);
    return jsonResponse(200, { success: true, weight_grams: weightGrams, options });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    if (!(error instanceof HttpError)) {
      console.error('[shipping] Unexpected error:', error);
    }
    return jsonResponse(statusCode, {
      success: false,
      error: error instanceof HttpError ? error.message : 'Terjadi kesalahan server.'
    });
  }
};