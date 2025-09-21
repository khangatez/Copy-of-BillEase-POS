
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Html5QrcodeScanner } from 'html5-qrcode';


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
    password?: string; // Optional for CurrentUser
    role: 'admin' | 'manager' | 'cashier';
    shopId?: number;
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


// --- MOCK DATA FOR LOCAL FEATURES (NOTES) ---
const initialNotes: Note[] = [
    { id: 1, text: 'Order new stock for milk', completed: false },
    { id: 2, text: 'Clean the front display', completed: true },
];

const MOCK_PRODUCTS: Product[] = [
    { id: 1, shopId: 1, name: 'Apple', nameTamil: 'ஆப்பிள்', b2bPrice: 0.40, b2cPrice: 0.50, stock: 100, barcode: '1111' },
    { id: 2, shopId: 1, name: 'Milk', nameTamil: 'பால்', b2bPrice: 1.20, b2cPrice: 1.50, stock: 50, barcode: '2222' },
    { id: 3, shopId: 2, name: 'Bread', nameTamil: 'ரொட்டி', b2bPrice: 2.00, b2cPrice: 2.50, stock: 30, barcode: '3333' },
    { id: 4, shopId: 2, name: 'Coffee Beans', nameTamil: 'காபி பீன்ஸ்', b2bPrice: 8.00, b2cPrice: 10.00, stock: 8, barcode: '4444' },
];

const MOCK_SALES: SaleData[] = [
    { id: 'sale-1', shopId: 1, date: new Date(new Date().setDate(new Date().getDate() - 1)), customerName: 'Alice', customerMobile: '111', saleItems: [{ productId: 1, name: 'Apple', quantity: 5, price: 0.5, isReturn: false }], grossTotal: 2.5, returnTotal: 0, subtotal: 2.5, taxAmount: 0, taxPercent: 0, grandTotal: 2.5, languageMode: 'English', previousBalance: 0, amountPaid: 2.5, totalBalanceDue: 0 },
    { id: 'sale-2', shopId: 2, date: new Date(), customerName: 'Bob', customerMobile: '222', saleItems: [{ productId: 3, name: 'Bread', quantity: 2, price: 2.5, isReturn: false }, { productId: 4, name: 'Coffee Beans', quantity: 1, price: 10, isReturn: false }], grossTotal: 15, returnTotal: 0, subtotal: 15, taxAmount: 0.75, taxPercent: 5, grandTotal: 15.75, languageMode: 'English', previousBalance: 10, amountPaid: 25.75, totalBalanceDue: 0 },
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
        if (body.username === 'admin' && body.password === 'admin') return { token: 'fake-admin-token', user: { username: 'admin', role: 'admin' } };
        if (body.username === 'manager1' && body.password === 'password') return { token: 'fake-manager-token', user: { username: 'manager1', role: 'manager', shopId: 1 } };
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
    if(url.startsWith('/users')) return [{ username: 'manager1', password: 'password', role: 'manager', shopId: 1 }];
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
  const allMenuItems = ['Admin Dashboard', 'New Sale', 'Product Inventory', 'Customer Management', 'Order Management', 'Reports', 'Expenses', 'Notes', 'Settings', 'Balance Due', 'Shop Management'];
  const managerMenuItems = ['New Sale', 'Product Inventory', 'Customer Management', 'Order Management', 'Reports', 'Expenses', 'Notes', 'Balance Due'];
  const cashierMenuItems = ['New Sale'];
  const getMenuItems = () => {
    switch(currentUser.role) {
        case 'admin': return allMenuItems;
        case 'manager': return managerMenuItems;
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
      <div className="header-user-info">
        <SyncStatusIndicator status={syncStatus} pendingCount={pendingSyncCount} />
        <span className="header-welcome-message">Welcome, {currentUser.username} ({currentUser.role}){currentUser.role !== 'admin' && ` @ ${currentShopName}`}</span>
        {currentUser.role === 'admin' && shops.length > 0 && (
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
};
const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onAddProduct }) => {
    const [newProductName, setNewProductName] = useState('');
    const [newProductNameTamil, setNewProductNameTamil] = useState('');
    const [newProductB2B, setNewProductB2B] = useState(0);
    const [newProductB2C, setNewProductB2C] = useState(0);
    const [newProductStock, setNewProductStock] = useState(0);
    const [newProductBarcode, setNewProductBarcode] = useState('');
    const [newProductCategory, setNewProductCategory] = useState('');
    const [newProductSubcategory, setNewProductSubcategory] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const nameTamilRef = useRef<HTMLInputElement>(null);
    const b2bRef = useRef<HTMLInputElement>(null);
    const b2cRef = useRef<HTMLInputElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
    const categoryRef = useRef<HTMLInputElement>(null);
    const subcategoryRef = useRef<HTMLInputElement>(null);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const submitRef = useRef<HTMLButtonElement>(null);
    const formId = "add-product-form";

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
            setNewProductName(''); setNewProductNameTamil(''); setNewProductB2B(0); setNewProductB2C(0); setNewProductStock(0); setNewProductBarcode(''); setNewProductCategory(''); setNewProductSubcategory('');
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
                        <div className="form-group"><label htmlFor="modal-new-product-name-tamil">Product Name (Tamil)</label><input ref={nameTamilRef} id="modal-new-product-name-tamil" type="text" className="input-field" value={newProductNameTamil} onChange={e => setNewProductNameTamil(e.target.value)} onKeyDown={e => handleKeyDown(e, b2bRef)} /></div>
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
    const [csvData, setCsvData] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setCsvData('');
            setIsImporting(false);
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleImport = async () => {
        if (!csvData.trim()) {
            setError('Please paste data from your spreadsheet.');
            return;
        }
        setIsImporting(true);
        setError('');
        try {
            const rows = csvData.trim().split('\n').slice(1); // Skip header row
            const newProducts: Omit<Product, 'id' | 'shopId'>[] = rows.map((row, index) => {
                const columns = row.split(',').map(c => c.trim());
                if (columns.length < 5) {
                    throw new Error(`Row ${index + 2}: Not enough columns. Expected at least 5.`);
                }
                const product: Omit<Product, 'id' | 'shopId'> = {
                    name: columns[0],
                    nameTamil: columns[1] || '',
                    b2bPrice: parseFloat(columns[2]) || 0,
                    b2cPrice: parseFloat(columns[3]) || 0,
                    stock: parseInt(columns[4], 10) || 0,
                    barcode: columns[5] || undefined,
                    category: columns[6] || undefined,
                    subcategory: columns[7] || undefined,
                };
                if (!product.name) {
                    throw new Error(`Row ${index + 2}: Product name is required.`);
                }
                return product;
            });

            await onBulkAdd(newProducts);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred during import.');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Import Bulk Products</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="import-instructions">
                        <p>Copy columns from your Excel or Google Sheet and paste them into the text box below.</p>
                        <p>Ensure the first row is a header and the columns are in the following order:</p>
                        <code>Name, Tamil Name, B2B Price, B2C Price, Stock, Barcode (Optional), Category (Optional), Subcategory (Optional)</code>
                    </div>
                    {error && <p className="login-error">{error}</p>}
                    <textarea
                        className="input-field"
                        rows={10}
                        value={csvData}
                        onChange={e => setCsvData(e.target.value)}
                        placeholder="Paste your CSV data here..."
                        disabled={isImporting}
                    />
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose} disabled={isImporting}>Cancel</button>
                    <button className="action-button-primary" onClick={handleImport} disabled={isImporting}>
                        {isImporting ? 'Importing...' : 'Import Products'}
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


// --- NEW SALE PAGE COMPONENT ---
type NewSalePageProps = {
    products: Product[];
    customers: Customer[];
    salesHistory: SaleData[];
    onPreviewInvoice: (saleData: Omit<SaleData, 'id' | 'date'>) => void;
    onViewInvoice: (sale: SaleData) => void;
    onAddProduct: (newProduct: Omit<Product, 'id' | 'shopId'>) => Promise<Product>;
    onUpdateProduct: (updatedProduct: Product) => void;
    userRole: User['role'];
    sessionData: SaleSession;
    onSessionUpdate: (updates: Partial<SaleSession>) => void;
    activeBillIndex: number;
    onBillChange: (index: number) => void;
    currentShopId: number | null;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
};

const NewSalePage: React.FC<NewSalePageProps> = ({ products, customers, salesHistory, onPreviewInvoice, onViewInvoice, onAddProduct, onUpdateProduct, userRole, sessionData, onSessionUpdate, activeBillIndex, onBillChange, currentShopId, viewMode, onViewModeChange }) => {
    const { customerName, customerMobile, priceMode, languageMode, taxPercent, saleItems, amountPaid, returnReason } = sessionData;
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [showAddNewSuggestion, setShowAddNewSuggestion] = useState(false);
    const [activeSuggestion, setActiveSuggestion] = useState(-1);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState('');
    const [voiceSearchHistory, setVoiceSearchHistory] = useState<string[]>([]);
    const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const mobileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const prevSaleItemsLengthRef = useRef(saleItems.length);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const recognitionRef = useRef<any>(null); // To hold the recognition instance

    useEffect(() => {
        try { const history = JSON.parse(sessionStorage.getItem('voiceSearchHistory') || '[]'); setVoiceSearchHistory(history); } catch (e) { setVoiceSearchHistory([]); }
    }, []);
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
            const filtered = products.filter(p => p.name.toLowerCase().includes(lowercasedTerm) || p.barcode === searchTerm);
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

    const handleProductSelect = (product: Product) => {
        const newItems = [...saleItems];
        const existingItemIndex = newItems.findIndex(item => item.productId === product.id && !item.isReturn);
        if(existingItemIndex > -1) newItems[existingItemIndex].quantity += 1;
        else {
            newItems.push({ productId: product.id, name: product.name, quantity: 1, price: priceMode === 'B2B' ? product.b2bPrice : product.b2cPrice, isReturn: false });
        }
        onSessionUpdate({ saleItems: newItems });
        setSearchTerm('');
    };
    const handleAddNewProductSuggestion = async () => {
        try {
            const newProduct = await onAddProduct({ name: searchTerm, nameTamil: '', b2cPrice: 0, b2bPrice: 0, stock: 0, barcode: '' });
            handleProductSelect(newProduct);
        } catch (error) { alert(`Error adding product: ${error instanceof Error ? error.message : String(error)}`); }
    };
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        const totalOptions = suggestions.length + (showAddNewSuggestion ? 1 : 0);
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(prev => (prev < totalOptions - 1 ? prev + 1 : prev)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(prev => (prev > 0 ? prev - 1 : prev)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            let selectionIndex = activeSuggestion === -1 && totalOptions > 0 ? 0 : activeSuggestion;
            if (selectionIndex >= 0 && selectionIndex < suggestions.length) handleProductSelect(suggestions[selectionIndex]);
            else if (showAddNewSuggestion && selectionIndex === suggestions.length) handleAddNewProductSuggestion();
        }
    };
    const handleItemUpdate = (index: number, field: keyof SaleItem | 'name', value: any) => {
        const updatedItems = [...saleItems]; (updatedItems[index] as any)[field] = value;
        onSessionUpdate({ saleItems: updatedItems });
        if (userRole !== 'admin') return;
        const item = updatedItems[index];
        const productToUpdate = products.find(p => p.id === item.productId);
        if (!productToUpdate) return;
        if (field === 'price') {
            const priceType = priceMode === 'B2B' ? 'b2bPrice' : 'b2cPrice';
            if (productToUpdate[priceType] !== value) onUpdateProduct({ ...productToUpdate, [priceType]: value });
        } else if (field === 'name') {
             if (productToUpdate.name !== value) onUpdateProduct({ ...productToUpdate, name: value });
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
        recognition.onresult = (event: any) => {
            const speechResult = event.results[0][0].transcript; setSearchTerm(speechResult);
            const newHistory = [speechResult, ...voiceSearchHistory.filter(item => item !== speechResult)].slice(0, 5);
            setVoiceSearchHistory(newHistory); sessionStorage.setItem('voiceSearchHistory', JSON.stringify(newHistory));
        };
        recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
        recognition.onnomatch = () => { setVoiceError("Didn’t catch that, please try again"); setTimeout(() => setVoiceError(''), 3000); };
        recognition.onerror = (event: any) => { if (event.error !== 'no-speech' && event.error !== 'aborted') { setVoiceError(`Error: ${event.error}`); setTimeout(() => setVoiceError(''), 3000); } };
    };
    
    const handleCustomerMobileChange = (mobile: string) => {
        onSessionUpdate({
            customerMobile: mobile,
            amountPaid: '',
        });
    };

    const {
        grossTotal, returnTotal, netSaleTotal, taxAmount, roundedGrandTotal,
        previousBalance, totalAmountDue, newBalanceDue, changeDue
    } = useMemo(() => {
        const grossTotal = saleItems.filter(item => !item.isReturn).reduce((acc, item) => acc + item.quantity * item.price, 0);
        const returnTotal = saleItems.filter(item => item.isReturn).reduce((acc, item) => acc + item.quantity * item.price, 0);
        const netSaleTotal = grossTotal - returnTotal;
        const taxAmount = netSaleTotal * (taxPercent / 100);
        const grandTotalBeforeRounding = netSaleTotal + taxAmount;
        const roundedGrandTotal = Math.round(grandTotalBeforeRounding);

        const previousBalance = activeCustomer?.balance ?? 0;
        const totalAmountDue = previousBalance + roundedGrandTotal;
        
        const paid = parseFloat(amountPaid) || 0;
        const balance = totalAmountDue - paid;

        const newBalanceDue = balance > 0 ? balance : 0;
        const changeDue = balance < 0 ? -balance : 0;

        return {
            grossTotal, returnTotal, netSaleTotal, taxAmount, roundedGrandTotal,
            previousBalance, totalAmountDue, newBalanceDue, changeDue
        };
    }, [saleItems, taxPercent, activeCustomer, amountPaid]);

    const handleAmountPaidChange = (value: string) => {
        onSessionUpdate({ amountPaid: value });
    };

    const handlePayFull = () => {
        onSessionUpdate({ amountPaid: totalAmountDue.toFixed(2) });
    };

    const handlePreviewClick = () => {
        if (saleItems.length === 0) { alert("Cannot preview an empty sale."); return; }
        if (!currentShopId) { alert("Cannot create a sale without a selected shop."); return; }
        
        const finalAmountPaid = parseFloat(amountPaid) || 0;
        
        onPreviewInvoice({ 
            shopId: currentShopId, 
            customerName, 
            customerMobile, 
            saleItems, 
            grossTotal, 
            returnTotal, 
            subtotal: netSaleTotal, 
            taxAmount, 
            taxPercent, 
            grandTotal: roundedGrandTotal, 
            languageMode, 
            previousBalance, 
            amountPaid: finalAmountPaid, 
            totalBalanceDue: newBalanceDue, 
            returnReason,
            paymentDetailsEntered: amountPaid.trim() !== ''
        });
    };

    return (
        <div className="page-container">
            <CustomerHistoryModal 
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                customer={activeCustomer}
                salesHistory={salesHistory}
                onViewInvoice={onViewInvoice}
            />
            <main className="new-sale-layout">
                <section className="sale-main" aria-labelledby="sale-heading">
                    <h2 id="sale-heading" className="page-title" style={{ marginBottom: 'var(--padding-md)' }}>New Sale</h2>
                    <div className="settings-toggles-top">
                        <div className="toggles-group-left">
                           <div className="toggle-switch"><button className={`toggle-button ${priceMode === 'B2C' ? 'active' : ''}`} onClick={() => onSessionUpdate({ priceMode: 'B2C' })}>B2C</button><button className={`toggle-button ${priceMode === 'B2B' ? 'active' : ''}`} onClick={() => onSessionUpdate({ priceMode: 'B2B' })}>B2B</button></div>
                            <div className="toggle-switch"><button className={`toggle-button ${languageMode === 'English' ? 'active' : ''}`} onClick={() => onSessionUpdate({ languageMode: 'English'})}>English</button><button className={`toggle-button ${languageMode === 'Tamil' ? 'active' : ''}`} onClick={() => onSessionUpdate({ languageMode: 'Tamil' })}>Tamil</button></div>
                            <div className="toggle-switch view-mode-toggle"><button className={`toggle-button ${viewMode === 'desktop' ? 'active' : ''}`} onClick={() => onViewModeChange('desktop')}>Desktop</button><button className={`toggle-button ${viewMode === 'mobile' ? 'active' : ''}`} onClick={() => onViewModeChange('mobile')}>Mobile</button></div>
                        </div>
                         <div className="toggle-switch">{[0, 1, 2].map(index => (<button key={index} className={`toggle-button ${activeBillIndex === index ? 'active' : ''}`} onClick={() => onBillChange(index)}>{index + 1}</button>))}</div>
                    </div>
                    <div className="customer-details">
                         <div className="form-group"><label htmlFor="customer-name">Customer Name</label><input id="customer-name" type="text" className="input-field" value={customerName} onChange={e => onSessionUpdate({ customerName: e.target.value })} onKeyDown={handleCustomerNameKeydown} /></div>
                        <div className="form-group"><label htmlFor="customer-mobile">Customer Mobile Number</label><input id="customer-mobile" type="text" className="input-field" ref={mobileInputRef} value={customerMobile} onChange={e => handleCustomerMobileChange(e.target.value)} onKeyDown={handleMobileKeydown} /></div>
                    </div>
                    <div className="product-search-area">
                        <div className="form-group product-search-container">
                            <label htmlFor="product-search">Product Search</label>
                             <div className="input-with-icons">
                                <input id="product-search" type="text" className="input-field" placeholder="Start typing product name..." ref={searchInputRef} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} autoComplete="off" />
                                <button onClick={handleVoiceSearch} className={`input-icon-button ${isListening ? 'voice-listening' : ''}`} aria-label="Search by voice"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg></button>
                                <button onClick={() => setIsScannerOpen(true)} className="input-icon-button" aria-label="Scan barcode"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2v14H3V5zm2 2v2H5V7h2zm4 0v2H9V7h2zm4 0v2h-2V7h2zm4 0v2h-2V7h2zM5 11h2v2H5v-2zm4 0h2v2H9v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"></path></svg></button>
                            </div>
                            {(suggestions.length > 0 || showAddNewSuggestion) && (
                                <div className="product-suggestions">
                                    {suggestions.map((p, i) => (<div key={p.id} className={`suggestion-item ${i === activeSuggestion ? 'active' : ''}`} onClick={() => handleProductSelect(p)} onMouseEnter={() => setActiveSuggestion(i)}>{p.name}</div>))}
                                    {showAddNewSuggestion && (<div className={`suggestion-item add-new-item ${suggestions.length === activeSuggestion ? 'active' : ''}`} onClick={handleAddNewProductSuggestion} onMouseEnter={() => setActiveSuggestion(suggestions.length)}>+ Add "{searchTerm}" as new product</div>)}
                                </div>
                            )}
                             <div className="voice-search-extras">
                                {voiceError && <p className="voice-error-message">{voiceError}</p>}
                                {voiceSearchHistory.length > 0 && (<div className="voice-search-history">{voiceSearchHistory.map((item, index) => (<button key={index} className="history-item" onClick={() => setSearchTerm(item)}>{item}</button>))}</div>)}
                            </div>
                        </div>
                         <div className="product-add-button-container">
                            <button 
                                className="action-button-secondary"
                                onClick={() => setIsHistoryModalOpen(true)}
                                disabled={!activeCustomer}
                                title={!activeCustomer ? "Enter a known customer's mobile to view history" : `View history for ${customerName}`}
                            >
                                History
                            </button>
                        </div>
                    </div>
                    {isScannerOpen && (<div className="barcode-scanner-container"><div id="barcode-reader" style={{ width: '100%', maxWidth: '500px' }}></div><button onClick={() => setIsScannerOpen(false)} className="action-button-secondary">Cancel</button></div>)}
                    <div className="sales-grid-container">
                        <table className="sales-grid" aria-label="Sales Items">
                            <thead><tr><th>S.No</th><th>Product Description</th><th>Quantity</th><th>Price</th><th>Total</th><th>Return</th><th>Actions</th></tr></thead>
                            <tbody>
                                {saleItems.length === 0 && (<tr><td colSpan={7} data-label="Status" style={{textAlign: 'center', padding: '2rem'}}>No items in sale.</td></tr>)}
                                {saleItems.map((item, index) => (
                                    <tr key={`${item.productId}-${index}`} className={item.isReturn ? 'is-return' : ''}>
                                        <td data-label="S.No">{index + 1}</td>
                                        <td data-label="Product"><input type="text" className="input-field-seamless" value={item.name} onChange={e => handleItemUpdate(index, 'name', e.target.value)} aria-label={`Product name for ${item.name}`} disabled={userRole !== 'admin'} /></td>
                                        <td data-label="Quantity"><input type="number" className="input-field" data-field="quantity" value={item.quantity} onChange={e => handleItemUpdate(index, 'quantity', parseFloat(e.target.value) || 0)} onKeyDown={e => handleGridKeyDown(e, index, 'quantity')} aria-label={`Quantity for ${item.name}`} step="0.001" /></td>
                                        <td data-label="Price"><input type="number" className="input-field" data-field="price" value={item.price} onChange={e => handleItemUpdate(index, 'price', parseFloat(e.target.value) || 0)} onKeyDown={e => handleGridKeyDown(e, index, 'price')} aria-label={`Price for ${item.name}`} step="0.01" disabled={userRole !== 'admin'} /></td>
                                        <td data-label="Total">{formatNumberForInvoice(item.quantity * item.price)}</td>
                                        <td data-label="Return"><button className={`return-toggle-button ${item.isReturn ? 'is-return-active' : ''}`} onClick={() => handleItemUpdate(index, 'isReturn', !item.isReturn)} aria-label={`Toggle return status for ${item.name}. Currently ${item.isReturn ? 'Yes' : 'No'}`}>{item.isReturn ? 'Y' : 'N'}</button></td>
                                        <td data-label="Actions"><button className="action-button" onClick={() => handleItemRemove(index)} aria-label={`Remove ${item.name}`}>&times;</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <aside className="sale-sidebar">
                    <div className="totals-summary-wrapper">
                        {saleItems.some(i => i.isReturn) && (<div className="form-group"><label htmlFor="return-reason">Reason for Return (Optional)</label><textarea id="return-reason" className="input-field" rows={2} value={returnReason || ''} onChange={e => onSessionUpdate({ returnReason: e.target.value })} placeholder="e.g., Damaged item" /></div>)}
                        
                        <div className="totals-summary">
                            <div className="total-row"><span>Gross Total</span><span>{formatCurrency(grossTotal)}</span></div>
                            {returnTotal > 0 && (<div className="total-row return-total-row"><span>Return Total</span><span>-{formatCurrency(returnTotal)}</span></div>)}
                            <div className="total-row"><span>Grand Total</span><span>{formatCurrency(netSaleTotal)}</span></div>
                            {taxAmount > 0 && (<div className="total-row"><span>Tax ({taxPercent}%)</span><span>{formatCurrency(taxAmount)}</span></div>)}
                            <div className="total-row sale-total-row"><span>Net Payable</span><span>{formatCurrency(roundedGrandTotal)}</span></div>
                            
                            <div className="balance-summary-section">
                                <div className="total-row"><span>Previous Balance</span><span>{formatCurrency(previousBalance)}</span></div>
                                <div className="total-row total-due-row"><span>Total Amount Due</span><span>{formatCurrency(totalAmountDue)}</span></div>
                            </div>
                            
                            <div className="payment-section">
                                <div className="total-row amount-paid-row">
                                    <label htmlFor="amount-paid-input">Amount Paid</label>
                                    <div className="amount-paid-input-group">
                                        <button className="action-button-secondary amount-paid-yes" onClick={handlePayFull}>Full</button>
                                        <input
                                            id="amount-paid-input"
                                            type="number"
                                            className="input-field"
                                            value={amountPaid}
                                            onChange={e => handleAmountPaidChange(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            aria-label="Amount Paid"
                                        />
                                    </div>
                                </div>

                                {changeDue > 0 && (
                                    <div className="total-row change-due-row">
                                        <span>Change Due</span>
                                        <span>{formatCurrency(changeDue)}</span>
                                    </div>
                                )}

                                {newBalanceDue > 0 && !changeDue && (
                                    <div className="total-row new-balance-due-row">
                                        <span>New Balance Due</span>
                                        <span>{formatCurrency(newBalanceDue)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="finalize-section">
                        <div className="form-group">
                            <label htmlFor="tax-percent">Tax %</label>
                            <input id="tax-percent" type="number" className="input-field" value={taxPercent} onChange={e => onSessionUpdate({ taxPercent: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <button className="finalize-button" onClick={handlePreviewClick}>Finish Sale &amp; Preview</button>
                    </div>
                </aside>
            </main>
        </div>
    );
};


// --- PRODUCT INVENTORY PAGE ---
type ProductInventoryPageProps = {
    products: Product[];
    onAddProduct: (newProduct: Omit<Product, 'id' | 'shopId'>) => Promise<Product>;
    onBulkAddProducts: (products: Omit<Product, 'id' | 'shopId'>[]) => Promise<void>;
    shops: Shop[];
};
const ProductInventoryPage: React.FC<ProductInventoryPageProps> = ({ products, onAddProduct, onBulkAddProducts, shops }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products;
        const lowercasedTerm = searchTerm.toLowerCase();
        return products.filter(p => 
            p.name.toLowerCase().includes(lowercasedTerm) ||
            (p.barcode && p.barcode.toLowerCase().includes(lowercasedTerm)) ||
            (p.category && p.category.toLowerCase().includes(lowercasedTerm)) ||
            (p.subcategory && p.subcategory.toLowerCase().includes(lowercasedTerm))
        );
    }, [products, searchTerm]);

    const handleExportPdf = () => {
        const doc = new jsPDF();
        const tableColumn = ["ID", "Name (English)", "Category", "Subcategory", "Shop", "B2B Price", "B2C Price", "Stock", "Barcode"];
        const tableRows: (string | number)[][] = [];

        filteredProducts.forEach(product => {
            const productData = [
                product.id,
                product.name,
                product.category || 'N/A',
                product.subcategory || 'N/A',
                shops.find(s => s.id === product.shopId)?.name || 'N/A',
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
        const colWidths = [10, 40, 25, 25, 25, 20, 20, 15, 30];

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
            <div className="page-header">
                <h2 className="page-title">Product Inventory</h2>
                <div className="page-header-actions">
                    <button className="action-button-secondary" onClick={() => setIsImportModalOpen(true)}>Import Bulk Products</button>
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
                        <thead><tr><th>ID</th><th>Name (English)</th><th>Category</th><th>Subcategory</th><th>Shop</th><th>B2B Price</th><th>B2C Price</th><th>Stock</th><th>Barcode</th></tr></thead>
                        <tbody>
                            {filteredProducts.length === 0 && (
                                <tr><td colSpan={9} data-label="Status" style={{ textAlign: 'center', padding: '2rem' }}>No products found.</td></tr>
                            )}
                            {filteredProducts.map(p => (
                                <tr key={p.id} className={p.stock < LOW_STOCK_THRESHOLD ? 'low-stock' : ''}>
                                    <td data-label="ID">{p.id}</td>
                                    <td data-label="Name (English)">{p.name}</td>
                                    <td data-label="Category">{p.category || 'N/A'}</td>
                                    <td data-label="Subcategory">{p.subcategory || 'N/A'}</td>
                                    <td data-label="Shop">{shops.find(s => s.id === p.shopId)?.name || 'N/A'}</td>
                                    <td data-label="B2B Price">{formatCurrency(p.b2bPrice)}</td>
                                    <td data-label="B2C Price">{formatCurrency(p.b2cPrice)}</td>
                                    <td data-label="Stock">{p.stock}</td>
                                    <td data-label="Barcode">{p.barcode || 'N/A'}</td>
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
    onConfirmFinalizeSale: () => Promise<void>;
    isFinalized: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
    onMarginsChange: (margins: { top: number; right: number; bottom: number; left: number }) => void;
    offsets: { header: number; footer: number };
    onOffsetsChange: (offsets: { header: number; footer: number }) => void;
    fontStyle: InvoiceFontStyle;
    onFontStyleChange: (style: InvoiceFontStyle) => void;
};
const InvoicePage: React.FC<InvoicePageProps> = ({ saleData, onNavigate, settings, onSettingsChange, onConfirmFinalizeSale, isFinalized, margins, onMarginsChange, offsets, onOffsetsChange, fontStyle, onFontStyleChange }) => {
    const [paperSize, setPaperSize] = useState('4inch');
    const [fontSize, setFontSize] = useState('medium');
    const [whatsAppNumber, setWhatsAppNumber] = useState('');
    const invoiceRef = useRef<HTMLDivElement>(null);
    const [invoiceTitle, setInvoiceTitle] = useState('Invoice');
    const [isTitleEditing, setIsTitleEditing] = useState(false);
    const [isFooterEditing, setIsFooterEditing] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const footerInputRef = useRef<HTMLInputElement>(null);
    const { invoiceFooter } = settings;
    useEffect(() => { if (isTitleEditing && titleInputRef.current) titleInputRef.current.focus(); }, [isTitleEditing]);
    useEffect(() => { if (isFooterEditing && footerInputRef.current) footerInputRef.current.focus(); }, [isFooterEditing]);
    useEffect(() => { if (saleData?.customerMobile) setWhatsAppNumber(saleData.customerMobile); }, [saleData]);
    if (!saleData) return (<div className="page-container"><h2 className="page-title">Invoice</h2><p>No sale data available.</p><button onClick={() => onNavigate('New Sale')} className="action-button-primary">Back to Sale</button></div>);
    const { customerName, customerMobile, saleItems, subtotal, taxAmount, taxPercent, languageMode, grandTotal, previousBalance, totalBalanceDue, amountPaid, grossTotal, returnTotal, returnReason, paymentDetailsEntered } = saleData;
    const regularItems = saleItems.filter(item => !item.isReturn);
    const returnedItems = saleItems.filter(item => !item.isReturn);
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
    const handleFinalize = async () => {
        setIsFinalizing(true);
        try { await onConfirmFinalizeSale(); }
        catch (error) { alert(`Error finalizing sale: ${error instanceof Error ? error.message : String(error)}`); setIsFinalizing(false); }
    };
    return (
        <div className="page-container invoice-page-container">
            <div className={`invoice-paper size-${paperSize} font-${fontSize} font-style-${fontStyle}`} ref={invoiceRef} style={{ padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px` }}>
                <div className="printable-area">
                    <header className="invoice-header" style={{ transform: `translateY(${offsets.header}px)` }}>{isTitleEditing ? <input ref={titleInputRef} type="text" value={invoiceTitle} onChange={e => setInvoiceTitle(e.target.value)} onBlur={() => setIsTitleEditing(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setIsTitleEditing(false); }} className="invoice-title-input" /> : <h2 onDoubleClick={() => setIsTitleEditing(true)} title="Double-click to edit">{invoiceTitle}</h2>}</header>
                    <section className="invoice-customer">{(customerName || customerMobile) && (<><p><strong>Customer:</strong> {customerName || 'N/A'}</p><p><strong>Mobile:</strong> {customerMobile || 'N/A'}</p></>)}<p><strong>Date:</strong> {saleData.date.toLocaleString()}</p></section>
                    <table className="invoice-table"><thead><tr><th>{languageMode === 'English' ? 'S.No' : 'எண்'}</th><th>{languageMode === 'English' ? 'Item' : 'பொருள்'}</th><th>{languageMode === 'English' ? 'Qty' : 'அளவு'}</th><th>{languageMode === 'English' ? 'Price' : 'விலை'}</th><th>{languageMode === 'English' ? 'Total' : 'மொத்தம்'}</th></tr></thead><tbody>{regularItems.map((item, index) => (<tr key={index}><td>{index + 1}</td><td>{item.name}</td><td>{formatQuantityForInvoice(item.quantity)}</td><td>{formatPriceForInvoice(item.price)}</td><td>{formatNumberForInvoice(item.quantity * item.price)}</td></tr>))}</tbody></table>
                    {regularItems.length > 0 && (<div className="total-row invoice-section-total"><span>{languageMode === 'English' ? 'Gross Total' : 'மொத்த விற்பனை'}</span><span>{formatNumberForInvoice(finalGrossTotal)}</span></div>)}
                    {returnedItems.length > 0 && (<><h3 className="invoice-section-header">{languageMode === 'English' ? 'Return Items' : 'திரும்பிய பொருட்கள்'}</h3><table className="invoice-table"><tbody>{returnedItems.map((item, index) => (<tr key={index} className="is-return"><td>{index + 1}</td><td>{item.name}</td><td>{formatQuantityForInvoice(item.quantity)}</td><td>{formatPriceForInvoice(item.price)}</td><td className="return-amount">-{formatNumberForInvoice(item.quantity * item.price)}</td></tr>))}</tbody></table><div className="total-row return-total-row invoice-section-total"><span>{languageMode === 'English' ? 'Return Total' : 'திரும்பிய மொத்தம்'}</span><span className="return-amount">-{formatNumberForInvoice(finalReturnTotal)}</span></div>{returnReason && <p className="invoice-return-reason"><strong>Reason:</strong> {returnReason}</p>}</>)}
                    <footer className="invoice-footer" style={{ transform: `translateY(${offsets.footer}px)` }}><div className="invoice-totals">{taxPercent > 0 && (<div className="total-row"><span>{languageMode === 'English' ? `Tax (${taxPercent}%)` : `வரி (${taxPercent}%)`}</span><span>{formatNumberForInvoice(taxAmount)}</span></div>)}<div className="total-row grand-total"><span>{languageMode === 'English' ? 'Grand Total' : 'மொத்தத் தொகை'}</span><span>{formatCurrency(grandTotal)}</span></div>
                    <div className="balance-summary">
                        {previousBalance !== 0 && (
                            <div className="total-row"><span>{languageMode === 'English' ? 'Previous Balance' : 'முந்தைய இருப்பு'}</span><span>{formatCurrency(previousBalance)}</span></div>
                        )}
                        {paymentDetailsEntered && (
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
                <div className="invoice-main-actions"><button onClick={handlePrint} className="action-button-primary">Print</button><button onClick={handleSaveAsPdf} className="action-button-primary">Save as PDF</button><div className="whatsapp-group"><input type="tel" className="input-field" placeholder="WhatsApp Number" value={whatsAppNumber} onChange={e => setWhatsAppNumber(e.target.value)} /><button onClick={handleSendWhatsApp} className="action-button-primary">Send</button></div></div>
                <div className="invoice-controls"><div className="form-group"><label htmlFor="paper-size">Paper Size</label><select id="paper-size" value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="select-field"><option value="4inch">4 Inch</option><option value="a4">A4</option><option value="letter">Letter</option></select></div><div className="form-group"><label htmlFor="font-size">Font Size</label><select id="font-size" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="select-field"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div><div className="form-group"><label htmlFor="font-style">Font Style</label><select id="font-style" value={fontStyle} onChange={(e) => onFontStyleChange(e.target.value as InvoiceFontStyle)} className="select-field"><option value="monospace">Monospace</option><option value="sans-serif">Sans-Serif</option><option value="serif">Serif</option><option value="inconsolata">Inconsolata</option><option value="roboto">Roboto</option><option value="merriweather">Merriweather</option><option value="playfair">Playfair Display</option></select></div><div className="margin-controls"><label>Margins (px)</label><input type="number" title="Top" className="input-field" value={margins.top} onChange={e => handleMarginChange('top', e.target.value)} /><input type="number" title="Right" className="input-field" value={margins.right} onChange={e => handleMarginChange('right', e.target.value)} /><input type="number" title="Bottom" className="input-field" value={margins.bottom} onChange={e => handleMarginChange('bottom', e.target.value)} /><input type="number" title="Left" className="input-field" value={margins.left} onChange={e => handleMarginChange('left', e.target.value)} /></div><div className="offset-controls"><label>Offsets (px)</label><input type="number" title="Header Y" className="input-field" value={offsets.header} onChange={e => handleOffsetChange('header', e.target.value)} /><input type="number" title="Footer Y" className="input-field" value={offsets.footer} onChange={e => handleOffsetChange('footer', e.target.value)} /></div></div>
                <div className="finalize-actions-group"><button onClick={handleFinalize} className="finalize-button" disabled={isFinalized || isFinalizing}>{isFinalized ? 'Sale Recorded ✓' : (isFinalizing ? 'Recording...' : 'Finalize Sale')}</button><button onClick={() => onNavigate('New Sale')} className="action-button-secondary" disabled={isFinalizing}>Back to Sale</button></div>
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


// --- REPORTS PAGE COMPONENT ---
type ReportsPageProps = { salesHistory: SaleData[]; onViewInvoice: (sale: SaleData) => void; };
const ReportsPage: React.FC<ReportsPageProps> = ({ salesHistory, onViewInvoice }) => {
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | '7days' | '1month'>('today');
    const filteredSales = useMemo(() => {
        const now = new Date(); const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        return salesHistory.filter(sale => {
            const saleDate = new Date(sale.date);
            switch (filterPeriod) {
                case 'today': return saleDate >= todayStart;
                case 'yesterday': return saleDate >= yesterdayStart && saleDate < todayStart;
                case '7days': return saleDate >= sevenDaysAgo;
                case '1month': return saleDate >= oneMonthAgo;
                default: return true;
            }
        });
    }, [salesHistory, filterPeriod]);
    const reportStats = useMemo(() => {
        const totalSales = filteredSales.reduce((acc, sale) => acc + (sale.grandTotal || 0), 0);
        const itemsSold = filteredSales.reduce((acc, sale) => acc + sale.saleItems.reduce((itemAcc, item) => itemAcc + (item.isReturn ? -item.quantity : item.quantity), 0), 0);
        return { totalSales, itemsSold, transactionCount: filteredSales.length };
    }, [filteredSales]);
    return (<div className="page-container reports-page"><h2 className="page-title">Sales Reports</h2><div className="report-filters"><div className="form-group"><label htmlFor="report-period">Select Period</label><select id="report-period" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as any)} className="select-field"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 Days</option><option value="1month">Last 1 Month</option></select></div></div><div className="summary-cards"><div className="summary-card"><h3>Total Sales</h3><p>{formatCurrency(reportStats.totalSales)}</p></div><div className="summary-card"><h3>Items Sold</h3><p>{reportStats.itemsSold.toFixed(3)}</p></div><div className="summary-card"><h3>Transactions</h3><p>{reportStats.transactionCount}</p></div></div><div className="inventory-list-container"><table className="inventory-table sales-history-table"><thead><tr><th>Date</th><th>Customer</th><th>Items</th><th>Total Amount</th><th>Actions</th></tr></thead><tbody>{filteredSales.map(sale => (<tr key={sale.id}><td data-label="Date">{new Date(sale.date).toLocaleString()}</td><td data-label="Customer">{sale.customerName || 'N/A'} ({sale.customerMobile || 'N/A'})</td><td data-label="Items">{sale.saleItems.length}</td><td data-label="Total Amount">{formatCurrency(sale.grandTotal)}</td><td data-label="Actions"><button className="action-button-secondary" onClick={() => onViewInvoice(sale)}>View</button></td></tr>))}</tbody></table></div></div>);
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
type ShopManagementPageProps = { users: User[]; shops: Shop[]; onAddShop: (name: string) => Promise<void>; onAddUser: (user: Omit<User, 'id' | 'password'> & { password?: string }) => Promise<void>; onUpdateShop: (id: number, name: string) => void; };
const ShopManagementPage: React.FC<ShopManagementPageProps> = ({ users, shops, onAddShop, onAddUser, onUpdateShop }) => {
    const [newShopName, setNewShopName] = useState(''); const [newUsername, setNewUsername] = useState(''); const [newPassword, setNewPassword] = useState(''); const [newUserRole, setNewUserRole] = useState<'manager' | 'cashier'>('cashier'); const [newUserShopId, setNewUserShopId] = useState<number | undefined>(shops[0]?.id); const [editingShopId, setEditingShopId] = useState<number | null>(null); const [editingShopName, setEditingShopName] = useState('');
    const handleAddShop = async (e: React.FormEvent) => { e.preventDefault(); if (newShopName.trim()) { try { await onAddShop(newShopName.trim()); setNewShopName(''); } catch (error) { alert(`Error: ${error instanceof Error ? error.message : String(error)}`); } } };
    const handleAddUser = async (e: React.FormEvent) => { e.preventDefault(); if (newUsername.trim() && newPassword.trim() && newUserShopId) { try { await onAddUser({ username: newUsername.trim(), password: newPassword.trim(), role: newUserRole, shopId: newUserShopId, }); setNewUsername(''); setNewPassword(''); setNewUserRole('cashier'); setNewUserShopId(shops[0]?.id); } catch (error) { alert(`Error: ${error instanceof Error ? error.message : String(error)}`); } } };
    const handleStartEdit = (shop: Shop) => { setEditingShopId(shop.id); setEditingShopName(shop.name); }; const handleCancelEdit = () => { setEditingShopId(null); setEditingShopName(''); }
    const handleSaveEdit = (id: number) => { if (editingShopName.trim()) { onUpdateShop(id, editingShopName.trim()); handleCancelEdit(); } }
    return (<div className="page-container"><h2 className="page-title">Shop Management</h2><div className="shop-management-layout"><div className="management-card"><h3>Manage Shops</h3><form onSubmit={handleAddShop}><div className="form-group"><label htmlFor="new-shop-name">New Shop Name</label><input id="new-shop-name" type="text" className="input-field" value={newShopName} onChange={e => setNewShopName(e.target.value)} placeholder="e.g., Downtown Branch" /></div><button type="submit" className="action-button-primary">Add Shop</button></form><div className="shop-list-container"><h4>Existing Shops</h4><ul className="shop-list">{shops.map(shop => (<li key={shop.id} className="shop-list-item">{editingShopId === shop.id ? (<div className="edit-shop-form"><input type="text" className="input-field" value={editingShopName} onChange={(e) => setEditingShopName(e.target.value)} /><div className="edit-shop-actions"><button className="action-button-secondary" onClick={handleCancelEdit}>Cancel</button><button className="action-button-primary" onClick={() => handleSaveEdit(shop.id)}>Save</button></div></div>) : (<><span>{shop.name}</span><button className="action-button-secondary" onClick={() => handleStartEdit(shop)}>Edit</button></>)}</li>))}</ul></div></div><div className="management-card"><h3>Manage Users</h3><form onSubmit={handleAddUser}><div className="form-group"><label htmlFor="new-username">Username</label><input id="new-username" type="text" className="input-field" value={newUsername} onChange={e => setNewUsername(e.target.value)} required /></div><div className="form-group"><label htmlFor="new-password">Password</label><input id="new-password" type="text" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></div><div className="form-group"><label htmlFor="new-user-role">Role</label><select id="new-user-role" className="select-field" value={newUserRole} onChange={e => setNewUserRole(e.target.value as 'manager' | 'cashier')}><option value="cashier">Cashier</option><option value="manager">Manager</option></select></div><div className="form-group"><label htmlFor="new-user-shop">Shop</label><select id="new-user-shop" className="select-field" value={newUserShopId} onChange={e => setNewUserShopId(Number(e.target.value))} required>{shops.map(shop => (<option key={shop.id} value={shop.id}>{shop.name}</option>))}</select></div><button type="submit" className="action-button-primary">Add User</button></form><div className="user-list-container"><table className="inventory-table"><thead><tr><th>Username</th><th>Password</th><th>Role</th><th>Shop</th></tr></thead><tbody>{users.filter(u => u.role !== 'admin').map(user => (<tr key={user.username}><td data-label="Username">{user.username}</td><td data-label="Password">{user.password}</td><td data-label="Role">{user.role}</td><td data-label="Shop">{shops.find(s => s.id === user.shopId)?.name || 'N/A'}</td></tr>))}</tbody></table></div></div></div></div>);
};

// --- ADMIN DASHBOARD PAGE ---
type AdminDashboardPageProps = { allSalesHistory: SaleData[]; allProducts: Product[]; shops: Shop[]; };
const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ allSalesHistory, allProducts, shops }) => {
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | '7days' | '1month'>('today');
    const filteredSales = useMemo(() => {
        const now = new Date(); const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const yesterdayStart = new Date(todayStart.getTime() - 24*60*60*1000); const sevenDaysAgo = new Date(todayStart.getTime() - 6*24*60*60*1000); const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        return allSalesHistory.filter(sale => {
            const saleDate = new Date(sale.date);
            switch (filterPeriod) {
                case 'today': return saleDate >= todayStart;
                case 'yesterday': return saleDate >= yesterdayStart && saleDate < todayStart;
                case '7days': return saleDate >= sevenDaysAgo;
                case '1month': return saleDate >= oneMonthAgo;
                default: return true;
            }
        });
    }, [allSalesHistory, filterPeriod]);
    const { totalSales, transactionCount, salesByShop, topProducts } = useMemo(() => {
        const totalSales = filteredSales.reduce((acc, sale) => acc + sale.grandTotal, 0);
        const salesByShop = shops.map(shop => ({ shopId: shop.id, shopName: shop.name, totalSales: filteredSales.filter(s => s.shopId === shop.id).reduce((acc, sale) => acc + sale.grandTotal, 0), transactionCount: filteredSales.filter(s => s.shopId === shop.id).length })).sort((a, b) => b.totalSales - a.totalSales);
        const productSales = new Map<number, { name: string, quantity: number, total: number }>();
        filteredSales.forEach(sale => { sale.saleItems.forEach(item => { if (!item.isReturn) { const existing = productSales.get(item.productId) || { name: item.name, quantity: 0, total: 0 }; existing.quantity += item.quantity; existing.total += item.quantity * item.price; productSales.set(item.productId, existing); } }); });
        const topProducts = [...productSales.entries()].map(([productId, data]) => ({ productId, ...data })).sort((a, b) => b.total - a.total).slice(0, 10);
        return { totalSales, transactionCount: filteredSales.length, salesByShop, topProducts };
    }, [filteredSales, shops]);
    return (<div className="page-container admin-dashboard-page"><h2 className="page-title">Admin Dashboard</h2><div className="report-filters"><div className="form-group"><label htmlFor="report-period">Select Period</label><select id="report-period" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as any)} className="select-field"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 Days</option><option value="1month">Last 1 Month</option></select></div></div><div className="summary-cards"><div className="summary-card"><h3 data-label="Metric">Total Sales (All Shops)</h3><p>{formatCurrency(totalSales)}</p></div><div className="summary-card"><h3 data-label="Metric">Total Transactions</h3><p>{transactionCount}</p></div><div className="summary-card"><h3 data-label="Metric">Avg. Sale Value</h3><p>{formatCurrency(transactionCount > 0 ? totalSales / transactionCount : 0)}</p></div></div><div className="admin-dashboard-layout"><div className="dashboard-section management-card"><h3>Sales by Shop</h3><table className="inventory-table"><thead><tr><th>Shop Name</th><th>Transactions</th><th>Total Sales</th></tr></thead><tbody>{salesByShop.map(s => (<tr key={s.shopId}><td data-label="Shop Name">{s.shopName}</td><td data-label="Transactions">{s.transactionCount}</td><td data-label="Total Sales">{formatCurrency(s.totalSales)}</td></tr>))}</tbody></table></div><div className="dashboard-section management-card"><h3>Top Selling Products</h3><table className="inventory-table"><thead><tr><th>Product</th><th>Quantity Sold</th><th>Total Value</th></tr></thead><tbody>{topProducts.map(p => (<tr key={p.productId}><td data-label="Product">{p.name}</td><td data-label="Quantity Sold">{formatQuantity(p.quantity)}</td><td data-label="Total Value">{formatCurrency(p.total)}</td></tr>))}</tbody></table></div></div></div>);
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


// --- LOGIN PAGE COMPONENT ---
type LoginPageProps = { onLogin: (user: User) => void; };
const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [isLoggingIn, setIsLoggingIn] = useState(false);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(''); setIsLoggingIn(true);
        try {
            const { token, user } = await api.login(username, password);
            sessionStorage.setItem('authToken', token); onLogin(user);
        } catch (err) { setError(err instanceof Error ? err.message : 'Invalid credentials'); setIsLoggingIn(false); }
    };
    return (<div className="login-container"><form onSubmit={handleSubmit} className="login-form"><h2>BillEase POS Login</h2>{error && <p className="login-error">{error}</p>}<div className="form-group"><label htmlFor="username">Username</label><input id="username" type="text" className="input-field" value={username} onChange={e => setUsername(e.target.value)} required disabled={isLoggingIn} /></div><div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoggingIn} /></div><button type="submit" className="action-button-primary login-button" disabled={isLoggingIn}>{isLoggingIn ? 'Logging in...' : 'Login'}</button><div className="login-info"><p>Hint: admin/admin or manager1/password</p></div></form></div>);
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
    const [users, setUsers] = useState<User[]>([]);
    const [shops, setShops] = useState<Shop[]>([]);
    const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('desktop');
    const syncIntervalRef = useRef<number | null>(null);

    const initialSaleSession: SaleSession = useMemo(() => ({ customerName: '', customerMobile: '', priceMode: 'B2C', languageMode: 'English', taxPercent: 0, saleItems: [], amountPaid: '', returnReason: '', }), []);
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

    const currentShopContextId = useMemo(() => currentUser?.role === 'admin' ? selectedShopId : (currentUser?.shopId || null), [currentUser, selectedShopId]);
    
    const visibleProducts = useMemo(() => {
        if (currentUser?.role === 'admin') {
            if (!selectedShopId) return allProducts;
            return allProducts.filter(p => p.shopId === selectedShopId);
        }
        return allProducts.filter(p => p.shopId === currentUser?.shopId);
    }, [allProducts, currentUser, selectedShopId]);

    const visibleSalesHistory = useMemo(() => {
        if (currentUser?.role === 'admin') {
            if (!selectedShopId) return allSalesHistory;
            return allSalesHistory.filter(s => s.shopId === selectedShopId);
        }
        return allSalesHistory.filter(s => s.shopId === currentUser?.shopId);
    }, [allSalesHistory, currentUser, selectedShopId]);

    const visibleExpenses = useMemo(() => {
        if (currentUser?.role === 'admin') {
            if (!selectedShopId) return expenses;
            return expenses.filter(e => e.shopId === selectedShopId);
        }
        return expenses.filter(e => e.shopId === currentUser?.shopId);
    }, [expenses, currentUser, selectedShopId]);
    
    const visiblePurchaseOrders = useMemo(() => {
        if (currentUser?.role === 'admin') {
            if (!selectedShopId) return purchaseOrders;
            return purchaseOrders.filter(o => o.shopId === selectedShopId);
        }
        return purchaseOrders.filter(o => o.shopId === currentUser?.shopId);
    }, [purchaseOrders, currentUser, selectedShopId]);
    
    const visibleSalesOrders = useMemo(() => {
        if (currentUser?.role === 'admin') {
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
        setIsLoading(true); setAppError(null);
        try {
            const [shopsData, customersData, usersData, productsData, salesData] = await Promise.all([
                api.getShops(), api.getCustomers(), user.role === 'admin' ? api.getUsers() : Promise.resolve([]),
                api.getProducts(), api.getSales(),
            ]);
            await Promise.all([
                dbManager.clear('shops'), dbManager.clear('customers'), dbManager.clear('users'),
                dbManager.clear('products'), dbManager.clear('sales'), dbManager.clear('expenses'),
                dbManager.clear('purchaseOrders'), dbManager.clear('salesOrders')
            ]);
            await Promise.all([
                dbManager.bulkPut('shops', shopsData || []), dbManager.bulkPut('customers', customersData || []),
                dbManager.bulkPut('users', usersData || []), dbManager.bulkPut('products', productsData || []),
                dbManager.bulkPut('sales', (salesData || []).map(s => ({ ...s, date: new Date(s.date) }))),
            ]);
            setCurrentUser(user);
            setCurrentPage(user.role === 'admin' ? 'Admin Dashboard' : 'New Sale');
        } catch (err) {
            setAppError(err instanceof Error ? err.message : "Failed to sync initial data.");
            setIsLoading(false);
        }
    };
    const handleLogout = () => { sessionStorage.removeItem('authToken'); sessionStorage.removeItem('currentUser'); setCurrentUser(null); setAllProducts([]); setCustomers([]); setAllSalesHistory([]); setUsers([]); setShops([]); setSelectedShopId(null); };
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
            const updatedProductsMap = new Map(allProducts.map(p => [p.id, { ...p }]));
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

    const handlePreviewInvoice = (saleData: Omit<SaleData, 'id' | 'date'>) => {
        const completeSaleData: SaleData = { ...saleData, id: `sale-${Date.now()}`, date: new Date() };
        setPendingSaleData(completeSaleData); setIsSaleFinalized(false); setCurrentPage('Invoice');
    };
    const handleConfirmFinalizeSale = async () => {
        if (!pendingSaleData || isSaleFinalized) return;
        await dbManager.put('sales', pendingSaleData);
        await dbManager.put('outbox', { type: 'createSale', payload: pendingSaleData });
        const updatedProducts = [...allProducts];
        for (const item of pendingSaleData.saleItems) {
            const idx = updatedProducts.findIndex(p => p.id === item.productId);
            if (idx > -1) {
                updatedProducts[idx].stock += item.isReturn ? item.quantity : -item.quantity;
                await dbManager.put('products', updatedProducts[idx]);
            }
        }
        if (pendingSaleData.customerMobile) {
            const customer = await dbManager.get<Customer>('customers', pendingSaleData.customerMobile);
            const newCustomer: Customer = customer || { mobile: pendingSaleData.customerMobile, name: pendingSaleData.customerName, balance: 0 };
            newCustomer.balance = pendingSaleData.totalBalanceDue;
            newCustomer.name = pendingSaleData.customerName || newCustomer.name;
            await dbManager.put('customers', newCustomer);
        }
        setAllSalesHistory(prev => [pendingSaleData, ...prev].sort((a,b) => b.date.getTime() - a.date.getTime()));
        setAllProducts(updatedProducts);
        setCustomers(await dbManager.getAll('customers'));
        setIsSaleFinalized(true);
        resetCurrentSaleSession();
        processSyncQueue();
        await new Promise(resolve => setTimeout(resolve, 200));
        handleNavigate('New Sale');
    };
    const handleNavigate = (page: string) => {
        if (page === 'New Sale' && currentPage === 'Invoice' && !isSaleFinalized) {}
        else if (page === 'New Sale') { setPendingSaleData(null); setIsSaleFinalized(false); }
        setCurrentPage(page);
    };
    const handleViewInvoiceFromReport = (sale: SaleData) => { setPendingSaleData(sale); setIsSaleFinalized(true); setCurrentPage('Invoice'); };
    const handleShopChange = (shopId: number) => {
        setSelectedShopId(shopId === 0 ? null : shopId);
        setCurrentPage(shopId !== 0 ? 'Reports' : 'Admin Dashboard');
    };

    if (isLoading) return <div className={`theme-${theme} loading-container`}><h2>Loading BillEase POS...</h2></div>;
    if (!currentUser) return <div className={`theme-${theme}`} style={{height: '100%'}}><LoginPage onLogin={handleLogin} /></div>;
    if (appError) return <div className={`theme-${theme} error-container`}><h2>Error</h2><p>{appError}</p><button onClick={handleLogout}>Logout</button></div>;

    const renderPage = () => {
        switch (currentPage) {
            case 'Admin Dashboard': return <AdminDashboardPage allSalesHistory={allSalesHistory} allProducts={allProducts} shops={shops} />;
            case 'New Sale': return <NewSalePage products={visibleProducts} customers={customers} salesHistory={allSalesHistory} onPreviewInvoice={handlePreviewInvoice} onViewInvoice={handleViewInvoiceFromReport} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} userRole={currentUser.role} sessionData={saleSessions[activeBillIndex]} onSessionUpdate={updateCurrentSaleSession} activeBillIndex={activeBillIndex} onBillChange={setActiveBillIndex} currentShopId={currentShopContextId} viewMode={viewMode} onViewModeChange={setViewMode} />;
            case 'Product Inventory': return <ProductInventoryPage products={visibleProducts} onAddProduct={handleAddProduct} onBulkAddProducts={handleBulkAddProducts} shops={shops} />;
            case 'Order Management': return <OrderManagementPage purchaseOrders={visiblePurchaseOrders} salesOrders={visibleSalesOrders} products={allProducts} currentShopId={currentShopContextId} onAddPurchaseOrder={handleAddPurchaseOrder} onAddSalesOrder={handleAddSalesOrder} onUpdateOrderStatus={handleUpdateOrderStatus} onUpdateOrder={handleUpdateOrder} />;
            case 'Invoice': return <InvoicePage saleData={pendingSaleData} onNavigate={handleNavigate} settings={appSettings} onSettingsChange={setAppSettings} onConfirmFinalizeSale={handleConfirmFinalizeSale} isFinalized={isSaleFinalized} margins={invoiceMargins} onMarginsChange={setInvoiceMargins} offsets={invoiceTextOffsets} onOffsetsChange={setInvoiceTextOffsets} fontStyle={invoiceFontStyle} onFontStyleChange={setInvoiceFontStyle} />;
            case 'Customer Management': return <CustomerManagementPage customers={customers} onAddCustomer={handleAddCustomer} />;
            case 'Balance Due': return <BalanceDuePage customersWithBalance={customers.filter(c => c.balance > 0)} />;
            case 'Reports': return <ReportsPage salesHistory={visibleSalesHistory} onViewInvoice={handleViewInvoiceFromReport} />;
            case 'Expenses': return <ExpensesPage expenses={visibleExpenses} onAddExpense={handleAddExpense} shops={shops} />;
            case 'Notes': return <NotesPage notes={notes} setNotes={setNotes} />;
            case 'Settings': return <SettingsPage theme={theme} onThemeChange={setTheme} settings={appSettings} onSettingsChange={setAppSettings} appName={appName} onAppNameChange={setAppName} />;
            case 'Shop Management': return currentUser.role === 'admin' ? <ShopManagementPage users={users} shops={shops} onAddShop={handleAddShop} onAddUser={handleAddUser} onUpdateShop={handleUpdateShop} /> : <p>Access Denied</p>;
            default: return currentUser.role === 'admin' ? <AdminDashboardPage allSalesHistory={allSalesHistory} allProducts={allProducts} shops={shops} /> : <NewSalePage products={visibleProducts} customers={customers} salesHistory={allSalesHistory} onPreviewInvoice={handlePreviewInvoice} onViewInvoice={handleViewInvoiceFromReport} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} userRole={currentUser.role} sessionData={saleSessions[activeBillIndex]} onSessionUpdate={updateCurrentSaleSession} activeBillIndex={activeBillIndex} onBillChange={setActiveBillIndex} currentShopId={currentShopContextId} viewMode={viewMode} onViewModeChange={setViewMode} />;
        }
    };
    return (<div className={viewMode === 'mobile' ? 'view-mode-mobile' : ''}><AppHeader onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} appName={appName} shops={shops} selectedShopId={selectedShopId} onShopChange={handleShopChange} syncStatus={syncStatus} pendingSyncCount={pendingSyncCount} /><main className="app-main">{renderPage()}</main></div>);
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
