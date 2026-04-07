// ==========================================
//  DATABASE.JS - Manajemen data JSON
// ==========================================

const fs = require("fs");
const path = require("path");

const DB_DIR = path.join(__dirname, "database");
const ORDERS_FILE = path.join(DB_DIR, "orders.json");
const STATES_FILE = path.join(DB_DIR, "user_states.json");

// Pastikan folder database ada
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ==================== ORDERS ====================
function loadOrders() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]");
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function createOrder(orderData) {
  const orders = loadOrders();
  const newOrder = {
    id: Date.now().toString(),
    ...orderData,
    status: "pending", // pending, paid, expired, failed
    createdAt: new Date().toISOString(),
  };
  orders.push(newOrder);
  saveOrders(orders);
  return newOrder;
}

function updateOrder(orderId, updates) {
  const orders = loadOrders();
  const index = orders.findIndex((o) => o.id === orderId);
  if (index !== -1) {
    orders[index] = { ...orders[index], ...updates };
    saveOrders(orders);
    return orders[index];
  }
  return null;
}

function getOrder(orderId) {
  const orders = loadOrders();
  return orders.find((o) => o.id === orderId);
}

// ==================== USER STATES ====================
function loadUserStates() {
  if (!fs.existsSync(STATES_FILE)) {
    fs.writeFileSync(STATES_FILE, "{}");
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(STATES_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveUserStates(states) {
  fs.writeFileSync(STATES_FILE, JSON.stringify(states, null, 2));
}

function getUserState(userId) {
  const states = loadUserStates();
  return states[userId] || null;
}

function setUserState(userId, state) {
  const states = loadUserStates();
  states[userId] = state;
  saveUserStates(states);
}

function clearUserState(userId) {
  const states = loadUserStates();
  delete states[userId];
  saveUserStates(states);
}

module.exports = {
  loadOrders,
  saveOrders,
  createOrder,
  updateOrder,
  getOrder,
  getUserState,
  setUserState,
  clearUserState,
};
