import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    newBalance: number;
    isBalanceEdited?: boolean;
    returnReason?: string;
}

interface Note {
    id: number;
    text: string;
    completed: boolean;
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
    editedNewBalance: string;
    returnReason?: string;
}

type Theme = 'dark' | 'light' | 'ocean-blue' | 'forest-green' | 'sunset-orange' | 'monokai' | 'nord' | 'professional-light' | 'charcoal' | 'slate';
type InvoiceFontStyle = 'monospace' | 'sans-serif' | 'serif' | 'roboto' | 'merriweather' | 'playfair' | 'inconsolata' | 'times-new-roman' | 'georgia' | 'lato' | 'source-code-pro';


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
    { id: 'sale-1', shopId: 1, date: new Date(new Date().setDate(new Date().getDate() - 1)), customerName: 'Alice', customerMobile: '111', saleItems: [{ productId: 1, name: 'Apple', quantity: 5, price: 0.5, isReturn: false }], grossTotal: 2.5, returnTotal: 0, subtotal: 2.5, taxAmount: 0, taxPercent: 0, grandTotal: 2.5, languageMode: 'English', previousBalance: 0, amountPaid: 2.5, newBalance: 0 },
    { id: 'sale-2', shopId: 2, date: new Date(), customerName: 'Bob', customerMobile: '222', saleItems: [{ productId: 3, name: 'Bread', quantity: 2, price: 2.5, isReturn: false }, { productId: 4, name: 'Coffee Beans', quantity: 1, price: 10, isReturn: false }], grossTotal: 15, returnTotal: 0, subtotal: 15, taxAmount: 0.75, taxPercent: 5, grandTotal: 15.75, languageMode: 'English', previousBalance: 10, amountPaid: 25.75, newBalance: 0 },
];


// --- API Client ---
const API_BASE_URL = '/api'; // Using a proxy to a real backend

const getAuthToken = () => sessionStorage.getItem('authToken');

const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    console.log(`Making API call to ${API_BASE_URL}${url}`, options);
    await new Promise(res => setTimeout(res, 300));

    // MOCK RESPONSES FOR DEMONSTRATION
    if (url.startsWith('/auth/login')) {
        const body = JSON.parse(options.body as string);
        if (body.username === 'admin' && body.password === 'admin') {
            return { token: 'fake-admin-token', user: { username: 'admin', role: 'admin' } };
        }
        if (body.username === 'manager1' && body.password === 'password') {
             return { token: 'fake-manager-token', user: { username: 'manager1', role: 'manager', shopId: 1 } };
        }
        throw new Error("Invalid credentials");
    }
    if(url === '/products') return MOCK_PRODUCTS;
    if(url.startsWith('/products?shop_id=')) {
        const shopId = Number(url.split('=')[1]);
        return MOCK_PRODUCTS.filter(p => p.shopId === shopId);
    }
    if(url === '/sales') return MOCK_SALES;
    if(url.startsWith('/sales?shop_id=')) {
        const shopId = Number(url.split('=')[1]);
        return MOCK_SALES.filter(s => s.shopId === shopId);
    }
    if(url.startsWith('/customers')) return [{ mobile: '+917601984346', name: 'Christy (from API)', balance: 50.75 }];
    if(url.startsWith('/users')) return [{ username: 'manager1', password: 'password', role: 'manager', shopId: 1 }];
    if(url.startsWith('/shops')) return [{ id: 1, name: "Main Street Branch" }, { id: 2, name: "Downtown Kiosk"}];
    if(options.method === 'POST' && url.startsWith('/sales')) return { ...JSON.parse(options.body as string), id: `sale-${Date.now()}` };
    if(options.method === 'POST') return { ...JSON.parse(options.body as string), id: Date.now() };


    // REAL FETCH LOGIC (commented out for demonstration)
    /*
    const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
    if (!response.ok) { throw new Error((await response.json()).message || 'API Error'); }
    if (response.status === 204) return null;
    return response.json();
    */
};


const api = {
    login: (username, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (user) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(user) }),
    getShops: () => apiFetch('/shops'),
    addShop: (name) => apiFetch('/shops', { method: 'POST', body: JSON.stringify({ name }) }),
    getUsers: () => apiFetch('/users'),
    getProducts: (shopId?: number) => apiFetch(shopId ? `/products?shop_id=${shopId}` : '/products'),
    addProduct: (product) => apiFetch('/products', { method: 'POST', body: JSON.stringify(product) }),
    updateProduct: (id, product) => apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) }),
    createSale: (sale) => apiFetch('/sales', { method: 'POST', body: JSON.stringify(sale) }),
    getSales: (shopId?: number) => apiFetch(shopId ? `/sales?shop_id=${shopId}` : '/sales'),
    getCustomers: () => apiFetch('/customers'),
    addCustomer: (customer) => apiFetch('/customers', { method: 'POST', body: JSON.stringify(customer) }),
    updateCustomerBalance: (id, balance) => apiFetch(`/customers/${id}/balance`, { method: 'POST', body: JSON.stringify({ balance }) }),
};


// --- UTILITY FUNCTIONS ---
const formatCurrency = (amount: number) => `₹${(amount || 0).toFixed(2)}`;
const formatQuantity = (quantity: number) => (quantity || 0).toFixed(3);
const formatNumberForInvoice = (amount: number) => (amount || 0).toFixed(2);
const formatPriceForInvoice = (amount: number) => (amount || 0).toFixed(1);
const formatQuantityForInvoice = (quantity: number) => (quantity || 0).toFixed(1);
const LOW_STOCK_THRESHOLD = 10;


// --- HEADER COMPONENT ---
type HeaderProps = {
  onNavigate: (page: string) => void;
  currentUser: User;
  onLogout: () => void;
  appName: string;
  shops: Shop[];
  selectedShopId: number | null;
  onShopChange: (shopId: number) => void;
};

const AppHeader: React.FC<HeaderProps> = ({ onNavigate, currentUser, onLogout, appName, shops, selectedShopId, onShopChange }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allMenuItems = ['Admin Dashboard', 'New Sale', 'Product Inventory', 'Customer Management', 'Reports', 'Notes', 'Settings', 'Balance Due', 'Shop Management'];
  const managerMenuItems = ['New Sale', 'Product Inventory', 'Customer Management', 'Reports', 'Notes', 'Balance Due'];
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentShopName = shops.find(s => s.id === selectedShopId)?.name || 'All Shops';

  return (
    <header className="app-header">
      <h1 className="header-title">{appName}</h1>
      <div className="header-user-info">
        <span>
            Welcome, {currentUser.username} ({currentUser.role})
            {currentUser.role !== 'admin' && ` @ ${currentShopName}`}
        </span>
        {currentUser.role === 'admin' && shops.length > 0 && (
            <div className="shop-selector">
                <label htmlFor="shop-select" className="sr-only">Select Shop</label>
                <select
                    id="shop-select"
                    className="select-field"
                    value={selectedShopId || 'all'}
                    onChange={(e) => onShopChange(e.target.value === 'all' ? 0 : Number(e.target.value))}
                >
                    <option value="all">All Shops (Dashboard)</option>
                    {shops.map(shop => (
                        <option key={shop.id} value={shop.id}>{shop.name}</option>
                    ))}
                </select>
            </div>
        )}
        <div className="dropdown" ref={dropdownRef}>
            <button className="dropdown-button" onClick={() => setDropdownOpen(!dropdownOpen)}>
            Menu ▾
            </button>
            <div className={`dropdown-content ${dropdownOpen ? 'show' : ''}`}>
            {menuItems.map(item => (
                <button key={item} className="dropdown-item" onClick={() => { onNavigate(item); setDropdownOpen(false); }}>
                {item}
                </button>
            ))}
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
    const [isAdding, setIsAdding] = useState(false);

    const nameTamilRef = useRef<HTMLInputElement>(null);
    const b2bRef = useRef<HTMLInputElement>(null);
    const b2cRef = useRef<HTMLInputElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const submitRef = useRef<HTMLButtonElement>(null);

    const formId = "add-product-form";

    if (!isOpen) return null;

    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProductName) return;
        setIsAdding(true);
        try {
            await onAddProduct({
                name: newProductName,
                nameTamil: newProductNameTamil,
                b2bPrice: newProductB2B,
                b2cPrice: newProductB2C,
                stock: newProductStock,
                barcode: newProductBarcode
            });
            setNewProductName('');
            setNewProductNameTamil('');
            setNewProductB2B(0);
            setNewProductB2C(0);
            setNewProductStock(0);
            setNewProductBarcode('');
            onClose();
        } catch (error) {
            alert(`Error adding product: ${error.message}`);
        } finally {
            setIsAdding(false);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef.current?.focus();
        }
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Add New Product</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <form id={formId} onSubmit={handleAddProduct} className="add-product-form">
                        <div className="form-group">
                           <label htmlFor="modal-new-product-name">Product Name (English)</label>
                           <input id="modal-new-product-name" type="text" className="input-field" value={newProductName} onChange={e => setNewProductName(e.target.value)} onKeyDown={e => handleKeyDown(e, nameTamilRef)} required />
                        </div>
                        <div className="form-group">
                           <label htmlFor="modal-new-product-name-tamil">Product Name (Tamil)</label>
                           <input ref={nameTamilRef} id="modal-new-product-name-tamil" type="text" className="input-field" value={newProductNameTamil} onChange={e => setNewProductNameTamil(e.target.value)} onKeyDown={e => handleKeyDown(e, b2bRef)} />
                        </div>
                        <div className="form-group">
                           <label htmlFor="modal-new-product-b2b">B2B Price</label>
                           <input ref={b2bRef} id="modal-new-product-b2b" type="number" step="0.01" className="input-field" value={newProductB2B} onChange={e => setNewProductB2B(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, b2cRef)} />
                        </div>
                        <div className="form-group">
                           <label htmlFor="modal-new-product-b2c">B2C Price</label>
                           <input ref={b2cRef} id="modal-new-product-b2c" type="number" step="0.01" className="input-field" value={newProductB2C} onChange={e => setNewProductB2C(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, stockRef)} />
                        </div>
                         <div className="form-group">
                           <label htmlFor="modal-new-product-stock">Initial Stock</label>
                           <input ref={stockRef} id="modal-new-product-stock" type="number" step="1" className="input-field" value={newProductStock} onChange={e => setNewProductStock(parseInt(e.target.value, 10) || 0)} onKeyDown={e => handleKeyDown(e, barcodeRef)} />
                        </div>
                        <div className="form-group">
                           <label htmlFor="modal-new-product-barcode">Barcode (Optional)</label>
                           <input ref={barcodeRef} id="modal-new-product-barcode" type="text" className="input-field" value={newProductBarcode} onChange={e => setNewProductBarcode(e.target.value)} onKeyDown={e => handleKeyDown(e, submitRef)} />
                        </div>
                    </form>
                </div>
                <div className="modal-footer">
                     <button className="action-button-secondary" type="button" onClick={onClose} disabled={isAdding}>Cancel</button>
                     <button ref={submitRef} type="submit" form={formId} className="action-button-primary" disabled={isAdding}>
                        {isAdding ? 'Adding...' : 'Add Product'}
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
    onPreviewInvoice: (saleData: Omit<SaleData, 'id' | 'date'>) => void;
    onAddProduct: (newProduct: Omit<Product, 'id' | 'shopId'>) => Promise<Product>;
    onUpdateProduct: (updatedProduct: Product) => void;
    userRole: User['role'];
    sessionData: SaleSession;
    onSessionUpdate: (updates: Partial<SaleSession>) => void;
    activeBillIndex: number;
    onBillChange: (index: number) => void;
    currentShopId: number | null;
};

const NewSalePage: React.FC<NewSalePageProps> = ({ 
    products, customers, onPreviewInvoice, onAddProduct, onUpdateProduct, userRole,
    sessionData, onSessionUpdate, activeBillIndex, onBillChange, currentShopId
}) => {
    const { customerName, customerMobile, priceMode, languageMode, taxPercent, saleItems, editedNewBalance, returnReason } = sessionData;

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [showAddNewSuggestion, setShowAddNewSuggestion] = useState(false);
    const [activeSuggestion, setActiveSuggestion] = useState(-1);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState('');
    const [voiceSearchHistory, setVoiceSearchHistory] = useState<string[]>([]);
    
    const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);

    const mobileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const prevSaleItemsLengthRef = useRef(saleItems.length);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const recognitionRef = useRef<any>(null); // To hold the recognition instance

    useEffect(() => {
        try {
            const history = JSON.parse(sessionStorage.getItem('voiceSearchHistory') || '[]');
            setVoiceSearchHistory(history);
        } catch (e) {
            setVoiceSearchHistory([]);
        }
    }, []);

    useEffect(() => {
        const foundCustomer = customers.find(c => c.mobile === customerMobile);
        setActiveCustomer(foundCustomer || null);
        if (foundCustomer && !customerName) {
            onSessionUpdate({ customerName: foundCustomer.name });
        }
        if (!foundCustomer) {
             setActiveCustomer(null);
        }
        onSessionUpdate({ editedNewBalance: '' }); // Reset edited balance when customer changes
    }, [customerMobile, customers]);

    useEffect(() => {
        if (saleItems.length > prevSaleItemsLengthRef.current) {
            const lastQuantityInput = document.querySelector<HTMLInputElement>(
                `.sales-grid tbody tr:last-child input[data-field="quantity"]`
            );
            if (lastQuantityInput) {
                lastQuantityInput.focus();
                lastQuantityInput.select();
            }
        }
        prevSaleItemsLengthRef.current = saleItems.length;
    }, [saleItems, activeBillIndex]);

    useEffect(() => {
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            const filtered = products.filter(p => 
                p.name.toLowerCase().includes(lowercasedTerm) ||
                p.barcode === searchTerm
            );
            setSuggestions(filtered);
            setShowAddNewSuggestion(filtered.length === 0 && !products.some(p => p.barcode === searchTerm));
        } else {
            setSuggestions([]);
            setShowAddNewSuggestion(false);
        }
        setActiveSuggestion(-1);
    }, [searchTerm, products]);
    
    // Barcode Scanner Effect
    useEffect(() => {
        if (isScannerOpen) {
            const scanner = new Html5QrcodeScanner(
                'barcode-reader', 
                { fps: 10, qrbox: { width: 250, height: 250 } }, 
                false
            );
            
            const handleSuccess = (decodedText: string) => {
                scanner.clear();
                setIsScannerOpen(false);
                const matchedProduct = products.find(p => p.barcode === decodedText);
                if (matchedProduct) {
                    handleProductSelect(matchedProduct);
                } else {
                    setSearchTerm(decodedText);
                    searchInputRef.current?.focus();
                }
            };
            
            const handleError = (error: any) => {
                // console.warn(`Barcode scan error: ${error}`);
            };

            scanner.render(handleSuccess, handleError);
            scannerRef.current = scanner;
        } else {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
                scannerRef.current = null;
            }
        }

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(err => console.error("Failed to clear scanner on unmount", err));
            }
        };
    }, [isScannerOpen, products]);


    const handleProductSelect = (product: Product) => {
        const newItems = [...saleItems];
        const existingItemIndex = newItems.findIndex(item => item.productId === product.id && !item.isReturn);
        if(existingItemIndex > -1) {
            newItems[existingItemIndex].quantity += 1;
        } else {
            const newItem: SaleItem = {
                productId: product.id,
                name: product.name,
                quantity: 1,
                price: priceMode === 'B2B' ? product.b2bPrice : product.b2cPrice,
                isReturn: false,
            };
            newItems.push(newItem);
        }
        onSessionUpdate({ saleItems: newItems });
        setSearchTerm('');
    };

    const handleAddNewProductSuggestion = async () => {
        try {
            const newProdData = {
                name: searchTerm,
                nameTamil: '',
                b2cPrice: 0,
                b2bPrice: 0,
                stock: 0,
                barcode: '',
            };
            const newProduct = await onAddProduct(newProdData);
            handleProductSelect(newProduct);
        } catch (error) {
            alert(`Error adding product: ${error.message}`);
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        const totalOptions = suggestions.length + (showAddNewSuggestion ? 1 : 0);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestion(prev => (prev < totalOptions - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestion(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            let selectionIndex = activeSuggestion;
            if (activeSuggestion === -1 && totalOptions > 0) {
                 selectionIndex = 0;
            }
            
            if (selectionIndex >= 0 && selectionIndex < suggestions.length) {
                handleProductSelect(suggestions[selectionIndex]);
            } else if (showAddNewSuggestion && selectionIndex === suggestions.length) {
                handleAddNewProductSuggestion();
            }
        }
    };

    const handleItemUpdate = (index: number, field: keyof SaleItem | 'name', value: any) => {
        const updatedItems = [...saleItems];
        (updatedItems[index] as any)[field] = value;
        onSessionUpdate({ saleItems: updatedItems });
        
        if (userRole !== 'admin') return;

        const item = updatedItems[index];
        const productToUpdate = products.find(p => p.id === item.productId);
        if (!productToUpdate) return;
        
        if (field === 'price') {
            const priceType = priceMode === 'B2B' ? 'b2bPrice' : 'b2cPrice';
            if (productToUpdate[priceType] !== value) {
                onUpdateProduct({ ...productToUpdate, [priceType]: value });
            }
        } else if (field === 'name') {
             if (productToUpdate.name !== value) {
                onUpdateProduct({ ...productToUpdate, name: value });
            }
        }
    };
    
    const handleItemRemove = (index: number) => {
        onSessionUpdate({ saleItems: saleItems.filter((_, i) => i !== index) });
    };

    const handleCustomerNameKeydown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            mobileInputRef.current?.focus();
        }
    }
    
    const handleMobileKeydown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchInputRef.current?.focus();
        }
    }

    const handleGridKeyDown = (e: React.KeyboardEvent, index: number, field: 'quantity' | 'price') => {
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
    
    const handleVoiceSearch = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setVoiceError("Sorry, your browser does not support voice recognition.");
            setTimeout(() => setVoiceError(''), 3000);
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        setIsListening(true);
        setVoiceError('');
        recognition.start();

        recognition.onresult = (event: any) => {
            const speechResult = event.results[0][0].transcript;
            setSearchTerm(speechResult);

            // Update history
            const newHistory = [speechResult, ...voiceSearchHistory.filter(item => item !== speechResult)].slice(0, 5);
            setVoiceSearchHistory(newHistory);
            sessionStorage.setItem('voiceSearchHistory', JSON.stringify(newHistory));
        };

        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };
        
        recognition.onnomatch = () => {
            setVoiceError("Didn’t catch that, please try again");
            setTimeout(() => setVoiceError(''), 3000);
        };

        recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                setVoiceError(`Error: ${event.error}`);
                setTimeout(() => setVoiceError(''), 3000);
            }
        };
    };


    const { grossTotal, returnTotal, netTotal, taxAmount, grandTotal, finalNewBalance, amountPaidForInvoice, isEdited } = useMemo(() => {
        const grossTotal = saleItems.filter(item => !item.isReturn).reduce((acc, item) => acc + item.quantity * item.price, 0);
        const returnTotal = saleItems.filter(item => item.isReturn).reduce((acc, item) => acc + item.quantity * item.price, 0);
        const netTotal = grossTotal - returnTotal;
        const taxAmount = netTotal * (taxPercent / 100);
        const grandTotal = netTotal + taxAmount;
        
        const previousBalance = activeCustomer?.balance ?? 0;
        const totalDue = previousBalance + grandTotal;

        const isEdited = editedNewBalance !== '';
        const parsedEdited = parseFloat(editedNewBalance);
        
        const finalNewBalance = isEdited && !isNaN(parsedEdited) 
            ? parsedEdited
            : previousBalance;
            
        const amountPaidForInvoice = totalDue - finalNewBalance;
        
        return { grossTotal, returnTotal, netTotal, taxAmount, grandTotal, finalNewBalance, amountPaidForInvoice, isEdited };
    }, [saleItems, taxPercent, activeCustomer, editedNewBalance]);

    const handlePreviewClick = () => {
        if (saleItems.length === 0) {
            alert("Cannot preview an empty sale.");
            return;
        }
        if (!currentShopId) {
            alert("Cannot create a sale without a selected shop.");
            return;
        }
        onPreviewInvoice({
            shopId: currentShopId,
            customerName,
            customerMobile,
            saleItems,
            grossTotal,
            returnTotal,
            subtotal: netTotal,
            taxAmount,
            taxPercent,
            grandTotal,
            languageMode,
            previousBalance: activeCustomer?.balance ?? 0,
            amountPaid: amountPaidForInvoice,
            newBalance: finalNewBalance,
            isBalanceEdited: isEdited && !isNaN(parseFloat(editedNewBalance)),
            returnReason,
        });
    };

    return (
        <div className="page-container">
            <main className="new-sale-layout">
                <section className="sale-main" aria-labelledby="sale-heading">
                    <h2 id="sale-heading" className="page-title" style={{ marginBottom: 'var(--padding-md)' }}>New Sale</h2>

                    <div className="settings-toggles-top">
                        <div className="toggles-group-left">
                           <div className="toggle-switch">
                                <button className={`toggle-button ${priceMode === 'B2C' ? 'active' : ''}`} onClick={() => onSessionUpdate({ priceMode: 'B2C' })}>B2C</button>
                                <button className={`toggle-button ${priceMode === 'B2B' ? 'active' : ''}`} onClick={() => onSessionUpdate({ priceMode: 'B2B' })}>B2B</button>
                            </div>
                            <div className="toggle-switch">
                                <button className={`toggle-button ${languageMode === 'English' ? 'active' : ''}`} onClick={() => onSessionUpdate({ languageMode: 'English'})}>English</button>
                                <button className={`toggle-button ${languageMode === 'Tamil' ? 'active' : ''}`} onClick={() => onSessionUpdate({ languageMode: 'Tamil' })}>Tamil</button>
                            </div>
                        </div>
                         <div className="toggle-switch">
                            {[0, 1, 2].map(index => (
                                <button key={index} className={`toggle-button ${activeBillIndex === index ? 'active' : ''}`} onClick={() => onBillChange(index)}>{index + 1}</button>
                            ))}
                        </div>
                    </div>

                    <div className="customer-details">
                         <div className="form-group">
                            <label htmlFor="customer-name">Customer Name</label>
                            <input id="customer-name" type="text" className="input-field" value={customerName} onChange={e => onSessionUpdate({ customerName: e.target.value })} onKeyDown={handleCustomerNameKeydown} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="customer-mobile">Customer Mobile Number</label>
                            <input id="customer-mobile" type="text" className="input-field" ref={mobileInputRef} value={customerMobile} onChange={e => onSessionUpdate({ customerMobile: e.target.value })} onKeyDown={handleMobileKeydown} />
                        </div>
                    </div>

                    <div className="product-search-area">
                        <div className="form-group product-search-container">
                            <label htmlFor="product-search">Product Search</label>
                             <div className="input-with-icons">
                                <input 
                                    id="product-search" 
                                    type="text" 
                                    className="input-field" 
                                    placeholder="Start typing product name..."
                                    ref={searchInputRef}
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    autoComplete="off"
                                />
                                <button onClick={handleVoiceSearch} className={`input-icon-button ${isListening ? 'voice-listening' : ''}`} aria-label="Search by voice">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg>
                                </button>
                                <button onClick={() => setIsScannerOpen(true)} className="input-icon-button" aria-label="Scan barcode">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h2V3h2v2h2V3h2v2h2V3h2v2h2V3h2v2h2v14H3V5zm2 2v2H5V7h2zm4 0v2H9V7h2zm4 0v2h-2V7h2zm4 0v2h-2V7h2zM5 11h2v2H5v-2zm4 0h2v2H9v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"></path></svg>
                                </button>
                            </div>
                            {(suggestions.length > 0 || showAddNewSuggestion) && (
                                <div className="product-suggestions">
                                    {suggestions.map((p, i) => (
                                        <div 
                                            key={p.id} 
                                            className={`suggestion-item ${i === activeSuggestion ? 'active' : ''}`}
                                            onClick={() => handleProductSelect(p)}
                                            onMouseEnter={() => setActiveSuggestion(i)}
                                        >
                                            {p.name}
                                        </div>
                                    ))}
                                    {showAddNewSuggestion && (
                                         <div 
                                            className={`suggestion-item add-new-item ${suggestions.length === activeSuggestion ? 'active' : ''}`}
                                            onClick={handleAddNewProductSuggestion}
                                            onMouseEnter={() => setActiveSuggestion(suggestions.length)}
                                        >
                                            + Add "{searchTerm}" as new product
                                        </div>
                                    )}
                                </div>
                            )}
                             <div className="voice-search-extras">
                                {voiceError && <p className="voice-error-message">{voiceError}</p>}
                                {voiceSearchHistory.length > 0 && (
                                    <div className="voice-search-history">
                                        {voiceSearchHistory.map((item, index) => (
                                            <button key={index} className="history-item" onClick={() => setSearchTerm(item)}>
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {isScannerOpen && (
                        <div className="barcode-scanner-container">
                            <div id="barcode-reader" style={{ width: '100%', maxWidth: '500px' }}></div>
                            <button onClick={() => setIsScannerOpen(false)} className="action-button-secondary">Cancel</button>
                        </div>
                    )}

                    <div className="sales-grid-container">
                        <table className="sales-grid" aria-label="Sales Items">
                            <thead>
                                <tr>
                                    <th>S.No</th>
                                    <th>Product Description</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                    <th>Total</th>
                                    <th>Return</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {saleItems.length === 0 && (
                                    <tr>
                                        <td colSpan={7} style={{textAlign: 'center', padding: '2rem'}}>No items in sale.</td>
                                    </tr>
                                )}
                                {saleItems.map((item, index) => (
                                    <tr key={`${item.productId}-${index}`} className={item.isReturn ? 'is-return' : ''}>
                                        <td>{index + 1}</td>
                                        <td>
                                            <input 
                                                type="text"
                                                className="input-field-seamless"
                                                value={item.name}
                                                onChange={e => handleItemUpdate(index, 'name', e.target.value)}
                                                aria-label={`Product name for ${item.name}`}
                                                disabled={userRole !== 'admin'}
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="input-field"
                                                data-field="quantity"
                                                value={item.quantity} 
                                                onChange={e => handleItemUpdate(index, 'quantity', parseFloat(e.target.value) || 0)}
                                                onKeyDown={e => handleGridKeyDown(e, index, 'quantity')}
                                                aria-label={`Quantity for ${item.name}`}
                                                step="0.001"
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="input-field"
                                                data-field="price"
                                                value={item.price} 
                                                onChange={e => handleItemUpdate(index, 'price', parseFloat(e.target.value) || 0)}
                                                onKeyDown={e => handleGridKeyDown(e, index, 'price')}
                                                aria-label={`Price for ${item.name}`}
                                                step="0.01"
                                                disabled={userRole !== 'admin'}
                                            />
                                        </td>
                                        <td>{formatNumberForInvoice(item.quantity * item.price)}</td>
                                        <td>
                                          <button
                                            className={`return-toggle-button ${item.isReturn ? 'is-return-active' : ''}`}
                                            onClick={() => handleItemUpdate(index, 'isReturn', !item.isReturn)}
                                            aria-label={`Toggle return status for ${item.name}. Currently ${item.isReturn ? 'Yes' : 'No'}`}
                                          >
                                            {item.isReturn ? 'Y' : 'N'}
                                          </button>
                                        </td>
                                        <td>
                                          <button className="action-button" onClick={() => handleItemRemove(index)} aria-label={`Remove ${item.name}`}>
                                            &times;
                                          </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <aside className="sale-sidebar">
                    {saleItems.some(i => i.isReturn) && (
                        <div className="form-group">
                            <label htmlFor="return-reason">Reason for Return (Optional)</label>
                            <textarea
                                id="return-reason"
                                className="input-field"
                                rows={2}
                                value={returnReason || ''}
                                onChange={e => onSessionUpdate({ returnReason: e.target.value })}
                                placeholder="e.g., Damaged item"
                            />
                        </div>
                    )}

                    <div className="totals-summary">
                        {(activeCustomer && activeCustomer.balance !== 0) && (
                            <div className="total-row">
                                <span>Previous Balance</span>
                                <span>{formatCurrency(activeCustomer.balance)}</span>
                            </div>
                        )}

                        <div className="total-row">
                            <span>Gross Total</span>
                            <span>{formatCurrency(grossTotal)}</span>
                        </div>
                        {returnTotal > 0 && (
                            <div className="total-row return-total-row">
                                <span>Return Total</span>
                                <span>-{formatCurrency(returnTotal)}</span>
                            </div>
                        )}
                        
                        <div className="total-row total-due-row">
                            <span>Total Due</span>
                            <span>{formatCurrency((activeCustomer?.balance ?? 0) + grandTotal)}</span>
                        </div>
                        
                        <div className="total-row grand-total">
                            <span>New Balance Due</span>
                            <input
                                type="number"
                                className="input-field"
                                value={editedNewBalance}
                                onChange={e => onSessionUpdate({ editedNewBalance: e.target.value })}
                                placeholder={formatCurrency(activeCustomer?.balance ?? 0)}
                                step="0.01"
                                aria-label="New Balance Due"
                            />
                        </div>
                    </div>
                    
                    <div className="finalize-section">
                        <button className="finalize-button" onClick={handlePreviewClick}>Preview Invoice</button>
                         <div className="form-group">
                            <label htmlFor="tax-percent">Tax %</label>
                            <input id="tax-percent" type="number" className="input-field" value={taxPercent} onChange={e => onSessionUpdate({ taxPercent: parseFloat(e.target.value) || 0 })} />
                        </div>
                        {taxPercent > 0 && (
                            <div className="total-row">
                                <span>Tax ({taxPercent}%)</span>
                                <span>{formatCurrency(taxAmount)}</span>
                            </div>
                        )}
                        <div className="total-row">
                            <span>Grand Total</span>
                            <span>{formatCurrency(grandTotal)}</span>
                        </div>
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
    shops: Shop[];
};
const ProductInventoryPage: React.FC<ProductInventoryPageProps> = ({ products, onAddProduct, shops }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    return (
        <div className="page-container">
            <AddProductModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onAddProduct={onAddProduct} 
            />
            <div className="page-header">
                <h2 className="page-title">Product Inventory</h2>
                <div className="page-header-actions">
                    <button className="action-button-secondary" onClick={() => setIsAddModalOpen(true)}>
                        Add New Product
                    </button>
                </div>
            </div>
            <div className="inventory-layout">
                <div className="inventory-list-container">
                     <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name (English)</th>
                                <th>Name (Tamil)</th>
                                <th>Shop</th>
                                <th>B2B Price</th>
                                <th>B2C Price</th>
                                <th>Stock</th>
                                <th>Barcode</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(p => (
                                <tr key={p.id} className={p.stock < LOW_STOCK_THRESHOLD ? 'low-stock' : ''}>
                                    <td>{p.id}</td>
                                    <td>{p.name}</td>
                                    <td>{p.nameTamil}</td>
                                    <td>{shops.find(s => s.id === p.shopId)?.name || 'N/A'}</td>
                                    <td>{formatCurrency(p.b2bPrice)}</td>
                                    <td>{formatCurrency(p.b2cPrice)}</td>
                                    <td>{p.stock}</td>
                                    <td>{p.barcode || 'N/A'}</td>
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
const InvoicePage: React.FC<InvoicePageProps> = ({ 
    saleData, onNavigate, settings, onSettingsChange, onConfirmFinalizeSale, isFinalized, 
    margins, onMarginsChange, offsets, onOffsetsChange, fontStyle, onFontStyleChange 
}) => {
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

    useEffect(() => {
        if (isTitleEditing && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isTitleEditing]);

    useEffect(() => {
        if (isFooterEditing && footerInputRef.current) {
            footerInputRef.current.focus();
            footerInputRef.current.select();
        }
    }, [isFooterEditing]);

    useEffect(() => {
        if (saleData?.customerMobile) {
            setWhatsAppNumber(saleData.customerMobile);
        }
    }, [saleData]);

    if (!saleData) {
        return (
            <div className="page-container">
                <h2 className="page-title">Invoice</h2>
                <p>No sale data available. Please start a new sale.</p>
                <button onClick={() => onNavigate('New Sale')} className="action-button-primary">Back to Sale</button>
            </div>
        );
    }
    
    const { 
        customerName, customerMobile, saleItems, subtotal, taxAmount, taxPercent, languageMode,
        grandTotal, previousBalance, amountPaid, newBalance, isBalanceEdited,
        grossTotal, returnTotal, returnReason
    } = saleData;

    const regularItems = saleItems.filter(item => !item.isReturn);
    const returnedItems = saleItems.filter(item => item.isReturn);

    // For backward compatibility with old sale data from reports
    const finalGrossTotal = grossTotal ?? regularItems.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const finalReturnTotal = returnTotal ?? returnedItems.reduce((acc, item) => acc + item.quantity * item.price, 0);


    const handlePrint = () => {
        window.print();
    };
    
    const handleMarginChange = (side: keyof typeof margins, value: string) => {
        onMarginsChange({ ...margins, [side]: parseInt(value, 10) || 0 });
    };
    
    const handleOffsetChange = (type: keyof typeof offsets, value: string) => {
        onOffsetsChange({ ...offsets, [type]: parseInt(value, 10) || 0 });
    };

    const handleSaveAsPdf = async () => {
        const input = invoiceRef.current;
        if (!input) return;

        const canvas = await html2canvas(input, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: [canvas.width, canvas.height]
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`invoice-${saleData.id}.pdf`);
    };

    const handleSendWhatsApp = () => {
        if (!whatsAppNumber) {
            alert('Please enter a mobile number to send the invoice.');
            return;
        }

        let message = `*Invoice from BillEase POS*\n\n`;
        message += `Customer: ${customerName || 'N/A'}\n`;
        message += `Date: ${saleData.date.toLocaleString()}\n\n`;
        message += `*Items:*\n`;
        regularItems.forEach(item => {
            const itemTotal = item.quantity * item.price;
            message += `- ${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatPriceForInvoice(item.price)}) = ${formatCurrency(itemTotal)}\n`;
        });
        if (returnedItems.length > 0) {
            message += `\n*Returned Items:*\n`;
            returnedItems.forEach(item => {
                const itemTotal = item.quantity * item.price;
                message += `- ${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatPriceForInvoice(item.price)}) = -${formatCurrency(itemTotal)}\n`;
            });
        }
        message += `\n*Summary:*\n`;
        message += `Net Total: ${formatCurrency(subtotal)}\n`;
        if (taxPercent > 0) {
            message += `Tax (${taxPercent}%): ${formatNumberForInvoice(taxAmount)}\n`;
        }
        message += `Grand Total: ${formatCurrency(grandTotal)}\n`;
        if (previousBalance !== 0) {
            message += `Previous Balance: ${formatCurrency(previousBalance)}\n`;
        }
        message += `*New Balance Due: ${formatCurrency(newBalance)}*\n\n`;
        message += `${invoiceFooter}`;

        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.whatsapp.com/send?phone=${whatsAppNumber.replace(/\D/g, '')}&text=${encodedMessage}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleFinalize = async () => {
        setIsFinalizing(true);
        try {
            await onConfirmFinalizeSale();
        } catch (error) {
            alert(`Error finalizing sale: ${error.message}`);
            setIsFinalizing(false);
        }
    };

    return (
        <div className="page-container invoice-page-container">
            <div 
                className={`invoice-paper size-${paperSize} font-${fontSize} font-style-${fontStyle}`} 
                ref={invoiceRef}
                style={{ padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px` }}
            >
                <div className="printable-area">
                    <header className="invoice-header" style={{ transform: `translateY(${offsets.header}px)` }}>
                        {isTitleEditing ? (
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={invoiceTitle}
                                onChange={e => setInvoiceTitle(e.target.value)}
                                onBlur={() => setIsTitleEditing(false)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setIsTitleEditing(false); }}
                                className="invoice-title-input"
                            />
                        ) : (
                            <h2 onDoubleClick={() => setIsTitleEditing(true)} title="Double-click to edit">{invoiceTitle}</h2>
                        )}
                    </header>
                    <section className="invoice-customer">
                        {(customerName || customerMobile) && (
                            <>
                                <p><strong>Customer:</strong> {customerName || 'N/A'}</p>
                                <p><strong>Mobile:</strong> {customerMobile || 'N/A'}</p>
                            </>
                        )}
                        <p><strong>Date:</strong> {saleData.date.toLocaleString()}</p>
                    </section>
                    <table className="invoice-table">
                        <thead>
                            <tr>
                                <th>{languageMode === 'English' ? 'S.No' : 'எண்'}</th>
                                <th>{languageMode === 'English' ? 'Item' : 'பொருள்'}</th>
                                <th>{languageMode === 'English' ? 'Qty' : 'அளவு'}</th>
                                <th>{languageMode === 'English' ? 'Price' : 'விலை'}</th>
                                <th>{languageMode === 'English' ? 'Total' : 'மொத்தம்'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {regularItems.map((item, index) => (
                               <tr key={index}>
                                   <td>{index + 1}</td>
                                   <td>{item.name}</td>
                                   <td>{formatQuantityForInvoice(item.quantity)}</td>
                                   <td>{formatPriceForInvoice(item.price)}</td>
                                   <td>{formatNumberForInvoice(item.quantity * item.price)}</td>
                               </tr>
                            ))}
                        </tbody>
                    </table>

                    {regularItems.length > 0 && (
                        <div className="total-row invoice-section-total">
                            <span>{languageMode === 'English' ? 'Gross Total' : 'மொத்த விற்பனை'}</span>
                            <span>{formatNumberForInvoice(finalGrossTotal)}</span>
                        </div>
                    )}

                    {returnedItems.length > 0 && (
                        <>
                            <h3 className="invoice-section-header">{languageMode === 'English' ? 'Return Items' : 'திரும்பிய பொருட்கள்'}</h3>
                             <table className="invoice-table">
                                <tbody>
                                    {returnedItems.map((item, index) => (
                                       <tr key={index} className="is-return">
                                           <td>{index + 1}</td>
                                           <td>{item.name}</td>
                                           <td>{formatQuantityForInvoice(item.quantity)}</td>
                                           <td>{formatPriceForInvoice(item.price)}</td>
                                           <td className="return-amount">-{formatNumberForInvoice(item.quantity * item.price)}</td>
                                       </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="total-row return-total-row invoice-section-total">
                                <span>{languageMode === 'English' ? 'Return Total' : 'திரும்பிய மொத்தம்'}</span>
                                <span className="return-amount">-{formatNumberForInvoice(finalReturnTotal)}</span>
                            </div>
                            {returnReason && <p className="invoice-return-reason"><strong>Reason:</strong> {returnReason}</p>}
                        </>
                    )}

                    <footer className="invoice-footer" style={{ transform: `translateY(${offsets.footer}px)` }}>
                        <div className="invoice-totals">
                            {taxPercent > 0 && (
                                <div className="total-row">
                                    <span>{languageMode === 'English' ? `Tax (${taxPercent}%)` : `வரி (${taxPercent}%)`}</span>
                                    <span>{formatNumberForInvoice(taxAmount)}</span>
                                </div>
                            )}
                            <div className="total-row grand-total">
                                <span>{languageMode === 'English' ? 'Grand Total' : 'மொத்தத் தொகை'}</span>
                                <span>{formatCurrency(grandTotal)}</span>
                            </div>
                            <div className="balance-summary">
                                {previousBalance !== 0 && (
                                    <div className="total-row">
                                        <span>{languageMode === 'English' ? 'Previous Balance' : 'முந்தைய இருப்பு'}</span>
                                        <span>{formatCurrency(previousBalance)}</span>
                                    </div>
                                )}
                                {(isFinalized || isBalanceEdited) && (
                                    <div className="total-row grand-total">
                                        <span>{languageMode === 'English' ? 'New Balance Due' : 'புதிய இருப்பு'}</span>
                                        <span>{formatCurrency(newBalance)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        {invoiceFooter && (
                            isFooterEditing ? (
                                <input
                                    ref={footerInputRef}
                                    type="text"
                                    value={invoiceFooter}
                                    onChange={e => onSettingsChange({ ...settings, invoiceFooter: e.target.value })}
                                    onBlur={() => setIsFooterEditing(false)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setIsFooterEditing(false); }}
                                    className="invoice-footer-input"
                                />
                            ) : (
                                <p className="invoice-custom-footer" onDoubleClick={() => setIsFooterEditing(true)} title="Double-click to edit">
                                    {invoiceFooter}
                                </p>
                            )
                        )}
                    </footer>
                </div>
            </div>
            <div className="invoice-actions">
                <div className="invoice-main-actions">
                    <button onClick={handlePrint} className="action-button-primary">Print</button>
                    <button onClick={handleSaveAsPdf} className="action-button-primary">Save as PDF</button>
                    <div className="whatsapp-group">
                        <input 
                            type="tel" 
                            className="input-field"
                            placeholder="WhatsApp Number" 
                            value={whatsAppNumber}
                            onChange={e => setWhatsAppNumber(e.target.value)}
                        />
                         <button onClick={handleSendWhatsApp} className="action-button-primary">Send</button>
                    </div>
                </div>

                <div className="invoice-controls">
                     <div className="form-group">
                        <label htmlFor="paper-size">Paper Size</label>
                        <select id="paper-size" value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="select-field">
                            <option value="4inch">4 Inch (Default)</option>
                            <option value="a4">A4</option>
                            <option value="letter">Letter</option>
                        </select>
                    </div>
                     <div className="form-group">
                        <label htmlFor="font-size">Font Size</label>
                        <select id="font-size" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="select-field">
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="font-style">Font Style</label>
                        <select id="font-style" value={fontStyle} onChange={(e) => onFontStyleChange(e.target.value as InvoiceFontStyle)} className="select-field">
                            <option value="monospace">System Monospace (Courier)</option>
                            <option value="sans-serif">System Sans-Serif (Helvetica)</option>
                            <option value="serif">System Serif (Times New Roman)</option>
                            <option value="inconsolata">Inconsolata (Monospace)</option>
                            <option value="roboto">Roboto (Sans-Serif)</option>
                            <option value="merriweather">Merriweather (Serif)</option>
                            <option value="playfair">Playfair Display (Serif)</option>
                            <option value="times-new-roman">Times New Roman</option>
                            <option value="georgia">Georgia (Serif)</option>
                            <option value="lato">Lato (Sans-Serif)</option>
                            <option value="source-code-pro">Source Code Pro (Monospace)</option>
                        </select>
                    </div>
                    <div className="margin-controls">
                        <label>Margins (px)</label>
                        <input type="number" title="Top" aria-label="Top Margin" className="input-field" value={margins.top} onChange={e => handleMarginChange('top', e.target.value)} />
                        <input type="number" title="Right" aria-label="Right Margin" className="input-field" value={margins.right} onChange={e => handleMarginChange('right', e.target.value)} />
                        <input type="number" title="Bottom" aria-label="Bottom Margin" className="input-field" value={margins.bottom} onChange={e => handleMarginChange('bottom', e.target.value)} />
                        <input type="number" title="Left" aria-label="Left Margin" className="input-field" value={margins.left} onChange={e => handleMarginChange('left', e.target.value)} />
                    </div>
                    <div className="offset-controls">
                        <label>Offsets (px)</label>
                        <input type="number" title="Header Y" aria-label="Header Y Offset" className="input-field" value={offsets.header} onChange={e => handleOffsetChange('header', e.target.value)} />
                        <input type="number" title="Footer Y" aria-label="Footer Y Offset" className="input-field" value={offsets.footer} onChange={e => handleOffsetChange('footer', e.target.value)} />
                    </div>
                </div>
                
                <div className="finalize-actions-group">
                    <button 
                        onClick={handleFinalize} 
                        className="finalize-button"
                        disabled={isFinalized || isFinalizing}
                    >
                        {isFinalized ? 'Sale Recorded ✓' : (isFinalizing ? 'Recording...' : 'Finalize Sale')}
                    </button>
                    <button onClick={() => onNavigate('New Sale')} className="action-button-secondary" disabled={isFinalizing}>Back to Sale</button>
                </div>
            </div>
        </div>
    );
};


// --- NOTES PAGE COMPONENT ---
type NotesPageProps = {
    notes: Note[];
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
};
const NotesPage: React.FC<NotesPageProps> = ({ notes, setNotes }) => {
    const [newNote, setNewNote] = useState('');
    const nextNoteId = useRef(Math.max(0, ...notes.map(n => n.id)) + 1);

    const handleAddNote = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNote.trim()) return;
        const note: Note = {
            id: nextNoteId.current++,
            text: newNote,
            completed: false
        };
        setNotes(prev => [...prev, note]);
        setNewNote('');
    };
    
    const toggleNote = (id: number) => {
        setNotes(prev => prev.map(note => note.id === id ? { ...note, completed: !note.completed } : note));
    };

    const deleteNote = (id: number) => {
        setNotes(prev => prev.filter(note => note.id !== id));
    };

    return (
        <div className="page-container">
            <h2 className="page-title">Notes & To-Do</h2>
            <div className="notes-page-layout">
                <form onSubmit={handleAddNote} className="add-note-form">
                    <input
                        type="text"
                        className="input-field"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a new note or task..."
                    />
                    <button type="submit" className="action-button-primary">Add</button>
                </form>
                <ul className="notes-list">
                    {notes.map(note => (
                        <li key={note.id} className={`note-item ${note.completed ? 'completed' : ''}`}>
                            <input
                                type="checkbox"
                                checked={note.completed}
                                onChange={() => toggleNote(note.id)}
                                aria-label={`Mark note as ${note.completed ? 'incomplete' : 'complete'}`}
                            />
                            <span className="note-text">{note.text}</span>
                            <button onClick={() => deleteNote(note.id)} className="action-button" aria-label="Delete note">&times;</button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

// --- ADD CUSTOMER MODAL ---
type AddCustomerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onAddCustomer: (newCustomer: Omit<Customer, 'balance'>) => Promise<void>;
};
const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, onAddCustomer }) => {
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const mobileRef = useRef<HTMLInputElement>(null);
    const submitRef = useRef<HTMLButtonElement>(null);
    const formId = "add-customer-form";

    useEffect(() => {
        if (isOpen) {
            // Reset state when modal opens
            setName('');
            setMobile('');
            setIsAdding(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !mobile) return;
        setIsAdding(true);
        try {
            await onAddCustomer({ name, mobile });
            onClose();
        } catch (error) {
            alert(`Error adding customer: ${error.message}`);
        } finally {
            setIsAdding(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef.current?.focus();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Add New Customer</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <form id={formId} onSubmit={handleSubmit} className="add-product-form">
                        <div className="form-group">
                            <label htmlFor="modal-new-customer-name">Customer Name</label>
                            <input id="modal-new-customer-name" type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => handleKeyDown(e, mobileRef)} required autoFocus />
                        </div>
                        <div className="form-group">
                            <label htmlFor="modal-new-customer-mobile">Mobile Number</label>
                            <input ref={mobileRef} id="modal-new-customer-mobile" type="text" className="input-field" value={mobile} onChange={e => setMobile(e.target.value)} onKeyDown={e => handleKeyDown(e, submitRef)} required />
                        </div>
                    </form>
                </div>
                <div className="modal-footer">
                    <button className="action-button-secondary" type="button" onClick={onClose} disabled={isAdding}>Cancel</button>
                    <button ref={submitRef} type="submit" form={formId} className="action-button-primary" disabled={isAdding}>
                        {isAdding ? 'Adding...' : 'Add Customer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- CUSTOMER MANAGEMENT PAGE ---
type CustomerManagementPageProps = {
    customers: Customer[];
    onAddCustomer: (newCustomer: Omit<Customer, 'balance'>) => Promise<void>;
};
const CustomerManagementPage: React.FC<CustomerManagementPageProps> = ({ customers, onAddCustomer }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const filteredCustomers = useMemo(() => {
        const lowercasedTerm = searchTerm.toLowerCase();
        if (!lowercasedTerm) return customers;
        return customers.filter(c => 
            c.name.toLowerCase().includes(lowercasedTerm) || 
            c.mobile.includes(lowercasedTerm)
        );
    }, [searchTerm, customers]);
    
    useEffect(() => {
        if (selectedCustomer && !customers.find(c => c.mobile === selectedCustomer.mobile)) {
            setSelectedCustomer(null);
        }
    }, [customers, selectedCustomer]);

    return (
        <div className="page-container customer-management-page">
             <AddCustomerModal 
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onAddCustomer={onAddCustomer}
            />
            <div className="page-header">
                <h2 className="page-title">Customer Management</h2>
                <div className="page-header-actions">
                    <button className="action-button-primary" onClick={() => setIsAddModalOpen(true)}>
                        Add New Customer
                    </button>
                </div>
            </div>
            <div className="customer-management-layout">
                <aside className="customer-list-panel">
                    <div className="customer-search">
                        <div className="input-with-icon">
                           <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                               <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
                           </svg>
                            <input 
                                type="text" 
                                className="input-field"
                                placeholder="Search customers..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="customer-list">
                        {filteredCustomers.map(customer => (
                            <button 
                                key={customer.mobile} 
                                className={`customer-list-item ${selectedCustomer?.mobile === customer.mobile ? 'active' : ''}`}
                                onClick={() => setSelectedCustomer(customer)}
                                aria-pressed={selectedCustomer?.mobile === customer.mobile}
                            >
                                <span className="customer-name">{customer.name}</span>
                                <span className="customer-mobile">{customer.mobile}</span>
                            </button>
                        ))}
                         {filteredCustomers.length === 0 && (
                            <div className="customer-list-empty">
                                <p>No customers found.</p>
                            </div>
                        )}
                    </div>
                </aside>
                <main className="customer-details-panel" role="region" aria-live="polite">
                    {selectedCustomer ? (
                        <div className="customer-details-view">
                           <h3>{selectedCustomer.name}</h3>
                           <p><strong>Mobile:</strong> {selectedCustomer.mobile}</p>
                           <p><strong>Balance Due:</strong> {formatCurrency(selectedCustomer.balance)}</p>
                           <div className="purchase-history-placeholder">
                               <h4>Purchase History</h4>
                               <p>Purchase history will be displayed here in a future update.</p>
                           </div>
                        </div>
                    ) : (
                        <div className="customer-details-placeholder">
                            <p>Select a customer from the list to view their details and purchase history.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};


// --- BALANCE DUE PAGE ---
type BalanceDuePageProps = {
    customersWithBalance: Customer[];
};
const BalanceDuePage: React.FC<BalanceDuePageProps> = ({ customersWithBalance }) => {
    return (
        <div className="page-container">
            <h2 className="page-title">Balance Due Customers</h2>
            <div className="inventory-list-container">
                <table className="customer-table inventory-table">
                    <thead>
                        <tr>
                            <th>Customer Name</th>
                            <th>Mobile Number</th>
                            <th>Balance Due</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customersWithBalance.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ textAlign: 'center', padding: '2rem' }}>No customers with outstanding balance.</td>
                            </tr>
                        )}
                        {customersWithBalance.sort((a,b) => b.balance - a.balance).map(c => (
                            <tr key={c.mobile}>
                                <td>{c.name}</td>
                                <td>{c.mobile}</td>
                                <td>{formatCurrency(c.balance)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- REPORTS PAGE COMPONENT ---
type ReportsPageProps = {
    salesHistory: SaleData[];
    onViewInvoice: (sale: SaleData) => void;
};
const ReportsPage: React.FC<ReportsPageProps> = ({ salesHistory, onViewInvoice }) => {
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | '7days' | '1month'>('today');

    const filteredSales = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        return salesHistory.filter(sale => {
            const saleDate = sale.date;
            switch (filterPeriod) {
                case 'today':
                    return saleDate >= todayStart;
                case 'yesterday':
                    return saleDate >= yesterdayStart && saleDate < todayStart;
                case '7days':
                    return saleDate >= sevenDaysAgo;
                case '1month':
                    return saleDate >= oneMonthAgo;
                default:
                    return true;
            }
        });
    }, [salesHistory, filterPeriod]);

    const reportStats = useMemo(() => {
        const totalSales = filteredSales.reduce((acc, sale) => acc + (sale.grandTotal || 0), 0);
        const itemsSold = filteredSales.reduce((acc, sale) => acc + sale.saleItems.reduce((itemAcc, item) => itemAcc + (item.isReturn ? -item.quantity : item.quantity), 0), 0);
        const transactionCount = filteredSales.length;
        return { totalSales, itemsSold, transactionCount };
    }, [filteredSales]);

    return (
        <div className="page-container reports-page">
            <h2 className="page-title">Sales Reports</h2>
            <div className="report-filters">
                <div className="form-group">
                    <label htmlFor="report-period">Select Period</label>
                    <select id="report-period" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as any)} className="select-field">
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="1month">Last 1 Month</option>
                    </select>
                </div>
            </div>
            <div className="summary-cards">
                <div className="summary-card">
                    <h3>Total Sales</h3>
                    <p>{formatCurrency(reportStats.totalSales)}</p>
                </div>
                <div className="summary-card">
                    <h3>Items Sold</h3>
                    <p>{reportStats.itemsSold.toFixed(3)}</p>
                </div>
                <div className="summary-card">
                    <h3>Transactions</h3>
                    <p>{reportStats.transactionCount}</p>
                </div>
            </div>
            <div className="inventory-list-container">
                <table className="inventory-table sales-history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Total Amount</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSales.map(sale => (
                            <tr key={sale.id}>
                                <td>{sale.date.toLocaleString()}</td>
                                <td>{sale.customerName || 'N/A'} ({sale.customerMobile || 'N/A'})</td>
                                <td>{sale.saleItems.length}</td>
                                <td>{formatCurrency(sale.grandTotal)}</td>
                                <td>
                                    <button 
                                        className="action-button-secondary"
                                        onClick={() => onViewInvoice(sale)}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- SETTINGS PAGE COMPONENT ---
type SettingsPageProps = {
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    appName: string;
    onAppNameChange: (name: string) => void;
};
const SettingsPage: React.FC<SettingsPageProps> = ({ theme, onThemeChange, settings, onSettingsChange, appName, onAppNameChange }) => {
    
    const handleFooterChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onSettingsChange({ ...settings, invoiceFooter: e.target.value });
    };
    
    const themes: {id: Theme, name: string}[] = [
        {id: 'light', name: 'Light'},
        {id: 'dark', name: 'Dark'},
        {id: 'professional-light', name: 'Professional'},
        {id: 'charcoal', name: 'Charcoal'},
        {id: 'slate', name: 'Slate'},
        {id: 'ocean-blue', name: 'Ocean Blue'},
        {id: 'forest-green', name: 'Forest Green'},
        {id: 'sunset-orange', name: 'Sunset Orange'},
        {id: 'monokai', name: 'Monokai'},
        {id: 'nord', name: 'Nord'},
    ];

    return (
        <div className="page-container">
            <h2 className="page-title">Settings</h2>
            <div className="settings-layout">
                 <div className="settings-card">
                    <h3>General</h3>
                    <div className="form-group">
                        <label htmlFor="app-name">POS Name</label>
                        <input id="app-name" type="text" className="input-field" value={appName} onChange={e => onAppNameChange(e.target.value)} />
                    </div>
                 </div>
                 <div className="settings-card">
                    <h3>Interface Theme</h3>
                    <div className="toggle-group">
                        <label>Theme</label>
                        <div className="toggle-switch theme-selector">
                            {themes.map(t => (
                                <button key={t.id} className={`toggle-button ${theme === t.id ? 'active' : ''}`} onClick={() => onThemeChange(t.id)}>{t.name}</button>
                            ))}
                        </div>
                    </div>
                 </div>
                 <div className="settings-card">
                    <h3>Invoice Customization</h3>
                     <div className="form-group">
                        <label htmlFor="invoice-footer">Invoice Footer Text</label>
                        <textarea 
                            id="invoice-footer"
                            className="input-field" 
                            rows={3}
                            value={settings.invoiceFooter}
                            onChange={handleFooterChange}
                        ></textarea>
                    </div>
                 </div>
            </div>
        </div>
    );
};

// --- SHOP MANAGEMENT PAGE ---
type ShopManagementPageProps = {
    users: User[];
    shops: Shop[];
    onAddShop: (name: string) => Promise<void>;
    onAddUser: (user: Omit<User, 'id' | 'password'> & { password?: string }) => Promise<void>;
    onUpdateShop: (id: number, name: string) => void;
};

const ShopManagementPage: React.FC<ShopManagementPageProps> = ({ users, shops, onAddShop, onAddUser, onUpdateShop }) => {
    const [newShopName, setNewShopName] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState<'manager' | 'cashier'>('cashier');
    const [newUserShopId, setNewUserShopId] = useState<number | undefined>(shops[0]?.id);
    
    const [editingShopId, setEditingShopId] = useState<number | null>(null);
    const [editingShopName, setEditingShopName] = useState('');

    const handleAddShop = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newShopName.trim()) {
            try {
                await onAddShop(newShopName.trim());
                setNewShopName('');
            } catch (error) {
                alert(`Error adding shop: ${error.message}`);
            }
        }
    };
    
    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newUsername.trim() && newPassword.trim() && newUserShopId) {
            try {
                await onAddUser({
                    username: newUsername.trim(),
                    password: newPassword.trim(),
                    role: newUserRole,
                    shopId: newUserShopId,
                });
                setNewUsername('');
                setNewPassword('');
                setNewUserRole('cashier');
                setNewUserShopId(shops[0]?.id);
            } catch (error) {
                alert(`Error adding user: ${error.message}`);
            }
        }
    };

    const handleStartEdit = (shop: Shop) => {
        setEditingShopId(shop.id);
        setEditingShopName(shop.name);
    };
    
    const handleCancelEdit = () => {
        setEditingShopId(null);
        setEditingShopName('');
    }
    
    const handleSaveEdit = (id: number) => {
        if (editingShopName.trim()) {
            // onUpdateShop is not async in this example, assuming it's a local/optimistic update
            onUpdateShop(id, editingShopName.trim());
            handleCancelEdit();
        }
    }

    return (
        <div className="page-container">
            <h2 className="page-title">Shop Management</h2>
            <div className="shop-management-layout">
                <div className="management-card">
                    <h3>Manage Shops</h3>
                    <form onSubmit={handleAddShop}>
                        <div className="form-group">
                            <label htmlFor="new-shop-name">New Shop Name</label>
                            <input
                                id="new-shop-name"
                                type="text"
                                className="input-field"
                                value={newShopName}
                                onChange={e => setNewShopName(e.target.value)}
                                placeholder="e.g., Downtown Branch"
                            />
                        </div>
                        <button type="submit" className="action-button-primary">Add Shop</button>
                    </form>
                    <div className="shop-list-container">
                        <h4>Existing Shops</h4>
                        <ul className="shop-list">
                            {shops.map(shop => (
                                <li key={shop.id} className="shop-list-item">
                                    {editingShopId === shop.id ? (
                                        <div className="edit-shop-form">
                                            <input 
                                                type="text" 
                                                className="input-field" 
                                                value={editingShopName} 
                                                onChange={(e) => setEditingShopName(e.target.value)} 
                                            />
                                            <div className="edit-shop-actions">
                                                <button className="action-button-secondary" onClick={handleCancelEdit}>Cancel</button>
                                                <button className="action-button-primary" onClick={() => handleSaveEdit(shop.id)}>Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <span>{shop.name}</span>
                                            <button className="action-button-secondary" onClick={() => handleStartEdit(shop)}>Edit</button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="management-card">
                    <h3>Manage Users</h3>
                    <form onSubmit={handleAddUser}>
                        <div className="form-group">
                            <label htmlFor="new-username">Username</label>
                            <input id="new-username" type="text" className="input-field" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
                        </div>
                         <div className="form-group">
                            <label htmlFor="new-password">Password</label>
                            <input id="new-password" type="text" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                        </div>
                         <div className="form-group">
                            <label htmlFor="new-user-role">Role</label>
                            <select id="new-user-role" className="select-field" value={newUserRole} onChange={e => setNewUserRole(e.target.value as 'manager' | 'cashier')}>
                                <option value="cashier">Cashier</option>
                                <option value="manager">Manager</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="new-user-shop">Shop</label>
                            <select id="new-user-shop" className="select-field" value={newUserShopId} onChange={e => setNewUserShopId(Number(e.target.value))} required>
                                {shops.map(shop => (
                                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="action-button-primary">Add User</button>
                    </form>
                    <div className="user-list-container">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Password</th>
                                    <th>Role</th>
                                    <th>Shop</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.filter(u => u.role !== 'admin').map(user => (
                                    <tr key={user.username}>
                                        <td>{user.username}</td>
                                        <td>{user.password}</td>
                                        <td>{user.role}</td>
                                        <td>{shops.find(s => s.id === user.shopId)?.name || 'N/A'}</td>
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

// --- ADMIN DASHBOARD PAGE ---
type AdminDashboardPageProps = {
    allSalesHistory: SaleData[];
    allProducts: Product[];
    shops: Shop[];
};
const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ allSalesHistory, allProducts, shops }) => {
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | '7days' | '1month'>('today');

    const filteredSales = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        return allSalesHistory.filter(sale => {
            const saleDate = sale.date;
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
        const transactionCount = filteredSales.length;

        const salesByShop = shops.map(shop => {
            const shopSales = filteredSales.filter(sale => sale.shopId === shop.id);
            return {
                shopId: shop.id,
                shopName: shop.name,
                totalSales: shopSales.reduce((acc, sale) => acc + sale.grandTotal, 0),
                transactionCount: shopSales.length,
            };
        }).sort((a, b) => b.totalSales - a.totalSales);

        const productSales = new Map<number, { name: string, quantity: number, total: number }>();
        filteredSales.forEach(sale => {
            sale.saleItems.forEach(item => {
                if (!item.isReturn) {
                    const existing = productSales.get(item.productId) || { name: item.name, quantity: 0, total: 0 };
                    existing.quantity += item.quantity;
                    existing.total += item.quantity * item.price;
                    productSales.set(item.productId, existing);
                }
            });
        });
        const topProducts = [...productSales.entries()]
            .map(([productId, data]) => ({ productId, ...data }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        return { totalSales, transactionCount, salesByShop, topProducts };
    }, [filteredSales, shops]);

    return (
        <div className="page-container admin-dashboard-page">
            <h2 className="page-title">Admin Dashboard</h2>
            <div className="report-filters">
                <div className="form-group">
                    <label htmlFor="report-period">Select Period</label>
                    <select id="report-period" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as any)} className="select-field">
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="1month">Last 1 Month</option>
                    </select>
                </div>
            </div>
            <div className="summary-cards">
                <div className="summary-card">
                    <h3>Total Sales (All Shops)</h3>
                    <p>{formatCurrency(totalSales)}</p>
                </div>
                <div className="summary-card">
                    <h3>Total Transactions</h3>
                    <p>{transactionCount}</p>
                </div>
                <div className="summary-card">
                    <h3>Avg. Sale Value</h3>
                    <p>{formatCurrency(transactionCount > 0 ? totalSales / transactionCount : 0)}</p>
                </div>
            </div>
            <div className="admin-dashboard-layout">
                <div className="dashboard-section management-card">
                    <h3>Sales by Shop</h3>
                    <table className="inventory-table">
                        <thead>
                            <tr><th>Shop Name</th><th>Transactions</th><th>Total Sales</th></tr>
                        </thead>
                        <tbody>
                            {salesByShop.map(s => (
                                <tr key={s.shopId}>
                                    <td>{s.shopName}</td>
                                    <td>{s.transactionCount}</td>
                                    <td>{formatCurrency(s.totalSales)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="dashboard-section management-card">
                    <h3>Top Selling Products</h3>
                     <table className="inventory-table">
                        <thead>
                            <tr><th>Product</th><th>Quantity Sold</th><th>Total Value</th></tr>
                        </thead>
                        <tbody>
                            {topProducts.map(p => (
                                <tr key={p.productId}>
                                    <td>{p.name}</td>
                                    <td>{formatQuantity(p.quantity)}</td>
                                    <td>{formatCurrency(p.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- LOGIN PAGE COMPONENT ---
type LoginPageProps = {
    onLogin: (user: User) => void;
};
const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);
        try {
            const { token, user } = await api.login(username, password);
            sessionStorage.setItem('authToken', token);
            onLogin(user);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Invalid username or password';
            setError(errorMessage);
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="login-container">
            <form onSubmit={handleSubmit} className="login-form">
                <h2>BillEase POS Login</h2>
                {error && <p className="login-error">{error}</p>}
                <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input 
                        id="username"
                        type="text"
                        className="input-field"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                        disabled={isLoggingIn}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input 
                        id="password"
                        type="password"
                        className="input-field"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        disabled={isLoggingIn}
                    />
                </div>
                <button type="submit" className="action-button-primary login-button" disabled={isLoggingIn}>
                    {isLoggingIn ? 'Logging in...' : 'Login'}
                </button>
                <div className="login-info">
                  <p>Hint: admin/admin or manager1/password</p>
                </div>
            </form>
        </div>
    );
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
    const [pendingSaleData, setPendingSaleData] = useState<SaleData | null>(null);
    const [isSaleFinalized, setIsSaleFinalized] = useState<boolean>(false);
    const [theme, setTheme] = useState<Theme>('dark');
    const [appName, setAppName] = useState('BillEase POS');
    const [appSettings, setAppSettings] = useState<AppSettings>({ invoiceFooter: 'Thank you for your business!' });
    const [invoiceMargins, setInvoiceMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
    const [invoiceTextOffsets, setInvoiceTextOffsets] = useState({ header: 0, footer: 0 });
    const [invoiceFontStyle, setInvoiceFontStyle] = useState<InvoiceFontStyle>('monospace');
    const [users, setUsers] = useState<User[]>([]);
    const [shops, setShops] = useState<Shop[]>([]);
    const [selectedShopId, setSelectedShopId] = useState<number | null>(null);


    const initialSaleSession: SaleSession = useMemo(() => ({
        customerName: '',
        customerMobile: '',
        priceMode: 'B2C',
        languageMode: 'English',
        taxPercent: 0,
        saleItems: [],
        editedNewBalance: '',
        returnReason: '',
    }), []);

    const [saleSessions, setSaleSessions] = useState<SaleSession[]>([
        {...initialSaleSession},
        {...initialSaleSession},
        {...initialSaleSession},
    ]);
    const [activeBillIndex, setActiveBillIndex] = useState(0);

    // Check for existing session on initial load
    useEffect(() => {
        const checkSession = () => {
            const token = getAuthToken();
            if (token) {
                try {
                    const user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
                    if (user) {
                        setCurrentUser(user);
                    } else {
                        setIsLoading(false); // No user, stop loading, show login
                    }
                } catch {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        };
        checkSession();
    }, []);

    // Main data fetching effect
    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser) return;
            setIsLoading(true);
            setAppError(null);

            try {
                const [shopsData, customersData, usersData] = await Promise.all([
                    api.getShops(),
                    api.getCustomers(),
                    currentUser.role === 'admin' ? api.getUsers() : Promise.resolve([]),
                ]);
                const allShops = shopsData || [];
                setShops(allShops);
                setCustomers(customersData || []);
                if (currentUser.role === 'admin') {
                    setUsers(usersData || []);
                }
                
                let shopIdToFetch: number | undefined;
                if(currentUser.role === 'admin') {
                    // For admin, fetch ALL sales and products
                    shopIdToFetch = undefined; 
                } else {
                    shopIdToFetch = currentUser.shopId;
                     if (!shopIdToFetch) {
                        throw new Error("User has no assigned shop.");
                    }
                }

                const [productsData, salesData] = await Promise.all([
                    api.getProducts(shopIdToFetch),
                    api.getSales(shopIdToFetch),
                ]);
                setAllProducts(productsData || []);
                setAllSalesHistory((salesData || []).map(s => ({ ...s, date: new Date(s.date) })));

            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Failed to load application data.";
                setAppError(errorMessage);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [currentUser]); // Re-fetches only when user logs in/out

    const currentShopContextId = useMemo(() => {
        if (currentUser?.role === 'admin') return selectedShopId;
        return currentUser?.shopId || null;
    }, [currentUser, selectedShopId]);
    
    const visibleProducts = useMemo(() => {
        if (currentUser?.role !== 'admin') return allProducts;
        if (!selectedShopId) return allProducts;
        return allProducts.filter(p => p.shopId === selectedShopId);
    }, [allProducts, currentUser, selectedShopId]);

    const visibleSalesHistory = useMemo(() => {
        if (currentUser?.role !== 'admin') return allSalesHistory;
        if (!selectedShopId) return allSalesHistory;
        return allSalesHistory.filter(s => s.shopId === selectedShopId);
    }, [allSalesHistory, currentUser, selectedShopId]);


    const updateCurrentSaleSession = (updates: Partial<SaleSession>) => {
        setSaleSessions(prev => {
            const newSessions = [...prev];
            newSessions[activeBillIndex] = { ...newSessions[activeBillIndex], ...updates };
            return newSessions;
        });
    };

    const resetCurrentSaleSession = () => {
        setSaleSessions(prev => {
            const newSessions = [...prev];
            newSessions[activeBillIndex] = {...initialSaleSession};
            return newSessions;
        });
    }

    useEffect(() => {
        document.body.className = `theme-${theme}`;
    }, [theme]);

    const handleLogin = (user: User) => {
        sessionStorage.setItem('currentUser', JSON.stringify(user));
        setCurrentUser(user);
        setCurrentPage(user.role === 'admin' ? 'Admin Dashboard' : 'New Sale');
    };

    const handleLogout = () => {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('currentUser');
        setCurrentUser(null);
        setAllProducts([]);
        setCustomers([]);
        setAllSalesHistory([]);
        setUsers([]);
        setShops([]);
        setSelectedShopId(null);
    };

    const handleAddProduct = async (newProductData: Omit<Product, 'id' | 'shopId'>): Promise<Product> => {
        if (!currentShopContextId) {
            throw new Error("Cannot add a product without a selected shop.");
        }
        const fullProductData = { ...newProductData, shopId: currentShopContextId };
        const newProduct = await api.addProduct(fullProductData);
        setAllProducts(prev => [...prev, newProduct]);
        return newProduct;
    };
    
    const handleAddCustomer = async (newCustomerData: Omit<Customer, 'balance'>) => {
        if (customers.some(c => c.mobile === newCustomerData.mobile)) {
            throw new Error("A customer with this mobile number already exists.");
        }
        const newCustomer = await api.addCustomer(newCustomerData);
        setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
    };
    
    const handleUpdateProduct = async (updatedProduct: Product) => {
        try {
            const returnedProduct = await api.updateProduct(updatedProduct.id, updatedProduct);
            setAllProducts(prev => prev.map(p => p.id === returnedProduct.id ? returnedProduct : p));
        } catch (error) {
            console.error("Failed to update product:", error);
            // Optionally show an error to the user
        }
    };
    
    const handleAddShop = async (name: string) => {
        const newShop = await api.addShop(name);
        setShops(prev => [...prev, newShop]);
    };
    
    const handleUpdateShop = (id: number, name: string) => {
        // API endpoint for this is not in the spec, doing an optimistic local update for now.
        setShops(prev => prev.map(shop => shop.id === id ? { ...shop, name } : shop));
    };


    const handleAddUser = async (user: Omit<User, 'id'>) => {
        if (users.some(u => u.username === user.username)) {
            throw new Error("Username already exists.");
        }
        const newUser = await api.register(user);
        setUsers(prev => [...prev, newUser]);
    };


    const handlePreviewInvoice = (saleData: Omit<SaleData, 'id' | 'date'>) => {
        const completeSaleData: SaleData = { 
            ...saleData, 
            id: `sale-${Date.now()}`,
            date: new Date()
        };
        
        setPendingSaleData(completeSaleData);
        setIsSaleFinalized(false);
        setCurrentPage('Invoice');
    };

    const handleConfirmFinalizeSale = async () => {
        if (!pendingSaleData || isSaleFinalized) return;
        
        await api.createSale(pendingSaleData);
        
        // Optimistically update history and reset state
        setAllSalesHistory(prev => [pendingSaleData, ...prev]);
        setIsSaleFinalized(true);
        resetCurrentSaleSession();

        // Refetch critical data in the background
        const shopIdToRefresh = currentUser?.role === 'admin' ? undefined : currentUser?.shopId;
        api.getProducts(shopIdToRefresh).then(setAllProducts);
        api.getCustomers().then(setCustomers);

        await new Promise(resolve => setTimeout(resolve, 800));
        handleNavigate('New Sale');
    };
    
    const handleNavigate = (page: string) => {
        if (page === 'New Sale' && currentPage === 'Invoice' && !isSaleFinalized) {
             // Coming back from an unfinalized invoice preview, do nothing to state
        } else if (page === 'New Sale') {
            setPendingSaleData(null);
            setIsSaleFinalized(false);
        }
        setCurrentPage(page);
    };

    const handleViewInvoiceFromReport = (sale: SaleData) => {
        setPendingSaleData(sale);
        setIsSaleFinalized(true); // This makes the invoice view read-only.
        setCurrentPage('Invoice');
    };
    
    const handleShopChange = (shopId: number) => {
        // 0 is the value for "All Shops"
        setSelectedShopId(shopId === 0 ? null : shopId);
        // If an admin selects a specific shop, take them to the reports page for that shop
        if (shopId !== 0) {
            setCurrentPage('Reports');
        } else {
            setCurrentPage('Admin Dashboard');
        }
    };

    if (isLoading) {
        return <div className={`theme-${theme} loading-container`}><h2>Loading BillEase POS...</h2></div>;
    }
    
    if (!currentUser) {
        return <div className={`theme-${theme}`} style={{height: '100%'}}><LoginPage onLogin={handleLogin} /></div>;
    }
    
    if (appError) {
        return <div className={`theme-${theme} error-container`}><h2>Error</h2><p>{appError}</p><button onClick={handleLogout}>Logout</button></div>;
    }
  
    const renderPage = () => {
        switch (currentPage) {
            case 'Admin Dashboard':
                return currentUser.role === 'admin' ? <AdminDashboardPage allSalesHistory={allSalesHistory} allProducts={allProducts} shops={shops} /> : <p>Access Denied</p>;
            case 'New Sale':
                return <NewSalePage 
                    products={visibleProducts} 
                    customers={customers} 
                    onPreviewInvoice={handlePreviewInvoice} 
                    onAddProduct={handleAddProduct} 
                    onUpdateProduct={handleUpdateProduct} 
                    userRole={currentUser.role} 
                    sessionData={saleSessions[activeBillIndex]}
                    onSessionUpdate={updateCurrentSaleSession}
                    activeBillIndex={activeBillIndex}
                    onBillChange={setActiveBillIndex}
                    currentShopId={currentShopContextId}
                />;
            case 'Product Inventory':
                return <ProductInventoryPage products={visibleProducts} onAddProduct={handleAddProduct} shops={shops} />;
            case 'Invoice':
                 return <InvoicePage 
                    saleData={pendingSaleData} 
                    onNavigate={handleNavigate} 
                    settings={appSettings}
                    onSettingsChange={setAppSettings} 
                    onConfirmFinalizeSale={handleConfirmFinalizeSale} 
                    isFinalized={isSaleFinalized}
                    margins={invoiceMargins}
                    onMarginsChange={setInvoiceMargins}
                    offsets={invoiceTextOffsets}
                    onOffsetsChange={setInvoiceTextOffsets}
                    fontStyle={invoiceFontStyle}
                    onFontStyleChange={setInvoiceFontStyle}
                 />;
            case 'Customer Management':
                return <CustomerManagementPage customers={customers} onAddCustomer={handleAddCustomer} />;
            case 'Balance Due':
                return <BalanceDuePage customersWithBalance={customers.filter(c => c.balance > 0)} />;
            case 'Reports':
                return <ReportsPage salesHistory={visibleSalesHistory} onViewInvoice={handleViewInvoiceFromReport} />;
            case 'Notes':
                return <NotesPage notes={notes} setNotes={setNotes} />;
            case 'Settings':
                 return <SettingsPage theme={theme} onThemeChange={setTheme} settings={appSettings} onSettingsChange={setAppSettings} appName={appName} onAppNameChange={setAppName} />;
            case 'Shop Management':
                return currentUser.role === 'admin' ? <ShopManagementPage users={users} shops={shops} onAddShop={handleAddShop} onAddUser={handleAddUser} onUpdateShop={handleUpdateShop} /> : <p>Access Denied</p>;
            default:
                 return currentUser.role === 'admin' ? <AdminDashboardPage allSalesHistory={allSalesHistory} allProducts={allProducts} shops={shops} /> : <NewSalePage 
                    products={visibleProducts} 
                    customers={customers} 
                    onPreviewInvoice={handlePreviewInvoice} 
                    onAddProduct={handleAddProduct} 
                    onUpdateProduct={handleUpdateProduct} 
                    userRole={currentUser.role}
                    sessionData={saleSessions[activeBillIndex]}
                    onSessionUpdate={updateCurrentSaleSession}
                    activeBillIndex={activeBillIndex}
                    onBillChange={setActiveBillIndex}
                    currentShopId={currentShopContextId}
                />;
        }
    };

    return (
        <>
            <AppHeader 
                onNavigate={handleNavigate} 
                currentUser={currentUser} 
                onLogout={handleLogout} 
                appName={appName}
                shops={shops}
                selectedShopId={selectedShopId}
                onShopChange={handleShopChange}
             />
            <main className="app-main">
                {renderPage()}
            </main>
        </>
    );
};


const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
