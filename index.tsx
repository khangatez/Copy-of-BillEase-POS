
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { GoogleGenAI, Type } from "@google/genai";

declare var XLSX: any;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function translateToTamilTransliteration(text: string): Promise<string> {
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
type InvoiceTheme = 'professional' | 'modern' | 'classic' | 'minimalist';
type ViewMode = 'desktop' | 'mobile';


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
    { id: 5, shopId: 1, name: 'BLACK FRY PAN PLASTIC HANDLE', nameTamil: 'பிளாக் ஃப்ரை பேன் பிளாஸ்டிக் ஹேண்டில்', b2bPrice: 150, b2cPrice: 165, stock: 25, barcode: '5555', category: 'Kitchenware' },
];

const MOCK_SALES: SaleData[] = [
    { id: 'sale-1', shopId: 1, date: new Date(new Date().setDate(new Date().getDate() - 1)), customerName: 'Alice', customerMobile: '111', saleItems: [{ productId: 1, name: 'Apple', nameTamil: 'ஆப்பிள்', quantity: 5, price: 0.5, isReturn: false }], grossTotal: 2.5, returnTotal: 0, subtotal: 2.5, discount: 0, taxAmount: 0, taxPercent: 0, grandTotal: 2.5, languageMode: 'English', previousBalance: 0, amountPaid: 2.5, totalBalanceDue: 0 },
    { id: 'sale-2', shopId: 2, date: new Date(), customerName: 'Bob', customerMobile: '222', saleItems: [{ productId: 3, name: 'Bread', nameTamil: 'பிரெட்', quantity: 2, price: 2.5, isReturn: false }, { productId: 4, name: 'Coffee Beans', nameTamil: 'காபி பீன்ஸ்', quantity: 1, price: 10, isReturn: false }], grossTotal: 15, returnTotal: 0, subtotal: 15, discount: 0, taxAmount: 0.75, taxPercent: 5, grandTotal: 15.75, languageMode: 'English', previousBalance: 10, amountPaid: 25.75, totalBalanceDue: 0 },
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
    if(url.startsWith('/customers')) return [{ mobile: '+917601984346', name: 'Christy (from API)', balance: 50.75 }];
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

function fuzzyMatch(searchTerm: string, textToSearch: string): boolean {
    if (!searchTerm) return true;
    if (!textToSearch) return false;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    const lowerText = textToSearch.toLowerCase();
    let searchTermIndex = 0;

    for (let i = 0; i < lowerText.length && searchTermIndex < lowerSearchTerm.length; i++) {
        if (lowerText[i] === lowerSearchTerm[searchTermIndex]) {
            searchTermIndex++;
        }
    }

    return searchTermIndex === lowerSearchTerm.length;
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
                        <div className="form-group"><label htmlFor="modal-new-product-name">Product Name (English)</label><input id="modal-new-product-name" type="text" className="input-field" value={newProductName} onChange={e => setNewProductName(e.target.value)} onKeyDown={e => handleKeyDown(e, nameTamilRef)} required autoFocus/></div>
                        <div className="form-group"><label htmlFor="modal-new-product-name-tamil">Product Name (Tamil) {isTranslating && '(Translating...)'}</label><input ref={nameTamilRef} id="modal-new-product-name-tamil" type="text" className="input-field" value={newProductNameTamil} onChange={e => setNewProductNameTamil(e.target.value)} onKeyDown={e => handleKeyDown(e, b2bRef)} disabled={isTranslating} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-b2b">B2B Price</label><input ref={b2bRef} id="modal-new-product-b2b" type="number" step="0.01" className="input-field" value={newProductB2B} onChange={e => setNewProductB2B(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, b2cRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-b2c">B2C Price</label><input ref={b2cRef} id="modal-new-product-b2c" type="number" step="0.01" className="input-field" value={newProductB2C} onChange={e => setNewProductB2C(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, stockRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-stock">Initial Stock</label><input ref={stockRef} id="modal-new-product-stock" type="number" step="1" className="input-field" value={newProductStock} onChange={e => setNewProductStock(parseInt(e.target.value, 10) || 0)} onKeyDown={e => handleKeyDown(e, categoryRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-category">Category (Optional)</label><input ref={categoryRef} id="modal-new-product-category" type="text" className="input-field" value={newProductCategory} onChange={e => setNewProductCategory(e.target.value)} onKeyDown={e => handleKeyDown(e, subcategoryRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-subcategory">Subcategory (Optional)</label><input ref={subcategoryRef} id="modal-new-product-subcategory" type="text" className="input-field" value={newProductSubcategory} onChange={e => setNewProductSubcategory(e.target.value)} onKeyDown={e => handleKeyDown(e, barcodeRef)} /></div>
                        <div className="form-group"><label htmlFor="modal-new-product-barcode">Barcode (Optional)</label><input ref={barcodeRef} id="modal-new-product-barcode" type="text" className="input-field" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)} onKeyDown={e => handleKeyDown(e, submitRef)} /></div>
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

                        return {
                            name: String(name),
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
    onViewInvoice: (sale: SaleData) => void;
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
};

const NewSalePage: React.FC<NewSalePageProps> = ({ products, customers, salesHistory, onPreviewInvoice, onViewInvoice, onAddProduct, onUpdateProduct, userRole, sessionData, onSessionUpdate, activeBillIndex, onBillChange, currentShopId }) => {
    const { customerName, customerMobile, priceMode, languageMode, taxPercent, discount, saleItems, amountPaid } = sessionData;
    const [searchTerm, setSearchTerm] = useState('');
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
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            const filtered = products.filter(p => 
                fuzzyMatch(lowercasedTerm, p.name) || 
                (p.barcode && p.barcode.includes(lowercasedTerm))
            );
            setSuggestions(filtered);
            setShowAddNewSuggestion(filtered.length === 0 && !products.some(p => p.barcode === searchTerm));
        } else {
            setSuggestions([]); setShowAddNewSuggestion(false);
        }
        setActiveSuggestion(-1);
    }, [searchTerm, products]);
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
                const itemTop = activeItem.offsetTop;
                const itemBottom = itemTop + activeItem.offsetHeight;
                const containerVisibleTop = container.scrollTop;
                const containerVisibleBottom = container.scrollTop + container.clientHeight;

                if (itemTop < containerVisibleTop) {
                    // Item is hidden above, scroll to bring it to the top
                    container.scrollTop = itemTop;
                } else if (itemBottom > containerVisibleBottom) {
                    // Item is hidden below, scroll to bring it to the bottom
                    container.scrollTop = itemBottom - container.clientHeight;
                }
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
        const name = !isNaN(price) && parts.length > 1 ? parts.slice(0, -1).join(' ') : term;

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
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(prev => (prev < totalOptions - 1 ? prev + 1 : prev)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(prev => (prev > 0 ? prev - 1 : prev)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            let selectionIndex = activeSuggestion === -1 && totalOptions > 0 ? 0 : activeSuggestion;
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
        <div className="page-container new-sale-page">
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
                    <div className="customer-details-new">
                        <div className="form-group"><label htmlFor="customer-name">Customer Name</label><input id="customer-name" type="text" className="input-field" value={customerName} onChange={e => onSessionUpdate({ customerName: e.target.value })} onKeyDown={handleCustomerNameKeydown} /></div>
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
                                />
                            </div>
                        </div>
                        <div className="history-btn-container"><button className="action-button-secondary" onClick={() => setIsHistoryModalOpen(true)} disabled={!activeCustomer}>History</button></div>
                    </div>
                    <div className="product-search-container">
                        <div className="input-with-icons">
                            <input id="product-search" type="text" className="input-field" placeholder="Search for a product by name or barcode... or use the mic" ref={searchInputRef} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} autoComplete="off" />
                            <button onClick={handleVoiceSearch} className={`input-icon-button ${isListening ? 'voice-listening' : ''}`} aria-label="Search by voice"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg></button>
                            <button onClick={() => setIsScannerOpen(true)} className="input-icon-button" aria-label="Scan barcode"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2v14H3V5zm2 2v2H5V7h2zm4 0v2H9V7h2zm4 0v2h-2V7h2zm4 0v2h-2V7h2zM5 11h2v2H5v-2zm4 0h2v2H9v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"></path></svg></button>
                        </div>
                        {(suggestions.length > 0 || showAddNewSuggestion) && (
                            <div className="product-suggestions" ref={suggestionsContainerRef}>
                                {suggestions.map((p, i) => (<div key={p.id} className={`suggestion-item ${i === activeSuggestion ? 'active' : ''}`} onClick={() => handleProductSelect(p)} onMouseEnter={() => setActiveSuggestion(i)}>
                                    <span>{p.name}</span>
                                    <span className="suggestion-price">{formatCurrency(priceMode === 'B2B' ? p.b2bPrice : p.b2cPrice)}</span>
                                </div>))}
                                {showAddNewSuggestion && (
                                    <div
                                        className={`suggestion-item add-new-product-suggestion ${suggestions.length === activeSuggestion ? 'active' : ''}`}
                                        onClick={handleDirectAddProduct}
                                        onMouseEnter={() => setActiveSuggestion(suggestions.length)}
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
                                            onChange={e => handleItemUpdate(index, languageMode === 'Tamil' ? 'nameTamil' : 'name', e.target.value)}
                                            aria-label={`Description for item ${index + 1}`}
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
        
        // Sort alphabetically by product name for easier scanning
        return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }, [products, searchTerm]);

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
            setSelectedProducts(prev => new Set([...prev, ...filteredIds]));
        } else {
            setSelectedProducts(prev => {
                const newSet = new Set(prev);
                filteredIds.forEach(id => newSet.delete(id));
                return newSet;
            });
        }
    };
    
    const areAllFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.has(p.id));

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
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="inventory-layout">
                <div className="inventory-list-container">
                     <table className="inventory-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" onChange={handleSelectAll} checked={areAllFilteredSelected} title="Select all visible products" /></th>
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
                            {filteredProducts.length === 0 && (
                                <tr><td colSpan={11} data-label="Status" style={{ textAlign: 'center', padding: '2rem' }}>No products found.</td></tr>
                            )}
                            {filteredProducts.map((p, index) => (
                                <tr key={p.id} className={p.stock < LOW_STOCK_THRESHOLD ? 'low-stock' : ''}>
                                    <td><input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => handleSelectProduct(p.id)} /></td>
                                    <td data-label="S.No">{index + 1}</td>
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
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- INVOICE PAGE COMPONENT ---
type InvoicePageProps = {
    saleData: SaleData | null;
    onNavigate: (page: string) => void;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    isFinalized: boolean;
    onCompleteSale: () => Promise<void>;
    margins: { top: number; right: number; bottom: number; left: number };
    onMarginsChange: (margins: { top: number; right: number; bottom: number; left: number }) => void;
    offsets: { header: number; footer: number };
    onOffsetsChange: (offsets: { header: number; footer: number }) => void;
    fontStyle: InvoiceFontStyle;
    onFontStyleChange: (style: InvoiceFontStyle) => void;
    theme: InvoiceTheme;
    onThemeChange: (theme: InvoiceTheme) => void;
};
const InvoicePage: React.FC<InvoicePageProps> = ({ saleData, onNavigate, settings, onSettingsChange, isFinalized, onCompleteSale, margins, onMarginsChange, offsets, onOffsetsChange, fontStyle, onFontStyleChange, theme, onThemeChange }) => {
    const [paperSize, setPaperSize] = useState('4inch');
    const [fontSize, setFontSize] = useState('medium');
    const [whatsAppNumber, setWhatsAppNumber] = useState('');
    const invoiceRef = useRef<HTMLDivElement>(null);
    const [invoiceTitle, setInvoiceTitle] = useState('Invoice');
    const [isTitleEditing, setIsTitleEditing] = useState(false);
    const [isFooterEditing, setIsFooterEditing] = useState(false);
    const [isCompleting, setIsCompleting] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const footerInputRef = useRef<HTMLInputElement>(null);
    const { invoiceFooter } = settings;
    useEffect(() => { if (isTitleEditing && titleInputRef.current) titleInputRef.current.focus(); }, [isTitleEditing]);
    useEffect(() => { if (isFooterEditing && footerInputRef.current) footerInputRef.current.focus(); }, [isFooterEditing]);
    useEffect(() => { if (saleData?.customerMobile) setWhatsAppNumber(saleData.customerMobile); }, [saleData]);
    if (!saleData) return (<div className="page-container"><h2 className="page-title">Invoice</h2><p>No sale data available.</p><button onClick={() => onNavigate('New Sale')} className="action-button-primary">Back to Sale</button></div>);
    const { customerName, customerMobile, saleItems, subtotal, taxAmount, taxPercent, languageMode, grandTotal, previousBalance, totalBalanceDue, amountPaid, grossTotal, returnTotal, returnReason, paymentDetailsEntered } = saleData;
    const regularItems = saleItems.filter(item => !item.isReturn);
    const returnedItems = saleItems.filter(item => item.isReturn);
    const finalGrossTotal = grossTotal ?? regularItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const finalReturnTotal = returnTotal ?? returnedItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const handlePrint = () => window.print();
    const handleMarginChange = (side: keyof typeof margins, value: string) => onMarginsChange({ ...margins, [side]: parseInt(value, 10) || 0 });
    const handleOffsetChange = (type: keyof typeof offsets, value: string) => onOffsetsChange({ ...offsets, [type]: parseInt(value, 10) || 0 });
    const handleSaveAsPdf = async () => {
        const input = invoiceRef.current; if (!input) return;
        const canvas = await html2canvas(input, { scale: 2 }); const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height); pdf.save(`invoice-${saleData.id}.pdf`);
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
    const handleSendWhatsApp = () => {
        if (!whatsAppNumber) { alert('Please enter a mobile number.'); return; }
        let message = `*Invoice from BillEase POS*\n\nCustomer: ${customerName || 'N/A'}\nDate: ${saleData.date.toLocaleString()}\n\n*Items:*\n`;
        regularItems.forEach(item => { message += `- ${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatPriceForInvoice(item.price)}) = ${formatCurrency(item.quantity * item.price)}\n`; });
        if (returnedItems.length > 0) {
            message += `\n*Returned Items:*\n`;
            returnedItems.forEach(item => { message += `- ${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatPriceForInvoice(item.price)}) = -${formatCurrency(item.quantity * item.price)}\n`; });
        }
        message += `\n*Summary:*\nNet Total: ${formatCurrency(subtotal)}\n`;
        if (taxPercent > 0) message += `Tax (${taxPercent}%): ${formatNumberForInvoice(taxAmount)}\n`;
        message += `Grand Total: ${formatCurrency(grandTotal)}\n`;
        if (previousBalance !== 0) message += `Previous Balance: ${formatCurrency(previousBalance)}\n`;
        message += `*Total Balance Due: ${formatCurrency(totalBalanceDue)}*\n\n${invoiceFooter}`;
        const url = `https://api.whatsapp.com/send?phone=${whatsAppNumber.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };
    return (
        <div className="page-container invoice-page-container">
            <div className={`invoice-paper theme-${theme} size-${paperSize} font-${fontSize} font-style-${fontStyle}`} ref={invoiceRef} style={{ padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px` }}>
                <div className="printable-area">
                    <header className="invoice-header" style={{ transform: `translateY(${offsets.header}px)` }}>{isTitleEditing ? <input ref={titleInputRef} type="text" value={invoiceTitle} onChange={e => setInvoiceTitle(e.target.value)} onBlur={() => setIsTitleEditing(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setIsTitleEditing(false); }} className="invoice-title-input" /> : <h2 onDoubleClick={() => setIsTitleEditing(true)} title="Double-click to edit">{invoiceTitle}</h2>}</header>
                    <section className="invoice-customer">{(customerName || customerMobile) && (<><p><strong>Customer:</strong> {customerName || 'N/A'}</p><p><strong>Mobile:</strong> {customerMobile || 'N/A'}</p></>)}<p><strong>Date:</strong> {saleData.date.toLocaleString()}</p></section>
                    <table className="invoice-table"><thead><tr><th>{languageMode === 'English' ? 'S.No' : 'எண்'}</th><th>{languageMode === 'English' ? 'Item' : 'பொருள்'}</th><th>{languageMode === 'English' ? 'Qty' : 'அளவு'}</th><th>{languageMode === 'English' ? 'Price' : 'விலை'}</th><th>{languageMode === 'English' ? 'Total' : 'மொத்தம்'}</th></tr></thead><tbody>{regularItems.map((item, index) => (<tr key={index}><td>{index + 1}</td><td>{languageMode === 'Tamil' && item.nameTamil ? item.nameTamil : item.name}</td><td>{formatQuantityForInvoice(item.quantity)}</td><td>{formatPriceForInvoice(item.price)}</td><td>{formatPriceForInvoice(item.quantity * item.price)}</td></tr>))}</tbody></table>
                    {regularItems.length > 0 && (<div className="total-row invoice-section-total"><span>{languageMode === 'English' ? 'Gross Total' : 'மொத்த விற்பனை'}</span><span>{formatNumberForInvoice(finalGrossTotal)}</span></div>)}
                    {returnedItems.length > 0 && (<><h3 className="invoice-section-header">{languageMode === 'English' ? 'Return Items' : 'திரும்பிய பொருட்கள்'}</h3><table className="invoice-table"><tbody>{returnedItems.map((item, index) => (<tr key={index} className="is-return"><td>{index + 1}</td><td>{languageMode === 'Tamil' && item.nameTamil ? item.nameTamil : item.name}</td><td>{formatQuantityForInvoice(item.quantity)}</td><td>{formatPriceForInvoice(item.price)}</td><td className="return-amount">-{formatPriceForInvoice(item.quantity * item.price)}</td></tr>))}</tbody></table><div className="total-row return-total-row invoice-section-total"><span>{languageMode === 'English' ? 'Return Total' : 'திரும்பிய மொத்தம்'}</span><span className="return-amount">-{formatNumberForInvoice(finalReturnTotal)}</span></div>{returnReason && <p className="invoice-return-reason"><strong>Reason:</strong> {returnReason}</p>}</>)}
                    <footer className="invoice-footer" style={{ transform: `translateY(${offsets.footer}px)` }}><div className="invoice-totals">{taxPercent > 0 && (<div className="total-row"><span>{languageMode === 'English' ? `Tax (${taxPercent}%)` : `வரி (${taxPercent}%)`}</span><span>{formatNumberForInvoice(taxAmount)}</span></div>)}<div className="total-row grand-total"><span>{languageMode === 'English' ? 'Grand Total' : 'மொத்தத் தொகை'}</span><span>{formatCurrency(grandTotal)}</span></div>
                    <div className="balance-summary">
                        {previousBalance !== 0 && (
                            <div className="total-row"><span>{languageMode === 'English' ? 'Previous Balance' : 'முந்தைய இருப்பு'}</span><span>{formatCurrency(previousBalance)}</span></div>
                        )}
                        {paymentDetailsEntered && amountPaid !== grandTotal && (
                            <div className="total-row"><span>{languageMode === 'English' ? 'Amount Paid' : 'செலுத்திய தொகை'}</span><span>{formatCurrency(amountPaid)}</span></div>
                        )}
                        {paymentDetailsEntered && totalBalanceDue > 0 && (
                            <div className="total-row grand-total">
                                <span>{languageMode === 'English' ? 'Total Balance Due' : 'மொத்த நிலுவை'}</span>
                                <span>{formatCurrency(totalBalanceDue)}</span>
                            </div>
                        )}
                    </div>
                    </div>{invoiceFooter && (isFooterEditing ? <input ref={footerInputRef} type="text" value={invoiceFooter} onChange={e => onSettingsChange({ ...settings, invoiceFooter: e.target.value })} onBlur={() => setIsFooterEditing(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setIsFooterEditing(false); }} className="invoice-footer-input" /> : <p className="invoice-custom-footer" onDoubleClick={() => setIsFooterEditing(true)} title="Double-click to edit">{invoiceFooter}</p>)}</footer>
                </div>
            </div>
            <div className="invoice-actions">
                <div className="invoice-main-actions-container">
                    <div className="invoice-main-actions">
                        <button onClick={handlePrint} className="action-button-primary">Print</button>
                        <button onClick={handleSaveAsPdf} className="action-button-primary">Save as PDF</button>
                        <div className="whatsapp-group">
                            <input type="tel" className="input-field" placeholder="WhatsApp Number" value={whatsAppNumber} onChange={e => setWhatsAppNumber(e.target.value)} />
                            <button onClick={handleSendWhatsApp} className="action-button-primary">Send</button>
                        </div>
                    </div>
                    <div className="finalize-actions-group">
                        {isFinalized ? (
                            <button className="finalize-button" disabled>Sale Recorded ✓</button>
                        ) : (
                            <button className="finalize-button" onClick={handleCompleteClick} disabled={isCompleting}>
                                {isCompleting ? 'Completing...' : 'Complete Sale'}
                            </button>
                        )}
                        <button onClick={() => onNavigate('New Sale')} className="action-button-secondary">
                            {isFinalized ? 'New Sale' : 'Back to Edit Sale'}
                        </button>
                    </div>
                </div>
                <div className="invoice-controls">
                    <div className="form-group"><label htmlFor="paper-size">Paper Size</label><select id="paper-size" value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="select-field"><option value="4inch">4 Inch</option><option value="a4">A4</option><option value="letter">Letter</option></select></div>
                    <div className="form-group"><label htmlFor="font-size">Font Size</label><select id="font-size" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="select-field"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div>
                    <div className="form-group">
                        <label htmlFor="invoice-theme">Theme</label>
                        <select id="invoice-theme" value={theme} onChange={(e) => onThemeChange(e.target.value as InvoiceTheme)} className="select-field">
                            <option value="professional">Professional</option>
                            <option value="modern">Modern</option>
                            <option value="classic">Classic</option>
                            <option value="minimalist">Minimalist</option>
                        </select>
                    </div>
                    <div className="form-group"><label htmlFor="font-style">Font Style</label><select id="font-style" value={fontStyle} onChange={(e) => onFontStyleChange(e.target.value as InvoiceFontStyle)} className="select-field"><option value="monospace">Monospace</option><option value="sans-serif">Sans-Serif</option><option value="serif">Serif</option><option value="inconsolata">Inconsolata</option><option value="roboto">Roboto</option><option value="merriweather">Merriweather</option><option value="playfair">Playfair Display</option></select></div>
                    <div className="margin-controls"><label>Margins (px)</label><input type="number" title="Top" className="input-field" value={margins.top} onChange={e => handleMarginChange('top', e.target.value)} /><input type="number" title="Right" className="input-field" value={margins.right} onChange={e => handleMarginChange('right', e.target.value)} /><input type="number" title="Bottom" className="input-field" value={margins.bottom} onChange={e => handleMarginChange('bottom', e.target.value)} /><input type="number" title="Left" className="input-field" value={margins.left} onChange={e => handleMarginChange('left', e.target.value)} /></div>
                    <div className="offset-controls"><label>Offsets (px)</label><input type="number" title="Header Y" className="input-field" value={offsets.header} onChange={e => handleOffsetChange('header', e.target.value)} /><input type="number" title="Footer Y" className="input-field" value={offsets.footer} onChange={e => handleOffsetChange('footer', e.target.value)} /></div>
                </div>
            </div>
        </div>
    );
};


// --- NOTES PAGE COMPONENT ---
type NotesPageProps = { notes: Note[]; setNotes: React.Dispatch<React.SetStateAction<Note[]>>; };
const NotesPage: React.FC<NotesPageProps> = ({ notes, setNotes }) => {
    const [newNote, setNewNote] = useState(''); const nextNoteId = useRef(Math.max(0, ...notes.map(n => n.id)) + 1);
    const handleAddNote = (e: React.FormEvent) => { e.preventDefault(); if (!newNote.trim()) return; setNotes(prev => [...prev, { id: nextNoteId.current++, text: newNote, completed: false }]); setNewNote(''); };
    const toggleNote = (id: number) => setNotes(prev => prev.map(note => note.id === id ? { ...note, completed: !note.completed } : note));
    const deleteNote = (id: number) => setNotes(prev => prev.filter(note => note.id !== id));
    return (<div className="page-container"><h2 className="page-title">Notes & To-Do</h2><div className="notes-page-layout"><form onSubmit={handleAddNote} className="add-note-form"><input type="text" className="input-field" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a new note..." /><button type="submit" className="action-button-primary">Add</button></form><ul className="notes-list">{notes.map(note => (<li key={note.id} className={`note-item ${note.completed ? 'completed' : ''}`}><input type="checkbox" checked={note.completed} onChange={() => toggleNote(note.id)} /><span className="note-text">{note.text}</span><button onClick={() => deleteNote(note.id)} className="action-button">&times;</button></li>))}</ul></div></div>);
};

// --- ADD CUSTOMER MODAL ---
type AddCustomerModalProps = { isOpen: boolean; onClose: () => void; onAddCustomer: (newCustomer: Omit<Customer, 'balance'>) => Promise<void>; };
const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, onAddCustomer }) => {
    const [name, setName] = useState(''); const [mobile, setMobile] = useState(''); const [isAdding, setIsAdding] = useState(false);
    const mobileRef = useRef<HTMLInputElement>(null); const submitRef = useRef<HTMLButtonElement>(null); const formId = "add-customer-form";
    useEffect(() => { if (isOpen) { setName(''); setMobile(''); setIsAdding(false); } }, [isOpen]);
    if (!isOpen) return null;
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); if (!name || !mobile) return; setIsAdding(true);
        try { await onAddCustomer({ name, mobile }); onClose(); }
        catch (error) { alert(`Error adding customer: ${error instanceof Error ? error.message : String(error)}`); }
        finally { setIsAdding(false); }
    };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextRef: React.RefObject<HTMLElement>) => { if (e.key === 'Enter') { e.preventDefault(); nextRef.current?.focus(); } };
    return (<div className="modal-overlay" onClick={onClose}><div className="modal-content" onClick={e => e.stopPropagation()}><div className="modal-header"><h3>Add New Customer</h3><button onClick={onClose} className="close-button">&times;</button></div><div className="modal-body"><form id={formId} onSubmit={handleSubmit} className="add-product-form"><div className="form-group"><label htmlFor="modal-new-customer-name">Customer Name</label><input id="modal-new-customer-name" type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => handleKeyDown(e, mobileRef)} required autoFocus /></div><div className="form-group"><label htmlFor="modal-new-customer-mobile">Mobile Number</label><input ref={mobileRef} id="modal-new-customer-mobile" type="text" className="input-field" value={mobile} onChange={e => setMobile(e.target.value)} onKeyDown={e => handleKeyDown(e, submitRef)} required /></div></form></div><div className="modal-footer"><button className="action-button-secondary" type="button" onClick={onClose} disabled={isAdding}>Cancel</button><button ref={submitRef} type="submit" form={formId} className="action-button-primary" disabled={isAdding}>{isAdding ? 'Adding...' : 'Add Customer'}</button></div></div></div>);
};

// --- CUSTOMER MANAGEMENT PAGE ---
type CustomerManagementPageProps = { customers: Customer[]; onAddCustomer: (newCustomer: Omit<Customer, 'balance'>) => Promise<void>; };
const CustomerManagementPage: React.FC<CustomerManagementPageProps> = ({ customers, onAddCustomer }) => {
    const [searchTerm, setSearchTerm] = useState(''); const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null); const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const filteredCustomers = useMemo(() => { const lower = searchTerm.toLowerCase(); if (!lower) return customers; return customers.filter(c => c.name.toLowerCase().includes(lower) || c.mobile.includes(lower)); }, [searchTerm, customers]);
    useEffect(() => { if (selectedCustomer && !customers.find(c => c.mobile === selectedCustomer.mobile)) setSelectedCustomer(null); }, [customers, selectedCustomer]);
    return (<div className="page-container customer-management-page"><AddCustomerModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddCustomer={onAddCustomer} /><div className="page-header"><h2 className="page-title">Customer Management</h2><div className="page-header-actions"><button className="action-button-primary" onClick={() => setIsAddModalOpen(true)}>Add New Customer</button></div></div><div className="customer-management-layout"><aside className="customer-list-panel"><div className="customer-search"><div className="input-with-icon"><svg className="search-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg><input type="text" className="input-field" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div></div><div className="customer-list">{filteredCustomers.map(c => (<button key={c.mobile} className={`customer-list-item ${selectedCustomer?.mobile === c.mobile ? 'active' : ''}`} onClick={() => setSelectedCustomer(c)}><span className="customer-name">{c.name}</span><span className="customer-mobile">{c.mobile}</span></button>))}{filteredCustomers.length === 0 && (<div className="customer-list-empty"><p>No customers found.</p></div>)}</div></aside><main className="customer-details-panel">{selectedCustomer ? (<div className="customer-details-view"><h3>{selectedCustomer.name}</h3><p><strong>Mobile:</strong> {selectedCustomer.mobile}</p><p><strong>Balance Due:</strong> {formatCurrency(selectedCustomer.balance)}</p><div className="purchase-history-placeholder"><h4>Purchase History</h4><p>Purchase history will be displayed here.</p></div></div>) : (<div className="customer-details-placeholder"><p>Select a customer to view details.</p></div>)}</main></div></div>);
};


// --- BALANCE DUE PAGE ---
type BalanceDuePageProps = { customersWithBalance: Customer[]; };
const BalanceDuePage: React.FC<BalanceDuePageProps> = ({ customersWithBalance }) => {
    return (<div className="page-container"><h2 className="page-title">Balance Due Customers</h2><div className="inventory-list-container"><table className="customer-table inventory-table"><thead><tr><th>Customer Name</th><th>Mobile Number</th><th>Balance Due</th></tr></thead><tbody>{customersWithBalance.length === 0 && (<tr><td colSpan={3} data-label="Status" style={{ textAlign: 'center', padding: '2rem' }}>No customers with outstanding balance.</td></tr>)}{customersWithBalance.sort((a,b) => b.balance - a.balance).map(c => (<tr key={c.mobile}><td data-label="Customer Name">{c.name}</td><td data-label="Mobile Number">{c.mobile}</td><td data-label="Balance Due">{formatCurrency(c.balance)}</td></tr>))}</tbody></table></div></div>);
};


// --- EXPENSES PAGE COMPONENT ---
type ExpensesPageProps = {
    expenses: Expense[];
    onAddExpense: (description: string, amount: number) => Promise<void>;
    shops: Shop[];
};
const ExpensesPage: React.FC<ExpensesPageProps> = ({ expenses, onAddExpense, shops }) => {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numericAmount = parseFloat(amount);
        if (!description.trim() || isNaN(numericAmount) || numericAmount <= 0) {
            alert('Please enter a valid description and a positive amount.');
            return;
        }
        setIsAdding(true);
        try {
            await onAddExpense(description, numericAmount);
            setDescription('');
            setAmount('');
        } catch (error) {
            alert(`Error adding expense: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="page-container expenses-page">
            <h2 className="page-title">Daily Expenses</h2>
            <div className="management-card">
                <h3>Add New Expense</h3>
                <form onSubmit={handleSubmit} className="add-expense-form">
                    <div className="form-group">
                        <label htmlFor="expense-desc">Description</label>
                        <input id="expense-desc" type="text" className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g., Office Supplies, Rent" required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="expense-amount">Amount</label>
                        <input id="expense-amount" type="number" step="0.01" className="input-field" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
                    </div>
                    <button type="submit" className="action-button-primary" disabled={isAdding}>{isAdding ? 'Adding...' : 'Add Expense'}</button>
                </form>
            </div>
            <div className="inventory-list-container">
                 <h3>Expense History</h3>
                 <table className="inventory-table expenses-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Shop</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.length === 0 && (<tr><td colSpan={4} data-label="Status" style={{textAlign: 'center', padding: '2rem'}}>No expenses recorded.</td></tr>)}
                        {expenses.map(expense => (
                            <tr key={expense.id}>
                                <td data-label="Date">{new Date(expense.date).toLocaleString()}</td>
                                <td data-label="Description">{expense.description}</td>
                                <td data-label="Shop">{shops.find(s => s.id === expense.shopId)?.name || 'N/A'}</td>
                                <td data-label="Amount">{formatCurrency(expense.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- SETTINGS PAGE COMPONENT ---
type SettingsPageProps = { theme: Theme; onThemeChange: (theme: Theme) => void; settings: AppSettings; onSettingsChange: (settings: AppSettings) => void; appName: string; onAppNameChange: (name: string) => void; };
const SettingsPage: React.FC<SettingsPageProps> = ({ theme, onThemeChange, settings, onSettingsChange, appName, onAppNameChange }) => {
    const themes: {id: Theme, name: string}[] = [{id: 'light', name: 'Light'},{id: 'dark', name: 'Dark'},{id: 'professional-light', name: 'Professional'},{id: 'charcoal', name: 'Charcoal'},{id: 'slate', name: 'Slate'},{id: 'ocean-blue', name: 'Ocean Blue'},{id: 'forest-green', name: 'Forest Green'},{id: 'sunset-orange', name: 'Sunset Orange'},{id: 'monokai', name: 'Monokai'},{id: 'nord', name: 'Nord'}];
    return (<div className="page-container"><h2 className="page-title">Settings</h2><div className="settings-layout"><div className="settings-card"><h3>General</h3><div className="form-group"><label htmlFor="app-name">POS Name</label><input id="app-name" type="text" className="input-field" value={appName} onChange={e => onAppNameChange(e.target.value)} /></div></div><div className="settings-card"><h3>Interface Theme</h3><div className="toggle-group"><label>Theme</label><div className="toggle-switch theme-selector">{themes.map(t => (<button key={t.id} className={`toggle-button ${theme === t.id ? 'active' : ''}`} onClick={() => onThemeChange(t.id)}>{t.name}</button>))}</div></div></div><div className="settings-card"><h3>Invoice Customization</h3><div className="form-group"><label htmlFor="invoice-footer">Invoice Footer Text</label><textarea id="invoice-footer" className="input-field" rows={3} value={settings.invoiceFooter} onChange={e => onSettingsChange({ ...settings, invoiceFooter: e.target.value })}></textarea></div></div></div></div>);
};

// --- SHOP MANAGEMENT PAGE ---
type ShopManagementPageProps = { users: User[]; shops: Shop[]; onAddShop: (name: string) => Promise<void>; onAddUser: (user: Omit<User, 'password' | 'resetToken' | 'resetTokenExpiry'> & { password?: string }) => Promise<void>; onUpdateShop: (id: number, name: string) => void; onAdminPasswordReset: (username: string, newPass: string) => Promise<void>;};
const ShopManagementPage: React.FC<ShopManagementPageProps> = ({ users, shops, onAddShop, onAddUser, onUpdateShop, onAdminPasswordReset }) => {
    const [newShopName, setNewShopName] = useState(''); const [newUsername, setNewUsername] = useState(''); const [newEmail, setNewEmail] = useState(''); const [newPassword, setNewPassword] = useState(''); const [newUserRole, setNewUserRole] = useState<'admin' | 'cashier'>('cashier'); const [newUserShopId, setNewUserShopId] = useState<number | undefined>(shops[0]?.id); const [editingShopId, setEditingShopId] = useState<number | null>(null); const [editingShopName, setEditingShopName] = useState('');
    const handleAddShop = async (e: React.FormEvent) => { e.preventDefault(); if (newShopName.trim()) { try { await onAddShop(newShopName.trim()); setNewShopName(''); } catch (error) { alert(`Error: ${error instanceof Error ? error.message : String(error)}`); } } };
    const handleAddUser = async (e: React.FormEvent) => { e.preventDefault(); if (newUsername.trim() && newPassword.trim() && newUserShopId) { try { await onAddUser({ username: newUsername.trim(), email: newEmail.trim(), password: newPassword.trim(), role: newUserRole, shopId: newUserShopId, }); setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewUserRole('cashier'); setNewUserShopId(shops[0]?.id); } catch (error) { alert(`Error: ${error instanceof Error ? error.message : String(error)}`); } } };
    const handleStartEdit = (shop: Shop) => { setEditingShopId(shop.id); setEditingShopName(shop.name); }; const handleCancelEdit = () => { setEditingShopId(null); setEditingShopName(''); }
    const handleSaveEdit = (id: number) => { if (editingShopName.trim()) { onUpdateShop(id, editingShopName.trim()); handleCancelEdit(); } }
    const handleResetPasswordClick = (username: string) => { const newPass = prompt(`Enter new password for user '${username}':`); if (newPass && newPass.trim()) { onAdminPasswordReset(username, newPass.trim()); } else if (newPass !== null) { alert('Password cannot be empty.'); } };
    return (<div className="page-container page-container-full-width"><h2 className="page-title">User & Shop Management</h2><div className="shop-management-layout"><div className="management-card"><h3>Manage Shops</h3><form onSubmit={handleAddShop}><div className="form-group"><label htmlFor="new-shop-name">New Shop Name</label><input id="new-shop-name" type="text" className="input-field" value={newShopName} onChange={e => setNewShopName(e.target.value)} placeholder="e.g., Downtown Branch" /></div><button type="submit" className="action-button-primary">Add Shop</button></form><div className="shop-list-container"><h4>Existing Shops</h4><ul className="shop-list">{shops.map(shop => (<li key={shop.id} className="shop-list-item">{editingShopId === shop.id ? (<div className="edit-shop-form"><input type="text" className="input-field" value={editingShopName} onChange={(e) => setEditingShopName(e.target.value)} /><div className="edit-shop-actions"><button className="action-button-secondary" onClick={handleCancelEdit}>Cancel</button><button className="action-button-primary" onClick={() => handleSaveEdit(shop.id)}>Save</button></div></div>) : (<><span>{shop.name}</span><button className="action-button-secondary" onClick={() => handleStartEdit(shop)}>Edit</button></>)}</li>))}</ul></div></div><div className="management-card"><h3>Manage Users</h3><form onSubmit={handleAddUser}><div className="form-group"><label htmlFor="new-username">Username</label><input id="new-username" type="text" className="input-field" value={newUsername} onChange={e => setNewUsername(e.target.value)} required /></div><div className="form-group"><label htmlFor="new-email">Email</label><input id="new-email" type="email" className="input-field" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div><div className="form-group"><label htmlFor="new-password">Password</label><input id="new-password" type="text" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></div><div className="form-group"><label htmlFor="new-user-role">Role</label><select id="new-user-role" className="select-field" value={newUserRole} onChange={e => setNewUserRole(e.target.value as 'admin' | 'cashier')}><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div><div className="form-group"><label htmlFor="new-user-shop">Shop</label><select id="new-user-shop" className="select-field" value={newUserShopId} onChange={e => setNewUserShopId(Number(e.target.value))} required>{shops.map(shop => (<option key={shop.id} value={shop.id}>{shop.name}</option>))}</select></div><button type="submit" className="action-button-primary">Add User</button></form><div className="user-list-container"><table className="inventory-table"><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Shop</th><th>Actions</th></tr></thead><tbody>{users.filter(u => u.role !== 'super_admin').map(user => (<tr key={user.username}><td data-label="Username">{user.username}</td><td data-label="Email">{user.email || 'N/A'}</td><td data-label="Role">{user.role}</td><td data-label="Shop">{shops.find(s => s.id === user.shopId)?.name || 'N/A'}</td><td data-label="Actions"><button className="action-button-secondary" onClick={() => handleResetPasswordClick(user.username)}>Reset Password</button></td></tr>))}</tbody></table></div></div></div></div>);
};

// --- BAR CHART COMPONENT ---
interface ChartDataItem { label: string; value: number; }
type BarChartProps = {
    data: ChartDataItem[];
    title: string;
};
const BarChart: React.FC<BarChartProps> = ({ data, title }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 280 });

    useEffect(() => {
        if (containerRef.current) {
            const resizeObserver = new ResizeObserver(entries => {
                if (entries[0]) {
                    setDimensions({ width: entries[0].contentRect.width, height: 280 });
                }
            });
            resizeObserver.observe(containerRef.current);
            return () => resizeObserver.disconnect();
        }
    }, []);

    if (!data || data.length === 0) {
        return (
            <div className="chart-container" ref={containerRef}>
                <h3 className="chart-title">{title}</h3>
                <div className="chart-placeholder">No data available for this period.</div>
            </div>
        );
    }
    
    const { width, height } = dimensions;
    const padding = { top: 20, right: 20, bottom: 60, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxValue = Math.max(...data.map(d => d.value), 0);
    const yScale = chartHeight / (maxValue === 0 ? 1 : maxValue);
    const barWidth = chartWidth / data.length * 0.8;
    const barGap = chartWidth / data.length * 0.2;

    const handleMouseOver = (e: React.MouseEvent, item: ChartDataItem) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const svgRect = svgRef.current?.getBoundingClientRect();
        if(!svgRect) return;
        setTooltip({
            content: `${item.label}: ${formatCurrency(item.value)}`,
            x: rect.left - svgRect.left + rect.width / 2,
            y: rect.top - svgRect.top - 10,
        });
    };

    const handleMouseOut = () => setTooltip(null);
    
    const yAxisTicks = useMemo(() => {
        if (maxValue === 0) return [0];
        const tickCount = 5;
        const ticks = [];
        for (let i = 0; i <= tickCount; i++) {
            ticks.push((maxValue / tickCount) * i);
        }
        return ticks;
    }, [maxValue]);


    return (
        <div className="chart-container" ref={containerRef}>
            <h3 className="chart-title">{title}</h3>
            <div className="chart-wrapper">
                <svg ref={svgRef} width={width} height={height}>
                    {/* Y-Axis */}
                    <g className="y-axis">
                        {yAxisTicks.map((tick, i) => (
                            <g key={i} transform={`translate(0, ${padding.top + chartHeight - tick * yScale})`}>
                                <line x1={padding.left - 5} y1="0" x2={padding.left} y2="0" stroke="currentColor" />
                                <text x={padding.left - 10} y="0" dy="0.32em" textAnchor="end">{tick > 1000 ? `${(tick/1000).toFixed(1)}k` : tick.toFixed(0)}</text>
                                <line x1={padding.left} y1="0" x2={width - padding.right} y2="0" stroke="currentColor" strokeDasharray="2,2" opacity="0.2" />
                            </g>
                        ))}
                    </g>

                    {/* Bars and X-Axis Labels */}
                    {data.map((item, index) => {
                        const barHeight = item.value * yScale;
                        const x = padding.left + index * (barWidth + barGap);
                        const y = padding.top + chartHeight - barHeight;
                        return (
                            <g key={index}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={barHeight}
                                    className="chart-bar"
                                    onMouseOver={(e) => handleMouseOver(e, item)}
                                    onMouseOut={handleMouseOut}
                                />
                                <text
                                    x={x + barWidth / 2}
                                    y={padding.top + chartHeight + 15}
                                    className="x-axis-label"
                                    textAnchor="middle"
                                >
                                    {item.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
                {tooltip && (
                    <div className="chart-tooltip" style={{ transform: `translate(${tooltip.x}px, ${tooltip.y}px)` }}>
                        {tooltip.content}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- DASHBOARD & REPORTS PAGE ---
type DashboardAndReportsPageProps = {
    salesHistory: SaleData[];
    products: Product[];
    shops: Shop[];
    onViewInvoice: (sale: SaleData) => void;
};

const DashboardAndReportsPage: React.FC<DashboardAndReportsPageProps> = ({ salesHistory, products, onViewInvoice }) => {
    const [filterPeriod, setFilterPeriod] = useState<'7days' | '30days' | 'all'>('7days');

    const filteredSales = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        if (filterPeriod === 'all') return salesHistory;

        const days = filterPeriod === '7days' ? 7 : 30;
        const startDate = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

        return salesHistory.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= startDate;
        });
    }, [salesHistory, filterPeriod]);

    const { stats, salesOverTime, topProducts, salesByCategory } = useMemo(() => {
        const totalSales = filteredSales.reduce((acc, sale) => acc + sale.grandTotal, 0);
        const transactionCount = filteredSales.length;
        const avgSaleValue = transactionCount > 0 ? totalSales / transactionCount : 0;
        
        // Sales over time
        const salesByDate: { [key: string]: number } = {};
        filteredSales.forEach(sale => {
            const dateStr = new Date(sale.date).toLocaleDateString('en-CA'); // YYYY-MM-DD
            salesByDate[dateStr] = (salesByDate[dateStr] || 0) + sale.grandTotal;
        });
        const salesOverTimeData = Object.entries(salesByDate)
          .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
          .map(([date, total]) => ({ label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: total }));

        // Top selling products
        const productSales = new Map<string, { value: number }>();
        filteredSales.forEach(sale => {
            sale.saleItems.forEach(item => {
                if (!item.isReturn) {
                    const existing = productSales.get(item.name) || { value: 0 };
                    existing.value += item.quantity * item.price;
                    productSales.set(item.name, existing);
                }
            });
        });
        const topProductsData = [...productSales.entries()]
            .map(([label, { value }]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        // Sales by category
        const categorySales = new Map<string, { value: number }>();
        filteredSales.forEach(sale => {
            sale.saleItems.forEach(item => {
                if (!item.isReturn) {
                    const product = products.find(p => p.id === item.productId);
                    const category = product?.category || 'Uncategorized';
                    const existing = categorySales.get(category) || { value: 0 };
                    existing.value += item.quantity * item.price;
                    categorySales.set(category, existing);
                }
            });
        });
        const salesByCategoryData = [...categorySales.entries()]
            .map(([label, { value }]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

        return {
            stats: { totalSales, transactionCount, avgSaleValue },
            salesOverTime: salesOverTimeData,
            topProducts: topProductsData,
            salesByCategory: salesByCategoryData,
        };
    }, [filteredSales, products]);
    
    return (
        <div className="page-container dashboard-page">
            <div className="page-header">
                <h2 className="page-title">Dashboard & Reports</h2>
                <div className="report-filters">
                    <div className="toggle-switch">
                        <button className={`toggle-button ${filterPeriod === '7days' ? 'active' : ''}`} onClick={() => setFilterPeriod('7days')}>Last 7 Days</button>
                        <button className={`toggle-button ${filterPeriod === '30days' ? 'active' : ''}`} onClick={() => setFilterPeriod('30days')}>Last 30 Days</button>
                        <button className={`toggle-button ${filterPeriod === 'all' ? 'active' : ''}`} onClick={() => setFilterPeriod('all')}>All Time</button>
                    </div>
                </div>
            </div>

            <div className="summary-cards">
                <div className="summary-card"><h3>Total Revenue</h3><p>{formatCurrency(stats.totalSales)}</p></div>
                <div className="summary-card"><h3>Transactions</h3><p>{stats.transactionCount}</p></div>
                <div className="summary-card"><h3>Avg. Sale Value</h3><p>{formatCurrency(stats.avgSaleValue)}</p></div>
            </div>

            <div className="dashboard-grid">
                <BarChart title="Sales Over Time" data={salesOverTime} />
                <BarChart title="Top 5 Selling Products" data={topProducts} />
                <BarChart title="Sales by Category" data={salesByCategory} />
            </div>
            
            <div className="recent-activity">
                <h3 className="section-title">Recent Transactions</h3>
                <div className="inventory-list-container">
                    <table className="inventory-table sales-history-table">
                        <thead>
                            <tr><th>Date</th><th>Customer</th><th>Items</th><th>Total Amount</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {filteredSales.slice(0, 20).map(sale => (
                                <tr key={sale.id}>
                                    <td data-label="Date">{new Date(sale.date).toLocaleString()}</td>
                                    <td data-label="Customer">{sale.customerName || 'N/A'}</td>
                                    <td data-label="Items">{sale.saleItems.length}</td>
                                    <td data-label="Total Amount">{formatCurrency(sale.grandTotal)}</td>
                                    <td data-label="Actions"><button className="action-button-secondary" onClick={() => onViewInvoice(sale)}>View</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- CREATE ORDER MODAL ---
type CreateOrderModalProps = {
    isOpen: boolean;
    onClose: () => void;
    orderType: 'purchase' | 'sales';
    products: Product[];
    onSubmit: (orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'> | Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => Promise<void>;
    onUpdate: (orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'> | Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => Promise<void>;
    initialData: PurchaseOrder | SalesOrder | null;
};
const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ isOpen, onClose, orderType, products, onSubmit, onUpdate, initialData }) => {
    const isEditMode = !!initialData;
    const [supplierName, setSupplierName] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerMobile, setCustomerMobile] = useState('');
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [activeSuggestion, setActiveSuggestion] = useState(-1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const supplierNameRef = useRef<HTMLInputElement>(null);
    const customerNameRef = useRef<HTMLInputElement>(null);
    const customerMobileRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const prevOrderItemsLength = useRef(0);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setSuggestions([]);
            setActiveSuggestion(-1);
            setIsSubmitting(false);

            if (isEditMode && initialData) {
                setOrderItems(initialData.items);
                if (orderType === 'purchase') {
                    setSupplierName((initialData as PurchaseOrder).supplierName);
                } else {
                    setCustomerName((initialData as SalesOrder).customerName);
                    setCustomerMobile((initialData as SalesOrder).customerMobile);
                }
            } else {
                setSupplierName('');
                setCustomerName('');
                setCustomerMobile('');
                setOrderItems([]);
            }
             prevOrderItemsLength.current = isEditMode && initialData ? initialData.items.length : 0;
        }
    }, [isOpen, isEditMode, initialData, orderType]);

    useEffect(() => {
        if (orderItems.length > prevOrderItemsLength.current) {
            const lastQuantityInput = document.querySelector<HTMLInputElement>('.order-items-grid tbody tr:last-child input[data-field="quantity"]');
            if (lastQuantityInput) {
                lastQuantityInput.focus();
                lastQuantityInput.select();
            }
        }
        prevOrderItemsLength.current = orderItems.length;
    }, [orderItems]);


    useEffect(() => {
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            const filtered = products.filter(p => p.name.toLowerCase().includes(lowercasedTerm) || p.barcode === searchTerm);
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
        }
        setActiveSuggestion(-1);
    }, [searchTerm, products]);

    const handleProductSelect = (product: Product) => {
        const existingItemIndex = orderItems.findIndex(item => item.productId === product.id);
        if (existingItemIndex > -1) {
            const newItems = [...orderItems];
            newItems[existingItemIndex].quantity += 1;
            setOrderItems(newItems);
        } else {
            const newItem: OrderItem = {
                productId: product.id,
                name: product.name,
                quantity: 1,
                price: orderType === 'purchase' ? product.b2bPrice : product.b2cPrice,
            };
            setOrderItems(prev => [...prev, newItem]);
        }
        setSearchTerm('');
        setSuggestions([]);
        searchInputRef.current?.focus();
    };

    const handleItemUpdate = (index: number, field: keyof OrderItem, value: any) => {
        const updatedItems = [...orderItems];
        if (field === 'quantity' || field === 'price') {
            (updatedItems[index] as any)[field] = parseFloat(value) || 0;
        } else {
            (updatedItems[index] as any)[field] = value;
        }
        setOrderItems(updatedItems);
    };

    const handleItemRemove = (index: number) => {
        setOrderItems(orderItems.filter((_, i) => i !== index));
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(prev => (prev < suggestions.length - 1 ? prev + 1 : prev)); } 
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(prev => (prev > 0 ? prev - 1 : prev)); } 
        else if (e.key === 'Enter' && suggestions.length > 0) {
            e.preventDefault();
            const selectionIndex = activeSuggestion === -1 ? 0 : activeSuggestion;
            if (selectionIndex >= 0 && selectionIndex < suggestions.length) { handleProductSelect(suggestions[selectionIndex]); }
        }
    };
    
    const handleGridKeyDown = (e: React.KeyboardEvent, field: 'quantity' | 'price') => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const target = e.target as HTMLInputElement;
            if (field === 'quantity') {
                const priceInput = target.closest('tr')?.querySelector<HTMLInputElement>('input[data-field="price"]');
                priceInput?.focus();
                priceInput?.select();
            } else if (field === 'price') {
                searchInputRef.current?.focus();
            }
        }
    };

    const totalAmount = useMemo(() => orderItems.reduce((acc, item) => acc + item.quantity * item.price, 0), [orderItems]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (orderItems.length === 0) { alert('Please add at least one item to the order.'); return; }
        
        let orderData;
        if (orderType === 'purchase') {
            if (!supplierName.trim()) { alert('Please enter a supplier name.'); return; }
            orderData = { supplierName, items: orderItems, totalAmount };
        } else {
            if (!customerName.trim() || !customerMobile.trim()) { alert('Please enter customer name and mobile.'); return; }
            orderData = { customerName, customerMobile, items: orderItems, totalAmount };
        }
        
        setIsSubmitting(true);
        try {
            if (isEditMode) {
                await onUpdate(orderData);
            } else {
                await onSubmit(orderData);
            }
            onClose();
        } catch (error) {
            alert(`Error processing order: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px'}}>
                <div className="modal-header">
                    <h3>{isEditMode ? `Edit` : `New`} {orderType === 'purchase' ? 'Purchase Order' : 'Sales Order'}</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <form id="create-order-form" onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {orderType === 'purchase' ? (
                            <div className="form-group">
                                <label htmlFor="supplier-name">Supplier Name</label>
                                <input ref={supplierNameRef} id="supplier-name" type="text" className="input-field" value={supplierName} onChange={e => setSupplierName(e.target.value)} required autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchInputRef.current?.focus(); }}} />
                            </div>
                        ) : (
                            <div className="customer-details">
                                <div className="form-group">
                                    <label htmlFor="order-customer-name">Customer Name</label>
                                    <input ref={customerNameRef} id="order-customer-name" type="text" className="input-field" value={customerName} onChange={e => setCustomerName(e.target.value)} required autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); customerMobileRef.current?.focus(); }}} />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="order-customer-mobile">Customer Mobile</label>
                                    <input ref={customerMobileRef} id="order-customer-mobile" type="text" className="input-field" value={customerMobile} onChange={e => setCustomerMobile(e.target.value)} required onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchInputRef.current?.focus(); }}} />
                                </div>
                            </div>
                        )}
                        <hr style={{border: 'none', borderTop: `1px solid var(--border-color)`, margin: 'var(--padding-md) 0'}} />
                        <div className="form-group product-search-container">
                            <label htmlFor="order-product-search">Add Products</label>
                            <input id="order-product-search" type="text" className="input-field" placeholder="Start typing product name or barcode..." ref={searchInputRef} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} autoComplete="off" />
                            {suggestions.length > 0 && (
                                <div className="product-suggestions">
                                    {suggestions.map((p, i) => (
                                        <div key={p.id} className={`suggestion-item ${i === activeSuggestion ? 'active' : ''}`} onClick={() => handleProductSelect(p)} onMouseEnter={() => setActiveSuggestion(i)}>{p.name} - Stock: {p.stock}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="sales-grid-container">
                            <table className="sales-grid order-items-grid">
                                <thead><tr><th>Product</th><th>Quantity</th><th>Price</th><th>Total</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {orderItems.length === 0 && (<tr><td colSpan={5} style={{textAlign: 'center', padding: '1rem'}}>No items added.</td></tr>)}
                                    {orderItems.map((item, index) => (
                                        <tr key={item.productId}>
                                            <td data-label="Product">{item.name}</td>
                                            <td data-label="Quantity"><input type="number" className="input-field" data-field="quantity" value={item.quantity} onChange={e => handleItemUpdate(index, 'quantity', e.target.value)} onKeyDown={e => handleGridKeyDown(e, 'quantity')} step="0.001" /></td>
                                            <td data-label="Price"><input type="number" className="input-field" data-field="price" value={item.price} onChange={e => handleItemUpdate(index, 'price', e.target.value)} onKeyDown={e => handleGridKeyDown(e, 'price')} step="0.01" /></td>
                                            <td data-label="Total">{formatCurrency(item.quantity * item.price)}</td>
                                            <td data-label="Actions"><button type="button" className="action-button" onClick={() => handleItemRemove(index)} aria-label={`Remove ${item.name}`}>&times;</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="total-row" style={{justifyContent: 'flex-end', fontWeight: 'bold', fontSize: '1.2rem', marginTop: 'var(--padding-md)'}}>
                            <span>Total Amount</span><span>{formatCurrency(totalAmount)}</span>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="action-button-secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" form="create-order-form" className="action-button-primary" disabled={isSubmitting}>
                            {isSubmitting ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Order' : 'Finish & Create Order')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- ORDER MANAGEMENT COMPONENTS ---
const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
    const getStatusClassName = () => {
        switch (status) {
            case 'Pending': return 'status-pending';
            case 'Fulfilled': return 'status-fulfilled';
            case 'Cancelled': return 'status-cancelled';
            default: return '';
        }
    };
    return <span className={`status-badge ${getStatusClassName()}`}>{status}</span>;
};

type OrderDetailsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    order: PurchaseOrder | SalesOrder | null;
    orderType: 'purchase' | 'sales';
    onUpdateStatus: (orderId: number, newStatus: OrderStatus) => void;
};

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ isOpen, onClose, order, orderType, onUpdateStatus }) => {
    if (!isOpen || !order) return null;

    const handleAction = (newStatus: OrderStatus) => {
        const confirmMessage = newStatus === 'Fulfilled'
            ? 'Are you sure you want to fulfill this order? This will update your stock levels.'
            : 'Are you sure you want to cancel this order? This action cannot be undone.';
        
        if (window.confirm(confirmMessage)) {
            onUpdateStatus(order.id, newStatus);
        }
    };

    const isPurchaseOrder = (o: any): o is PurchaseOrder => orderType === 'purchase';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
                <div className="modal-header">
                    <h3>Order Details (ID: {order.id})</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body order-details-modal-body">
                    <div className="order-details-summary">
                        <div><strong>Date:</strong> {new Date(order.orderDate).toLocaleString()}</div>
                        {isPurchaseOrder(order) ? (
                            <div><strong>Supplier:</strong> {order.supplierName}</div>
                        ) : (
                            <div><strong>Customer:</strong> {(order as SalesOrder).customerName} ({(order as SalesOrder).customerMobile})</div>
                        )}
                        <div><strong>Status:</strong> <OrderStatusBadge status={order.status} /></div>
                    </div>
                    <h4>Items</h4>
                    <div className="sales-grid-container" style={{maxHeight: '300px'}}>
                        <table className="sales-grid">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item, index) => (
                                    <tr key={index}>
                                        <td data-label="Product">{item.name}</td>
                                        <td data-label="Quantity" style={{textAlign: 'right'}}>{formatQuantity(item.quantity)}</td>
                                        <td data-label="Price" style={{textAlign: 'right'}}>{formatCurrency(item.price)}</td>
                                        <td data-label="Total" style={{textAlign: 'right'}}>{formatCurrency(item.quantity * item.price)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="total-row" style={{justifyContent: 'flex-end', fontWeight: 'bold', fontSize: '1.4rem', marginTop: 'var(--padding-md)'}}>
                        <span>Total Amount</span>
                        <span>{formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose}>Close</button>
                    {order.status === 'Pending' && (
                        <div className="action-buttons-group">
                            <button className="action-button-secondary danger" onClick={() => handleAction('Cancelled')}>Cancel Order</button>
                            <button className="action-button-secondary success" onClick={() => handleAction('Fulfilled')}>Fulfill Order</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


type OrderManagementPageProps = {
    purchaseOrders: PurchaseOrder[];
    salesOrders: SalesOrder[];
    products: Product[];
    currentShopId: number | null;
    onAddPurchaseOrder: (order: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => Promise<void>;
    onAddSalesOrder: (order: Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => Promise<void>;
    onUpdateOrderStatus: (orderId: number, orderType: 'purchase' | 'sales', newStatus: OrderStatus) => Promise<void>;
    onUpdateOrder: (orderId: number, orderType: 'purchase' | 'sales', orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'> | Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => Promise<void>;
};

const OrderManagementPage: React.FC<OrderManagementPageProps> = ({ purchaseOrders, salesOrders, products, onAddPurchaseOrder, onAddSalesOrder, onUpdateOrderStatus, onUpdateOrder }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [orderToView, setOrderToView] = useState<PurchaseOrder | SalesOrder | null>(null);
    const [orderToEdit, setOrderToEdit] = useState<PurchaseOrder | SalesOrder | null>(null);
    const [modalOrderType, setModalOrderType] = useState<'purchase' | 'sales'>('purchase');

    const handleStatusChange = async (orderId: number, newStatus: OrderStatus) => {
        await onUpdateOrderStatus(orderId, modalOrderType, newStatus);
        setOrderToView(null);
    };

    const handleOpenCreateModal = (type: 'purchase' | 'sales') => {
        setModalOrderType(type);
        setOrderToEdit(null);
        setIsCreateModalOpen(true);
    };

    const handleOpenEditModal = (order: PurchaseOrder | SalesOrder, type: 'purchase' | 'sales') => {
        setModalOrderType(type);
        setOrderToEdit(order);
        setIsCreateModalOpen(true);
    };

    const handleViewOrder = (order: PurchaseOrder | SalesOrder, type: 'purchase' | 'sales') => {
        setModalOrderType(type);
        setOrderToView(order);
    };

    const handleCloseModal = () => {
        setIsCreateModalOpen(false);
        setOrderToEdit(null);
    };
    
    const handleSubmitNewOrder = async (orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'> | Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => {
        if (modalOrderType === 'purchase') {
            await onAddPurchaseOrder(orderData as Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'>);
        } else {
            await onAddSalesOrder(orderData as Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>);
        }
    };
    
    const handleSubmitUpdateOrder = async (orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'> | Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => {
        if (!orderToEdit) return;
        await onUpdateOrder(orderToEdit.id, modalOrderType, orderData);
    };

    const sortedPurchaseOrders = useMemo(() => [...purchaseOrders].sort((a,b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()), [purchaseOrders]);
    const sortedSalesOrders = useMemo(() => [...salesOrders].sort((a,b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()), [salesOrders]);

    return (
        <div className="page-container page-container-full-width">
            <h2 className="page-title">Order Management</h2>
            <CreateOrderModal 
                isOpen={isCreateModalOpen}
                onClose={handleCloseModal}
                orderType={modalOrderType}
                products={products}
                onSubmit={handleSubmitNewOrder}
                onUpdate={handleSubmitUpdateOrder}
                initialData={orderToEdit}
             />
             <OrderDetailsModal
                isOpen={!!orderToView}
                onClose={() => setOrderToView(null)}
                order={orderToView}
                orderType={modalOrderType}
                onUpdateStatus={handleStatusChange}
             />
            
            <div className="order-management-layout">
                {/* Purchase Orders Column */}
                <div className="order-column">
                    <div className="order-column-header">
                        <h3>Purchase Orders</h3>
                        <button className="action-button-primary" onClick={() => handleOpenCreateModal('purchase')}>
                            + New Purchase Order
                        </button>
                    </div>
                    <div className="inventory-list-container">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Supplier</th>
                                    <th>Date</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedPurchaseOrders.length === 0 && (
                                    <tr><td colSpan={6} data-label="Status" style={{ textAlign: 'center', padding: '2rem' }}>No purchase orders.</td></tr>
                                )}
                                {sortedPurchaseOrders.map(order => (
                                    <tr key={order.id}>
                                        <td data-label="ID">{order.id}</td>
                                        <td data-label="Supplier">{order.supplierName}</td>
                                        <td data-label="Date">{new Date(order.orderDate).toLocaleDateString()}</td>
                                        <td data-label="Total">{formatCurrency(order.totalAmount)}</td>
                                        <td data-label="Status"><OrderStatusBadge status={order.status} /></td>
                                        <td data-label="Actions">
                                            <div className="table-action-buttons">
                                                <button className="action-button-secondary" onClick={() => handleViewOrder(order, 'purchase')}>View</button>
                                                {order.status === 'Pending' && (
                                                    <button className="action-button-secondary" onClick={() => handleOpenEditModal(order, 'purchase')}>Edit</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Sales Orders Column */}
                <div className="order-column">
                    <div className="order-column-header">
                        <h3>Sales Orders</h3>
                        <button className="action-button-primary" onClick={() => handleOpenCreateModal('sales')}>
                            + New Sales Order
                        </button>
                    </div>
                    <div className="inventory-list-container">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Customer</th>
                                    <th>Date</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSalesOrders.length === 0 && (
                                    <tr><td colSpan={6} data-label="Status" style={{ textAlign: 'center', padding: '2rem' }}>No sales orders.</td></tr>
                                )}
                                {sortedSalesOrders.map(order => (
                                    <tr key={order.id}>
                                        <td data-label="ID">{order.id}</td>
                                        <td data-label="Customer">{`${order.customerName} (${order.customerMobile})`}</td>
                                        <td data-label="Date">{new Date(order.orderDate).toLocaleDateString()}</td>
                                        <td data-label="Total">{formatCurrency(order.totalAmount)}</td>
                                        <td data-label="Status"><OrderStatusBadge status={order.status} /></td>
                                        <td data-label="Actions">
                                            <div className="table-action-buttons">
                                                <button className="action-button-secondary" onClick={() => handleViewOrder(order, 'sales')}>View</button>
                                                {order.status === 'Pending' && (
                                                    <button className="action-button-secondary" onClick={() => handleOpenEditModal(order, 'sales')}>Edit</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- AUTHENTICATION PAGE COMPONENTS ---
type LoginPageProps = { onLogin: (user: User) => void; onNavigateToForgotPassword: () => void; };
const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onNavigateToForgotPassword }) => {
    const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [isLoggingIn, setIsLoggingIn] = useState(false);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(''); setIsLoggingIn(true);
        try {
            const { token, user } = await api.login(username, password);
            sessionStorage.setItem('authToken', token); onLogin(user);
        } catch (err) { setError(err instanceof Error ? err.message : 'Invalid credentials'); setIsLoggingIn(false); }
    };
    return (
        <div className="login-container">
            <div className="login-card">
                <form onSubmit={handleSubmit} className="login-form">
                    <h2>BillEase POS Login</h2>
                    {error && <p className="login-error">{error}</p>}
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input id="username" type="text" className="input-field" value={username} onChange={e => setUsername(e.target.value)} required disabled={isLoggingIn} autoFocus />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input id="password" type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoggingIn} />
                    </div>
                    <button type="submit" className="action-button-primary login-button" disabled={isLoggingIn}>
                        {isLoggingIn ? 'Logging in...' : 'Login'}
                    </button>
                    <div className="login-footer">
                        <a href="#" onClick={onNavigateToForgotPassword} className="forgot-password-link">Forgot Password?</a>
                    </div>
                </form>
            </div>
        </div>
    );
};

type ForgotPasswordPageProps = { onForgotPasswordRequest: (usernameOrEmail: string) => Promise<void>; onNavigateToLogin: () => void; };
const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onForgotPasswordRequest, onNavigateToLogin }) => {
    const [usernameOrEmail, setUsernameOrEmail] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [isSubmitting, setIsSubmitting] = useState(false);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(''); setMessage(''); setIsSubmitting(true);
        try {
            await onForgotPasswordRequest(usernameOrEmail);
            setMessage("Password reset process initiated. Check your console/alerts for the next step.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
            setIsSubmitting(false);
        }
    };
    return (<div className="login-container"><form onSubmit={handleSubmit} className="login-form"><h2>Forgot Password</h2>{error && <p className="login-error">{error}</p>}{message && <p className="success-message">{message}</p>}<div className="form-group"><label htmlFor="usernameOrEmail">Username or Email</label><input id="usernameOrEmail" type="text" className="input-field" value={usernameOrEmail} onChange={e => setUsernameOrEmail(e.target.value)} required disabled={isSubmitting} /></div><button type="submit" className="action-button-primary login-button" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send Reset Link'}</button><div className="login-footer"><a href="#" onClick={onNavigateToLogin} className="forgot-password-link">Back to Login</a></div></form></div>);
};

type ResetPasswordPageProps = { token: string | null; onResetPassword: (token: string, newPass: string) => Promise<void>; onNavigateToLogin: () => void; };
const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ token, onResetPassword, onNavigateToLogin }) => {
    const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [error, setError] = useState(''); const [isSubmitting, setIsSubmitting] = useState(false);
    useEffect(() => { if (!token) setError("No reset token provided. Please start the process again."); }, [token]);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) { setError("Passwords do not match."); return; }
        if (!token) { setError("Missing token."); return; }
        setError(''); setIsSubmitting(true);
        try {
            await onResetPassword(token, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reset password.");
            setIsSubmitting(false);
        }
    };
    return (<div className="login-container"><form onSubmit={handleSubmit} className="login-form"><h2>Reset Password</h2>{error && <p className="login-error">{error}</p>}<p style={{color: 'var(--text-secondary)', textAlign: 'center'}}>Enter a new password for your account.</p><div className="form-group"><label htmlFor="new-password">New Password</label><input id="new-password" type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} required disabled={isSubmitting || !token} /></div><div className="form-group"><label htmlFor="confirm-password">Confirm New Password</label><input id="confirm-password" type="password" className="input-field" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required disabled={isSubmitting || !token} /></div><button type="submit" className="action-button-primary login-button" disabled={isSubmitting || !token}>{isSubmitting ? 'Resetting...' : 'Reset Password'}</button><div className="login-footer"><a href="#" onClick={onNavigateToLogin} className="forgot-password-link">Back to Login</a></div></form></div>);
};


// --- MAIN APP COMPONENT ---
const App = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [appError, setAppError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState('New Sale');
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [allSalesHistory, setAllSalesHistory] = useState<SaleData[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [notes, setNotes] = useState<Note[]>(initialNotes);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    const [pendingSaleData, setPendingSaleData] = useState<SaleData | null>(null);
    const [isSaleFinalized, setIsSaleFinalized] = useState<boolean>(false);
    const [theme, setTheme] = useState<Theme>('professional-light');
    const [appName, setAppName] = useState('BillEase POS');
    const [appSettings, setAppSettings] = useState<AppSettings>({ invoiceFooter: 'Thank you for your business!' });
    const [invoiceMargins, setInvoiceMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
    const [invoiceTextOffsets, setInvoiceTextOffsets] = useState({ header: 0, footer: 0 });
    const [invoiceFontStyle, setInvoiceFontStyle] = useState<InvoiceFontStyle>('monospace');
    const [invoiceTheme, setInvoiceTheme] = useState<InvoiceTheme>('professional');
    const [users, setUsers] = useState<User[]>([]);
    const [shops, setShops] = useState<Shop[]>([]);
    const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('desktop');
    const syncIntervalRef = useRef<number | null>(null);

    const [authView, setAuthView] = useState<'login' | 'forgot' | 'reset'>('login');
    const [tokenForReset, setTokenForReset] = useState<string | null>(null);

    const initialSaleSession: SaleSession = useMemo(() => ({ customerName: '', customerMobile: '', priceMode: 'B2C', languageMode: 'English', taxPercent: 0, discount: 0, saleItems: [], amountPaid: '', returnReason: '', }), []);
    const [saleSessions, setSaleSessions] = useState<SaleSession[]>([ {...initialSaleSession}, {...initialSaleSession}, {...initialSaleSession} ]);
    const [activeBillIndex, setActiveBillIndex] = useState(0);

    const processSyncQueue = useCallback(async () => {
        if (!navigator.onLine) { setSyncStatus('offline'); return; }
        const outboxItems = await dbManager.getAll<any>('outbox');
        setPendingSyncCount(outboxItems.length);
        if (outboxItems.length === 0) { setSyncStatus('synced'); return; }
        setSyncStatus('syncing');
        try {
            await api.syncPush(outboxItems);
            await dbManager.clear('outbox');
            setPendingSyncCount(0);
            setSyncStatus('synced');
        } catch (error) {
            console.error("Sync failed:", error);
            setSyncStatus('error');
        }
    }, []);

    useEffect(() => {
        const handleOnline = () => processSyncQueue();
        const handleOffline = () => setSyncStatus('offline');
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        dbManager.open().then(() => {
            const token = getAuthToken();
            if (token) {
                try {
                    const user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
                    if (user) setCurrentUser(user); else setIsLoading(false);
                } catch { setIsLoading(false); }
            } else setIsLoading(false);
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
        };
    }, [processSyncQueue]);
    
    const loadDataFromDb = useCallback(async () => {
        setIsLoading(true);
        try {
            const [products, sales, customers, shops, users, expenses, purchaseOrders, salesOrders] = await Promise.all([
                dbManager.getAll<Product>('products'),
                dbManager.getAll<SaleData>('sales'),
                dbManager.getAll<Customer>('customers'),
                dbManager.getAll<Shop>('shops'),
                dbManager.getAll<User>('users'),
                dbManager.getAll<Expense>('expenses'),
                dbManager.getAll<PurchaseOrder>('purchaseOrders'),
                dbManager.getAll<SalesOrder>('salesOrders'),
            ]);
            setAllProducts(products);
            setAllSalesHistory(sales.map(s => ({...s, date: new Date(s.date) })).sort((a,b) => b.date.getTime() - a.date.getTime()));
            setCustomers(customers);
            setShops(shops);
            setUsers(users);
            setExpenses(expenses.map(e => ({...e, date: new Date(e.date) })).sort((a,b) => b.date.getTime() - a.date.getTime()));
            setPurchaseOrders(purchaseOrders.map(o => ({...o, orderDate: new Date(o.orderDate) })).sort((a,b) => b.orderDate.getTime() - a.orderDate.getTime()));
            setSalesOrders(salesOrders.map(o => ({...o, orderDate: new Date(o.orderDate) })).sort((a,b) => b.orderDate.getTime() - a.orderDate.getTime()));

        } catch (error) {
            setAppError("Failed to load data from local database.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (currentUser) {
            loadDataFromDb();
            processSyncQueue();
            syncIntervalRef.current = window.setInterval(processSyncQueue, 30000);
        }
    }, [currentUser, loadDataFromDb, processSyncQueue]);

    const currentShopContextId = useMemo(() => currentUser?.role === 'super_admin' ? selectedShopId : (currentUser?.shopId || null), [currentUser, selectedShopId]);
    
    const visibleProducts = useMemo(() => {
        if (currentUser?.role === 'super_admin') {
            if (!selectedShopId) return allProducts;
            return allProducts.filter(p => p.shopId === selectedShopId);
        }
        return allProducts.filter(p => p.shopId === currentUser?.shopId);
    }, [allProducts, currentUser, selectedShopId]);

    const visibleSalesHistory = useMemo(() => {
        if (currentUser?.role === 'super_admin') {
            if (!selectedShopId) return allSalesHistory;
            return allSalesHistory.filter(s => s.shopId === selectedShopId);
        }
        return allSalesHistory.filter(s => s.shopId === currentUser?.shopId);
    }, [allSalesHistory, currentUser, selectedShopId]);

    const visibleExpenses = useMemo(() => {
        if (currentUser?.role === 'super_admin') {
            if (!selectedShopId) return expenses;
            return expenses.filter(e => e.shopId === selectedShopId);
        }
        return expenses.filter(e => e.shopId === currentUser?.shopId);
    }, [expenses, currentUser, selectedShopId]);
    
    const visiblePurchaseOrders = useMemo(() => {
        if (currentUser?.role === 'super_admin') {
            if (!selectedShopId) return purchaseOrders;
            return purchaseOrders.filter(o => o.shopId === selectedShopId);
        }
        return purchaseOrders.filter(o => o.shopId === currentUser?.shopId);
    }, [purchaseOrders, currentUser, selectedShopId]);
    
    const visibleSalesOrders = useMemo(() => {
        if (currentUser?.role === 'super_admin') {
            if (!selectedShopId) return salesOrders;
            return salesOrders.filter(o => o.shopId === selectedShopId);
        }
        return salesOrders.filter(o => o.shopId === currentUser?.shopId);
    }, [salesOrders, currentUser, selectedShopId]);

    const updateCurrentSaleSession = (updates: Partial<SaleSession>) => setSaleSessions(prev => { const newSessions = [...prev]; newSessions[activeBillIndex] = { ...newSessions[activeBillIndex], ...updates }; return newSessions; });
    const resetCurrentSaleSession = () => setSaleSessions(prev => { const newSessions = [...prev]; newSessions[activeBillIndex] = {...initialSaleSession}; return newSessions; });
    useEffect(() => { document.body.className = `theme-${theme}`; }, [theme]);

    const handleLogin = async (user: User) => {
        sessionStorage.setItem('currentUser', JSON.stringify(user));
        setIsLoading(true);
        setAppError(null);
        try {
            // Use a persistent flag in localStorage to check if the initial data sync has been performed.
            // This is more robust than checking if a specific table is empty.
            const isInitialized = localStorage.getItem('db_initialized');
    
            if (!isInitialized) {
                const [shopsData, customersData, usersData, productsData, salesData] = await Promise.all([
                    api.getShops(),
                    api.getCustomers(),
                    user.role === 'super_admin' ? api.getUsers() : Promise.resolve([]),
                    api.getProducts(),
                    api.getSales(),
                ]);
    
                // Clear all data stores to ensure a fresh start
                await Promise.all([
                    dbManager.clear('shops'), dbManager.clear('customers'), dbManager.clear('users'),
                    dbManager.clear('products'), dbManager.clear('sales'), dbManager.clear('expenses'),
                    dbManager.clear('purchaseOrders'), dbManager.clear('salesOrders')
                ]);
    
                // Bulk insert the mock/initial data
                await Promise.all([
                    dbManager.bulkPut('shops', shopsData || []),
                    dbManager.bulkPut('customers', customersData || []),
                    dbManager.bulkPut('users', usersData || []),
                    dbManager.bulkPut('products', productsData || []),
                    dbManager.bulkPut('sales', (salesData || []).map(s => ({ ...s, date: new Date(s.date) }))),
                ]);
    
                // Set the flag after the first successful sync to prevent this block from running again.
                localStorage.setItem('db_initialized', 'true');
            }
    
            setCurrentUser(user);
            if (user.role === 'super_admin' || user.role === 'admin') {
                setCurrentPage('Dashboard');
            } else {
                setCurrentPage('New Sale');
            }
        } catch (err) {
            setAppError(err instanceof Error ? err.message : "Failed to sync initial data.");
            setIsLoading(false);
        }
    };
    
    const handleLogout = () => { sessionStorage.removeItem('authToken'); sessionStorage.removeItem('currentUser'); setCurrentUser(null); setAllProducts([]); setCustomers([]); setAllSalesHistory([]); setUsers([]); setShops([]); setSelectedShopId(null); setAuthView('login'); };
    const handleAddProduct = async (newProductData: Omit<Product, 'id' | 'shopId'>): Promise<Product> => {
        if (!currentShopContextId) {
            throw new Error("Admins must select a shop from the header before adding a product.");
        }
        if (!newProductData.name || !newProductData.name.trim()) {
            throw new Error("Product name cannot be empty.");
        }
        const newProduct: Product = {
            ...newProductData,
            name: newProductData.name.trim(),
            id: Date.now(),
            shopId: currentShopContextId
        };
        await dbManager.put('products', newProduct);
        await dbManager.put('outbox', { type: 'addProduct', payload: newProduct });
        setAllProducts(prev => [...prev, newProduct]);
        processSyncQueue();
        return newProduct;
    };
    const handleBulkAddProducts = async (products: Omit<Product, 'id' | 'shopId'>[]) => {
        if (!currentShopContextId) {
            throw new Error("Admins must select a shop from the header before importing products.");
        }
        const newProducts: Product[] = products.map(p => ({
            ...p,
            id: Date.now() + Math.random(), // Simple unique ID for now
            shopId: currentShopContextId,
        }));
        await dbManager.bulkPut('products', newProducts);
        for (const p of newProducts) {
            await dbManager.put('outbox', { type: 'addProduct', payload: p });
        }
        setAllProducts(prev => [...prev, ...newProducts]);
        processSyncQueue();
    };
    const handleDeleteProducts = async (productIds: number[]) => {
        await dbManager.bulkDelete('products', productIds);
        for (const id of productIds) {
            await dbManager.put('outbox', { type: 'deleteProduct', payload: { id } });
        }
        setAllProducts(prev => prev.filter(p => !productIds.includes(p.id)));
        processSyncQueue();
    };
    const handleAddCustomer = async (newCustomerData: Omit<Customer, 'balance'>) => {
        if (customers.some(c => c.mobile === newCustomerData.mobile)) throw new Error("Mobile number already exists.");
        const newCustomer = { ...newCustomerData, balance: 0 };
        await dbManager.put('customers', newCustomer); await dbManager.put('outbox', { type: 'addCustomer', payload: newCustomer });
        setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
        processSyncQueue();
    };
    const handleAddExpense = async (description: string, amount: number) => {
        if (!currentShopContextId) throw new Error("Please select a shop first.");
        const newExpense: Expense = { id: Date.now(), shopId: currentShopContextId, date: new Date(), description, amount };
        await dbManager.put('expenses', newExpense);
        await dbManager.put('outbox', { type: 'addExpense', payload: newExpense });
        setExpenses(prev => [newExpense, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        processSyncQueue();
    };
    const handleUpdateProduct = async (updatedProduct: Product) => {
        await dbManager.put('products', updatedProduct); await dbManager.put('outbox', { type: 'updateProduct', payload: updatedProduct });
        setAllProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
        processSyncQueue();
    };
    const handleAddShop = async (name: string) => {
        const newShop: Shop = { id: Date.now(), name };
        await dbManager.put('shops', newShop); await dbManager.put('outbox', { type: 'addShop', payload: newShop });
        setShops(prev => [...prev, newShop]); processSyncQueue();
    };
    const handleUpdateShop = async (id: number, name: string) => {
        const shop = shops.find(s => s.id === id); if (!shop) return;
        const updatedShop = { ...shop, name };
        await dbManager.put('shops', updatedShop); await dbManager.put('outbox', { type: 'updateShop', payload: updatedShop });
        setShops(prev => prev.map(s => s.id === id ? updatedShop : s));
        processSyncQueue();
    };
    const handleAddUser = async (user: Omit<User, 'id'>) => {
        if (users.some(u => u.username === user.username)) throw new Error("Username already exists.");
        await dbManager.put('users', user); await dbManager.put('outbox', { type: 'addUser', payload: user });
        setUsers(prev => [...prev, user]); processSyncQueue();
    };

    const handleAddPurchaseOrder = async (orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => {
        if (!currentShopContextId) throw new Error("Cannot create an order without a selected shop.");
        const newOrder: PurchaseOrder = { ...orderData, id: Date.now(), shopId: currentShopContextId, orderDate: new Date(), status: 'Pending' };
        await dbManager.put('purchaseOrders', newOrder);
        await dbManager.put('outbox', { type: 'addPurchaseOrder', payload: newOrder });
        setPurchaseOrders(prev => [newOrder, ...prev]);
        processSyncQueue();
    };

    const handleAddSalesOrder = async (orderData: Omit<SalesOrder, 'id' | 'shopId' | 'orderDate' | 'status'>) => {
        if (!currentShopContextId) throw new Error("Cannot create an order without a selected shop.");
        const newOrder: SalesOrder = { ...orderData, id: Date.now(), shopId: currentShopContextId, orderDate: new Date(), status: 'Pending' };
        await dbManager.put('salesOrders', newOrder);
        await dbManager.put('outbox', { type: 'addSalesOrder', payload: newOrder });
        setSalesOrders(prev => [newOrder, ...prev]);
        processSyncQueue();
    };

    const handleUpdateOrder = async (orderId: number, orderType: 'purchase' | 'sales', orderData: Omit<PurchaseOrder, 'id' | 'shopId' | 'status'> | Omit<SalesOrder, 'id' | 'shopId' | 'status'>) => {
        const storeName = orderType === 'purchase' ? 'purchaseOrders' : 'salesOrders';
        const setStateAction = orderType === 'purchase' ? setPurchaseOrders : setSalesOrders;

        const originalOrder = await dbManager.get<PurchaseOrder | SalesOrder>(storeName, orderId);
        if (!originalOrder) throw new Error("Order not found.");
        if (originalOrder.status !== 'Pending') throw new Error("Only pending orders can be edited.");
        
        const updatedOrder: PurchaseOrder | SalesOrder = {
            ...originalOrder,
            ...orderData,
            orderDate: new Date(originalOrder.orderDate),
        };

        await dbManager.put(storeName, updatedOrder);
        await dbManager.put('outbox', { type: `update${orderType.charAt(0).toUpperCase() + orderType.slice(1)}Order`, payload: updatedOrder });
        
        setStateAction(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        processSyncQueue();
    };
    
    const handleUpdateOrderStatus = async (orderId: number, orderType: 'purchase' | 'sales', newStatus: OrderStatus) => {
        const storeName = orderType === 'purchase' ? 'purchaseOrders' : 'salesOrders';
        const setStateAction = orderType === 'purchase' ? setPurchaseOrders : setSalesOrders;
    
        const orderToUpdate = await dbManager.get<PurchaseOrder | SalesOrder>(storeName, orderId);
    
        if (!orderToUpdate) {
            alert(`Error: Order with ID ${orderId} not found.`);
            return;
        }
    
        if (orderToUpdate.status !== 'Pending') {
            alert(`This order has already been processed and its status is '${orderToUpdate.status}'. No further actions can be taken.`);
            return;
        }
    
        if (newStatus === 'Fulfilled') {
            const updatedProductsMap: Map<number, Product> = new Map(allProducts.map(p => [p.id, { ...p }]));
            let stockUpdateError = false;
    
            for (const item of orderToUpdate.items) {
                const product = updatedProductsMap.get(item.productId);
                if (product) {
                    if (orderType === 'sales' && product.stock < item.quantity) {
                        alert(`Cannot fulfill order: Insufficient stock for product "${product.name}". Required: ${item.quantity}, Available: ${product.stock}.`);
                        stockUpdateError = true;
                        break;
                    }
                    product.stock += (orderType === 'purchase' ? item.quantity : -item.quantity);
                    updatedProductsMap.set(product.id, product);
                } else {
                    alert(`Product with ID ${item.productId} not found in inventory.`);
                    stockUpdateError = true;
                    break;
                }
            }
    
            if (stockUpdateError) return;
    
            const productsToUpdateInDb = Array.from(updatedProductsMap.values()).filter(p => 
                orderToUpdate.items.some(item => item.productId === p.id)
            );
            
            await dbManager.bulkPut('products', productsToUpdateInDb);
            for (const p of productsToUpdateInDb) {
                await dbManager.put('outbox', { type: 'updateProduct', payload: p });
            }
            setAllProducts(Array.from(updatedProductsMap.values()));
        }
    
        const updatedOrderForDB: PurchaseOrder | SalesOrder = {
            ...orderToUpdate,
            status: newStatus,
            orderDate: new Date(orderToUpdate.orderDate),
        };
    
        await dbManager.put(storeName, updatedOrderForDB);
        await dbManager.put('outbox', { type: `update${orderType.charAt(0).toUpperCase() + orderType.slice(1)}Order`, payload: updatedOrderForDB });
    
        setStateAction(prevOrders => prevOrders.map(order => 
            order.id === orderId 
                ? { ...order, status: newStatus, orderDate: new Date(order.orderDate) } 
                : order
        ));
        
        processSyncQueue();
        alert(`Order ${orderId} has been successfully ${newStatus.toLowerCase()}.`);
    };

    const handleFinalizeSale = async (saleToFinalize: SaleData): Promise<SaleData> => {
        if (!saleToFinalize) throw new Error("No sale data to finalize.");

        await dbManager.put('sales', saleToFinalize);
        await dbManager.put('outbox', { type: 'createSale', payload: saleToFinalize });

        const updatedProducts = [...allProducts];
        for (const item of saleToFinalize.saleItems) {
            const idx = updatedProducts.findIndex(p => p.id === item.productId);
            if (idx > -1) {
                const productToUpdate = { ...updatedProducts[idx] };
                productToUpdate.stock += item.isReturn ? item.quantity : -item.quantity;
                updatedProducts[idx] = productToUpdate;
                await dbManager.put('products', productToUpdate);
                await dbManager.put('outbox', { type: 'updateProduct', payload: productToUpdate });
            }
        }
        
        if (saleToFinalize.customerMobile) {
            const customer = await dbManager.get<Customer>('customers', saleToFinalize.customerMobile);
            const newCustomer: Customer = customer || { mobile: saleToFinalize.customerMobile, name: saleToFinalize.customerName, balance: 0 };
            newCustomer.balance = saleToFinalize.totalBalanceDue;
            newCustomer.name = saleToFinalize.customerName || newCustomer.name;
            await dbManager.put('customers', newCustomer);
            await dbManager.put('outbox', { type: 'updateCustomer', payload: newCustomer });
        }
        
        setAllSalesHistory(prev => [saleToFinalize, ...prev].sort((a,b) => b.date.getTime() - a.date.getTime()));
        setAllProducts(updatedProducts);
        setCustomers(await dbManager.getAll('customers'));
        resetCurrentSaleSession();
        processSyncQueue();
        
        return saleToFinalize;
    };

    const handleNavigate = (page: string) => {
        if (page === 'New Sale') {
            setPendingSaleData(null);
            setIsSaleFinalized(false);
        }
        setCurrentPage(page);
    };

    const handlePreviewInvoice = (sale: SaleData) => {
        setPendingSaleData(sale);
        setIsSaleFinalized(false);
        setCurrentPage('Invoice');
    };

    const handleCompleteSale = async () => {
        if (pendingSaleData && !isSaleFinalized) {
            try {
                await handleFinalizeSale(pendingSaleData);
                setIsSaleFinalized(true);
            } catch (error) {
                alert(`Error completing sale: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };

    const handleViewInvoiceFromReport = (sale: SaleData) => { setPendingSaleData(sale); setIsSaleFinalized(true); setCurrentPage('Invoice'); };
    const handleShopChange = (shopId: number) => {
        setSelectedShopId(shopId === 0 ? null : shopId);
        setCurrentPage('Dashboard');
    };

    const handleForgotPasswordRequest = async (usernameOrEmail: string) => {
        const allUsers = await dbManager.getAll<User>('users');
        const user = allUsers.find(u => u.username === usernameOrEmail || u.email === usernameOrEmail);
        if (!user) throw new Error("User not found.");
        const token = Date.now().toString(36) + Math.random().toString(36).substring(2);
        const expiry = Date.now() + 15 * 60 * 1000; // 15 minutes
        const updatedUser = { ...user, resetToken: token, resetTokenExpiry: expiry };
        await dbManager.put('users', updatedUser);
        console.log(`Password reset link for ${user.username}: /reset-password?token=${token}`);
        alert(`A password reset link has been "sent".\nFor this demo, your token is: ${token}\nYou will now be taken to the reset page.`);
        setTokenForReset(token);
        setAuthView('reset');
    };

    const handleResetPassword = async (token: string, newPassword: string) => {
        if (!token) throw new Error("Invalid or missing token.");
        const allUsers = await dbManager.getAll<User>('users');
        const user = allUsers.find(u => u.resetToken === token);
        if (!user) throw new Error("Invalid token.");
        if (user.resetTokenExpiry && user.resetTokenExpiry < Date.now()) {
            throw new Error("Token has expired.");
        }
        const updatedUser: User = { ...user, password: newPassword, resetToken: undefined, resetTokenExpiry: undefined };
        await dbManager.put('users', updatedUser);
        alert("Password has been reset successfully. Please log in.");
        setTokenForReset(null);
        setAuthView('login');
    };
    
    const handleAdminPasswordReset = async (username: string, newPassword: string) => {
        const user = await dbManager.get<User>('users', username);
        if (!user) throw new Error("User not found.");
        const updatedUser = { ...user, password: newPassword };
        await dbManager.put('users', updatedUser);
        setUsers(prev => prev.map(u => u.username === username ? updatedUser : u));
        await dbManager.put('outbox', { type: 'updateUserPassword', payload: { username, password: newPassword } });
        processSyncQueue();
        alert(`Password for ${username} has been reset.`);
    };


    if (isLoading) return <div className={`theme-${theme} loading-container`}><h2>Loading BillEase POS...</h2></div>;
    
    if (!currentUser) {
        return (
            <div className={`theme-${theme}`} style={{height: '100%'}}>
                {authView === 'login' && <LoginPage onLogin={handleLogin} onNavigateToForgotPassword={() => setAuthView('forgot')} />}
                {authView === 'forgot' && <ForgotPasswordPage onForgotPasswordRequest={handleForgotPasswordRequest} onNavigateToLogin={() => setAuthView('login')} />}
                {authView === 'reset' && <ResetPasswordPage token={tokenForReset} onResetPassword={handleResetPassword} onNavigateToLogin={() => { setTokenForReset(null); setAuthView('login'); }} />}
            </div>
        );
    }
    
    if (appError) return <div className={`theme-${theme} error-container`}><h2>Error</h2><p>{appError}</p><button onClick={handleLogout}>Logout</button></div>;

    const renderPage = () => {
        switch (currentPage) {
            case 'Dashboard': return <DashboardAndReportsPage salesHistory={visibleSalesHistory} products={allProducts} shops={shops} onViewInvoice={handleViewInvoiceFromReport} />;
            case 'New Sale': return <NewSalePage products={visibleProducts} customers={customers} salesHistory={allSalesHistory} onPreviewInvoice={handlePreviewInvoice} onViewInvoice={handleViewInvoiceFromReport} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} userRole={currentUser.role} sessionData={saleSessions[activeBillIndex]} onSessionUpdate={updateCurrentSaleSession} activeBillIndex={activeBillIndex} onBillChange={setActiveBillIndex} currentShopId={currentShopContextId} />;
            case 'Product Inventory': return <ProductInventoryPage products={visibleProducts} onAddProduct={handleAddProduct} onBulkAddProducts={handleBulkAddProducts} onDeleteProducts={handleDeleteProducts} shops={shops} />;
            case 'Order Management': return <OrderManagementPage purchaseOrders={visiblePurchaseOrders} salesOrders={visibleSalesOrders} products={allProducts} currentShopId={currentShopContextId} onAddPurchaseOrder={handleAddPurchaseOrder} onAddSalesOrder={handleAddSalesOrder} onUpdateOrderStatus={handleUpdateOrderStatus} onUpdateOrder={handleUpdateOrder} />;
            case 'Invoice': return <InvoicePage saleData={pendingSaleData} onNavigate={handleNavigate} settings={appSettings} onSettingsChange={setAppSettings} isFinalized={isSaleFinalized} onCompleteSale={handleCompleteSale} margins={invoiceMargins} onMarginsChange={setInvoiceMargins} offsets={invoiceTextOffsets} onOffsetsChange={setInvoiceTextOffsets} fontStyle={invoiceFontStyle} onFontStyleChange={setInvoiceFontStyle} theme={invoiceTheme} onThemeChange={setInvoiceTheme} />;
            case 'Customer Management': return <CustomerManagementPage customers={customers} onAddCustomer={handleAddCustomer} />;
            case 'Balance Due': return <BalanceDuePage customersWithBalance={customers.filter(c => c.balance > 0)} />;
            case 'Expenses': return <ExpensesPage expenses={visibleExpenses} onAddExpense={handleAddExpense} shops={shops} />;
            case 'Notes': return <NotesPage notes={notes} setNotes={setNotes} />;
            case 'Settings': return <SettingsPage theme={theme} onThemeChange={setTheme} settings={appSettings} onSettingsChange={setAppSettings} appName={appName} onAppNameChange={setAppName} />;
            case 'Manage Users': return currentUser.role === 'super_admin' ? <ShopManagementPage users={users} shops={shops} onAddShop={handleAddShop} onAddUser={handleAddUser} onUpdateShop={handleUpdateShop} onAdminPasswordReset={handleAdminPasswordReset} /> : <p>Access Denied</p>;
            default: return <DashboardAndReportsPage salesHistory={visibleSalesHistory} products={allProducts} shops={shops} onViewInvoice={handleViewInvoiceFromReport} />;
        }
    };
    return (<div className={viewMode === 'mobile' ? 'view-mode-mobile' : ''}><AppHeader onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} appName={appName} shops={shops} selectedShopId={selectedShopId} onShopChange={handleShopChange} syncStatus={syncStatus} pendingSyncCount={pendingSyncCount} /><main className="app-main">{renderPage()}</main></div>);
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}