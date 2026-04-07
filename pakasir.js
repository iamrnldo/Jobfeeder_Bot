// ==========================================
//  PAKASIR.JS - API Integration
//  Tidak menggunakan webhook secret
// ==========================================

const axios = require("axios");
const config = require("./config");

const pakasir = {
  /**
   * Membuat invoice/order di PAKASIR
   * @param {Object} data - { amount, customer_name, customer_email, customer_phone, description }
   * @returns {Promise<Object>} - { id, qr_code_url, checkout_url, status }
   */
  createOrder: async (data) => {
    try {
      const response = await axios.post(
        `${config.pakasir.baseUrl}/transactioncreate`,
        {
          amount: data.amount,
          customer_name: data.customer_name,
          customer_email: data.customer_email || "",
          customer_phone: data.customer_phone,
          description: data.description,
          redirect_url: "", // opsional, bisa diisi jika ingin redirect
        },
        {
          headers: {
            Authorization: `Bearer ${config.pakasir.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        "PAKASIR createOrder error:",
        error.response?.data || error.message,
      );
      throw new Error("Gagal membuat invoice pembayaran");
    }
  },

  /**
   * Mendapatkan detail order dari PAKASIR
   * @param {string} orderId - ID order dari PAKASIR
   * @returns {Promise<Object>} - Detail order
   */
  getOrder: async (orderId) => {
    try {
      const response = await axios.get(
        `${config.pakasir.baseUrl}/transaction/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${config.pakasir.apiKey}`,
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        "PAKASIR getOrder error:",
        error.response?.data || error.message,
      );
      throw new Error("Gagal mengambil detail order");
    }
  },
};

module.exports = pakasir;
