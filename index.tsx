import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { GoogleGenAI, Type } from "@google/genai";

declare var XLSX: any;

let ai: GoogleGenAI | undefined;
const apiKey = process.env.API_KEY;

// Vite replaces env vars, and if it's not set, it can become the string "undefined"
if (apiKey && apiKey !== 'undefined') {
  ai = new GoogleGenAI({ apiKey });
}


async function translateToTamilTransliteration(text: string): Promise<string> {
    if (!ai) return '';
    if (!text || !text.trim()) {
        return '';
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Transliterate the following English product name into Tamil script. Provide only the Tamil script transliteration, without any explanations or other text. For example, if the input is "Milk", the output should be "மில்க்". Input: "${text}"`,
            config: {
                temperature: 0.1,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error transliterating to Tamil:", error);
        return ''; // Return empty string on error, so UI doesn't break
    }
}

async function translateBatchToTamilTransliteration(texts: string[]): Promise<string[]> {
    if (!ai) return texts.map(() => '');
    if (!texts || texts.length === 0) {
        return [];
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Transliterate the following JSON array of English product names into a JSON array of their Tamil script transliterations. Maintain the exact same order and array length. Provide only the JSON array as your response, without any markdown formatting. For example, if the input is ["Milk", "Sugar"], the output should be ["மில்க்", "ஷுகர்"]. Input: ${JSON.stringify(texts)}`,
            config: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING,
                    },
                },
            }
        });

        let jsonString = response.text.trim();
        if (jsonString.startsWith('```json')) {
            jsonString = jsonString.substring(7, jsonString.length - 3).trim();
        } else if (jsonString.startsWith('```')) {
             jsonString = jsonString.substring(3, jsonString.length - 3).trim();
        }

        const parsedJson = JSON.parse(jsonString);
        let translatedTexts: any[] | undefined;

        if (Array.isArray(parsedJson)) {
            translatedTexts = parsedJson;
        } else if (typeof parsedJson === 'object' && parsedJson !== null) {
            // If the model wraps the array in an object, find the array.
            const arrayProperty = Object.values(parsedJson).find(value => Array.isArray(value));
            if (arrayProperty && Array.isArray(arrayProperty)) {
                translatedTexts = arrayProperty;
            }
        }

        if (Array.isArray(translatedTexts) && translatedTexts.length === texts.length) {
            return translatedTexts.map(t => String(t));
        } else {
            console.error("Batch translation response mismatch:", { expected: texts.length, received: translatedTexts?.length, response: parsedJson });
            return texts.map(() => ''); // Fallback
        }
    } catch (error) {
        console.error("Error in batch transliterating to Tamil:", error);
        return texts.map(() => ''); // Fallback on error
    }
}


// --- TYPES ---
interface Product {
  id: number;
  shopId: number;
  name: string;
  nameTamil: string;
  b2bPrice: number;
  b2cPrice: number;
  stock: number;
  barcode?: string;
  category?: string;
  subcategory?: string;
}

interface Customer {
    mobile: string;
    name: string;
    balance: number;
}

interface SaleItem {
  productId: number;
  name: string;
  nameTamil: string;
  quantity: number;
  price: number;
  isReturn: boolean;
}

interface SaleData {
    id: string;
    shopId: number;
    date: Date;
    customerName: string;
    customerMobile: string;
    saleItems: SaleItem[];
    grossTotal: number;
    returnTotal: number;
    subtotal: number; // Net Total
    discount: number;
    taxAmount: number;
    taxPercent: number;
    grandTotal: number; // Net Total + Tax
    languageMode: 'English' | 'Tamil';
    previousBalance: number;
    amountPaid: number;
    totalBalanceDue: number;
    paymentDetailsEntered?: boolean;
    returnReason?: string;
}

interface Note {
    id: number;
    text: string;
    completed: boolean;
}

interface Expense {
    id: number;
    shopId: number;
    date: Date;
    description: string;
    amount: number;
}

interface User {
    username: string;
    email?: string;
    password?: string;
    role: 'super_admin' | 'admin' | 'cashier';
    shopId?: number;
    resetToken?: string;
    resetTokenExpiry?: number;
}


interface Shop {
    id: number;
    name: string;
}


interface AppSettings {
    invoiceFooter: string;
}

interface SaleSession {
    customerName: string;
    customerMobile: string;

    priceMode: 'B2C' | 'B2B';
    languageMode: 'English' | 'Tamil';
    taxPercent: number;
    discount: number;
    saleItems: SaleItem[];
    amountPaid: string;
    returnReason?: string;
}

interface OrderItem {
  productId: number;
  name: string;
  quantity: number;
  price: number; // Purchase price for PO, sale price for SO
}

type OrderStatus = 'Pending' | 'Fulfilled' | 'Cancelled';

interface PurchaseOrder {
    id: number;
    shopId: number;
    supplierName: string;
    orderDate: Date;
    items: OrderItem[];
    totalAmount: number;
    status: OrderStatus;
}

interface SalesOrder {
    id: number;
    shopId: number;
    customerMobile: string;
    customerName: string;
    orderDate: Date;
    items: OrderItem[];
    totalAmount: number;
    status: OrderStatus;
}


type Theme = 'dark' | 'light' | 'ocean-blue' | 'forest-green' | 'sunset-orange' | 'monokai' | 'nord' | 'professional-light' | 'charcoal' | 'slate';
type InvoiceFontStyle = 'monospace' | 'sans-serif' | 'serif' | 'roboto' | 'merriweather' | 'playfair' | 'inconsolata' | 'times-new-roman' | 'georgia' | 'lato' | 'source-code-pro';
type ViewMode = 'desktop' | 'mobile';
type InvoiceTheme = 'classic' | 'modern' | 'dark' | 'grid-pro' | 'bold-header' | 'letterpress' | 'corporate' | 'playful';

interface InvoiceAppearance {
    fontStyle: InvoiceFontStyle;
    margins: { top: number; right: number; bottom: number; left: number };
    paperSize: '4inch' | 'a4' | 'letter';
    fontSize: 'small' | 'medium' | 'large';
    theme: InvoiceTheme;
}


// --- MOCK DATA FOR LOCAL FEATURES (NOTES) ---
const initialNotes: Note[] = [
    { id: 1, text: 'Order new stock for milk', completed: false },
    { id: 2, text: 'Clean the front display', completed: true },
];

const MOCK_PRODUCTS: Product[] = [
    { id: 1, shopId: 1, name: 'Apple', nameTamil: 'ஆப்பிள்', b2bPrice: 0.40, b2cPrice: 0.50, stock: 100, barcode: '1111', category: 'Fruits' },
    { id: 2, shopId: 1, name: 'Milk', nameTamil: 'மில்க்', b2bPrice: 1.20, b2cPrice: 1.50, stock: 50, barcode: '2222', category: 'Dairy' },
    { id: 3, shopId: 2, name: 'Bread', nameTamil: 'பிரெட்', b2bPrice: 2.00, b2cPrice: 2.50, stock: 30, barcode: '3333', category: 'Bakery' },
    { id: 4, shopId: 2, name: 'Coffee Beans', nameTamil: 'காபி பீன்ஸ்', b2bPrice: 8.00, b2cPrice: 10.00, stock: 8, barcode: '4444', category: 'Beverages' },
    { id: 5, shopId: 1, name: 'Black Fry Pan Plastic Handle', nameTamil: 'பிளாக் ஃப்ரை பேன் பிளாஸ்டிக் ஹேண்டில்', b2bPrice: 150, b2cPrice: 165, stock: 25, barcode: '5555', category: 'Kitchenware' },
    { id: 99, shopId: 1, name: 'Kambi Aduppu 8mm', nameTamil: 'கம்பி அடுப்பு 8mm', b2bPrice: 130.0, b2cPrice: 140.0, stock: 15, barcode: '9999', category: 'Hardware' }
];

const MOCK_CUSTOMERS: Customer[] = [
    { name: 'Abu Bhai', mobile: '9894030029', balance: 0 },
    { name: 'Christy', mobile: '+917601984346', balance: 50.75 },
    { name: 'Sardar Bhai', mobile: '+919043553135', balance: 120.00 },
];

const MOCK_SALES: SaleData[] = [
    {
        id: 'sale-3',
        shopId: 1,
        date: new Date('2025-07-09T12:11:59'),
        customerName: 'Abu Bhai',
        customerMobile: '9894030029',
        saleItems: [
            { productId: 99, name: 'Kambi Aduppu 8mm', nameTamil: 'கம்பி அடுப்பு 8mm', quantity: 8.28, price: 140.0, isReturn: false }
        ],
        grossTotal: 1159.2,
        returnTotal: 0,
        subtotal: 1159.2,
        discount: 0,
        taxAmount: 0,
        taxPercent: 0,
        grandTotal: 1159.2,
        languageMode: 'English',
        previousBalance: 0,
        amountPaid: 1159.2,
        totalBalanceDue: 0
    },
    { id: 'sale-1', shopId: 1, date: new Date(new Date().setDate(new Date().getDate() - 1)), customerName: 'Alice', customerMobile: '111', saleItems: [{ productId: 1, name: 'Apple', nameTamil: 'ஆப்பிள்', quantity: 5, price: 0.5, isReturn: false }], grossTotal: 2.5, returnTotal: 0, subtotal: 2.5, discount: 0, taxAmount: 0, taxPercent: 0, grandTotal: 2.5, languageMode: 'English', previousBalance: 0, amountPaid: 2.5, totalBalanceDue: 0 },
    { id: 'sale-2', shopId: 2, date: new Date(), customerName: 'Bob', customerMobile: '222', saleItems: [{ productId: 3, name: 'Bread', nameTamil: 'பிரெட்', quantity: 2, price: 2.5, isReturn: false }, { productId: 4, name: 'Coffee Beans', nameTamil: 'காபி பீன்ஸ்', quantity: 1, price: 10, isReturn: false }], grossTotal: 15, returnTotal: 0, subtotal: 15, discount: 0, taxAmount: 0.75, taxPercent: 5, grandTotal: 15.75, languageMode: 'English', previousBalance: 10, amountPaid: 25.75, totalBalanceDue: 0 },
];

const MOCK_PURCHASE_ORDERS: PurchaseOrder[] = [
    { id: 1, shopId: 1, supplierName: 'Wholesale Supplies Inc.', orderDate: new Date(new Date().setDate(new Date().getDate() - 5)), items: [{ productId: 5, name: 'Black Fry Pan Plastic Handle', quantity: 20, price: 150 }], totalAmount: 3000, status: 'Fulfilled' },
    { id: 2, shopId: 1, supplierName: 'Kitchen Goods Co.', orderDate: new Date(), items: [{ productId: 99, name: 'Kambi Aduppu 8mm', quantity: 10, price: 130 }], totalAmount: 1300, status: 'Pending' },
];

const MOCK_SALES_ORDERS: SalesOrder[] = [
    { id: 1, shopId: 1, customerMobile: '9894030029', customerName: 'Abu Bhai', orderDate: new Date(new Date().setDate(new Date().getDate() - 2)), items: [{ productId: 1, name: 'Apple', quantity: 10, price: 0.50 }], totalAmount: 5.00, status: 'Pending' },
    { id: 2, shopId: 2, customerMobile: '+917601984346', customerName: 'Christy', orderDate: new Date(new Date().setDate(new Date().getDate() - 10)), items: [{ productId: 3, name: 'Bread', quantity: 5, price: 2.50 }], totalAmount: 12.50, status: 'Fulfilled' },
];

// --- IndexedDB Manager ---
class IndexedDBManager {
    private db: IDBDatabase | null = null;
    private readonly dbName: string;
    private readonly dbVersion: number = 1;

    constructor(dbName: string) {
        this.dbName = dbName;
    }

    public async open(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'mobile' });
                if (!db.objectStoreNames.contains('sales')) db.createObjectStore('sales', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('shops')) db.createObjectStore('shops', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'username' });
                if (!db.objectStoreNames.contains('expenses')) db.createObjectStore('expenses', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('purchaseOrders')) db.createObjectStore('purchaseOrders', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('salesOrders')) db.createObjectStore('salesOrders', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { autoIncrement: true });
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", (event.target as IDBOpenDBRequest).error);
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
    }

    private getStore(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
        if (!this.db) throw new Error("Database is not open.");
        const tx = this.db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }
    
    public getDb(): IDBDatabase | null {
        return this.db;
    }

    public async getAll<T>(storeName: string): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readonly');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result as T[]);
            request.onerror = () => reject(request.error);
        });
    }
    
    public async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readonly');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result as T | undefined);
            request.onerror = () => reject(request.error);
        });
    }

    public async put<T>(storeName: string, item: T): Promise<void> {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readwrite');
            const request = store.put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    public async bulkDelete(storeName: string, keys: IDBValidKey[]): Promise<void> {
        if (!this.db) throw new Error("Database is not open.");
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        keys.forEach(key => store.delete(key));
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    public async clear(storeName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const store = this.getStore(storeName, 'readwrite');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    public async bulkPut<T>(storeName: string, items: T[]): Promise<void> {
        if (!this.db) throw new Error("Database is not open.");
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        items.forEach(item => store.put(item));
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}

const dbManager = new IndexedDBManager('BillEasePOS_DB');


// --- API Client ---
const API_BASE_URL = '/api';

const getAuthToken = () => sessionStorage.getItem('authToken');

const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers: HeadersInit = { 'Content-Type': 'application/json', ...options.headers };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    console.log(`Making API call to ${API_BASE_URL}${url}`, options);
    await new Promise(res => setTimeout(res, 300));

    // MOCK RESPONSES
    if (url.startsWith('/auth/login')) {
        const body = JSON.parse(options.body as string);
        
        // In this mock setup, we directly query the local IndexedDB for auth.
        // In a real application, this logic would reside on a secure server.
        const user = await dbManager.get<User>('users', body.username);

        if (user && user.password === body.password) {
            // Strip sensitive data before returning user object
            const { password, resetToken, resetTokenExpiry, ...userToReturn } = user;
            return { token: `fake-token-for-${user.username}`, user: userToReturn };
        }
        
        // The superadmin check can remain as a fallback for the very first login
        // before the user list is populated from the mock API.
        if (body.username === 'superadmin' && body.password === 'password') {
            const superAdminUser = { username: 'superadmin', role: 'super_admin' as const, email: 'super@admin.com' };
            // Ensure superadmin exists in DB for subsequent logins
            const existing = await dbManager.get<User>('users', 'superadmin');
            if (!existing) {
                await dbManager.put('users', { ...superAdminUser, password: 'password' });
            }
            return { token: 'fake-superadmin-token', user: superAdminUser };
        }

        throw new Error("Invalid credentials");
    }
    if(url.startsWith('/sync/push')) {
        console.log("Mock Sync Push:", JSON.parse(options.body as string));
        return { success: true };
    }
    if(url.startsWith('/sync/updates')) {
        console.log("Mock Sync Updates requested");
        return { newProducts: [], updatedCustomers: [], newSales: [] };
    }
    if(url === '/products') return MOCK_PRODUCTS;
    if(url.startsWith('/products?shop_id=')) return MOCK_PRODUCTS.filter(p => p.shopId === Number(url.split('=')[1]));
    if(url === '/sales') return MOCK_SALES;
    if(url.startsWith('/sales?shop_id=')) return MOCK_SALES.filter(s => s.shopId === Number(url.split('=')[1]));
    if(url.startsWith('/customers')) return MOCK_CUSTOMERS;
    if(url.startsWith('/users')) return [
        { username: 'superadmin', password: 'password', role: 'super_admin', email: 'super@admin.com' },
        { username: 'admin1', password: 'password', role: 'admin', shopId: 1, email: 'admin1@shop.com' },
        { username: 'cashier1', password: 'password', role: 'cashier', shopId: 1, email: 'cashier1@shop.com' }
    ];
    if(url.startsWith('/shops')) return [{ id: 1, name: "Main Street Branch" }, { id: 2, name: "Downtown Kiosk"}];
    if(options.method === 'POST') return { ...JSON.parse(options.body as string), id: Date.now() };
};


const api = {
    login: (username, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (user) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(user) }),
    getShops: () => apiFetch('/shops'),
    getUsers: () => apiFetch('/users'),
    getProducts: (shopId?: number) => apiFetch(shopId ? `/products?shop_id=${shopId}` : '/products'),
    getSales: (shopId?: number) => apiFetch(shopId ? `/sales?shop_id=${shopId}` : '/sales'),
    getCustomers: () => apiFetch('/customers'),
    syncPush: (items) => apiFetch('/sync/push', { method: 'POST', body: JSON.stringify(items) }),
    syncUpdates: (shopId, lastSync) => apiFetch(`/sync/updates?shop_id=${shopId}&last_sync=${lastSync}`),
};


// --- UTILITY FUNCTIONS ---
const formatCurrency = (amount: number) => `₹${(amount || 0).toFixed(2)}`;
const formatQuantity = (quantity: number) => (quantity || 0).toFixed(3);
const formatNumberForInvoice = (amount: number) => (amount || 0).toFixed(2);
const formatPriceForInvoice = (amount: number) => (amount || 0).toFixed(1);
const formatQuantityForInvoice = (quantity: number) => (quantity || 0).toFixed(1);
const LOW_STOCK_THRESHOLD = 10;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function calculateMatchScore(searchTerm: string, product: Product): number {
    const term = searchTerm.toLowerCase();
    if (!term) return 0;

    const name = product.name.toLowerCase();
    const nameTamil = product.nameTamil?.toLowerCase() || '';
    const category = product.category?.toLowerCase() || '';
    const barcode = product.barcode?.toLowerCase() || '';

    let score = 0;

    // Tier 1: Exact matches
    if (barcode === term) return 1000;
    if (name === term) score = Math.max(score, 900);
    if (nameTamil === term) score = Math.max(score, 890);

    // Tier 2: Starts with
    if (name.startsWith(term)) score = Math.max(score, 800 + (term.length / name.length * 50));
    if (nameTamil.startsWith(term)) score = Math.max(score, 790 + (term.length / nameTamil.length * 50));

    // Tier 3: Includes
    if (name.includes(term)) score = Math.max(score, 700);
    if (nameTamil.includes(term)) score = Math.max(score, 690);
    if (category.includes(term)) score = Math.max(score, 600);
    if (barcode.includes(term)) score = Math.max(score, 500);

    // Tier 4: Fuzzy sequential match
    const getFuzzyScore = (text: string): number => {
        let termIndex = 0;
        let startIndex = -1;
        let endIndex = -1;
        
        for (let i = 0; i < text.length && termIndex < term.length; i++) {
            if (text[i] === term[termIndex]) {
                if (startIndex === -1) startIndex = i;
                endIndex = i;
                termIndex++;
            }
        }

        if (termIndex === term.length) {
            const matchSpan = endIndex - startIndex + 1;
            const density = term.length / matchSpan;
            return density * 100;
        }
        return 0;
    };
    
    score = Math.max(score, getFuzzyScore(name));
    score = Math.max(score, getFuzzyScore(nameTamil));

    return score;
}

// --- SYNC STATUS INDICATOR ---
type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';
type SyncStatusIndicatorProps = {
    status: SyncStatus;
    pendingCount: number;
};
const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ status, pendingCount }) => {
    const getStatusInfo = () => {
        switch (status) {
            case 'synced': return { text: 'Synced', className: 'synced', icon: '✓' };
            case 'syncing': return { text: `Syncing...`, className: 'syncing', icon: '⟳' };
            case 'offline': return { text: `Offline (${pendingCount})`, className: 'offline', icon: '🌐' };
            case 'error': return { text: 'Sync Error', className: 'error', icon: '✗' };
            default: return { text: 'Unknown', className: 'offline', icon: '?' };
        }
    };
    const { text, className, icon } = getStatusInfo();
    const title = status === 'syncing' ? `Syncing ${pendingCount} items...` : text;
    return (
        <div className={`sync-status ${className}`} title={title}>
            <span className="sync-icon">{icon}</span>
            <span className="sync-text">{text}</span>
        </div>
    );
};

// --- HEADER COMPONENT ---
type HeaderProps = {
  onNavigate: (page: string) => void;
  currentUser: User;
  onLogout: () => void;
  appName: string;
  shops: Shop[];
  selectedShopId: number | null;
  onShopChange: (shopId: number) => void;
  syncStatus: SyncStatus;
  pendingSyncCount: number;
};
const AppHeader: React.FC<HeaderProps> = ({ onNavigate, currentUser, onLogout, appName, shops, selectedShopId, onShopChange, syncStatus, pendingSyncCount }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const getMenuItems = () => {
    const superAdminMenuItems = ['Dashboard', 'New Sale', 'Product Inventory', 'Customer Management', 'Order Management', 'Expenses', 'Notes', 'Settings', 'Balance Due', 'Manage Users'];
    const adminMenuItems = ['Dashboard', 'New Sale', 'Product Inventory', 'Customer Management', 'Order Management', 'Expenses', 'Notes', 'Settings', 'Balance Due'];
    const cashierMenuItems = ['New Sale'];
    switch(currentUser.role) {
        case 'super_admin': return superAdminMenuItems;
        case 'admin': return adminMenuItems;
        case 'cashier': return cashierMenuItems;
        default: return [];
    }
  };
  const menuItems = getMenuItems();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const currentShopName = shops.find(s => s.id === selectedShopId)?.name || 'All Shops';

  return (
    <header className="app-header">
      <h1 className="header-title">{appName}</h1>
      <nav className="header-nav">
        {menuItems.slice(0, 1).map(item => <button key={item} className="nav-button" onClick={() => onNavigate(item)}>{item}</button>)}
      </nav>
      <div className="header-user-info">
        <SyncStatusIndicator status={syncStatus} pendingCount={pendingSyncCount} />
        <span className="header-welcome-message">Welcome, {currentUser.username} ({currentUser.role}){currentUser.role !== 'super_admin' && ` @ ${currentShopName}`}</span>
        {currentUser.role === 'super_admin' && shops.length > 0 && (
            <div className="shop-selector">
                <label htmlFor="shop-select" className="sr-only">Select Shop</label>
                <select id="shop-select" className="select-field" value={selectedShopId || 'all'} onChange={(e) => onShopChange(e.target.value === 'all' ? 0 : Number(e.target.value))}>
                    <option value="all">All Shops (Dashboard)</option>
                    {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                </select>
            </div>
        )}
        <div className="dropdown" ref={dropdownRef}>
            <button className="dropdown-button" onClick={() => setDropdownOpen(!dropdownOpen)}>Menu ▾</button>
            <div className={`dropdown-content ${dropdownOpen ? 'show' : ''}`}>
            {menuItems.map(item => <button key={item} className="dropdown-item" onClick={() => { onNavigate(item); setDropdownOpen(false); }}>{item}</button>)}
            <div className="dropdown-divider"></div>
            <button className="dropdown-item" onClick={() => { onLogout(); setDropdownOpen(false); }}>Logout</button>
            </div>
        </div>
      </div>
    </header>
  );
};

// --- DASHBOARD PAGE COMPONENT ---
type DashboardPageProps = {
    sales: SaleData[];
    customers: Customer[];
};

const DashboardPage: React.FC<DashboardPageProps> = ({ sales, customers }) => {
    const [timeRange, setTimeRange] = useState<'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Custom Range'>('This Month');
    const [activeTab, setActiveTab] = useState<'Sales Summary' | 'AI Forecast'>('Sales Summary');
    const todayStr = new Date().toISOString().split('T')[0];
    const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
    const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

    const filteredSales = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        return sales.filter(sale => {
            const saleDate = new Date(sale.date);
            if (timeRange === 'Today') {
                return saleDate >= today;
            } else if (timeRange === 'Yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const endOfYesterday = new Date(today);
                return saleDate >= yesterday && saleDate < endOfYesterday;
            } else if (timeRange === 'This Week') {
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday as start
                return saleDate >= startOfWeek;
            } else if (timeRange === 'This Month') {
                 return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
            } else if (timeRange === 'Custom Range') {
                if (!customStartDate || !customEndDate) return true;
                const start = new Date(customStartDate);
                const end = new Date(customEndDate);
                end.setHours(23, 59, 59, 999);
                return saleDate >= start && saleDate <= end;
            }
            return true;
        });
    }, [sales, timeRange, customStartDate, customEndDate]);

    const stats = useMemo(() => {
        const totalRevenue = filteredSales.reduce((acc, sale) => acc + sale.grandTotal, 0);
        const itemsSold = filteredSales.reduce((acc, sale) => acc + sale.saleItems.reduce((sum, item) => sum + item.quantity, 0), 0);
        const transactions = filteredSales.length;
        
        // Outstanding calculation (simplified: sum of balances from all customers, or sales with due)
        // Using customers.balance as "Outstanding"
        // Note: The reference image implies "Outstanding" might be related to the time period, 
        // but typically outstanding is a global state of debt. 
        // We will sum all customer balances for the "Outstanding" card to show total debt.
        const totalOutstanding = customers.reduce((acc, c) => acc + c.balance, 0);

        return { totalRevenue, itemsSold, transactions, totalOutstanding };
    }, [filteredSales, customers]);

    return (
        <div className="page-container dashboard-new-layout">
             <div className="dashboard-header-row">
                <h2 className="dashboard-title">{timeRange === 'Custom Range' ? 'Custom Sales Report' : `${timeRange}'s Sales Report`}</h2>
                <div className="date-filter-container">
                     <select 
                        className="date-filter-select" 
                        value={timeRange} 
                        onChange={(e) => setTimeRange(e.target.value as any)}
                    >
                        <option value="Today">Today</option>
                        <option value="Yesterday">Yesterday</option>
                        <option value="This Week">This Week</option>
                        <option value="This Month">This Month</option>
                        <option value="Custom Range">Custom Range</option>
                    </select>
                    {timeRange === 'Custom Range' && (
                        <div className="custom-date-inputs">
                            <input 
                                type="date" 
                                className="input-field date-input"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                aria-label="Start Date"
                            />
                            <span className="date-separator">to</span>
                            <input 
                                type="date" 
                                className="input-field date-input" 
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                aria-label="End Date"
                            />
                        </div>
                    )}
                </div>
             </div>

             <div className="dashboard-tabs">
                <button 
                    className={`dashboard-tab-btn ${activeTab === 'Sales Summary' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Sales Summary')}
                >
                    Sales Summary
                </button>
                 <button 
                    className={`dashboard-tab-btn ${activeTab === 'AI Forecast' ? 'active' : ''}`}
                    onClick={() => setActiveTab('AI Forecast')}
                >
                    AI Forecast
                </button>
             </div>
             
             <div className="dashboard-divider"></div>

            {activeTab === 'Sales Summary' ? (
                <div className="dashboard-summary-grid">
                    <div className="summary-card-new">
                        <h3>Total Revenue</h3>
                        <p>{formatCurrency(stats.totalRevenue)}</p>
                    </div>
                    
                    <div className="summary-card-new outstanding-card">
                         <h3>Outstanding</h3>
                         <p>{formatCurrency(stats.totalOutstanding)}</p>
                    </div>

                    <div className="summary-card-new">
                         <h3>Items Sold</h3>
                         <p>{Math.round(stats.itemsSold)}</p>
                    </div>

                    <div className="summary-card-new">
                         <h3>Transactions</h3>
                         <p>{stats.transactions}</p>
                    </div>
                </div>
            ) : (
                <div className="ai-forecast-placeholder">
                    <p>AI Sales Forecasting is coming soon.</p>
                </div>
            )}
        </div>
    );
};


// --- ADD PRODUCT MODAL ---
type AddProductModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onAddProduct: (newProduct: Omit<Product, 'id' | 'shopId'>) => Promise<Product>;
    initialName?: string;
};
const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onAddProduct, initialName }) => {
    const [newProductName, setNewProductName] = useState('');
    const [newProductNameTamil, setNewProductNameTamil] = useState('');
    const [newProductB2B, setNewProductB2B] = useState(0);
    const [newProductB2C, setNewProductB2C] = useState(0);
    const [newProductStock, setNewProductStock] = useState(0);
    const [newProductBarcode, setNewProductBarcode] = useState('');
    const [newProductCategory, setNewProductCategory] = useState('');
    const [newProductSubcategory, setNewProductSubcategory] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);

    const nameTamilRef = useRef<HTMLInputElement>(null);
    const b2bRef = useRef<HTMLInputElement>(null);
    const b2cRef = useRef<HTMLInputElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
    const categoryRef = useRef<HTMLInputElement>(null);
    const subcategoryRef = useRef<HTMLInputElement>(null);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const submitRef = useRef<HTMLButtonElement>(null);
    const formId = "add-product-form";

    useEffect(() => {
        if (isOpen) {
            setNewProductName(initialName || '');
            setNewProductNameTamil('');
            setNewProductB2B(0);
            setNewProductB2C(0);
            setNewProductStock(0);
            setNewProductBarcode('');
            setNewProductCategory('');
            setNewProductSubcategory('');
            setIsAdding(false);
            setIsTranslating(false);
        }
    }, [isOpen, initialName]);

    useEffect(() => {
        const translationTimeout = setTimeout(async () => {
            if (newProductName.trim() && isOpen) {
                setIsTranslating(true);
                try {
                    const tamilName = await translateToTamilTransliteration(newProductName);
                    setNewProductNameTamil(tamilName);
                } finally {
                    setIsTranslating(false);
                }
            }
        }, 800);

        return () => clearTimeout(translationTimeout);
    }, [newProductName, isOpen]);

    if (!isOpen) return null;

    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProductName.trim()) {
            alert("Product name cannot be empty.");
            return;
        }
        setIsAdding(true);
        try {
            await onAddProduct({ name: newProductName, nameTamil: newProductNameTamil, b2bPrice: newProductB2B, b2cPrice: newProductB2C, stock: newProductStock, barcode: newProductBarcode, category: newProductCategory, subcategory: newProductSubcategory });
            onClose();
        } catch (error) {
            alert(`Error adding product: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsAdding(false);
        }
    };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); nextRef.current?.focus(); }
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Add New Product</h3><button onClick={onClose} className="close-button">&times;</button></div>
                <div className="modal-body">
                    <form id={formId} onSubmit={handleAddProduct} className="add-product-form">
                        <div className="form-group"><label htmlFor="modal-new-product-name">Product Name (English)</label><input id="modal-new-product-name" type="text" className="input-field" value={newProductName} onChange={e => setNewProductName(e.target.value.replace(/\b\w/g, l => l.toUpperCase()))} onKeyDown={e => handleKeyDown(e, nameTamilRef)} required autoFocus autoComplete="off"/></div>
                        <div className="form-group"><label htmlFor="modal-new-product-name-tamil">Product Name (Tamil) {isTranslating && '(Translating...)'}</label><input ref={nameTamilRef} id="modal-new-product-name-tamil" type="text" className="input-field" value={newProductNameTamil} onChange={e => setNewProductNameTamil(e.target.value)} onKeyDown={e => handleKeyDown(e, b2bRef)} disabled={isTranslating} autoComplete="off"/></div>
                        <div className="form-group"><label htmlFor="modal-new-product-b2b">B2B Price</label><input ref={b2bRef} id="modal-new-product-b2b" type="number" step="0.01" className="input-field" value={newProductB2B} onChange={e => setNewProductB2B(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, b2cRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-b2c">B2C Price</label><input ref={b2cRef} id="modal-new-product-b2c" type="number" step="0.01" className="input-field" value={newProductB2C} onChange={e => setNewProductB2C(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, stockRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-stock">Initial Stock</label><input ref={stockRef} id="modal-new-product-stock" type="number" step="1" className="input-field" value={newProductStock} onChange={e => setNewProductStock(parseInt(e.target.value, 10) || 0)} onKeyDown={e => handleKeyDown(e, categoryRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-category">Category (Optional)</label><input ref={categoryRef} id="modal-new-product-category" type="text" className="input-field" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} onKeyDown={e => handleKeyDown(e, subcategoryRef)} autoComplete="off"/></div>
                        <div className="form-group"><label htmlFor="modal-new-product-subcategory">Subcategory (Optional)</label><input ref={subcategoryRef} id="modal-new-product-subcategory" type="text" className="input-field" value={newProductSubcategory} onChange={e => setNewProductSubcategory(e.target.value)} onKeyDown={e => handleKeyDown(e, barcodeRef)} autoComplete="off"/></div>
                        <div className="form-group"><label htmlFor="modal-new-product-barcode">Barcode (Optional)</label><input ref={barcodeRef} id="modal-new-product-barcode" type="text" className="input-field" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)} onKeyDown={e => handleKeyDown(e, submitRef)} autoComplete="off"/></div>
                    </form>
                </div>
                <div className="modal-footer">
                     <button className="action-button-secondary" type="button" onClick={onClose} disabled={isAdding}>Cancel</button>
                     <button ref={submitRef} type="submit" form={formId} className="action-button-primary" disabled={isAdding}>{isAdding ? 'Adding...' : 'Add Product'}</button>
                </div>
            </div>
        </div>
    );
};


// --- IMPORT PRODUCTS MODAL ---
type ImportProductsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onBulkAdd: (products: Omit<Product, 'id' | 'shopId'>[]) => Promise<void>;
};
const ImportProductsModal: React.FC<ImportProductsModalProps> = ({ isOpen, onClose, onBulkAdd }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [parsedProducts, setParsedProducts] = useState<Omit<Product, 'id' | 'shopId'>[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedFile(null);
            setParsedProducts([]);
            setIsProcessing(false);
            setStatusMessage('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setParsedProducts([]);
            setStatusMessage('');
            setIsProcessing(true);
            setStatusMessage('Reading file...');
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = event.target?.result;
                    if (!data) throw new Error("Could not read file data.");
                    
                    setStatusMessage('Parsing Excel data...');
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) throw new Error("No sheets found in the Excel file.");
                    
                    const worksheet = workbook.Sheets[sheetName];
                    const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                    if (json.length === 0) throw new Error("The selected sheet is empty.");

                    const headers = Object.keys(json[0]);
                    const findHeader = (targetName: string) => headers.find(h => h.trim().toLowerCase() === targetName.toLowerCase());

                    const nameHeader = findHeader("English Description");
                    const nameTamilHeader = findHeader("Tamil Description") || findHeader("Tanglish Description");
                    const b2bHeader = findHeader("B2B Price");
                    const b2cHeader = findHeader("B2C Price");
                    const categoryHeader = findHeader("Category");


                    if (!nameHeader) {
                        throw new Error("Column 'English Description' not found. Please check the Excel file header.");
                    }

                    const productsToImport = json.map((row): Omit<Product, 'id' | 'shopId'> | null => {
                        const name = row[nameHeader];
                        if (!name || String(name).trim() === '') return null;

                        const formattedName = String(name).replace(/\b\w/g, l => l.toUpperCase());

                        return {
                            name: formattedName,
                            nameTamil: nameTamilHeader ? String(row[nameTamilHeader] || '') : '',
                            b2bPrice: b2bHeader ? parseFloat(row[b2bHeader]) || 0 : 0,
                            b2cPrice: b2cHeader ? parseFloat(row[b2cHeader]) || 0 : 0,
                            stock: 0,
                            barcode: undefined,
                            category: categoryHeader ? String(row[categoryHeader] || '') : undefined,
                            subcategory: undefined,
                        };
                    }).filter((p): p is Omit<Product, 'id' | 'shopId'> => p !== null);
                    
                    if (productsToImport.length === 0) {
                        throw new Error("No valid product rows found in the file.");
                    }

                    // Batch translation
                    setStatusMessage(`Preparing to translate ${productsToImport.length} products...`);
                    const productsRequiringTranslation = productsToImport.filter(p => !p.nameTamil && p.name);
                    const namesToTranslate = productsRequiringTranslation.map(p => p.name);
                    const translationMap = new Map<string, string>();

                    if (namesToTranslate.length > 0) {
                        setStatusMessage(`Translating ${namesToTranslate.length} product names in a single batch...`);
                        try {
                            const translatedNames = await translateBatchToTamilTransliteration(namesToTranslate);
                            namesToTranslate.forEach((name, index) => {
                                if (translatedNames[index]) {
                                    translationMap.set(name, translatedNames[index]);
                                }
                            });
                        } catch (batchError) {
                            console.error("Batch translation failed:", batchError);
                            setStatusMessage("Warning: Automatic translation failed. Please review Tamil names.");
                            await sleep(2000); // Show warning for a moment
                        }
                    }

                    const finalProducts = productsToImport.map(p => {
                        if (translationMap.has(p.name)) {
                            return { ...p, nameTamil: translationMap.get(p.name)! };
                        }
                        return p;
                    });
                    
                    setParsedProducts(finalProducts);
                    setStatusMessage('');

                } catch (err) {
                    setStatusMessage(err instanceof Error ? `Error parsing file: ${err.message}` : 'Failed to parse Excel file.');
                    setSelectedFile(null);
                    setParsedProducts([]);
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.onerror = () => {
                 setStatusMessage("Failed to read the file.");
                 setIsProcessing(false);
            };
            reader.readAsArrayBuffer(file);
        }
    };


    const handleImport = async () => {
        if (parsedProducts.length === 0) {
            setStatusMessage('No products to import. Please upload and preview a valid file first.');
            return;
        }
        setIsProcessing(true);
        setStatusMessage('');
        try {
            await onBulkAdd(parsedProducts);
            onClose();
        } catch (err) {
            setStatusMessage(err instanceof Error ? err.message : 'An unknown error occurred during import.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px'}}>
                <div className="modal-header">
                    <h3>Import Products From Excel</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="import-instructions">
                        <p>Upload an Excel file (.xlsx, .xls) with your product data. The importer will look for the following column headers (case-insensitive):</p>
                        <code>English Description, Tamil Description, B2B Price, B2C Price, Category</code>
                    </div>
                    {statusMessage && <p className="status-message">{statusMessage}</p>}
                    
                    <div className="file-upload-container">
                        <input
                            type="file"
                            id="excel-file-input"
                            accept=".xlsx, .xls"
                            onChange={handleFileChange}
                            disabled={isProcessing}
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="excel-file-input" className="file-drop-zone">
                             <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
                             <span className="upload-text">
                                {selectedFile ? `Selected: ${selectedFile.name}` : 'Drag & drop your Excel file here, or click to browse'}
                             </span>
                        </label>
                    </div>

                    {parsedProducts.length > 0 && (
                        <div className="inventory-list-container" style={{ maxHeight: '30vh', marginTop: 'var(--padding-md)' }}>
                            <h4>Preview ({parsedProducts.length} products found)</h4>
                            <table className="inventory-table">
                                <thead>
                                    <tr>
                                        <th>English Description</th>
                                        <th>Tamil Description</th>
                                        <th>Category</th>
                                        <th>B2B Price</th>
                                        <th>B2C Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedProducts.slice(0, 100).map((p, index) => ( // Preview up to 100 rows
                                        <tr key={index}>
                                            <td data-label="English Description">{p.name}</td>
                                            <td data-label="Tamil Description">{p.nameTamil}</td>
                                            <td data-label="Category">{p.category}</td>
                                            <td data-label="B2B Price">{formatCurrency(p.b2bPrice)}</td>
                                            <td data-label="B2C Price">{formatCurrency(p.b2cPrice)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                             {parsedProducts.length > 100 && <p style={{textAlign: 'center', marginTop: 'var(--padding-sm)', color: 'var(--text-secondary)'}}>... and {parsedProducts.length - 100} more rows.</p>}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose} disabled={isProcessing}>Cancel</button>
                    <button className="action-button-primary" onClick={handleImport} disabled={isProcessing || parsedProducts.length === 0}>
                        {isProcessing ? 'Processing...' : `Import ${parsedProducts.length} Products`}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- CUSTOMER HISTORY MODAL ---
type CustomerHistoryModalProps = {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
    salesHistory: SaleData[];
    onViewInvoice: (saleData: SaleData) => void;
};

const CustomerHistoryModal: React.FC<CustomerHistoryModalProps> = ({ isOpen, onClose, customer, salesHistory, onViewInvoice }) => {
    if (!isOpen || !customer) return null;

    const customerSales = useMemo(() => {
        return salesHistory
            .filter(sale => sale.customerMobile === customer.mobile)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [salesHistory, customer]);

    const handleViewClick = (sale: SaleData) => {
        onViewInvoice(sale);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px'}}>
                <div className="modal-header">
                    <h3>Purchase History for {customer.name}</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="inventory-list-container" style={{maxHeight: '60vh'}}>
                        <table className="inventory-table sales-history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Items</th>
                                    <th>Total Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customerSales.length === 0 ? (
                                    <tr><td colSpan={4} style={{textAlign: 'center', padding: '2rem'}}>No purchase history found for this customer.</td></tr>
                                ) : (
                                    customerSales.map(sale => (
                                        <tr key={sale.id}>
                                            <td data-label="Date">{new Date(sale.date).toLocaleString()}</td>
                                            <td data-label="Items">{sale.saleItems.length}</td>
                                            <td data-label="Total Amount">{formatCurrency(sale.grandTotal)}</td>
                                            <td data-label="Actions">
                                                <button className="action-button-secondary" onClick={() => handleViewClick(sale)}>View Invoice</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};


// --- CONFIRMATION MODAL ---
type ConfirmationModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    isConfirming?: boolean;
};

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', isConfirming = false }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content confirmation-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-body">
                    <div className="confirmation-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    </div>
                    <div className="confirmation-content">
                        <h3>{title}</h3>
                        <p>{message}</p>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose} disabled={isConfirming}>
                        Cancel
                    </button>
                    <button className="action-button-danger" onClick={onConfirm} disabled={isConfirming}>
                        {isConfirming ? 'Deleting...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- CONFIRM TRANSACTION MODAL ---
type ConfirmTransactionModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isConfirming?: boolean;
    summary: {
        previousBalance: number;
        currentBillTotal: number;
        grandTotalDue: number;
        amountPaid: number;
        newBalanceRemaining: number;
    };
};

const ConfirmTransactionModal: React.FC<ConfirmTransactionModalProps> = ({ isOpen, onClose, onConfirm, isConfirming = false, summary }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
                <div className="modal-header">
                    <h3>Confirm Transaction</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="confirmation-summary">
                        <div className="summary-row"><span>Previous Balance:</span><span>{formatCurrency(summary.previousBalance)}</span></div>
                        <div className="summary-row"><span>Current Bill Total:</span><span>{formatCurrency(summary.currentBillTotal)}</span></div>
                        <div className="summary-row grand-total"><span>Grand Total Due:</span><span>{formatCurrency(summary.grandTotalDue)}</span></div>
                        <div className="summary-row"><span>Amount Paid:</span><span>{formatCurrency(summary.amountPaid)}</span></div>
                        <div className="summary-row new-balance"><span>New Balance Remaining:</span><span>{formatCurrency(summary.newBalanceRemaining)}</span></div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose} disabled={isConfirming}>Cancel</button>
                    <button className="action-button-primary" onClick={onConfirm} disabled={isConfirming}>
                        {isConfirming ? 'Processing...' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- ORDER DETAILS MODAL ---
type OrderDetailsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder | PurchaseOrder | null;
};
const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order }) => {
    if (!isOpen || !order) return null;

    const isSalesOrder = 'customerName' in order;
    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                <div className="modal-header">
                    <h3>{isSalesOrder ? 'Sales' : 'Purchase'} Order #{order.id}</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="order-details-summary">
                        <div><strong>Date:</strong> {new Date(order.orderDate).toLocaleDateString()}</div>
                        <div><strong>{isSalesOrder ? 'Customer:' : 'Supplier:'}</strong> {isSalesOrder ? order.customerName : order.supplierName}</div>
                        <div><strong>Status:</strong> <span className={`status-badge ${order.status.toLowerCase()}`}>{order.status}</span></div>
                        <div><strong>Total Items:</strong> {totalItems}</div>
                    </div>
                    <h4>Items</h4>
                    <div className="inventory-list-container" style={{ maxHeight: '40vh' }}>
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                    <th>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item, index) => (
                                    <tr key={index}>
                                        <td data-label="Product Name">{item.name}</td>
                                        <td data-label="Quantity">{formatQuantity(item.quantity)}</td>
                                        <td data-label="Price">{formatCurrency(item.price)}</td>
                                        <td data-label="Subtotal">{formatCurrency(item.quantity * item.price)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="order-details-total">
                        <strong>Grand Total:</strong>
                        <span>{formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};


// --- HOOKS ---
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

// --- NEW SALE PAGE COMPONENT ---
type NewSalePageProps = {
    products: Product[];
    customers: Customer[];
    salesHistory: SaleData[];
    onPreviewInvoice: (saleData: SaleData) => void;
    onViewInvoice: (sale: SaleData) => void;
    onAddProduct: (newProduct: Omit<Product, 'id' | 'shopId'>) => Promise<Product>;
    onUpdateProduct: (updatedProduct: Product) => void;
    userRole: User['role'];
    sessionData: SaleSession;
    onSessionUpdate: (updates: Partial<SaleSession>) => void;
    activeBillIndex: number;
    onBillChange: (index: number) => void;
    currentShopId: number | null;
    isFitToScreen: boolean;
    setIsFitToScreen: React.Dispatch<React.SetStateAction<boolean>>;
};

const NewSalePage: React.FC<NewSalePageProps> = ({ products, customers, salesHistory, onPreviewInvoice, onViewInvoice, onAddProduct, onUpdateProduct, userRole, sessionData, onSessionUpdate, activeBillIndex, onBillChange, currentShopId, isFitToScreen, setIsFitToScreen }) => {
    const { customerName, customerMobile, priceMode, languageMode, taxPercent, discount, saleItems, amountPaid } = sessionData;
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 250);
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [showAddNewSuggestion, setShowAddNewSuggestion] = useState(false);
    const [activeSuggestion, setActiveSuggestion] = useState(-1);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState('');
    const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);

    const mobileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const prevSaleItemsLengthRef = useRef(saleItems.length);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const recognitionRef = useRef<any>(null);
    const suggestionsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const foundCustomer = customers.find(c => c.mobile === customerMobile);
        setActiveCustomer(foundCustomer || null);
        if (foundCustomer && !customerName) onSessionUpdate({ customerName: foundCustomer.name });
        if (!foundCustomer) setActiveCustomer(null);
    }, [customerMobile, customers, customerName, onSessionUpdate]);
    useEffect(() => {
        if (saleItems.length > prevSaleItemsLengthRef.current) {
            const lastQuantityInput = document.querySelector<HTMLInputElement>(`.sales-grid tbody tr:last-child input[data-field="quantity"]`);
            if (lastQuantityInput) { lastQuantityInput.focus(); lastQuantityInput.select(); }
        }
        prevSaleItemsLengthRef.current = saleItems.length;
    }, [saleItems, activeBillIndex]);
    useEffect(() => {
        if (debouncedSearchTerm) {
            const scoredProducts = products
                .map(p => ({ product: p, score: calculateMatchScore(debouncedSearchTerm, p) }))
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score);

            const filtered = scoredProducts.map(item => item.product);
            
            setSuggestions(filtered.slice(0, 15));
            setShowAddNewSuggestion(filtered.length === 0 && !products.some(p => p.barcode === debouncedSearchTerm));
        } else {
            setSuggestions([]); setShowAddNewSuggestion(false);
        }
        setActiveSuggestion(-1);
    }, [debouncedSearchTerm, products]);
    useEffect(() => {
        if (isScannerOpen) {
            const scanner = new Html5QrcodeScanner('barcode-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false);
            const handleSuccess = (decodedText: string) => {
                scanner.clear(); setIsScannerOpen(false);
                const matchedProduct = products.find(p => p.barcode === decodedText);
                if (matchedProduct) handleProductSelect(matchedProduct);
                else { setSearchTerm(decodedText); searchInputRef.current?.focus(); }
            };
            const handleError = (error: any) => {};
            scanner.render(handleSuccess, handleError);
            scannerRef.current = scanner;
        } else {
            if (scannerRef.current) { scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err)); scannerRef.current = null; }
        }
        return () => { if (scannerRef.current) scannerRef.current.clear().catch(err => console.error("Failed to clear scanner on unmount", err)); };
    }, [isScannerOpen, products]);

    useEffect(() => {
        const container = suggestionsContainerRef.current;
        if (activeSuggestion > -1 && container) {
            const activeItem = container.children[activeSuggestion] as HTMLElement;
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [activeSuggestion]);

    const handleProductSelect = (product: Product) => {
        const newItems = [...saleItems];
        const existingItemIndex = newItems.findIndex(item => item.productId === product.id && !item.isReturn);
        if (existingItemIndex > -1) {
            newItems[existingItemIndex].quantity += 1;
        } else {
            newItems.push({
                productId: product.id,
                name: product.name,
                nameTamil: product.nameTamil,
                quantity: 1,
                price: priceMode === 'B2B' ? product.b2bPrice : product.b2cPrice,
                isReturn: false,
            });
        }
        onSessionUpdate({ saleItems: newItems });
        setSearchTerm('');
    };
    
    const handleDirectAddProduct = async () => {
        if (!searchTerm.trim()) return;
        const term = searchTerm.trim();
        const parts = term.split(/\s+/);
        const lastPart = parts[parts.length - 1];
        const price = parseFloat(lastPart);
        let name = !isNaN(price) && parts.length > 1 ? parts.slice(0, -1).join(' ') : term;
        
        name = name.replace(/\b\w/g, l => l.toUpperCase());

        if (!name) {
            alert("Product name cannot be empty.");
            return;
        }

        const tamilName = await translateToTamilTransliteration(name);

        const newProductData: Omit<Product, 'id' | 'shopId'> = {
            name: name,
            nameTamil: tamilName,
            b2bPrice: 0,
            b2cPrice: 0,
            stock: 0,
            barcode: '',
            category: '',
            subcategory: '',
        };

        if (!isNaN(price)) {
            if (priceMode === 'B2B') {
                newProductData.b2bPrice = price;
            } else {
                newProductData.b2cPrice = price;
            }
        }
        
        try {
            const addedProduct = await onAddProduct(newProductData);
            handleProductSelect(addedProduct);
        } catch (error) {
            alert(`Error adding product directly: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setSearchTerm('');
            setSuggestions([]);
            setShowAddNewSuggestion(false);
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        const totalOptions = suggestions.length + (showAddNewSuggestion ? 1 : 0);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestion(prev => (prev < totalOptions - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestion(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            let selectionIndex = activeSuggestion;
            // If nothing is selected, but there are options, default to the first one on Enter.
            if (selectionIndex === -1 && totalOptions > 0) {
                selectionIndex = 0;
            }
            if (selectionIndex >= 0) {
                if (selectionIndex < suggestions.length) {
                    handleProductSelect(suggestions[selectionIndex]);
                } else if (showAddNewSuggestion && selectionIndex === suggestions.length) {
                    handleDirectAddProduct();
                }
            }
        }
    };
    const handleItemUpdate = (index: number, field: keyof SaleItem, value: any) => {
        const updatedItems = [...saleItems];
        (updatedItems[index] as any)[field] = value;
        onSessionUpdate({ saleItems: updatedItems });
    
        if ((field === 'price' || field === 'name' || field === 'nameTamil') && userRole === 'super_admin') {
            const item = updatedItems[index];
            const productToUpdate = products.find(p => p.id === item.productId);
            if (!productToUpdate) return;
    
            if (field === 'price') {
                const priceValue = typeof value === 'number' ? value : parseFloat(value);
                if (isNaN(priceValue)) return;
                
                if (priceMode === 'B2C' && productToUpdate.b2cPrice !== priceValue) {
                    onUpdateProduct({ ...productToUpdate, b2cPrice: priceValue });
                } else if (priceMode === 'B2B' && productToUpdate.b2bPrice !== priceValue) {
                    onUpdateProduct({ ...productToUpdate, b2bPrice: priceValue });
                }
            } else if (field === 'name' && productToUpdate.name !== value) {
                onUpdateProduct({ ...productToUpdate, name: value });
            } else if (field === 'nameTamil' && productToUpdate.nameTamil !== value) {
                onUpdateProduct({ ...productToUpdate, nameTamil: value });
            }
        }
    };
    const handleItemRemove = (index: number) => onSessionUpdate({ saleItems: saleItems.filter((_, i) => i !== index) });
    const handleCustomerNameKeydown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); mobileInputRef.current?.focus(); } };
    const handleMobileKeydown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); searchInputRef.current?.focus(); } };
    const handleGridKeyDown = (e: React.KeyboardEvent, index: number, field: 'quantity' | 'price') => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const target = e.target as HTMLInputElement;
            if (field === 'quantity') {
                const priceInput = target.closest('tr')?.querySelector<HTMLInputElement>('input[data-field="price"]');
                priceInput?.focus(); priceInput?.select();
            } else if (field === 'price') searchInputRef.current?.focus();
        }
    };
    const handleVoiceSearch = () => {
        if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { setVoiceError("Sorry, your browser does not support voice recognition."); setTimeout(() => setVoiceError(''), 3000); return; }
        const recognition = new SpeechRecognition(); recognitionRef.current = recognition;
        recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
        setIsListening(true); setVoiceError(''); recognition.start();
        recognition.onresult = (event: any) => { setSearchTerm(event.results[0][0].transcript); };
        recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
        recognition.onnomatch = () => { setVoiceError("Didn’t catch that, please try again"); setTimeout(() => setVoiceError(''), 3000); };
        recognition.onerror = (event: any) => { if (event.error !== 'no-speech' && event.error !== 'aborted') { setVoiceError(`Error: ${event.error}`); setTimeout(() => setVoiceError(''), 3000); } };
    };
    
    const handleCustomerMobileChange = (newCode: string, newNumber: string) => {
        onSessionUpdate({ customerMobile: `${newCode}${newNumber.replace(/\D/g, '')}` });
    };

    const [mobileCode, mobileNumber] = useMemo(() => {
        const mobile = customerMobile || '+91';

        // Prioritize +91 to solve ambiguity for Indian numbers, which is the user's reported issue.
        // This ensures that any digits typed after "+91" go into the number field,
        // instead of being greedily matched as part of the country code by the regex below.
        if (mobile.startsWith('+91')) {
            return ['+91', mobile.substring(3)];
        }

        // Fallback to original logic for other international codes.
        // This may still have issues with short codes (e.g., +1) but solves the primary problem.
        const match = mobile.match(/^(\+\d{1,4})(.*)$/);
        if (match) {
            return [match[1], match[2]];
        }
        if (mobile.startsWith('+')) {
            return [mobile, ''];
        }
        return ['+91', mobile];
    }, [customerMobile]);

    const {
        grossTotal, returnTotal, subtotal, grandTotal, taxAmount,
        previousBalance, totalAmountDue, newBalanceDue
    } = useMemo(() => {
        const grossTotal = saleItems.filter(item => !item.isReturn).reduce((acc, item) => acc + item.quantity * item.price, 0);
        const returnTotal = saleItems.filter(item => item.isReturn).reduce((acc, item) => acc + item.quantity * item.price, 0);
        const subtotal = grossTotal - returnTotal;
        const taxableAmount = subtotal - discount;
        const taxAmount = taxableAmount > 0 ? taxableAmount * (taxPercent / 100) : 0;
        const grandTotal = taxableAmount + taxAmount;
        const previousBalance = activeCustomer?.balance ?? 0;
        const totalAmountDue = previousBalance + grandTotal;
        const paid = parseFloat(amountPaid) || 0;
        const balance = totalAmountDue - paid;
        const newBalanceDue = balance > 0 ? balance : 0;
        return { grossTotal, returnTotal, subtotal, grandTotal, taxAmount, previousBalance, totalAmountDue, newBalanceDue };
    }, [saleItems, taxPercent, activeCustomer, amountPaid, discount]);

    useEffect(() => {
        if (totalAmountDue >= 0) {
            onSessionUpdate({ amountPaid: totalAmountDue.toFixed(2) });
        }
    }, [totalAmountDue, onSessionUpdate]);

    const handleNavigateToPreview = () => {
        if (!currentShopId) {
            alert("Cannot create a sale without a selected shop.");
            return;
        }
        const finalAmountPaid = parseFloat(amountPaid) || 0;
        const saleToPreview: SaleData = {
            id: `sale-${Date.now()}-${activeBillIndex}`, // Temp ID
            date: new Date(),
            shopId: currentShopId,
            customerName,
            customerMobile,
            saleItems,
            grossTotal,
            returnTotal,
            subtotal,
            discount,
            taxAmount,
            taxPercent,
            grandTotal,
            languageMode,
            previousBalance,
            amountPaid: finalAmountPaid,
            totalBalanceDue: newBalanceDue,
            returnReason: sessionData.returnReason,
            paymentDetailsEntered: true,
        };
        setConfirmModalOpen(false);
        onPreviewInvoice(saleToPreview);
    };

    const handlePreviewInvoiceClick = () => {
        if (previousBalance !== 0) {
            setConfirmModalOpen(true);
        } else {
            handleNavigateToPreview();
        }
    };

    return (
        <div className={`page-container new-sale-page ${isFitToScreen ? 'fit-to-screen' : ''}`}>
            <CustomerHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} customer={activeCustomer} salesHistory={salesHistory} onViewInvoice={onViewInvoice} />
            <ConfirmTransactionModal
                isOpen={isConfirmModalOpen}
                onClose={() => setConfirmModalOpen(false)}
                onConfirm={handleNavigateToPreview}
                summary={{
                    previousBalance,
                    currentBillTotal: subtotal,
                    grandTotalDue: totalAmountDue,
                    amountPaid: parseFloat(amountPaid) || 0,
                    newBalanceRemaining: newBalanceDue,
                }}
            />

            <main className="new-sale-main-content">
                <section className="customer-and-search-section">
                    <div className="sale-options-bar">
                        <div className="sale-options-left">
                            <div className="toggle-group">
                                <div className="toggle-switch">
                                    <button className={`toggle-button ${priceMode === 'B2C' ? 'active' : ''}`} onClick={() => onSessionUpdate({ priceMode: 'B2C' })}>B2C</button>
                                    <button className={`toggle-button ${priceMode === 'B2B' ? 'active' : ''}`} onClick={() => onSessionUpdate({ priceMode: 'B2B' })}>B2B</button>
                                </div>
                            </div>
                            <div className="toggle-group">
                                <div className="toggle-switch">
                                    <button className={`toggle-button ${languageMode === 'English' ? 'active' : ''}`} onClick={() => onSessionUpdate({ languageMode: 'English' })}>English</button>
                                    <button className={`toggle-button ${languageMode === 'Tamil' ? 'active' : ''}`} onClick={() => onSessionUpdate({ languageMode: 'Tamil' })}>Tamil</button>
                                </div>
                            </div>
                            <div className="toggle-group">
                                <div className="toggle-switch">
                                    {[0, 1, 2].map(index => (
                                        <button
                                            key={index}
                                            className={`toggle-button ${activeBillIndex === index ? 'active' : ''}`}
                                            onClick={() => onBillChange(index)}
                                            aria-label={`Switch to bill ${index + 1}`}
                                        >
                                            {index + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                         <div className="sale-options-right">
                            <button className={`fit-to-screen-button toggle-button ${isFitToScreen ? 'active' : ''}`} onClick={() => setIsFitToScreen(prev => !prev)} title={isFitToScreen ? "Exit Fit to Screen" : "Fit to Screen"}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                  {isFitToScreen 
                                    ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                                    : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                                  }
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="customer-details-new">
                        <div className="form-group"><label htmlFor="customer-name">Customer Name</label><input id="customer-name" type="text" className="input-field" value={customerName} onChange={e => onSessionUpdate({ customerName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} onKeyDown={handleCustomerNameKeydown} autoComplete="off" /></div>
                        <div className="form-group">
                            <label htmlFor="customer-mobile">Customer Mobile</label>
                            <div className="mobile-input-group">
                                <input
                                    type="text"
                                    className="country-code-input"
                                    value={mobileCode}
                                    onChange={e => handleCustomerMobileChange(e.target.value, mobileNumber)}
                                    aria-label="Country Code"
                                />
                                <input 
                                    id="customer-mobile" 
                                    type="text" 
                                    className="input-field" 
                                    ref={mobileInputRef} 
                                    value={mobileNumber} 
                                    onChange={e => handleCustomerMobileChange(mobileCode, e.target.value)} 
                                    onKeyDown={handleMobileKeydown}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                        <div className="history-btn-container"><button className="action-button-secondary" onClick={() => setIsHistoryModalOpen(true)} disabled={!activeCustomer}>History</button></div>
                    </div>
                    <div className="product-search-container">
                        <div className="input-with-icons">
                            <input id="product-search" type="text" className="input-field" placeholder="Search for a product by name or barcode... or use the mic" ref={searchInputRef} value={searchTerm} onChange={e => setSearchTerm(e.target.value.replace(/\b\w/g, l => l.toUpperCase()))} onKeyDown={handleSearchKeyDown} autoComplete="off" />
                            <button onClick={handleVoiceSearch} className={`input-icon-button ${isListening ? 'voice-listening' : ''}`} aria-label="Search by voice"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg></button>
                            <button onClick={() => setIsScannerOpen(true)} className="input-icon-button" aria-label="Scan barcode"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2v14H3V5zm2 2v2H5V7h2zm4 0v2H9V7h2zm4 0v2h-2V7h2zm4 0v2h-2V7h2zM5 11h2v2H5v-2zm4 0h2v2H9v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"></path></svg></button>
                        </div>
                        {(suggestions.length > 0 || showAddNewSuggestion) && (
                            <div className="product-suggestions" ref={suggestionsContainerRef} role="listbox" aria-label="Product suggestions">
                                {suggestions.map((p, i) => (
                                    <div
                                        key={p.id}
                                        className={`suggestion-item ${i === activeSuggestion ? 'active' : ''}`}
                                        onClick={() => handleProductSelect(p)}
                                        onMouseEnter={() => setActiveSuggestion(i)}
                                        role="option"
                                        aria-selected={i === activeSuggestion}
                                    >
                                        <div className="suggestion-main-info">
                                            <div className="suggestion-name-group">
                                                <span className="suggestion-name-en">{p.name}</span>
                                                {p.nameTamil && <span className="suggestion-name-ta">{p.nameTamil}</span>}
                                            </div>
                                            {p.category && <span className="suggestion-category-badge">{p.category}</span>}
                                        </div>
                                        <div className="suggestion-side-info">
                                            <span className="suggestion-price">{formatCurrency(priceMode === 'B2B' ? p.b2bPrice : p.b2cPrice)}</span>
                                            <span className={`suggestion-stock ${p.stock < LOW_STOCK_THRESHOLD ? 'low-stock' : ''}`}>
                                                {p.stock < LOW_STOCK_THRESHOLD && 
                                                    <svg className="low-stock-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                                                }
                                                {p.stock} in stock
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {showAddNewSuggestion && (
                                    <div
                                        className={`suggestion-item add-new-product-suggestion ${suggestions.length === activeSuggestion ? 'active' : ''}`}
                                        onClick={handleDirectAddProduct}
                                        onMouseEnter={() => setActiveSuggestion(suggestions.length)}
                                        role="option"
                                        aria-selected={suggestions.length === activeSuggestion}
                                    >
                                        + Add New Product: "{searchTerm}"
                                    </div>
                                )}
                            </div>
                        )}
                        {voiceError && <p className="voice-error-message">{voiceError}</p>}
                    </div>
                    {isScannerOpen && (<div className="barcode-scanner-container"><div id="barcode-reader" style={{ width: '100%', maxWidth: '500px' }}></div><button onClick={() => setIsScannerOpen(false)} className="action-button-secondary">Cancel</button></div>)}
                </section>

                <div className="sales-grid-container">
                    <table className="sales-grid" aria-label="Sales Items">
                        <thead><tr><th>S.No</th><th>Description</th><th>Quantity</th><th>Price</th><th>Total</th><th>Return</th><th>Actions</th></tr></thead>
                        <tbody>
                            {saleItems.length === 0 && (<tr><td colSpan={7} style={{textAlign: 'center', padding: '2rem'}}>No items in sale.</td></tr>)}
                            {saleItems.map((item, index) => (
                                <tr key={`${item.productId}-${index}`} className={item.isReturn ? 'is-return' : ''}>
                                    <td data-label="S.No">{index + 1}</td>
                                    <td data-label="Description">
                                        <input
                                            type="text"
                                            className="input-field"
                                            data-field={languageMode === 'Tamil' ? 'nameTamil' : 'name'}
                                            value={languageMode === 'Tamil' ? item.nameTamil : item.name}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const field = languageMode === 'Tamil' ? 'nameTamil' : 'name';
                                                const finalVal = field === 'name' ? val.replace(/\b\w/g, l => l.toUpperCase()) : val;
                                                handleItemUpdate(index, field, finalVal);
                                            }}
                                            aria-label={`Description for item ${index + 1}`}
                                            autoComplete="off"
                                        />
                                    </td>
                                    <td data-label="Quantity"><input type="number" className="input-field" data-field="quantity" value={item.quantity} onChange={e => handleItemUpdate(index, 'quantity', parseFloat(e.target.value) || 0)} onKeyDown={e => handleGridKeyDown(e, index, 'quantity')} aria-label={`Quantity for ${item.name}`} step="0.001" /></td>
                                    <td data-label="Price"><input type="number" className="input-field" data-field="price" value={item.price} onChange={e => handleItemUpdate(index, 'price', parseFloat(e.target.value) || 0)} onKeyDown={e => handleGridKeyDown(e, index, 'price')} aria-label={`Price for ${item.name}`} step="0.01" disabled={userRole !== 'super_admin'} /></td>
                                    <td data-label="Total">{formatNumberForInvoice(item.quantity * item.price)}</td>
                                    <td data-label="Return"><input type="checkbox" className="return-checkbox" checked={item.isReturn} onChange={() => handleItemUpdate(index, 'isReturn', !item.isReturn)} aria-label={`Toggle return status for ${item.name}`} /></td>
                                    <td data-label="Actions"><button className="action-button remove-item-btn" onClick={() => handleItemRemove(index)} aria-label={`Remove ${item.name}`}>&times;</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            <footer className="new-sale-footer">
                <div className="footer-item"><label htmlFor="discount-input">Discount (₹)</label><input id="discount-input" type="number" className="input-field" value={discount} onChange={e => onSessionUpdate({ discount: parseFloat(e.target.value) || 0 })} /></div>
                <div className="footer-item"><label htmlFor="tax-percent">Tax (%)</label><input id="tax-percent" type="number" className="input-field" value={taxPercent} onChange={e => onSessionUpdate({ taxPercent: parseFloat(e.target.value) || 0 })} /></div>
                <div className="footer-item"><span className="label">Previous Balance (₹)</span><span className="value">{formatNumberForInvoice(previousBalance)}</span></div>
                <div className="footer-item"><label htmlFor="amount-paid-input">Amount Paid (₹)</label><input id="amount-paid-input" type="number" className="input-field" value={amountPaid} onChange={e => onSessionUpdate({ amountPaid: e.target.value })} /></div>
                <div className="footer-item preview-btn"><button className="finalize-button" onClick={handlePreviewInvoiceClick}>Preview Invoice</button></div>
                <div className="footer-item grand-total"><span className="label">Grand Total:</span><span className="value">{formatCurrency(grandTotal)}</span></div>
            </footer>
        </div>
    );
};


// --- PRODUCT INVENTORY PAGE ---
type ProductInventoryPageProps = {
    products: Product[];
    onAddProduct: (newProduct: Omit<Product, 'id' | 'shopId'>) => Promise<Product>;
    onBulkAddProducts: (products: Omit<Product, 'id' | 'shopId'>[]) => Promise<void>;
    onDeleteProducts: (productIds: number[]) => Promise<void>;
    shops: Shop[];
};
const ProductInventoryPage: React.FC<ProductInventoryPageProps> = ({ products, onAddProduct, onBulkAddProducts, onDeleteProducts, shops }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmingDeleteIds, setConfirmingDeleteIds] = useState<number[] | null>(null);
    
    // --- VIRTUALIZATION STATE AND REFS ---
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    // NOTE: This height should be kept in sync with the CSS for table rows.
    // It's crucial for accurate virtualization calculations. A typical row with 12px padding is ~55px.
    const ROW_HEIGHT = 55;
    const OVERSCAN_COUNT = 5; // Render items above and below the viewport for smoother scrolling

    const filteredProducts = useMemo(() => {
        const filtered = searchTerm
            ? products.filter(p => {
                const lowercasedTerm = searchTerm.toLowerCase();
                return p.name.toLowerCase().includes(lowercasedTerm) ||
                    (p.nameTamil && p.nameTamil.includes(searchTerm)) ||
                    (p.barcode && p.barcode.toLowerCase().includes(lowercasedTerm)) ||
                    (p.category && p.category.toLowerCase().includes(lowercasedTerm)) ||
                    (p.subcategory && p.subcategory.toLowerCase().includes(lowercasedTerm));
            })
            : products;
        
        return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }, [products, searchTerm]);

    // --- VIRTUALIZATION LOGIC ---
    const handleScroll = useCallback(() => {
        if (containerRef.current) {
            setScrollTop(containerRef.current.scrollTop);
        }
    }, []);

    const {
        virtualItems,
        topPaddingHeight,
        bottomPaddingHeight,
        startIndex,
    } = useMemo(() => {
        const totalItems = filteredProducts.length;
        if (totalItems === 0) {
            return { virtualItems: [], topPaddingHeight: 0, bottomPaddingHeight: 0, startIndex: 0 };
        }
        
        const containerHeight = containerRef.current?.clientHeight || window.innerHeight * 0.75; // Fallback height

        const calculatedStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_COUNT);
        const visibleItemCount = Math.ceil(containerHeight / ROW_HEIGHT);
        const calculatedEndIndex = Math.min(totalItems - 1, calculatedStartIndex + visibleItemCount + (OVERSCAN_COUNT * 2));
        
        const virtualItems = filteredProducts.slice(calculatedStartIndex, calculatedEndIndex + 1);
        const topPaddingHeight = calculatedStartIndex * ROW_HEIGHT;
        const bottomPaddingHeight = (totalItems - (calculatedEndIndex + 1)) * ROW_HEIGHT;
        
        return { virtualItems, topPaddingHeight, bottomPaddingHeight, startIndex: calculatedStartIndex };
    }, [scrollTop, filteredProducts]);

    const handleSelectProduct = (productId: number) => {
        setSelectedProducts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(productId)) {
                newSet.delete(productId);
            } else {
                newSet.add(productId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const filteredIds = filteredProducts.map(p => p.id);
        if (e.target.checked) {
            setSelectedProducts(new Set(filteredIds));
        } else {
            setSelectedProducts(new Set());
        }
    };
    
    const areAllFilteredSelected = useMemo(() => {
        if (filteredProducts.length === 0) return false;
        return filteredProducts.every(p => selectedProducts.has(p.id));
    }, [filteredProducts, selectedProducts]);

    const handleDeleteClick = (productId: number) => {
        setConfirmingDeleteIds([productId]);
    };

    const handleDeleteSelectedClick = () => {
        if (selectedProducts.size > 0) {
            setConfirmingDeleteIds(Array.from(selectedProducts));
        }
    };

    const handleConfirmDelete = async () => {
        if (!confirmingDeleteIds) return;
        setIsDeleting(true);
        try {
            await onDeleteProducts(confirmingDeleteIds);
            setSelectedProducts(prev => {
                const newSet = new Set(prev);
                confirmingDeleteIds.forEach(id => newSet.delete(id));
                return newSet;
            });
        } catch (error) {
            alert(`Error deleting products: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsDeleting(false);
            setConfirmingDeleteIds(null);
        }
    };

    const handleExportPdf = () => {
        const doc = new jsPDF();
        const tableColumn = ["S.No", "Name (English)", "Name (Tamil)", "Category", "Subcategory", "B2B Price", "B2C Price", "Stock", "Barcode"];
        const tableRows: (string | number)[][] = [];

        filteredProducts.forEach((product, index) => {
            const productData = [
                index + 1,
                product.name,
                product.nameTamil || 'N/A',
                product.category || 'N/A',
                product.subcategory || 'N/A',
                formatCurrency(product.b2bPrice),
                formatCurrency(product.b2cPrice),
                product.stock,
                product.barcode || 'N/A'
            ];
            tableRows.push(productData);
        });

        doc.setFontSize(18);
        doc.text("Product Inventory List", 14, 22);
        
        const startX = 14;
        let y = 30;
        const colWidths = [10, 35, 35, 20, 20, 20, 20, 15, 30];

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        tableColumn.forEach((header, i) => {
            doc.text(header, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
        });
        y += 8;
        
        doc.setFont('helvetica', 'normal');
        tableRows.forEach(row => {
            if (y > 280) { // Page break
                doc.addPage();
                y = 20;
                doc.setFont('helvetica', 'bold');
                tableColumn.forEach((header, i) => {
                    doc.text(header, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
                });
                y += 8;
                doc.setFont('helvetica', 'normal');
            }
            row.forEach((cell, i) => {
                const text = String(cell);
                const splitText = doc.splitTextToSize(text, colWidths[i] - 5);
                 doc.text(splitText, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
            });
            y += 8;
        });
        
        doc.save('product_inventory.pdf');
    };

    return (
        <div className="page-container">
            <AddProductModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddProduct={onAddProduct} />
            <ImportProductsModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onBulkAdd={onBulkAddProducts} />
            <ConfirmationModal
                isOpen={!!confirmingDeleteIds}
                onClose={() => setConfirmingDeleteIds(null)}
                onConfirm={handleConfirmDelete}
                title="Confirm Deletion"
                message={`Are you sure you want to delete ${confirmingDeleteIds?.length} product(s)? This action cannot be undone.`}
                isConfirming={isDeleting}
                confirmText="Yes, Delete"
            />
            <div className="page-header">
                <h2 className="page-title">Product Inventory</h2>
                <div className="page-header-actions">
                    {selectedProducts.size > 0 && (
                        <button className="action-button-danger" onClick={handleDeleteSelectedClick} disabled={isDeleting}>
                            {isDeleting ? 'Deleting...' : `Delete Selected (${selectedProducts.size})`}
                        </button>
                    )}
                    <button className="action-button-secondary" onClick={() => setIsImportModalOpen(true)}>Import From Excel</button>
                    <button className="action-button-secondary" onClick={handleExportPdf}>Export as PDF</button>
                    <button className="action-button-primary" onClick={() => setIsAddModalOpen(true)}>Add New Product</button>
                </div>
            </div>
            <div className="inventory-controls">
                <div className="input-with-icon">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
                    <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Search by name, barcode, category..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value.replace(/\b\w/g, l => l.toUpperCase()))}
                    />
                </div>
            </div>
            <div className="inventory-layout">
                <div ref={containerRef} onScroll={handleScroll} className="inventory-list-container">
                     <table className="inventory-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" onChange={handleSelectAll} checked={areAllFilteredSelected} title="Select all filtered products" /></th>
                                <th>S.No</th>
                                <th>Name (English)</th>
                                <th>Name (Tamil)</th>
                                <th>Category</th>
                                <th>Subcategory</th>
                                <th>B2B Price</th>
                                <th>B2C Price</th>
                                <th>Stock</th>
                                <th>Barcode</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length === 0 ? (
                                <tr><td colSpan={11} data-label="Status" style={{ textAlign: 'center', padding: '2rem' }}>No products found.</td></tr>
                            ) : (
                                <>
                                    {topPaddingHeight > 0 && <tr style={{ height: topPaddingHeight }} />}
                                    {virtualItems.map((p, index) => (
                                        <tr key={p.id} className={p.stock < LOW_STOCK_THRESHOLD ? 'low-stock' : ''} style={{ height: `${ROW_HEIGHT}px` }}>
                                            <td><input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => handleSelectProduct(p.id)} /></td>
                                            <td data-label="S.No">{startIndex + index + 1}</td>
                                            <td data-label="Name (English)">{p.name}</td>
                                            <td data-label="Name (Tamil)">{p.nameTamil || 'N/A'}</td>
                                            <td data-label="Category">{p.category || 'N/A'}</td>
                                            <td data-label="Subcategory">{p.subcategory || 'N/A'}</td>
                                            <td data-label="B2B Price">{formatCurrency(p.b2bPrice)}</td>
                                            <td data-label="B2C Price">{formatCurrency(p.b2cPrice)}</td>
                                            <td data-label="Stock">{p.stock}</td>
                                            <td data-label="Barcode">{p.barcode || 'N/A'}</td>
                                            <td data-label="Actions">
                                                <div className="table-action-buttons">
                                                    <button className="action-button-danger" onClick={() => handleDeleteClick(p.id)} disabled={isDeleting}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {bottomPaddingHeight > 0 && <tr style={{ height: bottomPaddingHeight }} />}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- INVOICE PAGE COMPONENT (REBUILT) ---
type InvoicePageProps = {
    saleData: SaleData | null;
    onNavigate: (page: string) => void;
    isFinalized: boolean;
    onCompleteSale: () => Promise<void>;
    appearance: InvoiceAppearance;
    onAppearanceChange: (updater: (prev: InvoiceAppearance) => InvoiceAppearance) => void;
};

const InvoicePage: React.FC<InvoicePageProps> = ({ saleData, onNavigate, isFinalized, onCompleteSale, appearance, onAppearanceChange }) => {
    const [whatsAppNumber, setWhatsAppNumber] = useState('');
    const [isCompleting, setIsCompleting] = useState(false);
    const invoiceRef = useRef<HTMLDivElement>(null);
    const { fontStyle, margins, paperSize, fontSize, theme } = appearance;
    const invoiceFooter = "Thank you for your business!";

    useEffect(() => {
        if (saleData?.customerMobile) {
            setWhatsAppNumber(saleData.customerMobile);
        }
    }, [saleData]);

    const handlePrint = () => window.print();

    const handleSaveAsPdf = async () => {
        const input = invoiceRef.current;
        if (!input) return;
        const canvas = await html2canvas(input, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`invoice-${saleData?.id || Date.now()}.pdf`);
    };

    const handleSendWhatsApp = () => {
        if (!saleData || !whatsAppNumber) {
            alert('Please enter a mobile number.');
            return;
        }
        const { customerName, date, saleItems, subtotal, taxPercent, taxAmount, grandTotal, previousBalance, totalBalanceDue } = saleData;
        const regularItems = saleItems.filter(item => !item.isReturn);
        const returnedItems = saleItems.filter(item => item.isReturn);

        let message = `*Invoice from BillEase POS*\n\nCustomer: ${customerName || 'N/A'}\nDate: ${date.toLocaleString()}\n------------------------------------\n`;
        regularItems.forEach(item => { message += `${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatPriceForInvoice(item.price)}) = ${formatCurrency(item.quantity * item.price)}\n`; });
        if (returnedItems.length > 0) {
            message += `\n*Returned Items:*\n`;
            returnedItems.forEach(item => { message += `${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatPriceForInvoice(item.price)}) = -${formatCurrency(item.quantity * item.price)}\n`; });
        }
        message += `------------------------------------\n*Summary:*\nNet Total: ${formatCurrency(subtotal)}\n`;
        if (taxPercent > 0) message += `Tax (${taxPercent}%): ${formatNumberForInvoice(taxAmount)}\n`;
        message += `Grand Total: ${formatCurrency(grandTotal)}\n`;
        if (previousBalance !== 0) message += `Previous Balance: ${formatCurrency(previousBalance)}\n`;
        message += `*Total Balance Due: ${formatCurrency(totalBalanceDue)}*\n\n${invoiceFooter}`;
        const url = `https://api.whatsapp.com/send?phone=${whatsAppNumber.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleCompleteClick = async () => {
        if (isFinalized) return;
        setIsCompleting(true);
        try {
            await onCompleteSale();
        } finally {
            setIsCompleting(false);
        }
    };

    if (!saleData) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h2 className="page-title">Invoice Not Found</h2>
                </div>
                <p>No sale data is available to display. Please start a new sale.</p>
                <button onClick={() => onNavigate('New Sale')} className="action-button-primary" style={{ marginTop: 'var(--padding-md)', alignSelf: 'flex-start' }}>
                    ← Start New Sale
                </button>
            </div>
        );
    }
    
    const { grandTotal } = saleData;
    const invoiceThemes: {id: InvoiceTheme, name: string}[] = [
        { id: 'classic', name: 'Classic' },
        { id: 'modern', name: 'Modern' },
        { id: 'dark', name: 'Dark Mode' },
        { id: 'grid-pro', name: 'Grid Pro' },
        { id: 'bold-header', name: 'Bold Header' },
        { id: 'letterpress', name: 'Letterpress' },
        { id: 'corporate', name: 'Corporate' },
        { id: 'playful', name: 'Playful' },
    ];


    return (
        <div className="invoice-page-layout">
            <div className="invoice-preview-container">
                <div 
                    className={`invoice-paper theme-${theme} size-${paperSize} font-${fontSize} font-style-${fontStyle}`} 
                    ref={invoiceRef} 
                    style={{ padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px` }}
                >
                    <div className="invoice-header">
                        <h2>Invoice</h2>
                    </div>
                    <div className="invoice-dashed-line"></div>
                    <div className="invoice-details">
                        <p><strong>Date:</strong> {saleData.date.toLocaleString()}</p>
                    </div>
                    <div className="invoice-dashed-line"></div>
                    <table className="invoice-table-simple">
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {saleData.saleItems.filter(i => !i.isReturn).map((item, index) => (
                                <tr key={`sale-${index}`}>
                                    <td>{index + 1}</td>
                                    <td>{item.name}</td>
                                    <td>{formatQuantityForInvoice(item.quantity)}</td>
                                    <td>{formatPriceForInvoice(item.price)}</td>
                                    <td>{formatNumberForInvoice(item.quantity * item.price)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="invoice-dashed-line"></div>
                     <div className="invoice-total-summary">
                        <div className="total-row">
                            <span>Grand Total</span>
                            <span>{formatCurrency(grandTotal)}</span>
                        </div>
                    </div>
                    <div className="invoice-dashed-line"></div>
                    <div className="invoice-footer-message">
                        <p>{invoiceFooter}</p>
                    </div>
                </div>
            </div>

            <div className="invoice-controls-panel">
                <div className="controls-row">
                    <button onClick={handlePrint} className="action-button-teal">Print</button>
                    <button onClick={handleSaveAsPdf} className="action-button-teal">Save as PDF</button>
                    <div className="whatsapp-group">
                        <input type="tel" className="input-field" placeholder="WhatsApp Number" value={whatsAppNumber} onChange={e => setWhatsAppNumber(e.target.value)} />
                        <button onClick={handleSendWhatsApp} className="action-button-teal">Send</button>
                    </div>
                </div>
                <div className="controls-row">
                     <div className="form-group">
                        <label htmlFor="invoice-theme">Theme</label>
                        <select id="invoice-theme" value={theme} onChange={(e) => onAppearanceChange(prev => ({ ...prev, theme: e.target.value as InvoiceTheme }))} className="select-field">
                            {invoiceThemes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="paper-size">Paper Size</label>
                        <select id="paper-size" value={paperSize} onChange={(e) => onAppearanceChange(prev => ({ ...prev, paperSize: e.target.value as any }))} className="select-field"><option value="4inch">4 Inch</option><option value="a4">A4</option><option value="letter">Letter</option></select>
                    </div>
                     <div className="form-group">
                        <label htmlFor="font-size">Font Size</label>
                        <select id="font-size" value={fontSize} onChange={(e) => onAppearanceChange(prev => ({ ...prev, fontSize: e.target.value as any }))} className="select-field"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="font-style">Font Style</label>
                        <select id="font-style" value={fontStyle} onChange={(e) => onAppearanceChange(prev => ({ ...prev, fontStyle: e.target.value as InvoiceFontStyle }))} className="select-field">
                            <option value="sans-serif">Sans-Serif</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Monospace</option>
                        </select>
                    </div>
                     <div className="form-group">
                        <label>Margins (px)</label>
                        <div className="margin-controls">
                            <input type="number" title="Top" placeholder="T" className="input-field" value={margins.top} onChange={e => onAppearanceChange(prev => ({ ...prev, margins: { ...prev.margins, top: parseInt(e.target.value) || 0 } }))} />
                            <input type="number" title="Right" placeholder="R" className="input-field" value={margins.right} onChange={e => onAppearanceChange(prev => ({ ...prev, margins: { ...prev.margins, right: parseInt(e.target.value) || 0 } }))} />
                            <input type="number" placeholder="B" title="Bottom" className="input-field" value={margins.bottom} onChange={e => onAppearanceChange(prev => ({ ...prev, margins: { ...prev.margins, bottom: parseInt(e.target.value) || 0 } }))} />
                            <input type="number" placeholder="L" title="Left" className="input-field" value={margins.left} onChange={e => onAppearanceChange(prev => ({ ...prev, margins: { ...prev.margins, left: parseInt(e.target.value) || 0 } }))} />
                        </div>
                    </div>
                </div>
                <div className="controls-row final-actions">
                     <button onClick={() => onNavigate('New Sale')} className="action-button-secondary">
                        ← {isFinalized ? 'New Sale' : 'Back to Edit Sale'}
                    </button>
                    {isFinalized ? (
                        <div className="sale-recorded-badge">✓ Sale Recorded</div>
                    ) : (
                        <button className="action-button-green" onClick={handleCompleteClick} disabled={isCompleting}>
                            {isCompleting ? 'Completing...' : 'Complete Sale'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- SETTINGS PAGE COMPONENT ---
type SettingsPageProps = {
    currentTheme: Theme;
    onThemeChange: (theme: Theme) => void;
};

const SettingsPage: React.FC<SettingsPageProps> = ({ currentTheme, onThemeChange }) => {
    // Requested themes + others available in CSS
    const themes: Theme[] = ['light', 'dark', 'ocean-blue', 'forest-green', 'sunset-orange', 'monokai', 'nord', 'professional-light', 'charcoal', 'slate'];

    return (
        <div className="page-container">
            <div className="page-header">
                <h2 className="page-title">Settings</h2>
            </div>
            <div className="settings-layout">
                <div className="settings-card">
                    <h3>Appearance</h3>
                    <div className="form-group">
                        <label style={{ marginBottom: 'var(--padding-sm)', display: 'block' }}>Application Theme</label>
                        <div className="theme-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--padding-sm)' }}>
                            {themes.map(theme => (
                                <button
                                    key={theme}
                                    className={`toggle-button ${currentTheme === theme ? 'active' : ''}`}
                                    onClick={() => onThemeChange(theme)}
                                    style={{ 
                                        textTransform: 'capitalize', 
                                        padding: '12px',
                                        border: currentTheme === theme ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                        backgroundColor: currentTheme === theme ? 'var(--background-tertiary)' : 'transparent',
                                        color: currentTheme === theme ? 'var(--accent-primary)' : 'var(--text-primary)',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        borderRadius: 'var(--border-radius)'
                                    }}
                                >
                                    {theme.replace(/-/g, ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- APP COMPONENT ---
const App = () => {
  const [activePage, setActivePage] = useState('New Sale');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesHistory, setSalesHistory] = useState<SaleData[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [isFitToScreen, setIsFitToScreen] = useState(false);
  const [appTheme, setAppTheme] = useState<Theme>('light');
  const [invoiceAppearance, setInvoiceAppearance] = useState<InvoiceAppearance>({
      fontStyle: 'sans-serif',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      paperSize: 'a4',
      fontSize: 'medium',
      theme: 'modern',
  });
  // Session data for multiple bills (0, 1, 2)
  const [billSessions, setBillSessions] = useState<SaleSession[]>([
      { customerName: '', customerMobile: '', priceMode: 'B2C', languageMode: 'English', taxPercent: 0, discount: 0, saleItems: [], amountPaid: '' },
      { customerName: '', customerMobile: '', priceMode: 'B2C', languageMode: 'English', taxPercent: 0, discount: 0, saleItems: [], amountPaid: '' },
      { customerName: '', customerMobile: '', priceMode: 'B2C', languageMode: 'English', taxPercent: 0, discount: 0, saleItems: [], amountPaid: '' },
  ]);
  const [activeBillIndex, setActiveBillIndex] = useState(0);
  const [saleDataToPreview, setSaleDataToPreview] = useState<SaleData | null>(null);
  const [isSaleFinalized, setIsSaleFinalized] = useState(false);

  useEffect(() => {
      const initDB = async () => {
        await dbManager.open();

        // Initialize Shops
        let loadedShops = await dbManager.getAll<Shop>('shops');
        if (loadedShops.length === 0) {
            const mockShops = [{ id: 1, name: "Main Street Branch" }, { id: 2, name: "Downtown Kiosk" }];
            await dbManager.bulkPut('shops', mockShops);
            loadedShops = mockShops;
        }
        setShops(loadedShops);

        // Initialize Products
        let loadedProducts = await dbManager.getAll<Product>('products');
        if (loadedProducts.length === 0) {
            await dbManager.bulkPut('products', MOCK_PRODUCTS);
            loadedProducts = MOCK_PRODUCTS;
        }
        setProducts(loadedProducts);

        // Initialize Customers
        let loadedCustomers = await dbManager.getAll<Customer>('customers');
        if (loadedCustomers.length === 0) {
            await dbManager.bulkPut('customers', MOCK_CUSTOMERS);
            loadedCustomers = MOCK_CUSTOMERS;
        }
        setCustomers(loadedCustomers);

        // Initialize Sales
        let loadedSales = await dbManager.getAll<SaleData>('sales');
        if (loadedSales.length === 0) {
            await dbManager.bulkPut('sales', MOCK_SALES);
            loadedSales = MOCK_SALES;
        }
        setSalesHistory(loadedSales);

        // Auto-login mock
        setCurrentUser({ username: 'superadmin', role: 'super_admin', email: 'super@admin.com' });
        setSelectedShopId(1);
      };
      initDB();
  }, []);

  useEffect(() => {
      document.body.className = `theme-${appTheme}`;
  }, [appTheme]);

  const handleSessionUpdate = (updates: Partial<SaleSession>) => {
      setBillSessions(prev => {
          const newSessions = [...prev];
          newSessions[activeBillIndex] = { ...newSessions[activeBillIndex], ...updates };
          return newSessions;
      });
  };

  const handleNavigate = (page: string) => {
      setActivePage(page);
      if (page === 'New Sale') {
          setIsSaleFinalized(false);
          setSaleDataToPreview(null);
      }
  };

  const handlePreviewInvoice = (saleData: SaleData) => {
      setSaleDataToPreview(saleData);
      setActivePage('Invoice');
  };

  const handleCompleteSale = async () => {
      if (!saleDataToPreview) return;
      
      try {
        const finalizedSale = { ...saleDataToPreview };
        
        // 1. Save Sale to IndexedDB
        await dbManager.put('sales', finalizedSale);
        
        // 2. Update Product Stock in IndexedDB and State
        const updatedProducts = [...products];
        for (const item of finalizedSale.saleItems) {
             const productIndex = updatedProducts.findIndex(p => p.id === item.productId);
             if (productIndex > -1) {
                 const product = updatedProducts[productIndex];
                 const quantityChange = item.isReturn ? item.quantity : -item.quantity;
                 const newStock = product.stock + quantityChange;
                 const updatedProduct = { ...product, stock: newStock };
                 
                 updatedProducts[productIndex] = updatedProduct;
                 await dbManager.put('products', updatedProduct);
             }
        }
        setProducts(updatedProducts);

        // 3. Update Customer Balance in IndexedDB and State
        const updatedCustomers = [...customers];
        const customerIndex = updatedCustomers.findIndex(c => c.mobile === finalizedSale.customerMobile);
        let updatedCustomer: Customer;
        
        if (customerIndex > -1) {
            updatedCustomer = { ...updatedCustomers[customerIndex], balance: finalizedSale.totalBalanceDue };
            updatedCustomers[customerIndex] = updatedCustomer;
        } else {
            // New Customer
            updatedCustomer = {
                name: finalizedSale.customerName,
                mobile: finalizedSale.customerMobile,
                balance: finalizedSale.totalBalanceDue
            };
            updatedCustomers.push(updatedCustomer);
        }
        await dbManager.put('customers', updatedCustomer);
        setCustomers(updatedCustomers);

        // 4. Update Sales History State
        setSalesHistory(prev => [...prev, finalizedSale]);

        setIsSaleFinalized(true);
        // Reset current session
        handleSessionUpdate({
            customerName: '', customerMobile: '', saleItems: [], amountPaid: '',
            discount: 0, taxPercent: 0
        });
        
        alert("Sale Completed Successfully!");
      } catch (error) {
          console.error("Error completing sale:", error);
          alert("Failed to save sale. Please try again.");
      }
  };

  const renderPage = () => {
      switch (activePage) {
          case 'Dashboard':
              return (
                  <DashboardPage 
                      sales={salesHistory} 
                      customers={customers} 
                  />
              );
          case 'New Sale':
              return (
                  <NewSalePage 
                      products={products}
                      customers={customers}
                      salesHistory={salesHistory}
                      onPreviewInvoice={handlePreviewInvoice}
                      onViewInvoice={(sale) => { setSaleDataToPreview(sale); setIsSaleFinalized(true); setActivePage('Invoice'); }}
                      onAddProduct={async (p) => { 
                          const newP = { ...p, id: Date.now(), shopId: selectedShopId || 1 } as Product;
                          await dbManager.put('products', newP);
                          setProducts(prev => [...prev, newP]);
                          return newP;
                      }}
                      onUpdateProduct={async (p) => {
                           await dbManager.put('products', p);
                           setProducts(products.map(prod => prod.id === p.id ? p : prod));
                      }}
                      userRole={currentUser?.role || 'cashier'}
                      sessionData={billSessions[activeBillIndex]}
                      onSessionUpdate={handleSessionUpdate}
                      activeBillIndex={activeBillIndex}
                      onBillChange={setActiveBillIndex}
                      currentShopId={selectedShopId}
                      isFitToScreen={isFitToScreen}
                      setIsFitToScreen={setIsFitToScreen}
                  />
              );
          case 'Product Inventory':
              return (
                  <ProductInventoryPage
                      products={products}
                      onAddProduct={async (p) => {
                          const newP = { ...p, id: Date.now(), shopId: selectedShopId || 1 } as Product;
                          await dbManager.put('products', newP);
                          setProducts(prev => [...prev, newP]);
                          return newP;
                      }}
                      onBulkAddProducts={async (newProducts) => {
                          const productsWithIds = newProducts.map((p, i) => ({ ...p, id: Date.now() + i, shopId: selectedShopId || 1 } as Product));
                          await dbManager.bulkPut('products', productsWithIds);
                          setProducts(prev => [...prev, ...productsWithIds]);
                      }}
                      onDeleteProducts={async (ids) => {
                          await dbManager.bulkDelete('products', ids);
                          setProducts(prev => prev.filter(p => !ids.includes(p.id)));
                      }}
                      shops={shops}
                  />
              );
          case 'Invoice':
              return (
                  <InvoicePage 
                      saleData={saleDataToPreview}
                      onNavigate={handleNavigate}
                      isFinalized={isSaleFinalized}
                      onCompleteSale={handleCompleteSale}
                      appearance={invoiceAppearance}
                      onAppearanceChange={setInvoiceAppearance}
                  />
              );
          case 'Settings':
              return (
                  <SettingsPage 
                      currentTheme={appTheme} 
                      onThemeChange={setAppTheme}
                  />
              );
          default:
              return <div style={{padding: '2rem'}}>Page "{activePage}" is under construction.</div>;
      }
  };

  if (!currentUser) return <div className="login-container">Loading...</div>;

  return (
    <>
      <AppHeader 
          onNavigate={handleNavigate} 
          currentUser={currentUser} 
          onLogout={() => setCurrentUser(null)} 
          appName="BillEase POS"
          shops={shops}
          selectedShopId={selectedShopId}
          onShopChange={setSelectedShopId}
          syncStatus="synced"
          pendingSyncCount={0}
      />
      <div className="app-main">
          {renderPage()}
      </div>
    </>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}