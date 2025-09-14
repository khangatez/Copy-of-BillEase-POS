import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- TYPES ---
interface Product {
  id: number;
  name: string;
  nameTamil: string;
  b2bPrice: number;
  b2cPrice: number;
  stock: number;
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
    date: Date;
    customerName: string;
    customerMobile: string;
    saleItems: SaleItem[];
    subtotal: number;
    taxAmount: number;
    taxPercent: number;
    grandTotal: number; // This is current sale total
    languageMode: 'English' | 'Tamil';
    previousBalance: number;
    amountPaid: number;
    newBalance: number;
    isBalanceEdited?: boolean;
}

interface Note {
    id: number;
    text: string;
    completed: boolean;
}

interface User {
    username: string;
    role: 'admin' | 'cashier';
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
}

type Theme = 'dark' | 'light' | 'ocean-blue' | 'forest-green' | 'sunset-orange' | 'monokai' | 'nord';


// --- MOCK DATA (DATABASE SIMULATION) ---
const initialProducts: Product[] = [
  { id: 1, name: 'Apple', nameTamil: 'ஆப்பிள்', b2bPrice: 0.40, b2cPrice: 0.50, stock: 100 },
  { id: 2, name: 'Banana', nameTamil: 'வாழைப்பழம்', b2bPrice: 0.25, b2cPrice: 0.30, stock: 150 },
  { id: 3, name: 'Milk 1L', nameTamil: 'பால் 1லி', b2bPrice: 1.00, b2cPrice: 1.20, stock: 8 },
  { id: 4, name: 'Bread Loaf', nameTamil: 'ரொட்டி', b2bPrice: 2.00, b2cPrice: 2.50, stock: 30 },
  { id: 5, name: 'Cheddar Cheese 200g', nameTamil: 'செடார் சீஸ் 200கி', b2bPrice: 3.50, b2cPrice: 4.00, stock: 40 },
];

const initialCustomers: Customer[] = [
    { mobile: '1234567890', name: 'John Doe', balance: 50.75 },
    { mobile: '0987654321', name: 'Jane Smith', balance: 0 },
];

const initialNotes: Note[] = [
    { id: 1, text: 'Order new stock for milk', completed: false },
    { id: 2, text: 'Clean the front display', completed: true },
];

// In a real app, this would be a secure backend call
const users = [
    { username: 'admin', password: 'admin', role: 'admin' },
    { username: 'cashier', password: 'cashier', role: 'cashier' },
];


// --- UTILITY FUNCTIONS ---
const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;
const formatQuantity = (quantity: number) => quantity.toFixed(3);
const formatNumberForInvoice = (amount: number) => amount.toFixed(2);
const formatQuantityForInvoice = (quantity: number) => quantity.toFixed(1);
const LOW_STOCK_THRESHOLD = 10;


// --- HEADER COMPONENT ---
type HeaderProps = {
  onNavigate: (page: string) => void;
  currentUser: User;
  onLogout: () => void;
};

const AppHeader: React.FC<HeaderProps> = ({ onNavigate, currentUser, onLogout }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allMenuItems = ['New Sale', 'Product Inventory', 'Customer Management', 'Reports', 'Notes', 'Settings', 'Balance Due'];
  const cashierMenuItems = ['New Sale'];

  const menuItems = currentUser.role === 'admin' ? allMenuItems : cashierMenuItems;
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="app-header">
      <h1 className="header-title">BillEase POS</h1>
      <div className="header-user-info">
        <span>Welcome, {currentUser.username} ({currentUser.role})</span>
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

// --- NEW SALE PAGE COMPONENT ---
type NewSalePageProps = {
    products: Product[];
    customers: Customer[];
    onPreviewInvoice: (saleData: Omit<SaleData, 'id' | 'date'>) => void;
    onAddProduct: (newProduct: Omit<Product, 'id'>) => Product;
    onUpdateProduct: (updatedProduct: Product) => void;
    userRole: 'admin' | 'cashier';
    sessionData: SaleSession;
    onSessionUpdate: (updates: Partial<SaleSession>) => void;
    activeBillIndex: number;
    onBillChange: (index: number) => void;
};

const NewSalePage: React.FC<NewSalePageProps> = ({ 
    products, customers, onPreviewInvoice, onAddProduct, onUpdateProduct, userRole,
    sessionData, onSessionUpdate, activeBillIndex, onBillChange
}) => {
    const { customerName, customerMobile, priceMode, languageMode, taxPercent, saleItems, editedNewBalance } = sessionData;

    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [showAddNew, setShowAddNew] = useState(false);
    const [activeSuggestion, setActiveSuggestion] = useState(-1);
    
    const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);

    const mobileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const prevSaleItemsLengthRef = useRef(saleItems.length);

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
            const filtered = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
            setSuggestions(filtered);
            setShowAddNew(filtered.length === 0);
        } else {
            setSuggestions([]);
            setShowAddNew(false);
        }
        setActiveSuggestion(-1);
    }, [searchTerm, products]);

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

    const handleAddNewProduct = () => {
        const newProdData = {
            name: searchTerm,
            nameTamil: '',
            b2cPrice: 0,
            b2bPrice: 0,
            stock: 0,
        };
        const newProduct = onAddProduct(newProdData);
        handleProductSelect(newProduct);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        const totalOptions = suggestions.length + (showAddNew ? 1 : 0);
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
            } else if (showAddNew && selectionIndex === suggestions.length) {
                handleAddNewProduct();
            }
        }
    };

    const handleItemUpdate = (index: number, field: keyof SaleItem, value: any) => {
        const updatedItems = [...saleItems];
        (updatedItems[index] as any)[field] = value;
        onSessionUpdate({ saleItems: updatedItems });
        
        if (field === 'price') {
            const item = updatedItems[index];
            const productToUpdate = products.find(p => p.id === item.productId);
            if (productToUpdate) {
                const priceType = priceMode === 'B2B' ? 'b2bPrice' : 'b2cPrice';
                if (productToUpdate[priceType] !== value) {
                    onUpdateProduct({ ...productToUpdate, [priceType]: value });
                }
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

    const { subtotal, taxAmount, grandTotal, finalNewBalance, amountPaidForInvoice, isEdited } = useMemo(() => {
        const subtotal = saleItems.reduce((acc, item) => {
            const itemTotal = item.quantity * item.price;
            return acc + (item.isReturn ? -itemTotal : itemTotal);
        }, 0);
        const taxAmount = subtotal * (taxPercent / 100);
        const grandTotal = subtotal + taxAmount;
        
        const previousBalance = activeCustomer?.balance ?? 0;
        const totalDue = previousBalance + grandTotal;

        const isEdited = editedNewBalance !== '';
        const parsedEdited = parseFloat(editedNewBalance);
        
        // If edited and is a valid number, use it. Otherwise, default behavior is customer pays current bill, so new balance is previous balance.
        const finalNewBalance = isEdited && !isNaN(parsedEdited) 
            ? parsedEdited
            : previousBalance;
            
        const amountPaidForInvoice = totalDue - finalNewBalance;
        
        return { subtotal, taxAmount, grandTotal, finalNewBalance, amountPaidForInvoice, isEdited };
    }, [saleItems, taxPercent, activeCustomer, editedNewBalance]);

    const handlePreviewClick = () => {
        if (saleItems.length === 0) {
            alert("Cannot preview an empty sale.");
            return;
        }
        onPreviewInvoice({
            customerName,
            customerMobile,
            saleItems,
            subtotal,
            taxAmount,
            taxPercent,
            grandTotal,
            languageMode,
            previousBalance: activeCustomer?.balance ?? 0,
            amountPaid: amountPaidForInvoice,
            newBalance: finalNewBalance,
            isBalanceEdited: isEdited && !isNaN(parseFloat(editedNewBalance)),
        });
    };

    return (
        <div className="page-container">
            <main className="new-sale-layout">
                <section className="sale-main" aria-labelledby="sale-heading">
                    <h2 id="sale-heading" className="sr-only">New Sale</h2>

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

                    <div className="form-group product-search-container">
                        <label htmlFor="product-search">Product Search</label>
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
                        {(suggestions.length > 0 || showAddNew) && (
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
                                {showAddNew && (
                                     <div 
                                        className={`suggestion-item add-new-item ${suggestions.length === activeSuggestion ? 'active' : ''}`}
                                        onClick={handleAddNewProduct}
                                        onMouseEnter={() => setActiveSuggestion(suggestions.length)}
                                    >
                                        + Add "{searchTerm}" as new product
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
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
                                        <td>{item.name}</td>
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
                                                disabled={userRole === 'cashier'}
                                            />
                                        </td>
                                        <td>{formatCurrency(item.quantity * item.price)}</td>
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
                     <div className="form-group">
                        <label htmlFor="tax-percent">Tax %</label>
                        <input id="tax-percent" type="number" className="input-field" value={taxPercent} onChange={e => onSessionUpdate({ taxPercent: parseFloat(e.target.value) || 0 })} />
                    </div>

                    <div className="totals-summary">
                        {(activeCustomer && activeCustomer.balance !== 0) && (
                            <div className="total-row">
                                <span>Previous Balance</span>
                                <span>{formatCurrency(activeCustomer.balance)}</span>
                            </div>
                        )}

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
                        <button className="finalize-button" onClick={handlePreviewClick}>Preview Invoice</button>
                    </div>

                </aside>
            </main>
        </div>
    );
};

// --- PRODUCT INVENTORY PAGE ---
type ProductInventoryPageProps = {
    products: Product[];
    onAddProduct: (newProduct: Omit<Product, 'id'>) => void;
};
const ProductInventoryPage: React.FC<ProductInventoryPageProps> = ({ products, onAddProduct }) => {
    const [newProductName, setNewProductName] = useState('');
    const [newProductNameTamil, setNewProductNameTamil] = useState('');
    const [newProductB2B, setNewProductB2B] = useState(0);
    const [newProductB2C, setNewProductB2C] = useState(0);
    const [newProductStock, setNewProductStock] = useState(0);

    const nameTamilRef = useRef<HTMLInputElement>(null);
    const b2bRef = useRef<HTMLInputElement>(null);
    const b2cRef = useRef<HTMLInputElement>(null);
    const stockRef = useRef<HTMLInputElement>(null);
    const submitRef = useRef<HTMLButtonElement>(null);

    const handleAddProduct = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProductName) return;
        onAddProduct({
            name: newProductName,
            nameTamil: newProductNameTamil,
            b2bPrice: newProductB2B,
            b2cPrice: newProductB2C,
            stock: newProductStock
        });
        setNewProductName('');
        setNewProductNameTamil('');
        setNewProductB2B(0);
        setNewProductB2C(0);
        setNewProductStock(0);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextRef: React.RefObject<HTMLElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef.current?.focus();
        }
    };
    
    const handleBulkAdd = () => {
        alert("This is a demo of the bulk add feature. In a real app, you would be prompted to upload two PDF files. Here, we will add a few sample products to the inventory.");
        const sampleProducts = [
            { name: 'Organic Honey', nameTamil: 'ஆர்கானிக் தேன்', b2bPrice: 5.50, b2cPrice: 6.50, stock: 25 },
            { name: 'Almond Flour', nameTamil: 'பாதாம் மாவு', b2bPrice: 7.00, b2cPrice: 8.25, stock: 15 },
            { name: 'Sparkling Water', nameTamil: ' игристые воды', b2bPrice: 1.20, b2cPrice: 1.50, stock: 50 },
            { name: 'Instant Coffee', nameTamil: 'காபி', b2bPrice: 4.00, b2cPrice: 4.75, stock: 40 },
        ];
        sampleProducts.forEach(p => onAddProduct(p));
    };

    return (
        <div className="page-container">
            <h2 className="page-title">Product Inventory</h2>
            <div className="inventory-layout">
                <div className="inventory-list-container">
                     <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name (English)</th>
                                <th>Name (Tamil)</th>
                                <th>B2B Price</th>
                                <th>B2C Price</th>
                                <th>Stock</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(p => (
                                <tr key={p.id} className={p.stock < LOW_STOCK_THRESHOLD ? 'low-stock' : ''}>
                                    <td>{p.id}</td>
                                    <td>{p.name}</td>
                                    <td>{p.nameTamil}</td>
                                    <td>{formatCurrency(p.b2bPrice)}</td>
                                    <td>{formatCurrency(p.b2cPrice)}</td>
                                    <td>{p.stock}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="add-product-form-container">
                    <h3>Add New Product</h3>
                    <form onSubmit={handleAddProduct} className="add-product-form">
                        <div className="form-group">
                           <label htmlFor="new-product-name">Product Name (English)</label>
                           <input id="new-product-name" type="text" className="input-field" value={newProductName} onChange={e => setNewProductName(e.target.value)} onKeyDown={e => handleKeyDown(e, nameTamilRef)} required />
                        </div>
                        <div className="form-group">
                           <label htmlFor="new-product-name-tamil">Product Name (Tamil)</label>
                           <input ref={nameTamilRef} id="new-product-name-tamil" type="text" className="input-field" value={newProductNameTamil} onChange={e => setNewProductNameTamil(e.target.value)} onKeyDown={e => handleKeyDown(e, b2bRef)} />
                        </div>
                        <div className="form-group">
                           <label htmlFor="new-product-b2b">B2B Price</label>
                           <input ref={b2bRef} id="new-product-b2b" type="number" step="0.01" className="input-field" value={newProductB2B} onChange={e => setNewProductB2B(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, b2cRef)} />
                        </div>
                        <div className="form-group">
                           <label htmlFor="new-product-b2c">B2C Price</label>
                           <input ref={b2cRef} id="new-product-b2c" type="number" step="0.01" className="input-field" value={newProductB2C} onChange={e => setNewProductB2C(parseFloat(e.target.value) || 0)} onKeyDown={e => handleKeyDown(e, stockRef)} />
                        </div>
                         <div className="form-group">
                           <label htmlFor="new-product-stock">Initial Stock</label>
                           <input ref={stockRef} id="new-product-stock" type="number" step="1" className="input-field" value={newProductStock} onChange={e => setNewProductStock(parseInt(e.target.value, 10) || 0)} onKeyDown={e => handleKeyDown(e, submitRef)} />
                        </div>
                        <button ref={submitRef} type="submit" className="finalize-button">Add Product</button>
                        <button type="button" className="action-button-secondary bulk-add-button" onClick={handleBulkAdd}>Add Bulk Products from PDF</button>
                    </form>
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
    onConfirmFinalizeSale: () => void;
    isFinalized: boolean;
    margins: { top: number; right: number; bottom: number; left: number };
    onMarginsChange: (margins: { top: number; right: number; bottom: number; left: number }) => void;
    offsets: { header: number; footer: number };
    onOffsetsChange: (offsets: { header: number; footer: number }) => void;
};
const InvoicePage: React.FC<InvoicePageProps> = ({ 
    saleData, onNavigate, settings, onSettingsChange, onConfirmFinalizeSale, isFinalized, 
    margins, onMarginsChange, offsets, onOffsetsChange 
}) => {
    const [paperSize, setPaperSize] = useState('4inch');
    const [fontSize, setFontSize] = useState('medium');
    const [whatsAppNumber, setWhatsAppNumber] = useState('');
    const invoiceRef = useRef<HTMLDivElement>(null);

    const [invoiceTitle, setInvoiceTitle] = useState('Invoice');
    const [isTitleEditing, setIsTitleEditing] = useState(false);
    const [isFooterEditing, setIsFooterEditing] = useState(false);

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
        grandTotal, previousBalance, amountPaid, newBalance, isBalanceEdited
    } = saleData;

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
        saleItems.forEach(item => {
            const itemTotal = item.quantity * item.price;
            message += `- ${item.name} (${formatQuantityForInvoice(item.quantity)} x ${formatNumberForInvoice(item.price)}) = ${formatCurrency(itemTotal)} ${item.isReturn ? '(Return)' : ''}\n`;
        });
        message += `\n*Summary:*\n`;
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

    return (
        <div className="page-container invoice-page-container">
            <div 
                className={`invoice-paper size-${paperSize} font-${fontSize}`} 
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
                            {saleItems.map((item, index) => (
                               <tr key={index} className={item.isReturn ? 'is-return' : ''}>
                                   <td>{index + 1}</td>
                                   <td>{item.name} {item.isReturn && `(${languageMode === 'English' ? 'Return' : 'திரும்ப'})`}</td>
                                   <td>{formatQuantityForInvoice(item.quantity)}</td>
                                   <td>{formatNumberForInvoice(item.price)}</td>
                                   <td>{formatNumberForInvoice(item.quantity * item.price)}</td>
                               </tr>
                            ))}
                        </tbody>
                    </table>
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
                        onClick={onConfirmFinalizeSale} 
                        className="finalize-button"
                        disabled={isFinalized}
                    >
                        {isFinalized ? 'Sale Recorded ✓' : 'Finalize Sale'}
                    </button>
                    <button onClick={() => onNavigate('New Sale')} className="action-button-secondary" disabled={isFinalized}>Back to Sale</button>
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

// --- CUSTOMER MANAGEMENT PAGE ---
type CustomerManagementPageProps = {
    customers: Customer[];
};
const CustomerManagementPage: React.FC<CustomerManagementPageProps> = ({ customers }) => {
    return (
        <div className="page-container">
            <h2 className="page-title">Customer Management & Balances</h2>
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
                        {customers.sort((a,b) => b.balance - a.balance).map(c => (
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
        const totalSales = filteredSales.reduce((acc, sale) => acc + sale.grandTotal, 0);
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
};
const SettingsPage: React.FC<SettingsPageProps> = ({ theme, onThemeChange, settings, onSettingsChange }) => {
    
    const handleFooterChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onSettingsChange({ ...settings, invoiceFooter: e.target.value });
    };
    
    const themes: {id: Theme, name: string}[] = [
        {id: 'light', name: 'Light'},
        {id: 'dark', name: 'Dark'},
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

// --- LOGIN PAGE COMPONENT ---
type LoginPageProps = {
    onLogin: (user: User) => void;
};
const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            onLogin({ username: user.username, role: user.role as 'admin' | 'cashier' });
        } else {
            setError('Invalid username or password');
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
                    />
                </div>
                <button type="submit" className="action-button-primary login-button">Login</button>
                <div className="login-info">
                  <p>Hint: admin/admin or cashier/cashier</p>
                </div>
            </form>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
const App = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentPage, setCurrentPage] = useState('New Sale');
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [notes, setNotes] = useState<Note[]>(initialNotes);
    const [salesHistory, setSalesHistory] = useState<SaleData[]>([]);
    const [pendingSaleData, setPendingSaleData] = useState<SaleData | null>(null);
    const [isSaleFinalized, setIsSaleFinalized] = useState<boolean>(false);
    const [theme, setTheme] = useState<Theme>('dark');
    const [appSettings, setAppSettings] = useState<AppSettings>({ invoiceFooter: 'Thank you for your business!' });
    const [invoiceMargins, setInvoiceMargins] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
    const [invoiceTextOffsets, setInvoiceTextOffsets] = useState({ header: 0, footer: 0 });
    const nextProductId = useRef(Math.max(...initialProducts.map(p => p.id)) + 1);

    const initialSaleSession: SaleSession = useMemo(() => ({
        customerName: '',
        customerMobile: '',
        priceMode: 'B2C',
        languageMode: 'English',
        taxPercent: 0,
        saleItems: [],
        editedNewBalance: '',
    }), []);

    const [saleSessions, setSaleSessions] = useState<SaleSession[]>([
        {...initialSaleSession},
        {...initialSaleSession},
        {...initialSaleSession},
    ]);
    const [activeBillIndex, setActiveBillIndex] = useState(0);

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
        setCurrentUser(user);
        setCurrentPage('New Sale'); // Default page after login
    };

    const handleLogout = () => {
        setCurrentUser(null);
    };

    const handleAddProduct = (newProductData: Omit<Product, 'id'>): Product => {
        const newProduct = { ...newProductData, id: nextProductId.current++ };
        setProducts(prev => [...prev, newProduct]);
        return newProduct;
    };
    
    const handleUpdateProduct = (updatedProduct: Product) => {
        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
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

    const handleConfirmFinalizeSale = () => {
        if (!pendingSaleData || isSaleFinalized) return;

        const { customerMobile, customerName, newBalance, saleItems } = pendingSaleData;
        
        const existingCustomer = customers.find(c => c.mobile === customerMobile);

        if (existingCustomer) {
            setCustomers(prev => prev.map(c => 
                c.mobile === customerMobile ? { ...c, balance: newBalance, name: customerName || c.name } : c
            ));
        } else if (customerMobile) {
            const newCustomer: Customer = { mobile: customerMobile, name: customerName, balance: newBalance };
            setCustomers(prev => [...prev, newCustomer]);
        }

        const productsCopy = [...products];
        saleItems.forEach(item => {
            const productIndex = productsCopy.findIndex(p => p.id === item.productId);
            if (productIndex !== -1) {
                const stockChange = item.isReturn ? item.quantity : -item.quantity;
                productsCopy[productIndex].stock += stockChange;
            }
        });
        setProducts(productsCopy);
        
        setSalesHistory(prev => [pendingSaleData, ...prev]);
        setIsSaleFinalized(true);
        resetCurrentSaleSession();
    };
    
    const handleNavigate = (page: string) => {
        let targetPage = page;
        if (page === 'Balance Due') {
            targetPage = 'Customer Management';
        }
        if (page === 'New Sale' && currentPage === 'Invoice' && !isSaleFinalized) {
             // Coming back from an unfinalized invoice preview, do nothing to state
        } else if (page === 'New Sale') {
            setPendingSaleData(null);
            setIsSaleFinalized(false);
        }
        setCurrentPage(targetPage);
    };

    const handleViewInvoiceFromReport = (sale: SaleData) => {
        setPendingSaleData(sale);
        setIsSaleFinalized(true); // This makes the invoice view read-only.
        setCurrentPage('Invoice');
    };
    
    if (!currentUser) {
        return <div className={`theme-${theme}`} style={{height: '100%'}}><LoginPage onLogin={handleLogin} /></div>;
    }
  
    const renderPage = () => {
        switch (currentPage) {
            case 'New Sale':
                return <NewSalePage 
                    products={products} 
                    customers={customers} 
                    onPreviewInvoice={handlePreviewInvoice} 
                    onAddProduct={handleAddProduct} 
                    onUpdateProduct={handleUpdateProduct} 
                    userRole={currentUser.role} 
                    sessionData={saleSessions[activeBillIndex]}
                    onSessionUpdate={updateCurrentSaleSession}
                    activeBillIndex={activeBillIndex}
                    onBillChange={setActiveBillIndex}
                />;
            case 'Product Inventory':
                return <ProductInventoryPage products={products} onAddProduct={handleAddProduct} />;
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
                 />;
            case 'Customer Management':
                return <CustomerManagementPage customers={customers} />;
            case 'Reports':
                return <ReportsPage salesHistory={salesHistory} onViewInvoice={handleViewInvoiceFromReport} />;
            case 'Notes':
                return <NotesPage notes={notes} setNotes={setNotes} />;
            case 'Settings':
                 return <SettingsPage theme={theme} onThemeChange={setTheme} settings={appSettings} onSettingsChange={setAppSettings} />;
            default:
                return <NewSalePage 
                    products={products} 
                    customers={customers} 
                    onPreviewInvoice={handlePreviewInvoice} 
                    onAddProduct={handleAddProduct} 
                    onUpdateProduct={handleUpdateProduct} 
                    userRole={currentUser.role}
                    sessionData={saleSessions[activeBillIndex]}
                    onSessionUpdate={updateCurrentSaleSession}
                    activeBillIndex={activeBillIndex}
                    onBillChange={setActiveBillIndex}
                />;
        }
    };

    return (
        <>
            <AppHeader onNavigate={handleNavigate} currentUser={currentUser} onLogout={handleLogout} />
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